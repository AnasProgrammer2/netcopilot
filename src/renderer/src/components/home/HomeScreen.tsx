import { useState, useMemo } from 'react'
import {
  Search, Plus, FolderPlus, Router, Server, Monitor, Usb,
  ChevronRight, Zap, Terminal, Key, Download, Upload
} from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, ConnectionGroup, DeviceType } from '../../types'
import { cn } from '../../lib/utils'
import { GroupDialog } from '../sidebar/GroupDialog'
import { SSHKeyDialog } from '../dialogs/SSHKeyDialog'

const GROUP_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#84cc16'
]

function getDeviceIcon(deviceType: DeviceType, protocol?: string) {
  if (protocol === 'serial') return Usb
  switch (deviceType) {
    case 'cisco-ios':
    case 'cisco-iosxe':
    case 'cisco-nxos':
    case 'cisco-asa':
    case 'junos':
    case 'arista-eos':
    case 'panos':
    case 'nokia-sros':
    case 'huawei-vrp':
    case 'mikrotik':
    case 'fortios':
    case 'hp-procurve':
    case 'f5-tmos':
      return Router
    case 'windows':
      return Monitor
    case 'linux':
      return Server
    default:
      return Server
  }
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, hostCount, onClick }: {
  group: ConnectionGroup
  hostCount: number
  onClick: () => void
}) {
  const color = group.color || GROUP_COLORS[0]

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-left group"
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <div className="w-5 h-5 rounded grid grid-cols-2 gap-0.5">
          <div className="rounded-[2px]" style={{ backgroundColor: color }} />
          <div className="rounded-[2px]" style={{ backgroundColor: color }} />
          <div className="rounded-[2px]" style={{ backgroundColor: color }} />
          <div className="rounded-[2px]" style={{ backgroundColor: color }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {hostCount} {hostCount === 1 ? 'Host' : 'Hosts'}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </button>
  )
}

// ── Host Card ─────────────────────────────────────────────────────────────────
function HostCard({ connection, isConnected, onConnect }: {
  connection: Connection
  isConnected: boolean
  onConnect: () => void
}) {
  const Icon = getDeviceIcon(connection.deviceType, connection.protocol)

  return (
    <button
      onDoubleClick={onConnect}
      onClick={onConnect}
      className={cn(
        'flex items-center gap-3 p-4 rounded-xl border text-left group transition-all relative',
        isConnected
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'border-border bg-card hover:bg-accent/50 hover:border-primary/30'
      )}
    >
      {/* Device icon block */}
      <div className="w-10 h-10 rounded-lg bg-[#1a2744] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-blue-300" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">
            {connection.name || connection.host}
          </p>
          {isConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {connection.protocol === 'serial'
            ? connection.serialConfig?.path ?? connection.host
            : connection.host}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground/60 font-mono uppercase">
            {connection.protocol}
          </span>
          {connection.username && (
            <>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[10px] text-muted-foreground/60 truncate">
                {connection.username}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Main HomeScreen ───────────────────────────────────────────────────────────
export function HomeScreen(): JSX.Element {
  const {
    connections, groups, sessions,
    setConnectionDialogOpen,
    openSession, setQuickConnectOpen,
    exportConnections, importConnections
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)

  const connectedIds = new Set(
    sessions.filter(s => s.status === 'connected').map(s => s.connectionId)
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return connections.filter(c =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.host.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    )
  }, [connections, search])

  const groupIds = new Set(groups.map(g => g.id))

  // If a group is selected, show its connections
  const displayConns = useMemo(() => {
    if (selectedGroup) return filtered.filter(c => c.groupId === selectedGroup)
    return filtered
  }, [filtered, selectedGroup])

  const groupedConns = useMemo(() =>
    groups.map(g => ({
      group: g,
      conns: filtered.filter(c => c.groupId === g.id)
    })), [filtered, groups])

  const ungrouped = displayConns.filter(c => !c.groupId || !groupIds.has(c.groupId))
  const currentGroup = selectedGroup ? groups.find(g => g.id === selectedGroup) : null

  const handleImport = async () => {
    setImportMsg(null)
    const count = await importConnections()
    if (count === -1)     setImportMsg('Import failed — invalid file')
    else if (count === 0) setImportMsg('No connections imported')
    else                  setImportMsg(`Imported ${count} connection${count !== 1 ? 's' : ''}`)
    setTimeout(() => setImportMsg(null), 3500)
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find a host or ssh user@hostname..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Action buttons */}
        <button
          onClick={() => setConnectionDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Host
        </button>

        <button
          onClick={() => setQuickConnectOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors shrink-0"
        >
          <Zap className="w-4 h-4 text-yellow-400" />
          Quick Connect
        </button>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">

        {/* Breadcrumb when inside a group */}
        {selectedGroup && currentGroup && (
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setSelectedGroup(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
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

        {/* Empty state */}
        {connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center">
              <Terminal className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-foreground">No connections yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first host to get started
              </p>
            </div>
            <button
              onClick={() => setConnectionDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Host
            </button>
          </div>
        )}

        {/* Groups section — only on root view */}
        {!selectedGroup && groups.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Groups
              </h2>
              <button
                onClick={() => setGroupDialogOpen(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Group
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
                    onClick={() => setSelectedGroup(group.id)}
                  />
                ))}
            </div>
          </section>
        )}

        {/* Hosts section */}
        {(ungrouped.length > 0 || (selectedGroup && displayConns.length > 0)) && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {selectedGroup ? 'Hosts' : groups.length > 0 ? 'All Hosts' : 'Hosts'}
              </h2>
              {!selectedGroup && (
                <span className="text-xs text-muted-foreground/50">
                  {filtered.length} connection{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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

        {/* Search no results */}
        {search && filtered.length === 0 && connections.length > 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Search className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No results for "<span className="text-foreground">{search}</span>"
            </p>
          </div>
        )}

        {/* ── Footer actions ────────────────────────────────────────────────── */}
        {connections.length > 0 && (
          <div className="flex items-center gap-4 pt-2 border-t border-border">
            <button
              onClick={exportConnections}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => setSshKeyDialogOpen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              SSH Keys
            </button>
            {importMsg && (
              <span className={cn(
                'text-xs px-2 py-1 rounded ml-2',
                importMsg.startsWith('Imported')
                  ? 'text-emerald-400 bg-emerald-400/10'
                  : 'text-red-400 bg-red-400/10'
              )}>
                {importMsg}
              </span>
            )}
          </div>
        )}
      </div>

      {groupDialogOpen && (
        <GroupDialog onClose={() => setGroupDialogOpen(false)} />
      )}
      {sshKeyDialogOpen && (
        <SSHKeyDialog onClose={() => setSshKeyDialogOpen(false)} />
      )}
    </div>
  )
}
