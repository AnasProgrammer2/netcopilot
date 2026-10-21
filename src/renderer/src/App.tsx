import { useEffect, useCallback, useState, useRef } from 'react'
import { Lock, PanelLeftOpen } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useAppStore, isAiReady } from './store'
import { Sidebar } from './components/sidebar/Sidebar'
import { TerminalArea } from './components/terminal/TerminalArea'
import { HomeScreen } from './components/home/HomeScreen'
import { WelcomeScreen } from './components/WelcomeScreen'
import { ConnectionDialog } from './components/dialogs/ConnectionDialog'
import { QuickConnect } from './components/dialogs/QuickConnect'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { HelpDialog } from './components/dialogs/HelpDialog'
import { HostKeyDialog } from './components/dialogs/HostKeyDialog'
import { ChangeHistoryDialog } from './components/dialogs/ChangeHistoryDialog'
import { ChangeDock } from './components/ai/ChangeCard'
import { useChangeEvents } from './lib/changeRunner'
import { TitleBar } from './components/TitleBar'
import { MasterPasswordLock } from './components/MasterPasswordLock'
import { useUpdaterEvents } from './lib/updater'
import { UpdateBanner } from './components/UpdateBanner'
import { WhatsNewDialog } from './components/dialogs/WhatsNewDialog'
import { useWhatsNewOnUpdate, showNotesFor } from './lib/whatsNew'

export default function App(): JSX.Element {
  const {
    loadConnections, loadGroups, loadSshKeys, loadSettings, loadSnippets, loadSnippetFolders,
    connections, sessions, activeSessionId,
    setQuickConnectOpen, setSettingsOpen, setAiPanelOpen, aiPanelOpen,
    setActiveSession, closeSession, setSplitSession, splitSessionId,
    licenseValid, aiSource, aiConfigured,
    sidebarCollapsed, sidebarWidth, setSidebarCollapsed,
    selectedConnectionIds, clearSelection,
    keybindingSettings,
  } = useAppStore()
  useChangeEvents()
  const aiReady = isAiReady({ aiSource, aiConfigured, licenseValid })
  const [masterLocked, setMasterLocked] = useState<boolean | null>(null)
  const [hasMasterPassword, setHasMasterPassword] = useState(false)
  const [locked, setLocked] = useState(false)
  const [helpOpen,    setHelpOpen]    = useState(false)
  const [helpTab,     setHelpTab]     = useState<'start' | 'aria' | 'shortcuts'>('start')
  const lastActivityRef = useRef(Date.now())
  const autoLockMinsRef = useRef(0)

  // Request notification permission on startup
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Check master password on startup
  useEffect(() => {
    window.api.auth.hasMasterPassword().then((has) => {
      setHasMasterPassword(has)
      setMasterLocked(has) // true = show lock screen, false = skip
    })
  }, [])

  useEffect(() => {
    if (masterLocked === false) {
      loadConnections()
      loadGroups()
      loadSshKeys()
      loadSettings()
      loadSnippets()
      loadSnippetFolders()
      // One-time security notices from main (e.g. DB key stored without OS keyring)
      window.api.security.getWarnings().then((warnings) => {
        warnings.forEach((w) => toast.warning('Security notice', { description: w, duration: 20000 }))
      }).catch(() => { /* non-critical */ })
    }
  }, [masterLocked])

  useUpdaterEvents()
  useWhatsNewOnUpdate(masterLocked === false)

  // Auto-lock idle timer
  useEffect(() => {
    window.api.store.getSetting('autoLockMinutes').then((v) => {
      autoLockMinsRef.current = Number(v) || 0
    })

    const resetActivity = () => { lastActivityRef.current = Date.now() }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => document.addEventListener(e, resetActivity, { passive: true }))

    const interval = setInterval(async () => {
      // Refresh setting periodically (cheap, runs every 15s)
      const v = await window.api.store.getSetting('autoLockMinutes')
      autoLockMinsRef.current = Number(v) || 0
      if (autoLockMinsRef.current <= 0) return
      const idleMin = (Date.now() - lastActivityRef.current) / 60000
      if (idleMin >= autoLockMinsRef.current) {
        setLocked(true)
        // Re-check (a master password may have been set since startup) and
        // lock the main process too, so stored credentials stay sealed.
        window.api.auth.hasMasterPassword().then((has) => {
          setHasMasterPassword(has)
          if (has) window.api.auth.lock()
        }).catch(() => { /* ignore */ })
      }
    }, 15000)

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetActivity))
      clearInterval(interval)
    }
  }, [])

  const matchKeybinding = (e: KeyboardEvent, binding: string) => {
    if (!binding) return false
    const parts = binding.split('+')
    const key = parts[parts.length - 1].toLowerCase()
    const requiresMod = parts.includes('Mod') || parts.includes('CmdOrCtrl') || parts.includes('Ctrl') || parts.includes('Cmd')
    const requiresShift = parts.includes('Shift')
    const requiresAlt = parts.includes('Alt')

    const hasMod = e.metaKey || e.ctrlKey
    const hasShift = e.shiftKey
    const hasAlt = e.altKey

    return e.key.toLowerCase() === key &&
           requiresMod === hasMod &&
           requiresShift === hasShift &&
           requiresAlt === hasAlt
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape — clear multi-select
      if (e.key === 'Escape' && selectedConnectionIds.size > 0) {
        clearSelection()
        return
      }

      // ? — Help dialog (only when not typing in an input)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          setHelpTab('shortcuts')
          setHelpOpen(true)
        }
        return
      }

      if (matchKeybinding(e, keybindingSettings.quickConnect)) {
        e.preventDefault()
        setQuickConnectOpen(true)
      } else if (matchKeybinding(e, keybindingSettings.settings)) {
        e.preventDefault()
        setSettingsOpen(true)
      } else if (matchKeybinding(e, keybindingSettings.newTab)) {
        e.preventDefault()
        setQuickConnectOpen(true)
      } else if (matchKeybinding(e, keybindingSettings.closeTab)) {
        e.preventDefault()
        if (activeSessionId) {
          if (activeSessionId === splitSessionId) setSplitSession(null)
          closeSession(activeSessionId)
        }
      } else if (matchKeybinding(e, keybindingSettings.toggleAi)) {
        e.preventDefault()
        if (!aiPanelOpen && !aiReady) {
          toast.error(aiSource === 'byok' ? 'AI provider not set up' : 'License key required', {
            description: aiSource === 'byok'
              ? 'Set up your AI provider (API key or local endpoint) in Settings → ARIA.'
              : 'Add your license key in Settings → ARIA to use the AI assistant.',
            action: { label: 'Open Settings', onClick: () => setSettingsOpen(true, 'ai') }
          })
          return
        }
        setAiPanelOpen(!aiPanelOpen)
      } else if (matchKeybinding(e, keybindingSettings.toggleSplit)) {
        e.preventDefault()
        if (splitSessionId) {
          setSplitSession(null)
        } else if (sessions.length >= 2) {
          const other = sessions.find(s => s.id !== activeSessionId)
          if (other) setSplitSession(other.id)
        }
      } else if (matchKeybinding(e, keybindingSettings.toggleSidebar)) {
        e.preventDefault()
        setSidebarCollapsed(!sidebarCollapsed)
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (idx < sessions.length) {
          e.preventDefault()
          setActiveSession(sessions[idx].id)
        }
      }
    },
    [
      setQuickConnectOpen, setSettingsOpen, setAiPanelOpen, aiPanelOpen,
      activeSessionId, splitSessionId, sessions, aiReady, aiSource,
      closeSession, setSplitSession, setActiveSession,
      sidebarCollapsed, setSidebarCollapsed,
      selectedConnectionIds, clearSelection,
      keybindingSettings,
    ]  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // macOS menu bar items (the keyboard shortcuts themselves stay in handleKeyDown)
  useEffect(() => window.api.window.onMenuAction?.((action) => {
    const s = useAppStore.getState()
    switch (action) {
      case 'settings':       s.setSettingsOpen(true); break
      case 'new-connection': s.setConnectionDialogOpen(true); break
      case 'quick-connect':
      case 'new-tab':        s.setQuickConnectOpen(true); break
      case 'close-tab':
        if (s.activeSessionId) {
          if (s.activeSessionId === s.splitSessionId) s.setSplitSession(null)
          s.closeSession(s.activeSessionId)
        }
        break
      case 'toggle-sidebar': s.setSidebarCollapsed(!s.sidebarCollapsed); break
      case 'toggle-ai':
        if (!s.aiPanelOpen && !isAiReady(s)) s.setSettingsOpen(true, 'ai')
        else s.setAiPanelOpen(!s.aiPanelOpen)
        break
      case 'toggle-split':
        if (s.splitSessionId) s.setSplitSession(null)
        else {
          const other = s.sessions.find(x => x.id !== s.activeSessionId)
          if (other) s.setSplitSession(other.id)
        }
        break
      case 'getting-started': setHelpTab('start');     setHelpOpen(true); break
      case 'shortcuts':       setHelpTab('shortcuts'); setHelpOpen(true); break
      case 'whats-new':
        window.api.appInfo.getVersion().then((v) => {
          if (!showNotesFor(v)) toast.info(`No release notes bundled for ${v}`)
        }).catch(() => {})
        break
    }
  }), [])

  const unlock = () => {
    lastActivityRef.current = Date.now()
    setLocked(false)
  }

  // Capture keydown at window level while the idle-lock overlay is active so
  // "press any key" works even when focus is inside the xterm.js canvas.
  // Skipped when master password is required — user must submit the form.
  useEffect(() => {
    if (!locked || hasMasterPassword) return
    const handleKey = () => unlock()
    window.addEventListener('keydown', handleKey, true) // capture phase
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [locked, hasMasterPassword])

  // Show master password lock screen if needed
  if (masterLocked === null) return <div className="h-screen w-screen bg-background" /> // loading
  if (masterLocked) {
    return <MasterPasswordLock onUnlocked={() => {
      setMasterLocked(false)
      loadConnections(); loadGroups(); loadSshKeys(); loadSettings(); loadSnippets(); loadSnippetFolders()
    }} />
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      <Toaster position="bottom-right" theme="dark" richColors closeButton />
      <TitleBar
        onShortcuts={() => { setHelpTab('shortcuts'); setHelpOpen(true) }}
        onWelcome={() => { setHelpTab('start'); setHelpOpen(true) }}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Collapsed mini-bar */}
        {sidebarCollapsed && (
          <div className="shrink-0 w-11 bg-sidebar border-r border-sidebar-border flex flex-col items-center pt-3 gap-2">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-subtle hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="Show Sidebar (⌘B)"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Full sidebar */}
        <div
          className="shrink-0 overflow-hidden transition-all duration-200 ease-out"
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {sessions.length === 0
            ? connections.length === 0
              ? <WelcomeScreen />
              : <HomeScreen />
            : <TerminalArea />
          }
        </main>
      </div>

      <ConnectionDialog />
      <QuickConnect />
      <SettingsDialog />
      <HostKeyDialog />
      <ChangeHistoryDialog />
      <ChangeDock />
      <HelpDialog
        open={helpOpen}
        initialTab={helpTab}
        onClose={() => setHelpOpen(false)}
      />

      <UpdateBanner />
      <WhatsNewDialog />

      {locked && hasMasterPassword && (
        <MasterPasswordLock variant="idle" onUnlocked={unlock} />
      )}

      {locked && !hasMasterPassword && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center cursor-pointer"
          onClick={unlock}
          onKeyDown={unlock}
          role="button"
          tabIndex={0}
        >
          <div className="text-center select-none pointer-events-none">
            <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-white/10 mx-auto mb-4">
              <Lock className="w-8 h-8 text-white/70" />
            </div>
            <p className="text-lg font-semibold text-white">Session Locked</p>
            <p className="text-sm text-white/40 mt-1.5">Click anywhere or press any key to unlock</p>
          </div>
        </div>
      )}
    </div>
  )
}
