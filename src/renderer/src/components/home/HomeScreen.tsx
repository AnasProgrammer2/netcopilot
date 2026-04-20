import { useState, useMemo } from 'react'
import {
  Search, Plus, FolderPlus, Router, Server, Monitor, Usb,
  ChevronRight, Zap, Terminal, Key, Download, Upload,
  Wifi, WifiOff, Layers
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
      className="relative flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/60 hover:border-primary/25 transition-all text-left group cursor-pointer overflow-hidden"
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ backgroundColor: color }}
      />

      {/* Icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ml-2"
        style={{ backgroundColor: `${color}18` }}
      >
        <Layers className="w-4 h-4" style={{ color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{hostCount} hosts</span>
          {connectedCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {connectedCount} live
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors shrink-0" />
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

  return (
    <button
      onClick={onConnect}
      className={cn(
        'relative flex items-center gap-3 p-3.5 rounded-xl border text-left group transition-all cursor-pointer overflow-hidden w-full',
        isConnected
          ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40'
          : 'border-border bg-card hover:bg-accent/60 hover:border-primary/25'
      )}
    >
      {/* Device icon */}
      <div
        className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}18` }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
        {isConnected && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {connection.name || connection.host}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {connection.protocol === 'serial'
            ? connection.serialConfig?.path ?? connection.host
            : connection.host}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: `${accent}15`, color: accent }}
          >
            {connection.protocol}
          </span>
          {connection.username && (
            <span className="text-[10px] text-muted-foreground/60 truncate">
              {connection.username}
            </span>
          )}
        </div>
      </div>

      {/* Status icon */}
      <div className="shrink-0">
        {isConnected
          ? <Wifi className="w-3.5 h-3.5 text-emerald-500" />
          : <WifiOff className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors" />
        }
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

  const [search,           setSearch]           = useState('')
  const [selectedGroup,    setSelectedGroup]    = useState<string | null>(null)
  const [importMsg,        setImportMsg]        = useState<string | null>(null)
  const [groupDialogOpen,  setGroupDialogOpen]  = useState(false)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)

  const connectedIds   = new Set(sessions.filter(s => s.status === 'connected').map(s => s.connectionId))
  const totalConnected = sessions.filter(s => s.status === 'connected').length

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

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">

        {/* Live sessions pill */}
        {totalConnected > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-500 font-medium">{totalConnected} live</span>
          </div>
        )}

        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hosts, IPs, users..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Actions */}
        <button
          onClick={() => setConnectionDialogOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Host
        </button>

        <button
          onClick={() => setQuickConnectOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-card border border-border text-foreground text-sm font-medium hover:bg-accent transition-all shrink-0 cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-yellow-500" />
          Quick
        </button>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

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
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Groups
              </span>
              <button
                onClick={() => setGroupDialogOpen(true)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
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
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {selectedGroup ? 'Hosts' : groups.length > 0 ? 'All Hosts' : 'Hosts'}
              </span>
              {!selectedGroup && (
                <span className="text-[11px] text-muted-foreground/50">
                  {filtered.length} connection{filtered.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
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

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {connections.length > 0 && (
          <div className="flex items-center gap-1 pt-3 border-t border-border">
            <button
              onClick={exportConnections}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => setSshKeyDialogOpen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              SSH Keys
            </button>
            {importMsg && (
              <span className={cn(
                'text-xs px-2 py-1 rounded ml-2',
                importMsg.startsWith('Imported')
                  ? 'text-emerald-500 bg-emerald-500/10'
                  : 'text-red-400 bg-red-400/10'
              )}>
                {importMsg}
              </span>
            )}
          </div>
        )}
      </div>

      {groupDialogOpen   && <GroupDialog  onClose={() => setGroupDialogOpen(false)} />}
      {sshKeyDialogOpen  && <SSHKeyDialog onClose={() => setSshKeyDialogOpen(false)} />}
    </div>
  )
}
