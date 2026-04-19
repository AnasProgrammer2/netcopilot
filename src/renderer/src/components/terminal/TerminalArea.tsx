import { useAppStore } from '../../store'
import { TabBar } from './TabBar'
import { TerminalTab } from './TerminalTab'

export function TerminalArea(): JSX.Element {
  const { sessions, activeSessionId, splitSessionId } = useAppStore()

  const isSplit = !!splitSessionId && sessions.some(s => s.id === splitSessionId) && sessions.length >= 2

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TabBar />
      <div className="flex-1 relative overflow-hidden flex">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const isSplitPane = isSplit && session.id === splitSessionId

          if (!isActive && !isSplitPane) {
            // Keep mounted but fully hidden (preserves xterm state)
            return (
              <div key={session.id} className="hidden">
                <TerminalTab session={session} />
              </div>
            )
          }

          if (isSplit) {
            return (
              <div
                key={session.id}
                className={`flex-1 overflow-hidden ${isActive && isSplitPane ? '' : ''} ${isActive && !isSplitPane ? 'border-r border-border' : ''}`}
              >
                <TerminalTab session={session} />
              </div>
            )
          }

          // Normal single-pane
          return (
            <div key={session.id} className="absolute inset-0">
              <TerminalTab session={session} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
