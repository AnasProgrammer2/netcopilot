import { useEffect, useCallback } from 'react'
import { useAppStore } from './store'
import { Sidebar } from './components/sidebar/Sidebar'
import { TerminalArea } from './components/terminal/TerminalArea'
import { ConnectionDialog } from './components/dialogs/ConnectionDialog'
import { QuickConnect } from './components/dialogs/QuickConnect'
import { SettingsDialog } from './components/dialogs/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { WelcomeScreen } from './components/WelcomeScreen'

export default function App(): JSX.Element {
  const { loadConnections, loadGroups, loadSshKeys, sessions, setQuickConnectOpen } = useAppStore()

  useEffect(() => {
    loadConnections()
    loadGroups()
    loadSshKeys()
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
    </div>
  )
}
