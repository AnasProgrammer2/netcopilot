import { useState, useRef, useCallback } from 'react'
import { Search, Plus, FolderPlus, ChevronDown, ChevronRight, Server, Router, Monitor, Key, Usb, Pencil, Trash2, Download, Upload, MoreHorizontal, Clock, Zap, FileCode } from 'lucide-react'
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
  } = useAppStore()

  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [sshConfigDialogOpen, setSshConfigDialogOpen] = useState(false)

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

  const filtered = connections.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.host.toLowerCase().includes(search.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  const groupIds = new Set(groups.map((g) => g.id))
  const ungrouped = filtered.filter((c) => !c.groupId || !groupIds.has(c.groupId))
  const getGroupConnections = (groupId: string) => filtered.filter((c) => c.groupId === groupId)

  return (
    <div
      className="flex shrink-0 bg-sidebar border-r border-sidebar-border relative"
      style={{ width: sidebarWidth }}
    >
      <div className="flex flex-col w-full overflow-hidden">
        {/* Header */}
        <div className="px-3 pt-3 pb-3 border-b border-sidebar-border">
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

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-2 text-[13px] bg-sidebar-accent/50 border border-sidebar-border rounded-xl text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring transition-colors"
            />
          </div>
        </div>

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
                  <Upload className="w-3.5 h-3.5" /> Import
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
                    />
                  ))}
              </div>
            )
          })}

          {/* Ungrouped — also a drop target */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDropTargetId('ungrouped') }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(e) => { e.preventDefault(); handleConnDrop(undefined) }}
            className={cn('rounded-lg transition-colors', dropTargetId === 'ungrouped' && 'ring-1 ring-primary/50 bg-primary/5')}
          >
            {ungrouped.map((conn) => (
              <ConnectionItem
                key={conn.id}
                connection={conn}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onConnect={() => openSession(conn)}
                onOpenSftp={() => openSftpSession(conn)}
                onEdit={() => setConnectionDialogOpen(true, conn)}
                onDragStart={() => { dragConnId.current = conn.id }}
              />
            ))}
          </div>
        </div>

        {/* Footer actions — always visible, Termius-style */}
        <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
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
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-opacity"
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
}

function ConnectionItem({
  connection, indent = false, sessions, activeSessionId, onConnect, onOpenSftp, onEdit, onDragStart
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
        onDoubleClick={onConnect}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-3 px-2.5 py-2.5 text-left group transition-all rounded-xl cursor-pointer',
          indent && 'pl-6',
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/70'
        )}
      >
        <div
          className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}20` }}
        >
          <DeviceIcon className="w-4.5 h-4.5" style={{ color: accent }} />
          {isConnected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-sidebar" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate leading-tight text-sidebar-foreground">{connection.name}</p>
          <p className="text-[12px] text-sidebar-foreground/50 truncate mt-0.5">
            {connection.lastConnectedAt
              ? <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 shrink-0" />{timeAgo(connection.lastConnectedAt)}</span>
              : (connection.protocol === 'serial'
                  ? (connection.serialConfig?.path ?? connection.host)
                  : connection.host)
            }
          </p>
        </div>

        <div className="relative shrink-0 flex items-center">
          {/* Protocol badge — hidden on hover */}
          <span
            className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-lg font-bold transition-all group-hover:opacity-0 group-hover:scale-75"
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
