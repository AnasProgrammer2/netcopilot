import { useState, useMemo } from 'react'
import {
  Search, Plus, FolderPlus, Router, Server, Monitor, Usb,
  ChevronRight, Zap, Terminal, ArrowRight,
  Layers
} from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, ConnectionGroup, DeviceType } from '../../types'
import { cn } from '../../lib/utils'
import { GroupDialog } from '../sidebar/GroupDialog'
import { SSHKeyDialog } from '../dialogs/SSHKeyDialog'

// ── Device helpers ────────────────────────────────────────────────────────────

function getDeviceIcon(deviceType: DeviceType, protocol?: string) {
  if (protocol === 'serial') return Usb
  switch (deviceType) {
    case 'cisco-ios': case 'cisco-iosxe': case 'cisco-nxos':
    case 'cisco-asa': case 'junos': case 'arista-eos':
    case 'panos': case 'nokia-sros': case 'huawei-vrp':
    case 'mikrotik': case 'fortios': case 'hp-procurve': case 'f5-tmos':
      return Router
    case 'windows': return Monitor
    case 'linux':   return Server
    default:        return Server
  }
}

function getDeviceAccent(deviceType: DeviceType, protocol?: string): string {
  if (protocol === 'serial') return '#f59e0b'
  switch (deviceType) {
    case 'cisco-ios': case 'cisco-iosxe': case 'cisco-nxos':
      return '#3b82f6'
    case 'cisco-asa': case 'panos': case 'fortios':
      return '#f97316'
    case 'junos': case 'arista-eos':
      return '#a855f7'
    case 'linux':
      return '#22c55e'
    case 'windows':
      return '#60a5fa'
    default:
      return '#94a3b8'
  }
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, hostCount, connectedCount, onClick }: {
  group: ConnectionGroup
  hostCount: number
  connectedCount: number
  onClick: () => void
}) {
  const color = group.color || '#3b82f6'

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-left group cursor-pointer"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Layers className="w-5 h-5" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-foreground truncate">{group.name}</p>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="text-[13px] text-muted-foreground">{hostCount} Hosts</span>
          {connectedCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {connectedCount} live
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
    </button>
  )
}

// ── Host Card ─────────────────────────────────────────────────────────────────
function HostCard({ connection, isConnected, onConnect }: {
  connection: Connection
  isConnected: boolean
  onConnect: () => void
}) {
  const Icon   = getDeviceIcon(connection.deviceType, connection.protocol)
  const accent = getDeviceAccent(connection.deviceType, connection.protocol)

  const host = connection.protocol === 'serial'
    ? (connection.serialConfig?.path ?? connection.host)
    : connection.host

  const showPort = connection.protocol !== 'serial' && connection.port && connection.port !== 22

  return (
    <button
      onClick={onConnect}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left group transition-all cursor-pointer w-full',
        isConnected
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50'
          : 'border-border bg-card hover:bg-accent/40 hover:border-primary/25 hover:shadow-sm'
      )}
    >
      {/* Device icon */}
      <div
        className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}15` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
        {isConnected && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
          {connection.name || connection.host}
        </p>
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {host}{showPort ? `:${connection.port}` : ''}
          {connection.protocol && (
            <span className="ml-1.5 text-muted-foreground/60">{connection.protocol}</span>
          )}
          {connection.username && (
            <span className="ml-1.5 text-muted-foreground/50">{connection.username}</span>
          )}
        </p>
      </div>

      {/* Right side — status */}
      <div className="shrink-0 self-center">
        {isConnected ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            live
          </span>
        ) : (
          <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
    </button>
  )
}

// ── Main HomeScreen ───────────────────────────────────────────────────────────
export function HomeScreen(): JSX.Element {
  const {
    connections, groups, sessions,
    setConnectionDialogOpen,
    openSession, setQuickConnectOpen
  } = useAppStore()

  const [search,           setSearch]           = useState('')
  const [selectedGroup,    setSelectedGroup]    = useState<string | null>(null)
  const [selectedTag,      setSelectedTag]      = useState<string | null>(null)
  const [groupDialogOpen,  setGroupDialogOpen]  = useState(false)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)

  const connectedIds   = new Set(sessions.filter(s => s.status === 'connected').map(s => s.connectionId))
  const totalConnected = sessions.filter(s => s.status === 'connected').length

  // All unique tags across connections
  const allTags = useMemo(() => {
    const set = new Set<string>()
    connections.forEach(c => c.tags?.forEach(t => set.add(t)))
    return [...set].sort()
  }, [connections])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return connections.filter(c => {
      if (selectedTag && !c.tags?.includes(selectedTag)) return false
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q))
      )
    })
  }, [connections, search, selectedTag])

  const groupIds = new Set(groups.map(g => g.id))

  const displayConns = useMemo(() => {
    if (selectedGroup) return filtered.filter(c => c.groupId === selectedGroup)
    return filtered
  }, [filtered, selectedGroup])

  const groupedConns = useMemo(() =>
    groups.map(g => ({
      group: g,
      conns: filtered.filter(c => c.groupId === g.id)
    })), [filtered, groups])

  const ungrouped    = displayConns.filter(c => !c.groupId || !groupIds.has(c.groupId))
  const currentGroup = selectedGroup ? groups.find(g => g.id === selectedGroup) : null

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">

        {/* Live sessions pill */}
        {totalConnected > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[12px] text-emerald-600 font-medium">{totalConnected} live</span>
          </div>
        )}

        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find a host or ssh user@hostname..."
            className="w-full pl-9 pr-3 py-1.5 text-[13px] bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Actions */}
        <button
          onClick={() => setConnectionDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors shrink-0 cursor-pointer shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Host
        </button>

        <button
          onClick={() => setQuickConnectOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-[13px] font-medium hover:bg-accent transition-all shrink-0 cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-yellow-500" />
          Quick
        </button>
      </div>

      {/* ── Tags filter bar ─────────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 px-5 py-2 border-b border-border/60 overflow-x-auto shrink-0 scrollbar-none">
          <span className="text-[10px] text-muted-foreground/40 font-semibold uppercase tracking-wider shrink-0">Tags</span>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-full border font-medium transition-all cursor-pointer shrink-0 whitespace-nowrap',
                selectedTag === tag
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {tag}
            </button>
          ))}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="text-[11px] px-2 py-1 rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer shrink-0"
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

        {/* Breadcrumb */}
        {selectedGroup && currentGroup && (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setSelectedGroup(null)}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              All
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
            <span className="text-foreground font-medium">{currentGroup.name}</span>
            <span className="text-muted-foreground/50 text-xs ml-1">
              ({displayConns.length} hosts)
            </span>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <Terminal className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">No connections yet</p>
              <p className="text-sm text-muted-foreground mt-1.5">
                Add your first host to start managing devices with ARIA
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConnectionDialogOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Host
              </button>
              <button
                onClick={() => setQuickConnectOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-foreground text-sm hover:bg-accent transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4 text-yellow-500" />
                Quick Connect
              </button>
            </div>
          </div>
        )}

        {/* ── Groups ──────────────────────────────────────────────────────── */}
        {!selectedGroup && groups.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-foreground">
                Groups
              </span>
              <button
                onClick={() => setGroupDialogOpen(true)}
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                New
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {groupedConns
                .filter(({ conns }) => !search || conns.length > 0)
                .map(({ group, conns }) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    hostCount={conns.length}
                    connectedCount={conns.filter(c => connectedIds.has(c.id)).length}
                    onClick={() => setSelectedGroup(group.id)}
                  />
                ))}
            </div>
          </section>
        )}

        {/* ── Hosts ───────────────────────────────────────────────────────── */}
        {(ungrouped.length > 0 || (selectedGroup && displayConns.length > 0)) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-foreground">
                {selectedGroup ? 'Hosts' : groups.length > 0 ? 'All Hosts' : 'Hosts'}
              </span>
              {!selectedGroup && (
                <span className="text-[13px] text-muted-foreground">
                  {filtered.length} connection{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {(selectedGroup ? displayConns : ungrouped).map(conn => (
                <HostCard
                  key={conn.id}
                  connection={conn}
                  isConnected={connectedIds.has(conn.id)}
                  onConnect={() => openSession(conn)}
                />
              ))}
            </div>
          </section>
        )}

        {/* No search results */}
        {search && filtered.length === 0 && connections.length > 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Search className="w-7 h-7 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No results for "<span className="text-foreground">{search}</span>"
            </p>
          </div>
        )}

      </div>

      {groupDialogOpen   && <GroupDialog  onClose={() => setGroupDialogOpen(false)} />}
      {sshKeyDialogOpen  && <SSHKeyDialog onClose={() => setSshKeyDialogOpen(false)} />}
    </div>
  )
}
