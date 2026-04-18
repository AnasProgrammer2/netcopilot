import { X, Plus } from 'lucide-react'
import { useAppStore } from '../../store'
import { Session } from '../../types'
import { cn } from '../../lib/utils'

export function TabBar(): JSX.Element {
  const { sessions, activeSessionId, setActiveSession, closeSession, setQuickConnectOpen } = useAppStore()

  return (
    <div className="flex items-center border-b border-border bg-background overflow-x-auto shrink-0">
      {sessions.map((session) => (
        <Tab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onActivate={() => setActiveSession(session.id)}
          onClose={() => closeSession(session.id)}
        />
      ))}

      <button
        onClick={() => setQuickConnectOpen(true)}
        className="shrink-0 flex items-center justify-center w-8 h-9 ml-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
        title="New session (⌘K)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

interface TabProps {
  session: Session
  isActive: boolean
  onActivate: () => void
  onClose: () => void
}

function Tab({ session, isActive, onActivate, onClose }: TabProps): JSX.Element {
  const statusColor = {
    connecting: 'bg-amber-400',
    connected: 'bg-emerald-400',
    disconnected: 'bg-gray-400',
    error: 'bg-red-400'
  }[session.status]

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 h-9 border-r border-border cursor-pointer shrink-0 group max-w-48',
        isActive
          ? 'bg-background text-foreground border-b-2 border-b-primary'
          : 'bg-sidebar text-muted-foreground hover:bg-background/50 hover:text-foreground'
      )}
      onClick={onActivate}
    >
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
      <span className="text-xs font-medium truncate flex-1">{session.connection.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="shrink-0 p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
