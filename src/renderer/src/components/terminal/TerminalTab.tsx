import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Search, X, ChevronUp, ChevronDown, Copy, Clipboard, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { Session } from '../../types'
import { useAppStore } from '../../store'
import { detectDeviceType, PROBE_COMMAND, DEVICE_LABELS } from '../../lib/deviceDetector'
import { PasswordPrompt } from '../dialogs/PasswordPrompt'
import { TerminalHighlighter } from '../../lib/highlighter'
import type { TerminalSettings, ConnectionSettings } from '../../store'
import { cn } from '../../lib/utils'
import { terminalRegistry } from '../../lib/terminalRegistry'

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
  const startupTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedCredsRef   = useRef<{ username: string; password: string } | null>(null)
  const enableStateRef  = useRef<'idle' | 'waiting-prompt' | 'sent-enable' | 'done'>('idle')
  const highlighterRef  = useRef<TerminalHighlighter>(
    new TerminalHighlighter(
      session.connection.deviceType === 'auto' ? 'generic' : session.connection.deviceType
    )
  )
  const connSettingsRef = useRef<ConnectionSettings>(
    useAppStore.getState().connectionSettings
  )
  const logPathRef       = useRef<string | null>(null)
  const logStripAnsiRef  = useRef(true)
  const logTimestampRef  = useRef(false)
  const doConnectRef     = useRef<((isReconnect?: boolean) => void) | null>(null)

  // ── Search state ─────────────────────────────────────────────────────────────
  const [showSearch, setShowSearch]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchCaseSens, setSearchCaseSens] = useState(false)
  const [searchRegex, setSearchRegex]       = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Context menu state ────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const { setSessionStatus, setSessionLogging } = useAppStore()

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

  // ── Context menu handlers ─────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const ctxCopy = useCallback(() => {
    const sel = termRef.current?.getSelection()
    if (sel) navigator.clipboard.writeText(sel)
    setCtxMenu(null)
    termRef.current?.focus()
  }, [])

  const ctxPaste = useCallback(async () => {
    setCtxMenu(null)
    const text = await navigator.clipboard.readText()
    if (!text) return
    const proto = session.connection.protocol
    if      (proto === 'ssh')    window.api.ssh.send(session.id, text)
    else if (proto === 'serial') window.api.serial.send(session.id, text)
    else                         window.api.telnet.send(session.id, text)
    termRef.current?.focus()
  }, [session.id, session.connection.protocol])

  const ctxClear = useCallback(() => {
    termRef.current?.clear()
    setCtxMenu(null)
    termRef.current?.focus()
  }, [])

  const ctxSearch = useCallback(() => {
    setCtxMenu(null)
    openSearch()
  }, [openSearch])

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

  // ── Proactive AI watcher ──────────────────────────────────────────────────────
  // Debounce terminal data; when output settles (4s of silence) and the AI
  // panel is open and not already streaming, send context for analysis.
  // Skips ANSI-only noise (escape sequences, cursor moves, redraws).
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let outputBuffer = ''
    let lastAnalyzed = ''

    // Strip ANSI escape codes to get plain text
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[()][AB012]/g, '').trim()

    const proto = session.connection.protocol
    const onData = (_sessionId: string, data: string) => {
      if (_sessionId !== session.id) return
      outputBuffer += data
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const { aiPanelOpen, aiStreaming, aiAgentActive, activeSessionId } = useAppStore.getState()
        const autoWatch = (window as unknown as Record<string, unknown>)['__aiAutoWatch']
        if (!aiPanelOpen || aiStreaming || aiAgentActive || activeSessionId !== session.id || !autoWatch) {
          outputBuffer = ''
          return
        }
        const plain = stripAnsi(outputBuffer)
        outputBuffer = ''

        // Skip if content is too short (< 20 chars) — likely just a prompt redraw
        if (plain.length < 20) return

        // Skip if the content is the same as what we already analyzed
        if (plain === lastAnalyzed) return
        lastAnalyzed = plain

        // Trigger proactive analysis via the global bridge set by AiPanel
        const proactive = (window as unknown as Record<string, unknown>)['__aiSendProactive']
        if (typeof proactive === 'function') proactive(plain)
      }, 4000)
    }

    let off: (() => void) | undefined
    if      (proto === 'ssh')    off = window.api.ssh.onData(onData)
    else if (proto === 'telnet') off = window.api.telnet.onData(onData)
    else if (proto === 'serial') off = window.api.serial.onData(onData)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      off?.()
    }
  }, [session.id, session.connection.protocol])

  // ── 1. Init terminal ─────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    if (!containerRef.current || termRef.current) return

    // Read settings at effect-execution time (not from closure) to get the
    // freshest values even if loadSettings() completed after the first render
    const ts: TerminalSettings = useAppStore.getState().terminalSettings
    const term = new Terminal({
      fontFamily:  `"${ts.fontFamily}", "Cascadia Code", Consolas, monospace`,
      fontSize:    ts.fontSize,
      lineHeight:  ts.lineHeight,
      cursorBlink: ts.cursorBlink,
      cursorStyle: ts.cursorStyle,
      cursorWidth: ts.cursorStyle === 'bar' ? 2 : 1,
      scrollback:  ts.scrollback,
      theme: {
        background:          '#0B0718',
        foreground:          '#e8eaf0',
        cursor:              '#e8eaf0',
        cursorAccent:        '#0B0718',
        selectionBackground: '#8b5cf640',
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

    // Register this terminal instance in the global registry so AiPanel can access it
    terminalRegistry.register(session.id, {
      getContext: (lines = 120) => {
        const buf   = term.buffer.active
        const total = buf.length
        const start = Math.max(0, total - lines)
        const out: string[] = []
        for (let i = start; i < total; i++) {
          const line = buf.getLine(i)
          if (line) out.push(line.translateToString(true))
        }
        return out.join('\n')
      },
      sendData: (data: string) => {
        const proto = session.connection.protocol
        if      (proto === 'ssh')    window.api.ssh.send(session.id, data)
        else if (proto === 'serial') window.api.serial.send(session.id, data)
        else                         window.api.telnet.send(session.id, data)
      },
      scrollToBottom: () => {
        term.scrollToBottom()
      },
      reconnect: () => {
        if (connectingRef.current) return
        term.write('\r\n\x1b[33m⟳ Reconnecting...\x1b[0m\r\n')
        doConnectRef.current?.(true)
      },
    })

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
      terminalRegistry.unregister(session.id)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (startupTimerRef.current) {
        clearTimeout(startupTimerRef.current)
        startupTimerRef.current = null
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
    let rafId: number
    const obs = new ResizeObserver(() => {
      // Wait for the next frame so CSS layout is fully settled before measuring
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!fitRef.current || !termRef.current || !mountedRef.current) return
        try {
          fitRef.current.fit()
          const { cols, rows } = termRef.current
          if (session.connection.protocol === 'ssh') {
            window.api.ssh.resize(session.id, cols, rows)
          } else if (session.connection.protocol === 'telnet') {
            window.api.telnet.resize(session.id, cols, rows)
          }
        } catch { /* ignore during unmount */ }
      })
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => {
      cancelAnimationFrame(rafId)
      obs.disconnect()
    }
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

    const doConnect = async (isReconnect = false): Promise<void> => {
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
              // Load saved username if not stored on the connection
              if (!username) {
                username = (await window.api.credentials.get(`${conn.id}:username`)) || ''
              }
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
                await window.api.credentials.save(`${conn.id}:password`, password)
                // Save username as credential too (handles connections without stored username)
                if (username) {
                  await window.api.credentials.save(`${conn.id}:username`, username)
                }
                if (!conn.username && username) {
                  await window.api.store.saveConnection({ ...conn, username, updatedAt: Date.now() })
                }
              }
            }
            savedCredsRef.current = { username: username || '', password: password || '' }
          } else {
            username = savedCredsRef.current.username || username
            password = savedCredsRef.current.password
          }

          // Resolve jump host credentials if configured
          let jumpHostConfig: {
            host: string; port: number; username: string
            password?: string; privateKey?: string; passphrase?: string
          } | undefined = undefined

          if (conn.jumpHostId) {
            const allConns = useAppStore.getState().connections
            const jh = allConns.find(c => c.id === conn.jumpHostId)
            if (jh) {
              const jhPassword   = await window.api.credentials.get(`${jh.id}:password`)
              const jhPrivateKey = jh.sshKeyId
                ? await window.api.credentials.get(`${jh.sshKeyId}:privateKey`)
                : null
              jumpHostConfig = {
                host:       jh.host,
                port:       jh.port,
                username:   jh.username,
                password:   jhPassword  ?? undefined,
                privateKey: jhPrivateKey ?? undefined,
              }
            }
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
            keepaliveInterval: cs.keepaliveInterval * 1000,
            jumpHost: jumpHostConfig,
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

          // ── Auto device-type detection ─────────────────────────────────────
          if (conn.deviceType === 'auto' && conn.protocol !== 'serial') {
            // Collect banner output for 2.5s, then probe if still unresolved
            let bannerBuf = ''
            let detectionDone = false

            const bannerListener = (_sid: string, d: string) => {
              if (_sid === session.id && !detectionDone) bannerBuf += d
            }

            const unsubBanner =
              conn.protocol === 'ssh'
                ? window.api.ssh.onData(bannerListener)
                : window.api.telnet.onData(bannerListener)

            const applyDetected = async (detected: import('../../types').DeviceType | null) => {
              detectionDone = true
              unsubBanner()
              const resolved = detected ?? 'generic'
              if (!mountedRef.current) return

              highlighterRef.current = new TerminalHighlighter(resolved)

              const updated = { ...conn, deviceType: resolved, updatedAt: Date.now() }
              await window.api.store.saveConnection(updated)
              useAppStore.getState().saveConnection(updated)

              toast.success(`Device detected: ${DEVICE_LABELS[resolved]}`, {
                description: conn.host,
                duration: 4000,
              })
            }

            // Phase 1: analyse banner after 2.5s
            setTimeout(async () => {
              if (detectionDone || !mountedRef.current) return
              const detected = detectDeviceType(bannerBuf)
              if (detected) { await applyDetected(detected); return }

              // Phase 2: send probe command and wait 3s more
              const probe = PROBE_COMMAND + '\r'
              if (conn.protocol === 'ssh')    window.api.ssh.send(session.id, probe)
              else                             window.api.telnet.send(session.id, probe)

              setTimeout(async () => {
                if (detectionDone || !mountedRef.current) return
                await applyDetected(detectDeviceType(bannerBuf))
              }, 3000)
            }, 2500)
          }

          // Auto-disable paging so ARIA gets full output without --More-- prompts
          const resolvedDt = conn.deviceType === 'auto' ? 'generic' : conn.deviceType
          const pagingCmd = (() => {
            const dt = resolvedDt
            if (conn.protocol === 'serial') return null
            if (dt?.startsWith('cisco') || dt === 'generic') return 'terminal length 0'
            if (dt === 'junos')      return 'set cli screen-length 0'
            if (dt === 'arista-eos') return 'terminal length 0'
            if (dt === 'huawei-vrp') return 'screen-length 0 temporary'
            if (dt === 'nokia-sros') return 'environment no more'
            if (dt === 'hp-procurve') return 'no page'
            if (dt === 'linux' || dt === 'windows') return null
            return 'terminal length 0'
          })()

          const startupCmds = [
            ...(pagingCmd ? [pagingCmd] : []),
            ...(conn.startupCommands ?? []).filter(Boolean),
          ]

          if (startupCmds.length > 0) {
            startupTimerRef.current = setTimeout(() => {
              startupTimerRef.current = null
              if (!mountedRef.current) return
              for (const cmd of startupCmds) {
                const data = cmd + '\r'
                if (conn.protocol === 'ssh')         window.api.ssh.send(session.id, data)
                else if (conn.protocol === 'serial') window.api.serial.send(session.id, data)
                else                                  window.api.telnet.send(session.id, data)
              }
            }, 800)
          }

          // Enable password auto-login for Cisco devices
          if (conn.enablePassword && resolvedDt?.startsWith('cisco')) {
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

    doConnectRef.current = doConnect
    doConnect(false)

    return () => {
      cancelled = true
      doConnectRef.current = null
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      unsubData?.()
      unsubClosed?.()
      unsubError?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.connection.updatedAt])

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
    <div className="relative w-full h-full flex flex-col overflow-hidden">
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
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/40 bg-background shrink-0">
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
      <div className="relative flex-1 w-full min-h-0 overflow-hidden">
        <div
          ref={containerRef}
          onContextMenu={handleContextMenu}
          className="w-full h-full bg-[#0B0718]"
          style={{ fontVariantLigatures: 'none' }}
        />

        {/* Connecting overlay */}
        {session.status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B0718]/90 backdrop-blur-sm gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-foreground">Connecting…</span>
              <span className="text-xs text-muted-foreground font-mono">
                {session.connection.username ? `${session.connection.username}@` : ''}{session.connection.host}
              </span>
            </div>
          </div>
        )}

        {/* Disconnected overlay */}
        {session.status === 'disconnected' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B0718]/90 backdrop-blur-sm gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 15.312a4.5 4.5 0 0 1-1.242-7.244l4.5-4.5a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">Disconnected</span>
              <span className="text-xs text-muted-foreground font-mono">
                {session.connection.host}
              </span>
            </div>
            {session.connection.autoReconnect ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                Reconnecting…
              </div>
            ) : (
              <button
                onClick={() => doConnectRef.current?.(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Reconnect
              </button>
            )}
          </div>
        )}

        {/* Error overlay */}
        {session.status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B0718]/90 backdrop-blur-sm gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">Connection Error</span>
              {session.error && (
                <span className="text-xs text-muted-foreground font-mono max-w-xs text-center">{session.error}</span>
              )}
            </div>
            <button
              onClick={() => doConnectRef.current?.(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setCtxMenu(null); termRef.current?.focus() }} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-xl shadow-2xl py-1 w-44 overflow-hidden"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            <CtxItem icon={Copy}      label="Copy"          onClick={ctxCopy}   hint="⌘C" />
            <CtxItem icon={Clipboard} label="Paste"         onClick={ctxPaste}  hint="⌘V" />
            <div className="h-px bg-border/60 my-1 mx-2" />
            <CtxItem icon={Search}    label="Search"        onClick={ctxSearch} hint="⌘F" />
            <CtxItem icon={Eraser}    label="Clear"         onClick={ctxClear}  />
          </div>
        </>
      )}

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

function CtxItem({ icon: Icon, label, onClick, hint }: {
  icon:     React.ComponentType<{ className?: string }>
  label:    string
  onClick:  () => void
  hint?:    string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
    >
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px] text-muted-foreground/50 font-mono">{hint}</span>}
    </button>
  )
}
