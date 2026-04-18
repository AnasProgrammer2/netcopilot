import { Terminal, Plus, Zap } from 'lucide-react'
import { useAppStore } from '../store'

export function WelcomeScreen(): JSX.Element {
  const { setConnectionDialogOpen, setQuickConnectOpen, connections } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const recentConnections = connections
    .filter((c) => c.lastConnectedAt)
    .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    .slice(0, 5)

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Terminal className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Welcome to NetTerm</h1>
        <p className="text-muted-foreground text-center max-w-sm">
          SSH & Telnet client for routers, switches, and servers
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          onClick={() => setQuickConnectOpen(true)}
          className="flex items-center gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 text-left group transition-colors"
        >
          <Zap className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="font-medium text-foreground">Quick Connect</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isMac ? '⌘K' : 'Ctrl+K'} · Connect to any host instantly
            </p>
          </div>
        </button>

        <button
          onClick={() => setConnectionDialogOpen(true)}
          className="flex items-center gap-3 p-4 rounded-lg bg-secondary border border-border hover:bg-accent text-left group transition-colors"
        >
          <Plus className="w-5 h-5 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium text-foreground">New Connection</p>
            <p className="text-xs text-muted-foreground mt-0.5">Save to your connection library</p>
          </div>
        </button>
      </div>

      {recentConnections.length > 0 && (
        <div className="w-full max-w-sm">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Recent</p>
          <div className="flex flex-col gap-1">
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

  return (
    <button
      onClick={() => openSession(connection)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary text-left transition-colors"
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: connection.color || '#3b82f6' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{connection.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {connection.protocol.toUpperCase()} · {connection.username}@{connection.host}:{connection.port}
        </p>
      </div>
    </button>
  )
}
