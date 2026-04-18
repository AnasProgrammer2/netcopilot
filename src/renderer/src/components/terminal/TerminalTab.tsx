import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Session } from '../../types'
import { useAppStore } from '../../store'
import { PasswordPrompt } from '../dialogs/PasswordPrompt'
import { TerminalHighlighter } from '../../lib/highlighter'
import type { TerminalSettings } from '../../store'

interface Props {
  session: Session
}

export function TerminalTab({ session }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const connectingRef = useRef(false)
  const highlighterRef = useRef<TerminalHighlighter>(
    new TerminalHighlighter(session.connection.deviceType)
  )
  const { setSessionStatus, terminalSettings, connectionSettings } = useAppStore()

  const [promptState, setPromptState] = useState<{
    visible: boolean
    resolve?: (result: { username: string; password: string; save: boolean } | null) => void
  }>({ visible: false })

  const askCredentials = (): Promise<{ username: string; password: string; save: boolean } | null> => {
    return new Promise((resolve) => {
      setPromptState({ visible: true, resolve })
    })
  }

  const handlePromptSubmit = (credentials: { username: string; password: string; save: boolean }) => {
    setPromptState({ visible: false })
    promptState.resolve?.(credentials)
  }

  const handlePromptCancel = () => {
    setPromptState({ visible: false })
    promptState.resolve?.(null)
  }

  const initTerminal = useCallback(() => {
    if (!containerRef.current || termRef.current) return

    const ts: TerminalSettings = terminalSettings
    const term = new Terminal({
      fontFamily: `"${ts.fontFamily}", "Cascadia Code", Consolas, monospace`,
      fontSize: ts.fontSize,
      lineHeight: ts.lineHeight,
      cursorBlink: ts.cursorBlink,
      cursorStyle: ts.cursorStyle,
      cursorWidth: ts.cursorStyle === 'bar' ? 2 : 1,
      scrollback: ts.scrollback,
      theme: {
        background: '#0d0f14',
        foreground: '#e8eaf0',
        cursor: '#e8eaf0',
        cursorAccent: '#0d0f14',
        selectionBackground: '#3b82f640',
        black: '#1e2030',
        red: '#ff6b6b',
        green: '#69ff94',
        yellow: '#ffd93d',
        blue: '#60a5fa',
        magenta: '#c792ea',
        cyan: '#6fcfe3',
        white: '#e8eaf0',
        brightBlack: '#4a5568',
        brightRed: '#ff8585',
        brightGreen: '#80ffaa',
        brightYellow: '#ffe066',
        brightBlue: '#7db5ff',
        brightMagenta: '#d4a5f5',
        brightCyan: '#89dceb',
        brightWhite: '#ffffff'
      },
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(new SearchAddon())

    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    term.onData((data) => {
      const proto = session.connection.protocol
      if (proto === 'ssh')    window.api.ssh.send(session.id, data)
      else if (proto === 'serial') window.api.serial.send(session.id, data)
      else                    window.api.telnet.send(session.id, data)
    })

    const target = session.connection.protocol === 'serial'
      ? (session.connection.serialConfig?.path ?? session.connection.host)
      : session.connection.host
    term.write(
      '\r\n\x1b[36m  NetTerm\x1b[0m · Connecting to \x1b[33m' + target + '\x1b[0m...\r\n\r\n'
    )
  }, [session.id, session.connection])

  useEffect(() => {
    initTerminal()
    return () => {
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [initTerminal])

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (fitRef.current && termRef.current) {
        try {
          fitRef.current.fit()
          const { cols, rows } = termRef.current
          if (session.connection.protocol === 'ssh') {
            window.api.ssh.resize(session.id, cols, rows)
          }
        } catch {
          // ignore resize errors during unmount
        }
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [session.id, session.connection.protocol])

  useEffect(() => {
    const connect = async () => {
      if (connectingRef.current) return
      connectingRef.current = true
      try {
        const conn = session.connection
        let password: string | null = null
        let privateKey: string | null = null

        if (conn.protocol === 'ssh') {
          let username = conn.username

          // Try to load saved credentials
          if (conn.authType === 'password' || conn.authType === 'key+password') {
            password = await window.api.credentials.get(`${conn.id}:password`)
          }
          if ((conn.authType === 'key' || conn.authType === 'key+password') && conn.sshKeyId) {
            privateKey = await window.api.credentials.get(`${conn.sshKeyId}:privateKey`)
          }

          // No username or no password → ask user
          if (!username || (!password && !privateKey)) {
            const result = await askCredentials()
            if (!result) {
              setSessionStatus(session.id, 'disconnected')
              termRef.current?.write('\r\n\x1b[33mCancelled\x1b[0m\r\n')
              return
            }
            if (!username) username = result.username
            password = result.password
            if (result.save) {
              await window.api.credentials.save(`${conn.id}:password`, password)
              // Save username back to the connection if it was missing
              if (!conn.username) {
                window.api.store.saveConnection({ ...conn, username, updatedAt: Date.now() })
              }
            }
          }

          const { cols, rows } = termRef.current ?? { cols: 220, rows: 50 }
          await window.api.ssh.connect({
            sessionId: session.id,
            host: conn.host,
            port: conn.port,
            username,
            password: password ?? undefined,
            privateKey: privateKey ?? undefined,
            cols,
            rows,
            readyTimeout: connectionSettings.connectTimeout * 1000,
            keepaliveInterval: connectionSettings.keepaliveInterval * 1000
          })
        } else if (conn.protocol === 'telnet') {
          const { cols, rows } = termRef.current ?? { cols: 220, rows: 50 }
          await window.api.telnet.connect({
            sessionId: session.id,
            host: conn.host,
            port: conn.port,
            cols,
            rows
          })
        } else if (conn.protocol === 'serial') {
          const sc = conn.serialConfig
          if (!sc?.path) throw { error: 'No serial port configured' }
          await window.api.serial.connect({
            sessionId: session.id,
            path: sc.path,
            baudRate: sc.baudRate,
            dataBits: sc.dataBits,
            stopBits: sc.stopBits,
            parity: sc.parity,
            rtscts: sc.rtscts,
            xon: sc.xon,
            xoff: sc.xoff
          })
        }

        setSessionStatus(session.id, 'connected')
        termRef.current?.write('\x1b[32mConnected\x1b[0m\r\n')
      } catch (err: unknown) {
        const msg = (err as { error?: string })?.error || 'Connection failed'
        setSessionStatus(session.id, 'error', msg)
        termRef.current?.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`)
      }
    }

    connect()
  }, [session.id])

  useEffect(() => {
    const writeData = (data: string) => {
      const colored = highlighterRef.current.process(data)
      if (colored) termRef.current?.write(colored)
    }

    const onClosed = (sid: string) => {
      if (sid !== session.id) return
      setSessionStatus(session.id, 'disconnected')
      termRef.current?.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n')
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
        if (sid === session.id) {
          setSessionStatus(session.id, 'error', err)
          termRef.current?.write(`\r\n\x1b[31mSerial error: ${err}\x1b[0m\r\n`)
        }
      })
    } else {
      unsubData   = window.api.telnet.onData((sid, d) => { if (sid === session.id) writeData(d) })
      unsubClosed = window.api.telnet.onClosed(onClosed)
    }

    return () => {
      unsubData()
      unsubClosed()
      unsubError?.()
    }
  }, [session.id, session.connection.protocol])

  useEffect(() => {
    return () => {
      const proto = session.connection.protocol
      if (proto === 'ssh')         window.api.ssh.disconnect(session.id)
      else if (proto === 'serial') window.api.serial.disconnect(session.id)
      else                         window.api.telnet.disconnect(session.id)
    }
  }, [session.id, session.connection.protocol])

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full bg-[#0d0f14]"
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
