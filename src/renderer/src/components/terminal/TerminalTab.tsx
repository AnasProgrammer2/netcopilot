import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Session } from '../../types'
import { useAppStore } from '../../store'
import { PasswordPrompt } from '../dialogs/PasswordPrompt'
import { TerminalHighlighter } from '../../lib/highlighter'
import type { TerminalSettings, ConnectionSettings } from '../../store'
import { cn } from '../../lib/utils'

interface Props {
  session: Session
}

export function TerminalTab({ session }: Props): JSX.Element {
  const containerRef    = useRef<HTMLDivElement>(null)
  const termRef         = useRef<Terminal | null>(null)
  const fitRef          = useRef<FitAddon | null>(null)
  const searchRef       = useRef<SearchAddon | null>(null)
  const connectingRef   = useRef(false)
  const mountedRef      = useRef(true)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedCredsRef   = useRef<{ username: string; password: string } | null>(null)
  const enableStateRef  = useRef<'idle' | 'waiting-prompt' | 'sent-enable' | 'done'>('idle')
  const highlighterRef  = useRef<TerminalHighlighter>(
    new TerminalHighlighter(session.connection.deviceType)
  )
  const connSettingsRef = useRef<ConnectionSettings>(
    useAppStore.getState().connectionSettings
  )
  const logPathRef       = useRef<string | null>(null)
  const logStripAnsiRef  = useRef(true)
  const logTimestampRef  = useRef(false)

  // ── Search state ─────────────────────────────────────────────────────────────
  const [showSearch, setShowSearch]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchCaseSens, setSearchCaseSens] = useState(false)
  const [searchRegex, setSearchRegex]       = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const { setSessionStatus, setSessionLogging, terminalSettings } = useAppStore()

  // Derive logging state from the session's loggingPath (store is source of truth)
  const logging = !!session.loggingPath

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      connSettingsRef.current = state.connectionSettings
    })
  }, [])

  // Hot-reload terminal appearance settings for existing open sessions
  useEffect(() => {
    let prevTs = useAppStore.getState().terminalSettings
    return useAppStore.subscribe((state) => {
      const ts = state.terminalSettings
      if (ts === prevTs) return
      prevTs = ts
      const term = termRef.current
      if (!term) return
      term.options.fontSize    = ts.fontSize
      term.options.fontFamily  = `"${ts.fontFamily}", "Cascadia Code", Consolas, monospace`
      term.options.lineHeight  = ts.lineHeight
      term.options.cursorBlink = ts.cursorBlink
      term.options.cursorStyle = ts.cursorStyle
      term.options.scrollback  = ts.scrollback
      fitRef.current?.fit()
    })
  }, [])

  // Load and cache log format settings
  useEffect(() => {
    const load = async () => {
      const strip = await window.api.store.getSetting('logStripAnsi')
      const ts    = await window.api.store.getSetting('logTimestamp')
      logStripAnsiRef.current = strip !== false   // default true
      logTimestampRef.current = ts === true
    }
    load()
  }, [])

  const [promptState, setPromptState] = useState<{
    visible: boolean
    resolve?: (result: { username: string; password: string; save: boolean } | null) => void
  }>({ visible: false })

  const askCredentials = (): Promise<{ username: string; password: string; save: boolean } | null> =>
    new Promise((resolve) => setPromptState({ visible: true, resolve }))

  const handlePromptSubmit = (creds: { username: string; password: string; save: boolean }) => {
    setPromptState({ visible: false })
    promptState.resolve?.(creds)
  }

  const handlePromptCancel = () => {
    setPromptState({ visible: false })
    promptState.resolve?.(null)
  }

  // ── Search helpers ────────────────────────────────────────────────────────────
  const doSearch = useCallback((dir: 'next' | 'prev') => {
    if (!searchRef.current || !searchQuery) return
    const opts = { caseSensitive: searchCaseSens, regex: searchRegex }
    if (dir === 'next') searchRef.current.findNext(searchQuery, opts)
    else                searchRef.current.findPrevious(searchQuery, opts)
  }, [searchQuery, searchCaseSens, searchRegex])

  const openSearch = useCallback(() => {
    setShowSearch(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setShowSearch(false)
    setSearchQuery('')
    termRef.current?.focus()
  }, [])

  // ── Logging helpers ───────────────────────────────────────────────────────────
  const startLogging = async () => {
    const filePath = await window.api.log.start(session.connection.name)
    if (filePath) {
      logPathRef.current = filePath
      setSessionLogging(session.id, filePath)
    }
  }

  const stopLogging = async () => {
    if (logPathRef.current) {
      await window.api.log.stop(logPathRef.current)
      logPathRef.current = null
      setSessionLogging(session.id, null)
    }
  }

  // Auto-log: start logging automatically if the global setting is enabled
  useEffect(() => {
    const checkAutoLog = async () => {
      const autoLog = await window.api.store.getSetting('autoLog')
      if (!autoLog) return
      const logDir = (await window.api.store.getSetting('logDirectory') as string) || ''
      if (!logDir) return
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
      const safeName = session.connection.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      const filePath = `${logDir}/${safeName}_${ts}.log`
      const result = await window.api.log.startAt(filePath, session.connection.name)
      if (result) {
        logPathRef.current = result
        setSessionLogging(session.id, result)
      }
    }
    checkAutoLog()
  }, [session.id])

  // ── 1. Init terminal ─────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    if (!containerRef.current || termRef.current) return

    const ts: TerminalSettings = terminalSettings
    const term = new Terminal({
      fontFamily:  `"${ts.fontFamily}", "Cascadia Code", Consolas, monospace`,
      fontSize:    ts.fontSize,
      lineHeight:  ts.lineHeight,
      cursorBlink: ts.cursorBlink,
      cursorStyle: ts.cursorStyle,
      cursorWidth: ts.cursorStyle === 'bar' ? 2 : 1,
      scrollback:  ts.scrollback,
      theme: {
        background:          '#0d0f14',
        foreground:          '#e8eaf0',
        cursor:              '#e8eaf0',
        cursorAccent:        '#0d0f14',
        selectionBackground: '#3b82f640',
        black:         '#1e2030', red:          '#ff6b6b',
        green:         '#69ff94', yellow:       '#ffd93d',
        blue:          '#60a5fa', magenta:      '#c792ea',
        cyan:          '#6fcfe3', white:        '#e8eaf0',
        brightBlack:   '#4a5568', brightRed:    '#ff8585',
        brightGreen:   '#80ffaa', brightYellow: '#ffe066',
        brightBlue:    '#7db5ff', brightMagenta:'#d4a5f5',
        brightCyan:    '#89dceb', brightWhite:  '#ffffff'
      },
      allowProposedApi: true
    })

    const fitAddon    = new FitAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(searchAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current   = term
    fitRef.current    = fitAddon
    searchRef.current = searchAddon

    // Intercept Ctrl/Cmd+F for search
    term.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && e.type === 'keydown') {
        openSearch()
        return false
      }
      return true
    })

    term.onData((data) => {
      const proto = session.connection.protocol
      if      (proto === 'ssh')    window.api.ssh.send(session.id, data)
      else if (proto === 'serial') window.api.serial.send(session.id, data)
      else                         window.api.telnet.send(session.id, data)
    })

    const target = session.connection.protocol === 'serial'
      ? (session.connection.serialConfig?.path ?? session.connection.host)
      : session.connection.host
    term.write('\r\n\x1b[36m  NetCopilot\x1b[0m · Connecting to \x1b[33m' + target + '\x1b[0m...\r\n\r\n')

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (logPathRef.current) {
        window.api.log.stop(logPathRef.current)
        logPathRef.current = null
      }
      term.dispose()
      termRef.current   = null
      fitRef.current    = null
      searchRef.current = null
    }
  }, [])

  // ── 2. Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (fitRef.current && termRef.current) {
        try {
          fitRef.current.fit()
          const { cols, rows } = termRef.current
          if (session.connection.protocol === 'ssh') {
            window.api.ssh.resize(session.id, cols, rows)
          } else if (session.connection.protocol === 'telnet') {
            window.api.telnet.resize(session.id, cols, rows)
          }
        } catch { /* ignore during unmount */ }
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [session.id, session.connection.protocol])

  // ── 3. Connect + data listeners + auto reconnect ─────────────────────────────
  useEffect(() => {
    let cancelled = false

    const scheduleReconnect = () => {
      const delay = session.connection.reconnectDelay ?? 10
      termRef.current?.write(
        `\r\n\x1b[33m  Auto-reconnect in \x1b[1m${delay}s\x1b[0m\x1b[33m...\x1b[0m\r\n`
      )
      reconnectTimerRef.current = setTimeout(() => {
        if (cancelled || !mountedRef.current) return
        reconnectTimerRef.current = null
        connectingRef.current = false
        doConnect(true)
      }, delay * 1000)
    }

    const doConnect = async (isReconnect = false) => {
      if (cancelled || !mountedRef.current || connectingRef.current) return
      connectingRef.current = true
      try {
        const conn = session.connection
        const cs   = connSettingsRef.current

        if (isReconnect) {
          const target = conn.protocol === 'serial'
            ? (conn.serialConfig?.path ?? conn.host)
            : conn.host
          termRef.current?.write(`\r\n\x1b[36m  Reconnecting to \x1b[33m${target}\x1b[0m...\r\n\r\n`)
        }

        if (conn.protocol === 'ssh') {
          let username    = conn.username
          let password: string | null   = null
          let privateKey: string | null = null

          if (!isReconnect || !savedCredsRef.current) {
            if (conn.authType === 'password' || conn.authType === 'key+password') {
              password = await window.api.credentials.get(`${conn.id}:password`)
            }
            if ((conn.authType === 'key' || conn.authType === 'key+password') && conn.sshKeyId) {
              privateKey = await window.api.credentials.get(`${conn.sshKeyId}:privateKey`)
            }

            if (!username || (!password && !privateKey)) {
              const result = await askCredentials()
              if (!result) {
                setSessionStatus(session.id, 'disconnected')
                termRef.current?.write('\r\n\x1b[33mCancelled\x1b[0m\r\n')
                connectingRef.current = false
                return
              }
              if (!username) username = result.username
              password = result.password
              if (result.save) {
                const savePasswords = await window.api.store.getSetting('savePasswords')
                if (savePasswords !== false) {
                  await window.api.credentials.save(`${conn.id}:password`, password)
                  if (!conn.username) {
                    window.api.store.saveConnection({ ...conn, username, updatedAt: Date.now() })
                  }
                }
              }
            }
            savedCredsRef.current = { username: username || '', password: password || '' }
          } else {
            username = savedCredsRef.current.username || username
            password = savedCredsRef.current.password
          }

          const { cols, rows } = termRef.current ?? { cols: 220, rows: 50 }
          await window.api.ssh.connect({
            sessionId: session.id,
            host:      conn.host,
            port:      conn.port,
            username,
            password:   (conn.authType === 'password' || conn.authType === 'key+password') && !privateKey
              ? (password ?? undefined)
              : undefined,
            privateKey: privateKey  ?? undefined,
            passphrase: conn.authType === 'key+password' && password ? password : undefined,
            cols, rows,
            readyTimeout:      cs.connectTimeout    * 1000,
            keepaliveInterval: cs.keepaliveInterval * 1000
          })

        } else if (conn.protocol === 'telnet') {
          const { cols, rows } = termRef.current ?? { cols: 220, rows: 50 }
          await window.api.telnet.connect({ sessionId: session.id, host: conn.host, port: conn.port, cols, rows })

        } else if (conn.protocol === 'serial') {
          const sc = conn.serialConfig
          if (!sc?.path) throw { error: 'No serial port configured' }
          await window.api.serial.connect({
            sessionId: session.id,
            path: sc.path, baudRate: sc.baudRate, dataBits: sc.dataBits,
            stopBits: sc.stopBits, parity: sc.parity,
            rtscts: sc.rtscts, xon: sc.xon, xoff: sc.xoff
          })
        }

        if (!cancelled && mountedRef.current) {
          setSessionStatus(session.id, 'connected')
          termRef.current?.write('\x1b[32mConnected\x1b[0m\r\n')
          useAppStore.getState().updateLastConnected(conn.id)

          // Execute startup commands after a short delay
          const cmds = (conn.startupCommands ?? []).filter(Boolean)
          if (cmds.length > 0) {
            setTimeout(() => {
              if (!mountedRef.current) return
              for (const cmd of cmds) {
                const data = cmd + '\r'
                if (conn.protocol === 'ssh')         window.api.ssh.send(session.id, data)
                else if (conn.protocol === 'serial') window.api.serial.send(session.id, data)
                else                                  window.api.telnet.send(session.id, data)
              }
            }, 500)
          }

          // Enable password auto-login for Cisco devices
          if (conn.enablePassword && conn.deviceType?.startsWith('cisco')) {
            enableStateRef.current = 'waiting-prompt'
          } else {
            enableStateRef.current = 'idle'
          }
        }
      } catch (err: unknown) {
        if (cancelled || !mountedRef.current) return
        const msg = (err as { error?: string })?.error || 'Connection failed'
        setSessionStatus(session.id, 'error', msg)
        termRef.current?.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`)
        if (session.connection.autoReconnect) scheduleReconnect()
      } finally {
        connectingRef.current = false
      }
    }

    const sendToSession = (data: string) => {
      const proto = session.connection.protocol
      if      (proto === 'ssh')    window.api.ssh.send(session.id, data)
      else if (proto === 'serial') window.api.serial.send(session.id, data)
      else                          window.api.telnet.send(session.id, data)
    }

    // Batch incoming data to reduce per-character processing overhead
    let pendingData = ''
    let flushScheduled = false

    const flushData = () => {
      flushScheduled = false
      if (!pendingData) return
      const data = pendingData
      pendingData = ''

      // Enable password state machine for Cisco devices
      if (enableStateRef.current === 'waiting-prompt') {
        const stripped = data.replace(/\x1b\[[0-9;]*[mGKHFABCDJSTPM]|\x1b\][^\x07]*\x07/g, '')
        if (/#\s*$/.test(stripped.trimEnd())) {
          enableStateRef.current = 'done'
        } else if (/>\s*$/.test(stripped.trimEnd())) {
          enableStateRef.current = 'sent-enable'
          setTimeout(() => sendToSession('enable\r'), 50)
        }
      } else if (enableStateRef.current === 'sent-enable') {
        if (/[Pp]assword\s*:/.test(data)) {
          enableStateRef.current = 'done'
          setTimeout(() => sendToSession((session.connection.enablePassword ?? '') + '\r'), 50)
        }
      }

      const colored = highlighterRef.current.process(data)
      if (colored) termRef.current?.write(colored)
      if (logPathRef.current) {
        let logData = data
        if (logStripAnsiRef.current) {
          logData = logData.replace(/\x1b\[[0-9;]*[mGKHFABCDJP]|\x1b\][^\x07]*\x07/g, '')
        }
        if (logTimestampRef.current) {
          const ts = new Date().toTimeString().slice(0, 8)
          logData = logData.split('\n').map(l => l ? `[${ts}] ${l}` : l).join('\n')
        }
        window.api.log.append(logPathRef.current, logData)
      }
    }

    const writeData = (data: string) => {
      pendingData += data
      if (!flushScheduled) {
        flushScheduled = true
        requestAnimationFrame(flushData)
      }
    }

    const onClosed = (sid: string) => {
      if (sid !== session.id) return
      setSessionStatus(session.id, 'disconnected')
      termRef.current?.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n')
      if (!cancelled && session.connection.autoReconnect) scheduleReconnect()
    }

    const proto = session.connection.protocol
    let unsubData: () => void
    let unsubClosed: () => void
    let unsubError: (() => void) | undefined

    if (proto === 'ssh') {
      unsubData   = window.api.ssh.onData((sid, d)  => { if (sid === session.id) writeData(d) })
      unsubClosed = window.api.ssh.onClosed(onClosed)
    } else if (proto === 'serial') {
      unsubData   = window.api.serial.onData((sid, d) => { if (sid === session.id) writeData(d) })
      unsubClosed = window.api.serial.onClosed(onClosed)
      unsubError  = window.api.serial.onError((sid, err) => {
        if (sid !== session.id) return
        setSessionStatus(session.id, 'error', err)
        termRef.current?.write(`\r\n\x1b[31mSerial error: ${err}\x1b[0m\r\n`)
        if (!cancelled && session.connection.autoReconnect) scheduleReconnect()
      })
    } else {
      unsubData   = window.api.telnet.onData((sid, d) => { if (sid === session.id) writeData(d) })
      unsubClosed = window.api.telnet.onClosed(onClosed)
    }

    doConnect(false)

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      unsubData?.()
      unsubClosed?.()
      unsubError?.()
    }
  }, [session.id])

  // ── 4. Disconnect on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const proto = session.connection.protocol
      if      (proto === 'ssh')    window.api.ssh.disconnect(session.id)
      else if (proto === 'serial') window.api.serial.disconnect(session.id)
      else                         window.api.telnet.disconnect(session.id)
    }
  }, [session.id, session.connection.protocol])

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Search bar */}
      {showSearch && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-xl px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (searchRef.current && e.target.value) {
                searchRef.current.findNext(e.target.value, { caseSensitive: searchCaseSens, regex: searchRegex, incremental: true })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  { e.shiftKey ? doSearch('prev') : doSearch('next') }
              if (e.key === 'Escape') closeSearch()
            }}
            placeholder="Search..."
            className="w-40 text-xs bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <button
            onClick={() => setSearchCaseSens(v => !v)}
            title="Case sensitive"
            className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors', searchCaseSens ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}
          >Aa</button>
          <button
            onClick={() => setSearchRegex(v => !v)}
            title="Use regex"
            className={cn('px-1.5 py-0.5 rounded text-xs font-mono transition-colors', searchRegex ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground')}
          >.*</button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onClick={() => doSearch('prev')} title="Previous (Shift+Enter)" className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => doSearch('next')} title="Next (Enter)" className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={closeSearch} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/40 bg-[#0d0f14] shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/50 font-mono">
            {session.connection.protocol.toUpperCase()} · {session.connection.host}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Search button */}
          <button
            onClick={openSearch}
            title="Search (Ctrl+F)"
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors',
              showSearch
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5'
            )}
          >
            <Search className="w-3 h-3" />
            <span>Search</span>
          </button>

          <div className="w-px h-3.5 bg-border/40" />

          {/* Logging button */}
          {logging ? (
            <button
              onClick={stopLogging}
              title={`Logging to: ${session.loggingPath}\nClick to stop`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
              REC · Stop
            </button>
          ) : (
            <button
              onClick={startLogging}
              title="Start session logging"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full border border-current shrink-0" />
              Log
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 w-full bg-[#0d0f14]"
        style={{ fontVariantLigatures: 'none' }}
      />

      {promptState.visible && (
        <PasswordPrompt
          host={session.connection.host}
          username={session.connection.username || undefined}
          onSubmit={handlePromptSubmit}
          onCancel={handlePromptCancel}
        />
      )}
    </div>
  )
}
