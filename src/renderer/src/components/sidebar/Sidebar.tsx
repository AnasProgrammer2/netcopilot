import { useState, useRef, useCallback } from 'react'
import { Search, Plus, FolderPlus, ChevronDown, ChevronRight, Server, Router, Monitor, Key, Usb, Pencil, Trash2, Download, Upload } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, ConnectionGroup } from '../../types'
import { ConnectionContextMenu } from './ConnectionContextMenu'
import { GroupDialog } from './GroupDialog'
import { SSHKeyDialog } from '../dialogs/SSHKeyDialog'
import { cn } from '../../lib/utils'

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
    openSession, exportConnections, importConnections
  } = useAppStore()

  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [sshKeyDialogOpen, setSshKeyDialogOpen] = useState(false)
  const [resizing, setResizing] = useState(false)

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
        <div className="px-3 pt-3 pb-2.5 border-b border-sidebar-border">
          <div className="flex items-center gap-1 mb-2.5">
            <span className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest flex-1 pl-0.5">
              Connections
            </span>
            <button
              onClick={() => setConnectionDialogOpen(true)}
              className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="New Connection"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGroupDialog({ open: true })}
              className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors cursor-pointer"
              title="New Group"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-sidebar-foreground/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-sidebar-accent/50 border border-sidebar-border rounded-lg text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring transition-colors"
            />
          </div>
        </div>

        {/* Connection list */}
        <div className="flex-1 overflow-y-auto py-1">
          {connections.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <Server className="w-8 h-8 text-sidebar-foreground/20" />
              <p className="text-xs text-sidebar-foreground/40">No connections yet</p>
              <button
                onClick={() => setQuickConnectOpen(true)}
                className="text-xs text-primary hover:underline"
              >
                Quick connect
              </button>
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => {
            const groupConns = getGroupConnections(group.id)
            if (search && groupConns.length === 0) return null
            const isCollapsed = collapsedGroups.has(group.id)
            const groupColor = group.color || GROUP_COLORS[0]
            return (
              <div key={group.id}>
                <div className="flex items-center group/grp hover:bg-sidebar-accent/50 mx-1 rounded-lg transition-colors">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground/50 group-hover/grp:text-sidebar-foreground min-w-0 cursor-pointer"
                  >
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 shrink-0 text-sidebar-foreground/30" />
                      : <ChevronDown  className="w-3 h-3 shrink-0 text-sidebar-foreground/30" />
                    }
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: groupColor }}
                    />
                    <span className="font-semibold uppercase tracking-widest text-[10px] truncate">{group.name}</span>
                    <span className="ml-auto text-sidebar-foreground/30 shrink-0 tabular-nums">{groupConns.length}</span>
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
                      onEdit={() => setConnectionDialogOpen(true, conn)}
                    />
                  ))}
              </div>
            )
          })}

          {/* Ungrouped */}
          {ungrouped.map((conn) => (
            <ConnectionItem
              key={conn.id}
              connection={conn}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onConnect={() => openSession(conn)}
              onEdit={() => setConnectionDialogOpen(true, conn)}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="border-t border-sidebar-border p-2 space-y-0.5">
          {[
            { icon: Key,      label: 'SSH Keys',           action: () => setSshKeyDialogOpen(true) },
            { icon: Download, label: 'Export Connections',  action: () => exportConnections() },
            { icon: Upload,   label: 'Import Connections',  action: async () => {
              setImportMsg(null)
              const count = await importConnections()
              if (count === -1)     setImportMsg('Import failed — invalid file')
              else if (count === 0) setImportMsg('No connections imported')
              else                  setImportMsg(`Imported ${count} connection${count !== 1 ? 's' : ''}`)
              setTimeout(() => setImportMsg(null), 3500)
            }},
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
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
    </div>
  )
}

interface ConnectionItemProps {
  connection: Connection
  indent?: boolean
  sessions: import('../../types').Session[]
  activeSessionId: string | null
  onConnect: () => void
  onEdit: () => void
}

function ConnectionItem({
  connection, indent = false, sessions, activeSessionId, onConnect, onEdit
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
      <button
        onDoubleClick={onConnect}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 text-left group transition-all rounded-lg mx-1 cursor-pointer',
          indent && 'pl-5',
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
        )}
        style={{ width: 'calc(100% - 8px)' }}
      >
        {/* Icon with accent background */}
        <div
          className="relative w-6 h-6 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <DeviceIcon className="w-3.5 h-3.5" style={{ color: accent }} />
          {isConnected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-sidebar" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate leading-tight">{connection.name}</p>
          <p className="text-[10px] text-sidebar-foreground/35 truncate mt-0.5">
            {connection.protocol === 'serial'
              ? (connection.serialConfig?.path ?? connection.host)
              : connection.host}
          </p>
        </div>

        <span
          className="text-[9px] font-mono uppercase shrink-0 px-1 py-0.5 rounded font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: `${accent}15`, color: accent }}
        >
          {connection.protocol}
        </span>
      </button>

      {menuPos && (
        <ConnectionContextMenu
          position={menuPos}
          onClose={() => setMenuPos(null)}
          onConnect={onConnect}
          onEdit={onEdit}
          onDelete={() => deleteConnection(connection.id)}
          onDuplicate={handleDuplicate}
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
