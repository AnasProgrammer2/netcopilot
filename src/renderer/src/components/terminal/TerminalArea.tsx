import { useAppStore } from '../../store'
import { TabBar } from './TabBar'
import { TerminalTab } from './TerminalTab'

export function TerminalArea(): JSX.Element {
  const { sessions, activeSessionId } = useAppStore()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TabBar />
      <div className="flex-1 relative overflow-hidden">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`absolute inset-0 ${session.id === activeSessionId ? 'block' : 'hidden'}`}
          >
            <TerminalTab session={session} />
          </div>
        ))}
      </div>
    </div>
  )
}
