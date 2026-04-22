import { useEffect, useCallback, useState, useRef } from 'react'
import { Lock, ArrowUpCircle, X } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useAppStore } from './store'
import { Sidebar } from './components/sidebar/Sidebar'
import { TerminalArea } from './components/terminal/TerminalArea'
import { HomeScreen } from './components/home/HomeScreen'
import { ConnectionDialog } from './components/dialogs/ConnectionDialog'
import { QuickConnect } from './components/dialogs/QuickConnect'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { MasterPasswordLock } from './components/MasterPasswordLock'
import { cn } from './lib/utils'

export default function App(): JSX.Element {
  const {
    loadConnections, loadGroups, loadSshKeys, loadSettings,
    sessions, activeSessionId,
    setQuickConnectOpen, setSettingsOpen, setAiPanelOpen, aiPanelOpen,
    setActiveSession, closeSession, setSplitSession, splitSessionId,
    licenseValid,
  } = useAppStore()
  const [masterLocked, setMasterLocked] = useState<boolean | null>(null) // null = checking
  const [locked, setLocked] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const autoLockMinsRef = useRef(0)
  const [updateBanner, setUpdateBanner] = useState<{ version: string; url: string } | null>(null)

  // Check master password on startup
  useEffect(() => {
    window.api.auth.hasMasterPassword().then((has) => {
      setMasterLocked(has) // true = show lock screen, false = skip
    })
  }, [])

  useEffect(() => {
    if (masterLocked === false) {
      loadConnections()
      loadGroups()
      loadSshKeys()
      loadSettings()
      // Check for updates in background after 3s (non-blocking)
      setTimeout(() => {
        window.api.appInfo.checkUpdate().then((res) => {
          if (res.hasUpdate && res.latest && res.url) {
            setUpdateBanner({ version: res.latest, url: res.url })
          }
        }).catch(() => {/* ignore network errors */})
      }, 3000)
    }
  }, [masterLocked])

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
      if (idleMin >= autoLockMinsRef.current) setLocked(true)
    }, 15000)

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetActivity))
      clearInterval(interval)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // ⌘K / Ctrl+K — Quick Connect
      if (e.key === 'k') {
        e.preventDefault()
        setQuickConnectOpen(true)
      }
      // ⌘, / Ctrl+, — Settings
      else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
      // ⌘T / Ctrl+T — New tab (Quick Connect)
      else if (e.key === 't') {
        e.preventDefault()
        setQuickConnectOpen(true)
      }
      // ⌘W / Ctrl+W — Close active tab
      else if (e.key === 'w') {
        e.preventDefault()
        if (activeSessionId) {
          if (activeSessionId === splitSessionId) setSplitSession(null)
          closeSession(activeSessionId)
        }
      }
      // ⌘Shift+A / Ctrl+Shift+A — Toggle ARIA panel
      else if (e.shiftKey && e.key === 'A') {
        e.preventDefault()
        if (!aiPanelOpen && !licenseValid) {
          toast.error('License key required', { description: 'Add your license key in Settings → ARIA to use the AI assistant.' })
          return
        }
        setAiPanelOpen(!aiPanelOpen)
      }
      // ⌘D / Ctrl+D — Toggle split view
      else if (e.key === 'd') {
        e.preventDefault()
        if (splitSessionId) {
          setSplitSession(null)
        } else if (sessions.length >= 2) {
          const other = sessions.find(s => s.id !== activeSessionId)
          if (other) setSplitSession(other.id)
        }
      }
      // ⌘1-9 / Ctrl+1-9 — Switch to tab N
      else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (idx < sessions.length) {
          e.preventDefault()
          setActiveSession(sessions[idx].id)
        }
      }
    },
    [
      setQuickConnectOpen, setSettingsOpen, setAiPanelOpen, aiPanelOpen,
      activeSessionId, splitSessionId, sessions, licenseValid,
      closeSession, setSplitSession, setActiveSession,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const unlock = () => {
    lastActivityRef.current = Date.now()
    setLocked(false)
  }

  // Capture keydown at window level while the idle-lock overlay is active so
  // "press any key" works even when focus is inside the xterm.js canvas
  useEffect(() => {
    if (!locked) return
    const handleKey = () => unlock()
    window.addEventListener('keydown', handleKey, true) // capture phase
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [locked])

  // Show master password lock screen if needed
  if (masterLocked === null) return <div className="h-screen w-screen bg-background" /> // loading
  if (masterLocked) {
    return <MasterPasswordLock onUnlocked={() => {
      setMasterLocked(false)
      loadConnections(); loadGroups(); loadSshKeys(); loadSettings()
    }} />
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
      <Toaster position="bottom-right" theme="dark" richColors closeButton />
      <TitleBar />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {sessions.length === 0 ? <HomeScreen /> : <TerminalArea />}
        </main>
      </div>

      <ConnectionDialog />
      <QuickConnect />
      <SettingsDialog />

      {/* Update notification banner */}
      {updateBanner && (
        <div className={cn(
          'fixed bottom-5 right-5 z-[150] w-80 rounded-xl border border-primary/30',
          'bg-background/95 backdrop-blur-sm shadow-2xl shadow-black/40',
          'flex flex-col gap-3 p-4'
        )}>
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <ArrowUpCircle className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Update Available</p>
                <p className="text-xs text-muted-foreground">
                  v{updateBanner.version} is ready
                </p>
              </div>
            </div>
            <button
              onClick={() => setUpdateBanner(null)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href={updateBanner.url}
              onClick={(e) => { e.preventDefault(); window.open(updateBanner.url) }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              onClick={() => setUpdateBanner(null)}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center cursor-pointer"
          onClick={unlock}
          onKeyDown={unlock}
          role="button"
          tabIndex={0}
        >
          <div className="text-center select-none pointer-events-none">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mx-auto mb-4">
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
