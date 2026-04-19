import { useEffect, useCallback, useState, useRef } from 'react'
import { Lock } from 'lucide-react'
import { useAppStore } from './store'
import { Sidebar } from './components/sidebar/Sidebar'
import { TerminalArea } from './components/terminal/TerminalArea'
import { ConnectionDialog } from './components/dialogs/ConnectionDialog'
import { QuickConnect } from './components/dialogs/QuickConnect'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { MasterPasswordLock } from './components/MasterPasswordLock'

export default function App(): JSX.Element {
  const { loadConnections, loadGroups, loadSshKeys, loadSettings, sessions, setQuickConnectOpen } = useAppStore()
  const [masterLocked, setMasterLocked] = useState<boolean | null>(null) // null = checking
  const [locked, setLocked] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const autoLockMinsRef = useRef(0)

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickConnectOpen(true)
      }
    },
    [setQuickConnectOpen]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const unlock = () => {
    lastActivityRef.current = Date.now()
    setLocked(false)
  }

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
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden">
          {sessions.length === 0 ? <WelcomeScreen /> : <TerminalArea />}
        </main>
      </div>

      <ConnectionDialog />
      <QuickConnect />
      <SettingsDialog />

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
