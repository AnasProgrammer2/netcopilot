import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Zap, History, Server, Router, Monitor, Usb, Settings, Plus, FolderPlus, Download, Upload, Key, Terminal } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, Protocol, DeviceType } from '../../types'
import { cn } from '../../lib/utils'
import { nanoid } from 'nanoid'

interface PaletteAction {
  type: 'action'
  id: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  color: string
}

const PALETTE_ACTIONS: PaletteAction[] = [
  { type: 'action', id: 'new-connection',  label: 'New Connection',   description: 'Create a new connection profile',   icon: Plus,      color: '#8b5cf6' },
  { type: 'action', id: 'new-group',       label: 'New Group',        description: 'Create a folder group',             icon: FolderPlus, color: '#06b6d4' },
  { type: 'action', id: 'open-settings',   label: 'Open Settings',    description: 'App settings & preferences',        icon: Settings,   color: '#94a3b8' },
  { type: 'action', id: 'ssh-keys',        label: 'SSH Keys',         description: 'Manage stored SSH keys',            icon: Key,        color: '#f59e0b' },
  { type: 'action', id: 'export',          label: 'Export Connections', description: 'Save connections to a file',      icon: Download,   color: '#10b981' },
  { type: 'action', id: 'import',          label: 'Import Connections', description: 'Load connections from a file',   icon: Upload,     color: '#3b82f6' },
  { type: 'action', id: 'split-terminal',  label: 'Split Terminal',   description: 'Toggle split view on active tab',   icon: Terminal,   color: '#ec4899' },
]

function getDeviceIcon(deviceType: DeviceType, protocol?: string) {
  if (protocol === 'serial') return Usb
  switch (deviceType) {
    case 'cisco-ios': case 'cisco-iosxe': case 'cisco-nxos':
    case 'cisco-asa': case 'junos': case 'arista-eos':
    case 'panos': case 'nokia-sros': case 'huawei-vrp':
    case 'mikrotik': case 'fortios': case 'hp-procurve': case 'f5-tmos':
      return Router
    case 'windows': return Monitor
    default:        return Server
  }
}

function getDeviceAccent(deviceType: DeviceType, protocol?: string): string {
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

type AnyItem =
  | { type: 'connection'; conn: Connection }
  | { type: 'quick'; parsed: ReturnType<typeof parseQuery> }
  | PaletteAction

export function QuickConnect(): JSX.Element {
  const {
    quickConnectOpen, setQuickConnectOpen, connections, openSession,
    setConnectionDialogOpen, setSettingsOpen, setSplitSession, activeSessionId, splitSessionId,
  } = useAppStore()
  const [query, setQuery]         = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (quickConnectOpen) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [quickConnectOpen])

  // Command mode: query starts with '>'
  const isCommandMode = query.startsWith('>')
  const commandQuery  = isCommandMode ? query.slice(1).trim().toLowerCase() : ''

  const parsed = useMemo(() => (!isCommandMode ? parseQuery(query) : null), [query, isCommandMode])

  const matchingConnections = useMemo(() => {
    if (isCommandMode) return []
    if (!query) {
      return connections
        .filter((c) => c.lastConnectedAt)
        .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
        .slice(0, 8)
    }
    return connections
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.host.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 8)
  }, [query, connections, isCommandMode])

  const matchingActions = useMemo(() => {
    if (!isCommandMode && query) return []   // Only show actions in command mode or when query is empty
    const q = commandQuery || (isCommandMode ? '' : '')
    return PALETTE_ACTIONS.filter((a) =>
      !q || a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    )
  }, [query, isCommandMode, commandQuery])

  const items = useMemo<AnyItem[]>(() => {
    if (isCommandMode) return matchingActions

    const list: AnyItem[] = []
    if (parsed?.host && !matchingConnections.some((c) => c.host === parsed.host)) {
      list.push({ type: 'quick', parsed })
    }
    matchingConnections.forEach((conn) => list.push({ type: 'connection', conn }))
    // Append actions when no search query (show at bottom)
    if (!query) matchingActions.forEach((a) => list.push(a))
    return list
  }, [matchingConnections, matchingActions, parsed, isCommandMode, query])

  useEffect(() => { setSelectedIdx(0) }, [items.length])

  if (!quickConnectOpen) return <></>

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const item = items[selectedIdx]
      if (item) handleSelect(item)
    } else if (e.key === 'Escape') {
      setQuickConnectOpen(false)
    }
  }

  const runAction = (id: string) => {
    setQuickConnectOpen(false)
    switch (id) {
      case 'new-connection':  setConnectionDialogOpen(true); break
      case 'new-group':       setConnectionDialogOpen(true); break  // reuse dialog; groups handled via sidebar
      case 'open-settings':   setSettingsOpen(true); break
      case 'ssh-keys':        /* trigger via event */ document.dispatchEvent(new CustomEvent('open-ssh-keys')); break
      case 'export':          document.dispatchEvent(new CustomEvent('open-export')); break
      case 'import':          document.dispatchEvent(new CustomEvent('open-import')); break
      case 'split-terminal':
        if (activeSessionId) {
          setSplitSession(splitSessionId === activeSessionId ? null : activeSessionId)
        }
        break
    }
  }

  const handleSelect = (item: AnyItem) => {
    if (item.type === 'action') { runAction(item.id); return }
    if (item.type === 'connection') {
      openSession(item.conn)
    } else if (item.type === 'quick' && item.parsed) {
      const { username, host, port, protocol } = item.parsed
      const tempConn: Connection = {
        id: nanoid(), name: host, host, port, protocol,
        username: username || 'admin', authType: 'password',
        tags: [], notes: '', deviceType: 'generic',
        createdAt: Date.now(), updatedAt: Date.now()
      }
      openSession(tempConn)
    }
    setQuickConnectOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm"
      onClick={() => setQuickConnectOpen(false)}
    >
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          {isCommandMode
            ? <span className="text-xs font-semibold text-primary shrink-0">⌘</span>
            : <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isCommandMode ? 'Type a command...' : 'Search or user@host:port — type > for commands'}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
          {query && (
            <kbd className="text-[11px] text-muted-foreground/60 border border-border rounded-md px-1.5 py-0.5 font-mono bg-muted">↵</kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">No results</p>
          )}

          {items.map((item, idx) => {
            const prevItem = items[idx - 1]
            const isFirstConn   = item.type !== 'action' && (idx === 0 || prevItem?.type === 'action')
            const isFirstAction = item.type === 'action' && (idx === 0 || prevItem?.type !== 'action')
            return (
              <div key={item.type === 'action' ? item.id : (item.type === 'connection' ? item.conn.id : `q-${idx}`)}>
                {/* Section headers */}
                {isFirstConn && (
                  <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                    {!query ? 'Recent' : 'Results'}
                  </p>
                )}
                {isFirstAction && !isCommandMode && items.some(i => i.type !== 'action') && (
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                    <div className="h-px flex-1 bg-border/50" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Actions</p>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                )}
                {isFirstAction && isCommandMode && (
                  <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Commands</p>
                )}

                <button
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-all mx-1 rounded-lg cursor-pointer',
                    idx === selectedIdx ? 'bg-accent text-foreground' : 'text-foreground/80 hover:bg-accent/50'
                  )}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  {item.type === 'action' ? (
                    <>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}18` }}>
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </>
                  ) : item.type === 'quick' ? (
                    <>
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Connect to <span className="text-primary">{item.parsed?.host}</span></p>
                        <p className="text-xs text-muted-foreground">
                          {item.parsed?.protocol.toUpperCase()} · port {item.parsed?.port}
                          {item.parsed?.username ? ` · ${item.parsed.username}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md">Quick</span>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const Icon   = getDeviceIcon(item.conn.deviceType, item.conn.protocol)
                        const accent = item.conn.color || getDeviceAccent(item.conn.deviceType, item.conn.protocol)
                        return (
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                            <Icon className="w-4 h-4" style={{ color: accent }} />
                          </div>
                        )
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold truncate">{item.conn.name}</p>
                          {item.conn.lastConnectedAt && <History className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.conn.username ? `${item.conn.username}@` : ''}{item.conn.host}
                          {item.conn.protocol !== 'serial' ? `:${item.conn.port}` : ''}
                        </p>
                      </div>
                      {(() => {
                        const accent = item.conn.color || getDeviceAccent(item.conn.deviceType, item.conn.protocol)
                        return (
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: `${accent}18`, color: accent }}>
                            {item.conn.protocol}
                          </span>
                        )
                      })()}
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <Hint keys={['↑', '↓']} label="navigate" />
            <Hint keys={['↵']} label="select" />
            <Hint keys={['esc']} label="close" />
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground/50">
            {isCommandMode
              ? 'Command mode — type to filter'
              : <>Type <code className="bg-secondary text-muted-foreground px-1 py-0.5 rounded">&gt;</code> for commands</>
            }
          </span>
        </div>
      </div>
    </div>
  )
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="border border-border rounded px-1 py-0.5 font-mono text-[10px] bg-secondary">
          {k}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  )
}

function parseQuery(query: string): { username?: string; host: string; port: number; protocol: Protocol } | null {
  if (!query.trim()) return null

  let s = query.trim()
  let protocol: Protocol = 'ssh'

  if (s.startsWith('ssh://')) { s = s.slice(6); protocol = 'ssh' }
  else if (s.startsWith('telnet://')) { s = s.slice(9); protocol = 'telnet' }

  let username: string | undefined
  if (s.includes('@')) {
    const parts = s.split('@')
    username = parts[0]
    s = parts[1]
  }

  let host = s
  let port = protocol === 'telnet' ? 23 : 22

  if (s.includes(':')) {
    const lastColon = s.lastIndexOf(':')
    const portStr = s.slice(lastColon + 1)
    const parsed = parseInt(portStr)
    if (!isNaN(parsed)) {
      host = s.slice(0, lastColon)
      port = parsed
      if (port === 23) protocol = 'telnet'
    }
  }

  if (!host) return null

  return { username, host, port, protocol }
}
