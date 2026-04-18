import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Session } from '../../types'
import { useAppStore } from '../../store'
import { PasswordPrompt } from '../dialogs/PasswordPrompt'

interface Props {
  session: Session
}

export function TerminalTab({ session }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { setSessionStatus } = useAppStore()

  const [promptState, setPromptState] = useState<{
    visible: boolean
    resolve?: (result: { password: string; save: boolean } | null) => void
  }>({ visible: false })

  const askPassword = (): Promise<{ password: string; save: boolean } | null> => {
    return new Promise((resolve) => {
      setPromptState({ visible: true, resolve })
    })
  }

  const handlePromptSubmit = (password: string, save: boolean) => {
    setPromptState({ visible: false })
    promptState.resolve?.({ password, save })
  }

  const handlePromptCancel = () => {
    setPromptState({ visible: false })
    promptState.resolve?.(null)
  }

  const initTerminal = useCallback(() => {
    if (!containerRef.current || termRef.current) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#0d0f14',
        foreground: '#e8eaf0',
        cursor: '#60a5fa',
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
      allowProposedApi: true,
      scrollback: 5000
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
      if (session.connection.protocol === 'ssh') {
        window.api.ssh.send(session.id, data)
      } else {
        window.api.telnet.send(session.id, data)
      }
    })

    term.write(
      '\r\n\x1b[36m  NetTerm\x1b[0m · Connecting to \x1b[33m' +
        session.connection.host +
        '\x1b[0m...\r\n\r\n'
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
      try {
        const conn = session.connection
        let password: string | null = null
        let privateKey: string | null = null

        if (conn.protocol === 'ssh') {
          // Try to load saved password
          if (conn.authType === 'password' || conn.authType === 'key+password') {
            password = await window.api.credentials.get(`${conn.id}:password`)
          }

          // Try to load SSH key
          if ((conn.authType === 'key' || conn.authType === 'key+password') && conn.sshKeyId) {
            privateKey = await window.api.credentials.get(`${conn.sshKeyId}:privateKey`)
          }

          // No credentials found → ask user
          if (!password && !privateKey) {
            const result = await askPassword()
            if (!result) {
              // User cancelled
              setSessionStatus(session.id, 'disconnected')
              termRef.current?.write('\r\n\x1b[33mCancelled\x1b[0m\r\n')
              return
            }
            password = result.password
            if (result.save) {
              await window.api.credentials.save(`${conn.id}:password`, password)
            }
          }

          const { cols, rows } = termRef.current ?? { cols: 220, rows: 50 }
          await window.api.ssh.connect({
            sessionId: session.id,
            host: conn.host,
            port: conn.port,
            username: conn.username,
            password: password ?? undefined,
            privateKey: privateKey ?? undefined,
            cols,
            rows
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
    const unsubData =
      session.connection.protocol === 'ssh'
        ? window.api.ssh.onData((sid, data) => {
            if (sid === session.id) termRef.current?.write(data)
          })
        : window.api.telnet.onData((sid, data) => {
            if (sid === session.id) termRef.current?.write(data)
          })

    const unsubClosed =
      session.connection.protocol === 'ssh'
        ? window.api.ssh.onClosed((sid) => {
            if (sid === session.id) {
              setSessionStatus(session.id, 'disconnected')
              termRef.current?.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n')
            }
          })
        : window.api.telnet.onClosed((sid) => {
            if (sid === session.id) {
              setSessionStatus(session.id, 'disconnected')
              termRef.current?.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n')
            }
          })

    return () => {
      unsubData()
      unsubClosed()
    }
  }, [session.id, session.connection.protocol])

  useEffect(() => {
    return () => {
      if (session.connection.protocol === 'ssh') {
        window.api.ssh.disconnect(session.id)
      } else {
        window.api.telnet.disconnect(session.id)
      }
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
          username={session.connection.username}
          onSubmit={handlePromptSubmit}
          onCancel={handlePromptCancel}
        />
      )}
    </div>
  )
}
