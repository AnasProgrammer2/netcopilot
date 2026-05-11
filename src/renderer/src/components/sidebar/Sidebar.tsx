import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, Plus, FolderPlus, ChevronDown, ChevronRight, Server, Router, Monitor, Key, Usb, Pencil, Trash2, Download, Upload, MoreHorizontal, Clock, Zap, FileCode, X, FolderInput, SlidersHorizontal, Check } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, ConnectionGroup } from '../../types'
import { ConnectionContextMenu } from './ConnectionContextMenu'
import { GroupDialog } from './GroupDialog'
import { SSHKeyDialog } from '../dialogs/SSHKeyDialog'
import { ExportImportDialog } from '../dialogs/ExportImportDialog'
import { SshConfigImportDialog } from '../dialogs/SshConfigImportDialog'
import { cn, timeAgo } from '../../lib/utils'

const GROUP_COLORS = [
  '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#84cc16'
]

function getDeviceAccent(deviceType: string, protocol?: string): string {
  if (protocol === 'serial') return '#f59e0b'
  switch (deviceType) {
    case 'cisco-ios': case 'cisco-iosxe': case 'cisco-nxos': return '#3b82f6'
    case 'cisco-asa': case 'panos': case 'fortios':           return '#f97316'
    case 'junos': case 'arista-eos':                          return '#a855f7'
    case 'linux':                                             return '#22c55e'
    case 'windows':                                           return '#60a5fa'
    default:                                                  return '#94a3b8'
  }
}

export function Sidebar(): JSX.Element {
  const {
    connections, groups, sessions, activeSessionId,
    sidebarWidth, setSidebarWidth,
    setConnectionDialogOpen, setQuickConnectOpen,
    openSession, openSftpSession, exportConnections, importConnections,
    saveConnection, connectionsLoaded,
    groupDialogOpen, setGroupDialogOpen,
    selectedConnectionIds, toggleSelectConnection, clearSelection,
    deleteConnection,
  } = useAppStore()

  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [sshConfigDialogOpen, setSshConfigDialogOpen] = useState(false)
  const [footerOpen, setFooterOpen] = useState(false)
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'protocol'>('recent')
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [filterProtocol, setFilterProtocol] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'connected' | 'disconnected'>('all')

  const selCount = selectedConnectionIds.size

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selCount} connection${selCount !== 1 ? 's' : ''}?`)) return
    for (const id of selectedConnectionIds) {
      await deleteConnection(id)
    }
    clearSelection()
  }

  const handleBulkMove = async (groupId: string | undefined) => {
    for (const id of selectedConnectionIds) {
      const conn = connections.find((c) => c.id === id)
      if (conn && conn.groupId !== groupId) {
        await saveConnection({ ...conn, groupId })
      }
    }
    clearSelection()
    setBulkMoveOpen(false)
  }

  // DnD state for connections → groups
  const dragConnId = useRef<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null) // group id or 'ungrouped'

  const handleConnDrop = useCallback(async (targetGroupId: string | undefined) => {
    const connId = dragConnId.current
    if (!connId) return
    const conn = connections.find((c) => c.id === connId)
    if (conn && conn.groupId !== targetGroupId) {
      await saveConnection({ ...conn, groupId: targetGroupId })
    }
    dragConnId.current = null
    setDropTargetId(null)
  }, [connections, saveConnection])

  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group?: ConnectionGroup }>({ open: false })

  // Sync store-triggered group dialog (from Command Palette)
  useEffect(() => {
    if (groupDialogOpen) {
      setGroupDialog({ open: true })
      setGroupDialogOpen(false)
    }
  }, [groupDialogOpen, setGroupDialogOpen])
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
    setResizing(true)
    startX.current = e.clientX
    startWidth.current = sidebarWidth

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const delta = ev.clientX - startX.current
      const newWidth = Math.min(420, Math.max(200, startWidth.current + delta))
      setSidebarWidth(newWidth)
    }
    const onUp = () => {
      isResizing.current = false
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth, setSidebarWidth])

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const connectedIds = new Set(sessions.filter(s => s.status === 'connected').map(s => s.connectionId))

  const filtered = connections.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.host.toLowerCase().includes(q) && !c.tags.some((t) => t.toLowerCase().includes(q))) return false
    }
    if (filterProtocol && c.protocol !== filterProtocol) return false
    if (filterStatus === 'connected' && !connectedIds.has(c.id)) return false
    if (filterStatus === 'disconnected' && connectedIds.has(c.id)) return false
    return true
  })

  const hasActiveFilter = filterProtocol !== null || filterStatus !== 'all'

  const sortFn = (a: Connection, b: Connection) => {
    // Active (open) sessions always float to the top regardless of sort mode
    const aOpen = sessions.some((s) => s.connectionId === a.id) ? 1 : 0
    const bOpen = sessions.some((s) => s.connectionId === b.id) ? 1 : 0
    if (bOpen !== aOpen) return bOpen - aOpen

    if (sortBy === 'recent') {
      const aTime = a.lastConnectedAt ? new Date(a.lastConnectedAt).getTime() : 0
      const bTime = b.lastConnectedAt ? new Date(b.lastConnectedAt).getTime() : 0
      return bTime - aTime
    }
    if (sortBy === 'protocol') {
      const cmp = (a.protocol || '').localeCompare(b.protocol || '')
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name)
    }
    return a.name.localeCompare(b.name)
  }

  const sorted = [...filtered].sort(sortFn)

  const groupIds = new Set(groups.map((g) => g.id))
  const ungrouped = sorted.filter((c) => !c.groupId || !groupIds.has(c.groupId))
  const getGroupConnections = (groupId: string) => sorted.filter((c) => c.groupId === groupId)

  return (
    <div
      className="flex shrink-0 h-full bg-sidebar border-r border-sidebar-border relative overflow-hidden"
      style={{ width: sidebarWidth }}
    >
      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-3 pt-3 pb-3 border-b border-sidebar-border">
          <div className="flex items-center gap-1 mb-3">
            <span className="text-[15px] font-bold text-sidebar-foreground flex-1 pl-0.5 tracking-tight">
              Connections
            </span>
            <button
              onClick={() => setConnectionDialogOpen(true)}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="New Connection"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGroupDialog({ open: true })}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="New Group"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Search + Sort */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-2 text-[13px] bg-sidebar-accent/50 border border-sidebar-border rounded-xl text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring transition-colors"
            />
            </div>
            <div className="relative">
              <button
                onClick={() => setViewMenuOpen(!viewMenuOpen)}
                className={cn(
                  'relative p-2 rounded-xl border transition-colors cursor-pointer',
                  (hasActiveFilter || sortBy !== 'name')
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground/40 hover:text-sidebar-foreground'
                )}
                title="Sort & Filter"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {(hasActiveFilter || sortBy !== 'name') && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </button>
              {viewMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-popover border border-border rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sort by</p>
                    {([['name', 'Name'], ['recent', 'Last Connected'], ['protocol', 'Protocol']] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSortBy(key)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-1.5 text-[12px] transition-colors cursor-pointer rounded-lg mx-0.5',
                          sortBy === key ? 'text-primary font-semibold' : 'text-foreground hover:bg-accent'
                        )}
                      >
                        {label}
                        {sortBy === key && <Check className="w-3 h-3" />}
                      </button>
                    ))}

                    <div className="my-1.5 border-t border-border" />

                    <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Protocol</p>
                    <div className="flex flex-wrap gap-1 px-2 pb-1">
                      {['ssh', 'telnet', 'serial'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setFilterProtocol(filterProtocol === p ? null : p)}
                          className={cn(
                            'flex-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors cursor-pointer',
                            filterProtocol === p
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-accent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>

                    <p className="px-3 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                    <div className="flex gap-1 px-2 pb-1">
                      {([['all', 'All'], ['connected', 'Live'], ['disconnected', 'Offline']] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setFilterStatus(key)}
                          className={cn(
                            'flex-1 px-2 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer',
                            filterStatus === key
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-accent text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {(hasActiveFilter || sortBy !== 'name') && (
                      <>
                        <div className="my-1.5 border-t border-border" />
                        <button
                          onClick={() => { setFilterProtocol(null); setFilterStatus('all'); setSortBy('name'); setViewMenuOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg mx-0.5"
                        >
                          Reset all
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selCount > 0 && (
          <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-sidebar-border bg-primary/5">
            <span className="text-[12px] font-semibold text-primary flex-1 pl-1">{selCount} selected</span>
            <div className="relative">
              <button
                onClick={() => setBulkMoveOpen(!bulkMoveOpen)}
                className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors cursor-pointer"
                title="Move to group"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
              {bulkMoveOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setBulkMoveOpen(false)} />
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-44 bg-popover border border-border rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-bottom-2">
                    <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Move to</p>
                    <button
                      onClick={() => handleBulkMove(undefined)}
                      className="w-full text-left px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                    >
                      Ungrouped
                    </button>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => handleBulkMove(g.id)}
                        className="w-full text-left px-3 py-2 text-[13px] text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleBulkDelete}
              className="p-1.5 rounded-lg hover:bg-red-500/10 text-sidebar-foreground/60 hover:text-red-400 transition-colors cursor-pointer"
              title="Delete selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={clearSelection}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Connection list */}
        <div className="flex-1 overflow-y-auto py-1">

          {/* Skeleton loading */}
          {!connectionsLoaded && (
            <div className="px-2 py-1 space-y-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg mx-1 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-sidebar-accent/60 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded bg-sidebar-accent/60" style={{ width: `${55 + (i * 13) % 35}%` }} />
                    <div className="h-2.5 rounded bg-sidebar-accent/40" style={{ width: `${35 + (i * 17) % 30}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Better empty state */}
          {connectionsLoaded && connections.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-sidebar-accent/50 flex items-center justify-center">
                <Server className="w-6 h-6 text-sidebar-foreground/20" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-sidebar-foreground/50">No connections yet</p>
                <p className="text-[11px] text-sidebar-foreground/30 mt-1">Add your first host to get started</p>
              </div>
              <div className="flex flex-col gap-1.5 w-full">
                <button
                  onClick={() => setConnectionDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-[12px] font-medium hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> New Connection
                </button>
                <button
                  onClick={() => setQuickConnectOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/60 text-[12px] hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" /> Quick Connect
                </button>
                <button
                  onClick={() => setImportDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/60 text-[12px] hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Import Connections
                </button>
                <button
                  onClick={() => setSshConfigDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 text-sidebar-foreground/60 text-[12px] hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5" /> Import SSH Config
                </button>
              </div>
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => {
            const groupConns = getGroupConnections(group.id)
            if (search && groupConns.length === 0) return null
            const isCollapsed = collapsedGroups.has(group.id)
            const groupColor = group.color || GROUP_COLORS[0]
            const isDropTarget = dropTargetId === group.id
            return (
              <div
                key={group.id}
                onDragOver={(e) => { e.preventDefault(); setDropTargetId(group.id) }}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => { e.preventDefault(); handleConnDrop(group.id) }}
                className={cn('rounded-lg transition-colors', isDropTarget && 'ring-1 ring-primary/50 bg-primary/5')}
              >
                <div className="flex items-center group/grp hover:bg-sidebar-accent/50 mx-1 rounded-xl transition-colors">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex-1 flex items-center gap-2 px-2.5 py-2 text-[13px] text-sidebar-foreground/70 group-hover/grp:text-sidebar-foreground min-w-0 cursor-pointer"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3.5 h-3.5 shrink-0 text-sidebar-foreground/40" />
                      : <ChevronDown  className="w-3.5 h-3.5 shrink-0 text-sidebar-foreground/40" />
                    }
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: groupColor }}
                    />
                    <span className="font-bold text-[13px] truncate tracking-tight">{group.name}</span>
                    <span className="ml-auto text-sidebar-foreground/40 shrink-0 tabular-nums text-[12px] font-medium">{groupConns.length}</span>
                  </button>
                  {/* Edit / Delete group */}
                  <div className="flex items-center pr-1 opacity-0 group-hover/grp:opacity-100 transition-opacity">
                    <button
                      onClick={() => setGroupDialog({ open: true, group })}
                      className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/30 hover:text-sidebar-foreground cursor-pointer"
                      title="Edit group"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => useAppStore.getState().deleteGroup(group.id)}
                      className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/30 hover:text-destructive cursor-pointer"
                      title="Delete group"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {!isCollapsed &&
                  groupConns.map((conn) => (
                    <ConnectionItem
                      key={conn.id}
                      connection={conn}
                      indent
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      onConnect={() => openSession(conn)}
                      onOpenSftp={() => openSftpSession(conn)}
                      onEdit={() => setConnectionDialogOpen(true, conn)}
                      onDragStart={() => { dragConnId.current = conn.id }}
                      isSelected={selectedConnectionIds.has(conn.id)}
                      onSelect={(e) => toggleSelectConnection(conn.id, e.ctrlKey || e.metaKey)}
                    />
                  ))}
              </div>
            )
          })}

          {/* Ungrouped — also a drop target */}
          {(() => {
            const openConns    = ungrouped.filter((c) => sessions.some((s) => s.connectionId === c.id))
            const closedConns  = ungrouped.filter((c) => !sessions.some((s) => s.connectionId === c.id))
            const showDivider  = openConns.length > 0 && closedConns.length > 0
            return (
              <div
                onDragOver={(e) => { e.preventDefault(); setDropTargetId('ungrouped') }}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => { e.preventDefault(); handleConnDrop(undefined) }}
                className={cn('rounded-lg transition-colors stagger-children', dropTargetId === 'ungrouped' && 'ring-1 ring-primary/50 bg-primary/5')}
              >
                {openConns.map((conn) => (
                  <ConnectionItem
                    key={conn.id}
                    connection={conn}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onConnect={() => openSession(conn)}
                    onOpenSftp={() => openSftpSession(conn)}
                    onEdit={() => setConnectionDialogOpen(true, conn)}
                    onDragStart={() => { dragConnId.current = conn.id }}
                    isSelected={selectedConnectionIds.has(conn.id)}
                    onSelect={(e) => toggleSelectConnection(conn.id, e.ctrlKey || e.metaKey)}
                  />
                ))}
                {showDivider && (
                  <div className="flex items-center gap-2 px-3 py-1.5 mt-0.5">
                    <div className="h-px flex-1 bg-sidebar-border/60" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">Recent</span>
                    <div className="h-px flex-1 bg-sidebar-border/60" />
                  </div>
                )}
                {closedConns.map((conn) => (
                  <ConnectionItem
                    key={conn.id}
                    connection={conn}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onConnect={() => openSession(conn)}
                    onOpenSftp={() => openSftpSession(conn)}
                    onEdit={() => setConnectionDialogOpen(true, conn)}
                    onDragStart={() => { dragConnId.current = conn.id }}
                    isSelected={selectedConnectionIds.has(conn.id)}
                    onSelect={(e) => toggleSelectConnection(conn.id, e.ctrlKey || e.metaKey)}
                  />
                ))}
              </div>
            )
          })()}
        </div>

        {/* Footer actions — collapsible, always at bottom */}
        <div className="shrink-0 border-t border-sidebar-border">
          <button
            onClick={() => setFooterOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors cursor-pointer"
          >
            <span className="uppercase tracking-wider">Tools</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', footerOpen && 'rotate-180')} />
          </button>

          <div className={cn(
            'overflow-hidden transition-all duration-200 ease-out',
            footerOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          )}>
            <div className="px-2 pb-2 space-y-0.5">
              {[
                { icon: Key,      label: 'SSH Keys',           color: '#8b5cf6', action: () => setSshKeyDialogOpen(true) },
                { icon: FileCode, label: 'Import SSH Config',  color: '#06b6d4', action: () => setSshConfigDialogOpen(true) },
                { icon: Download, label: 'Export Connections', color: '#10b981', action: () => setExportDialogOpen(true) },
                { icon: Upload,   label: 'Import Connections', color: '#f59e0b', action: () => setImportDialogOpen(true) },
              ].map(({ icon: Icon, label, color, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer group"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color + '22' }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </div>
                  {label}
                </button>
              ))}

              {importMsg && (
                <p className={cn(
                  'text-xs px-2 py-1 rounded-lg mt-1',
                  importMsg.startsWith('Imported')
                    ? 'text-emerald-500 bg-emerald-500/10'
                    : 'text-red-400 bg-red-400/10'
                )}>
                  {importMsg}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group flex items-center justify-center transition-colors',
          resizing ? 'bg-primary/40' : 'hover:bg-primary/20'
        )}
      >
        <div className={cn(
          'w-0.5 h-8 rounded-full transition-all',
          resizing ? 'bg-primary/70 opacity-100' : 'bg-border/60 opacity-0 group-hover:opacity-100'
        )} />
      </div>

      {groupDialog.open && (
        <GroupDialog
          group={groupDialog.group}
          onClose={() => setGroupDialog({ open: false })}
        />
      )}
      {sshKeyDialogOpen && (
        <SSHKeyDialog onClose={() => setSshKeyDialogOpen(false)} />
      )}

      {exportDialogOpen && (
        <ExportImportDialog
          mode="export"
          onConfirm={async (password) => {
            setExportDialogOpen(false)
            await exportConnections(password)
          }}
          onCancel={() => setExportDialogOpen(false)}
        />
      )}

      {importDialogOpen && (
        <ExportImportDialog
          mode="import"
          onConfirm={async (password) => {
            setImportDialogOpen(false)
            setImportMsg(null)
            const count = await importConnections(password)
            if (count === -1)     setImportMsg('Import failed — invalid or wrong password')
            else if (count === 0) setImportMsg('No connections imported')
            else                  setImportMsg(`Imported ${count} connection${count !== 1 ? 's' : ''}`)
            setTimeout(() => setImportMsg(null), 3500)
          }}
          onCancel={() => setImportDialogOpen(false)}
        />
      )}

      {sshConfigDialogOpen && (
        <SshConfigImportDialog
          onImport={async (hosts) => {
            setSshConfigDialogOpen(false)
            let count = 0
            for (const host of hosts) {
              await saveConnection({
                name:         host.name,
                host:         host.hostname,
                port:         host.port,
                username:     host.username,
                protocol:     'ssh',
                authType:     host.identityFile ? 'key' : 'password',
                deviceType:   'generic',
                tags:         [],
                notes:        host.identityFile ? `IdentityFile: ${host.identityFile}` : '',
              })
              count++
            }
            setImportMsg(`Imported ${count} host${count !== 1 ? 's' : ''} from SSH config`)
            setTimeout(() => setImportMsg(null), 3500)
          }}
          onCancel={() => setSshConfigDialogOpen(false)}
        />
      )}
    </div>
  )
}

interface ConnectionItemProps {
  connection: Connection
  indent?: boolean
  sessions: import('../../types').Session[]
  activeSessionId: string | null
  onConnect: () => void
  onOpenSftp: () => void
  onEdit: () => void
  onDragStart?: () => void
  isSelected?: boolean
  onSelect?: (e: React.MouseEvent) => void
}

function ConnectionItem({
  connection, indent = false, sessions, activeSessionId, onConnect, onOpenSftp, onEdit, onDragStart,
  isSelected = false, onSelect
}: ConnectionItemProps): JSX.Element {
  const { deleteConnection, saveConnection } = useAppStore()

  const handleDuplicate = async () => {
    const { id: _id, createdAt: _ca, updatedAt: _ua, lastConnectedAt: _lca, ...rest } = connection
    await saveConnection({ ...rest, name: `${connection.name} (Copy)` })
  }
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const activeSession = sessions.find((s) => s.connectionId === connection.id)
  const isActive = activeSession ? activeSession.id === activeSessionId : false
  const isConnected = activeSession?.status === 'connected'

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const DeviceIcon = getDeviceIcon(connection.deviceType, connection.protocol)

  const accent = connection.color || getDeviceAccent(connection.deviceType, connection.protocol)

  return (
    <>
      {/* Tooltip wrapper */}
      <div className="relative group/tip mx-1" style={{ width: 'calc(100% - 8px)' }}>
        {/* Hover tooltip */}
        <div className={cn(
          'pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50',
          'w-52 bg-popover border border-border rounded-xl shadow-xl p-3 text-left',
          'opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150',
          'hidden group-hover/tip:block'
        )}>
          <p className="text-[12px] font-semibold text-foreground truncate">{connection.name}</p>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {connection.protocol.toUpperCase()} · {connection.host}{connection.port ? `:${connection.port}` : ''}
          </p>
          {connection.lastConnectedAt && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/60">
              <Clock className="w-2.5 h-2.5 shrink-0" />
              Last connected {timeAgo(connection.lastConnectedAt)}
            </div>
          )}
          {connection.notes && (
            <p className="text-[11px] text-muted-foreground/70 mt-1.5 border-t border-border pt-1.5 line-clamp-3">
              {connection.notes}
            </p>
          )}
        </div>

      <button
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey) { onSelect?.(e); return }
          onConnect()
        }}
        onDoubleClick={onConnect}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-2.5 px-2 py-1.5 text-left group transition-all rounded-lg cursor-pointer',
          'animate-in fade-in slide-in-from-left-1 duration-200',
          indent && 'pl-5',
          isSelected
            ? 'bg-primary/10 ring-1 ring-primary/40 text-sidebar-foreground'
            : isActive
              ? 'bg-sidebar-accent text-sidebar-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
        )}
      >
        <div
          className="relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}20` }}
        >
          <DeviceIcon className="w-3.5 h-3.5" style={{ color: accent }} />
          {isConnected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-sidebar animate-live-pulse shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-semibold truncate leading-tight text-sidebar-foreground">{connection.name}</p>
            {isConnected && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">Live</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <p className="text-[11px] text-sidebar-foreground/50 truncate">
              {connection.lastConnectedAt
                ? <span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5 shrink-0" />{timeAgo(connection.lastConnectedAt)}</span>
                : (connection.protocol === 'serial'
                    ? (connection.serialConfig?.path ?? connection.host)
                    : connection.host)
              }
            </p>
            {connection.tags && connection.tags.length > 0 && (
              <div className="flex items-center gap-1 shrink min-w-0 overflow-hidden">
                {connection.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-medium px-1.5 py-px rounded-md bg-sidebar-accent text-sidebar-foreground/60 truncate max-w-[60px]"
                  >
                    {tag}
                  </span>
                ))}
                {connection.tags.length > 2 && (
                  <span className="text-[9px] font-medium text-sidebar-foreground/40 shrink-0">
                    +{connection.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative shrink-0 flex items-center">
          {/* Protocol badge — hidden on hover */}
          <span
            className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-md font-bold transition-all group-hover:opacity-0 group-hover:scale-75"
            style={{ backgroundColor: `${accent}20`, color: accent }}
          >
            {connection.protocol}
          </span>

          {/* 3-dot menu — shown on hover, overlaid on badge */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              setMenuPos({ x: rect.right, y: rect.bottom + 4 })
            }}
            title="More options"
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </button>
      </div>

      {menuPos && (
        <ConnectionContextMenu
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onConnect={onConnect}
          onOpenSftp={onOpenSftp}
          onEdit={onEdit}
          onDelete={() => deleteConnection(connection.id)}
          onDuplicate={handleDuplicate}
          host={connection.host}
          port={connection.port ?? (connection.protocol === 'telnet' ? 23 : 22)}
        />
      )}
    </>
  )
}

function getDeviceIcon(deviceType: string, protocol?: string) {
  if (protocol === 'serial') return Usb
  switch (deviceType) {
    case 'cisco-ios':
    case 'cisco-iosxe':
    case 'cisco-nxos':
    case 'junos':
    case 'arista-eos':
    case 'panos':
      return Router
    case 'windows':
      return Monitor
    default:
      return Server
  }
}
