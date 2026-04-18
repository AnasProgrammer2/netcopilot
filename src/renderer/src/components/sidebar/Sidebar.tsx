import { useState, useRef, useCallback } from 'react'
import { Search, Plus, FolderPlus, ChevronDown, ChevronRight, Server, Router, Monitor, Key, Usb, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, ConnectionGroup } from '../../types'
import { ConnectionContextMenu } from './ConnectionContextMenu'
import { GroupDialog } from './GroupDialog'
import { cn } from '../../lib/utils'

const GROUP_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
]

export function Sidebar(): JSX.Element {
  const {
    connections, groups, sessions, activeSessionId,
    sidebarWidth, setSidebarWidth,
    setConnectionDialogOpen, setQuickConnectOpen,
    openSession
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group?: ConnectionGroup }>({ open: false })
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
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

  const ungrouped = filtered.filter((c) => !c.groupId)
  const getGroupConnections = (groupId: string) => filtered.filter((c) => c.groupId === groupId)

  return (
    <div
      className="flex shrink-0 bg-sidebar border-r border-sidebar-border relative"
      style={{ width: sidebarWidth }}
    >
      <div className="flex flex-col w-full overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-sidebar-border">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold text-sidebar-foreground/60 uppercase tracking-wider flex-1">
              Connections
            </span>
            <button
              onClick={() => setConnectionDialogOpen(true)}
              className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground"
              title="New Connection"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGroupDialog({ open: true })}
              className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground"
              title="New Group"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-foreground/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-sidebar-accent border border-sidebar-border rounded-md text-sidebar-foreground placeholder:text-sidebar-foreground/30 focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
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
            return (
              <div key={group.id}>
                <div className="flex items-center group/grp hover:bg-sidebar-accent">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-xs text-sidebar-foreground/50 group-hover/grp:text-sidebar-foreground min-w-0"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    )}
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: group.color || GROUP_COLORS[0] }}
                    />
                    <span className="font-medium uppercase tracking-wider truncate">{group.name}</span>
                    <span className="ml-auto text-sidebar-foreground/30 shrink-0">{groupConns.length}</span>
                  </button>
                  {/* Edit / Delete group — visible on hover */}
                  <div className="flex items-center pr-1 opacity-0 group-hover/grp:opacity-100 transition-opacity">
                    <button
                      onClick={() => setGroupDialog({ open: true, group })}
                      className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground"
                      title="Edit group"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => useAppStore.getState().deleteGroup(group.id)}
                      className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-destructive"
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

        {/* SSH Keys shortcut */}
        <div className="border-t border-sidebar-border p-2">
          <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <Key className="w-3.5 h-3.5" />
            SSH Keys
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
      />

      {groupDialog.open && (
        <GroupDialog
          group={groupDialog.group}
          onClose={() => setGroupDialog({ open: false })}
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
  onEdit: () => void
}

function ConnectionItem({
  connection, indent = false, sessions, activeSessionId, onConnect, onEdit
}: ConnectionItemProps): JSX.Element {
  const { deleteConnection } = useAppStore()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const activeSession = sessions.find((s) => s.connectionId === connection.id)
  const isActive = activeSession ? activeSession.id === activeSessionId : false
  const isConnected = activeSession?.status === 'connected'

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const DeviceIcon = getDeviceIcon(connection.deviceType, connection.protocol)

  return (
    <>
      <button
        onDoubleClick={onConnect}
        onContextMenu={handleContextMenu}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left group transition-colors',
          indent && 'pl-7',
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <div className="relative shrink-0">
          <DeviceIcon className="w-4 h-4" style={{ color: connection.color || '#6b7280' }} />
          {isConnected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-sidebar" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{connection.name}</p>
          <p className="text-[10px] text-sidebar-foreground/40 truncate">
            {connection.protocol === 'serial'
              ? (connection.serialConfig?.path ?? connection.host)
              : `${connection.host}:${connection.port}`}
          </p>
        </div>

        <span className="text-[10px] text-sidebar-foreground/30 shrink-0 uppercase">
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
