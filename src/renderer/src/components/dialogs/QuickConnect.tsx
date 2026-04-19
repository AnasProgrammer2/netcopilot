import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Zap, History, Server } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, Protocol } from '../../types'
import { cn } from '../../lib/utils'
import { nanoid } from 'nanoid'

export function QuickConnect(): JSX.Element {
  const { quickConnectOpen, setQuickConnectOpen, connections, openSession } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (quickConnectOpen) {
      setQuery('')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [quickConnectOpen])

  const parsed = useMemo(() => parseQuery(query), [query])

  const matchingConnections = useMemo(() => {
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
  }, [query, connections])

  const items = useMemo(() => {
    const list: Array<{ type: 'connection'; conn: Connection } | { type: 'quick'; parsed: ReturnType<typeof parseQuery> }> = []

    if (parsed?.host && !matchingConnections.some((c) => c.host === parsed.host)) {
      list.push({ type: 'quick', parsed })
    }

    matchingConnections.forEach((conn) => list.push({ type: 'connection', conn }))
    return list
  }, [matchingConnections, parsed])

  useEffect(() => {
    setSelectedIdx(0)
  }, [items.length])

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

  const handleSelect = (item: (typeof items)[0]) => {
    if (item.type === 'connection') {
      openSession(item.conn)
    } else if (item.type === 'quick' && item.parsed) {
      const { username, host, port, protocol } = item.parsed
      const tempConn: Connection = {
        id: nanoid(),
        name: host,
        host,
        port,
        protocol,
        username: username || 'admin',
        authType: 'password',
        tags: [],
        notes: '',
        deviceType: 'generic',
        createdAt: Date.now(),
        updatedAt: Date.now()
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
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="user@host:port or search connections..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {query && (
            <kbd className="text-[11px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">↵</kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">No connections found</p>
          )}

          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(item)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                idx === selectedIdx
                  ? 'bg-accent text-foreground'
                  : 'text-foreground/80 hover:bg-accent/50'
              )}
            >
              {item.type === 'quick' ? (
                <>
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      Connect to <span className="text-primary">{item.parsed?.host}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.parsed?.protocol.toUpperCase()} · port {item.parsed?.port}
                      {item.parsed?.username ? ` · ${item.parsed.username}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                    Quick
                  </span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    {item.conn.lastConnectedAt ? (
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Server className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.conn.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.conn.username}@{item.conn.host}:{item.conn.port}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={{
                      backgroundColor: (item.conn.color ?? '#3b82f6') + '20',
                      color: item.conn.color ?? '#3b82f6'
                    }}
                  >
                    {item.conn.protocol}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
            <Hint keys={['↑', '↓']} label="navigate" />
            <Hint keys={['↵']} label="connect" />
            <Hint keys={['esc']} label="close" />
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground/50">
            Try: <code className="bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">root@192.168.1.1</code>
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
