import { Terminal, Plus, Zap, Clock, ArrowRight } from 'lucide-react'
import { useAppStore } from '../store'
import { cn } from '../lib/utils'

export function WelcomeScreen(): JSX.Element {
  const { setConnectionDialogOpen, setQuickConnectOpen, connections } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const recentConnections = connections
    .filter((c) => c.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .slice(0, 5)

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 p-8">
      {/* Logo + heading */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Terminal className="w-7 h-7 text-primary" />
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">NetCopilot</h1>
          <p className="text-sm text-muted-foreground">
            SSH · Telnet · Serial Console
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={() => setQuickConnectOpen(true)}
          className="flex items-center gap-3 p-3.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-left transition-colors group"
        >
          <Zap className="w-4 h-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Quick Connect</p>
            <p className="text-xs opacity-75 mt-0.5">
              {isMac ? '⌘K' : 'Ctrl+K'} · Connect instantly
            </p>
          </div>
          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>

        <button
          onClick={() => setConnectionDialogOpen(true)}
          className="flex items-center gap-3 p-3.5 rounded-lg bg-secondary border border-border hover:bg-accent hover:border-border/80 text-left transition-colors group"
        >
          <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">New Connection</p>
            <p className="text-xs text-muted-foreground mt-0.5">Save to your library</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      </div>

      {/* Recent connections */}
      {recentConnections.length > 0 && (
        <div className="w-full max-w-xs space-y-1.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3 h-3 text-muted-foreground/60" />
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Recent</p>
          </div>
          <div className="flex flex-col gap-0.5">
            {recentConnections.map((conn) => (
              <RecentConnectionItem key={conn.id} connection={conn} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RecentConnectionItem({ connection }: { connection: import('../types').Connection }): JSX.Element {
  const { openSession } = useAppStore()

  const protocolColor: Record<string, string> = {
    ssh:    'text-violet-400',
    telnet: 'text-amber-400',
    serial: 'text-emerald-400',
  }

  return (
    <button
      onClick={() => openSession(connection)}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary text-left transition-colors group'
      )}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: connection.color || '#8b5cf6' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{connection.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {connection.username}@{connection.host}
        </p>
      </div>
      <span className={cn('text-[10px] font-semibold uppercase tracking-wider shrink-0', protocolColor[connection.protocol] ?? 'text-muted-foreground')}>
        {connection.protocol}
      </span>
    </button>
  )
}
