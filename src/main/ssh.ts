import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from '../types/shared'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { handleZmodemDetection, setupZmodemHandlers } from './zmodem'
import { createHostVerifier, cancelHostKeyPrompts } from './hostKeys'

interface ActiveSession {
  sessionId:    string
  client:       Client
  jumpClient:   Client | null   // non-null when tunnelled via jump host
  stream:       ClientChannel
  flushTimer:   ReturnType<typeof setTimeout> | null
  // Anti-idle (transport keepalive is handled by ssh2's keepaliveInterval)
  antiIdleTimer:  ReturnType<typeof setInterval> | null
}

/** A connection attempt that has not produced a shell yet (tracked so it can be cancelled). */
interface PendingConnect {
  cancel: () => void
}
const pendingConnects = new Map<string, PendingConnect>()

const noop = (): void => { /* swallow late errors */ }

/**
 * Drop our listeners and close. A no-op 'error' listener is re-added because
 * ssh2 can still emit 'error' after end() (e.g. socket reset), and an
 * EventEmitter 'error' without listeners throws in the main process.
 */
function silenceAndEnd(emitter: Client | net.Socket): void {
  if (emitter instanceof Client) cancelHostKeyPrompts(emitter)
  emitter.removeAllListeners()
  emitter.on('error', noop)
  try {
    if (emitter instanceof net.Socket) emitter.destroy()
    else emitter.end()
  } catch { /* already closed */ }
}

function teardownSession(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return

  // Clear all timers
  if (session.flushTimer) clearTimeout(session.flushTimer)
  if (session.antiIdleTimer) clearInterval(session.antiIdleTimer)

  session.stream.removeAllListeners()
  session.stream.on('error', noop)
  silenceAndEnd(session.client)
  if (session.jumpClient) silenceAndEnd(session.jumpClient)
  activeSessions.delete(sessionId)

  // Close any port forwards tied to this session
  for (const [id, fwd] of activeForwards) {
    if (fwd.sessionId === sessionId) {
      fwd.server.close()
      activeForwards.delete(id)
    }
  }
}

// ── SSH Agent Forwarding ────────────────────────────────────────────────────

function getDefaultAgentSocket(): string | undefined {
  // Check SSH_AUTH_SOCK environment variable
  if (process.env.SSH_AUTH_SOCK) {
    return process.env.SSH_AUTH_SOCK
  }

  // macOS: common agent socket locations
  if (process.platform === 'darwin') {
    const macosPaths = [
      path.join(os.tmpdir(), 'com.apple.launchd.*/Listeners'),
      path.join(os.homedir(), '.ssh/agent.*')
    ]
    for (const pattern of macosPaths) {
      try {
        const resolved = pattern.includes('*') ? resolveGlob(pattern) : pattern
        if (resolved && fs.existsSync(resolved)) {
          return resolved
        }
      } catch { /* ignore */ }
    }
  }

  // Linux: common agent socket locations
  if (process.platform === 'linux') {
    const linuxPaths = [
      path.join(os.tmpdir(), `ssh-*/agent.*`),
      path.join(os.homedir(), '.ssh/agent.*'),
      path.join(os.homedir(), '.gnupg/S.gpg-agent.ssh')
    ]
    for (const pattern of linuxPaths) {
      try {
        const resolved = pattern.includes('*') ? resolveGlob(pattern) : pattern
        if (resolved && fs.existsSync(resolved)) {
          return resolved
        }
      } catch { /* ignore */ }
    }
  }

  // Windows: the built-in OpenSSH agent listens on a named pipe
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\openssh-ssh-agent'
  }

  return undefined
}

function resolveGlob(pattern: string): string | undefined {
  // Simple glob resolver for common agent socket patterns
  const dir = path.dirname(pattern)
  const base = path.basename(pattern)
  const prefix = base.split('*')[0]
  const suffix = base.split('*')[1] || ''

  try {
    const entries = fs.readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry.endsWith(suffix)) {
        const fullPath = path.join(dir, entry)
        if (fs.statSync(fullPath).isDirectory() && pattern.includes('/*/')) {
          // One level deeper
          const subEntries = fs.readdirSync(fullPath)
          for (const sub of subEntries) {
            if (sub.startsWith('agent.')) {
              return path.join(fullPath, sub)
            }
          }
        } else if (fs.existsSync(fullPath)) {
          return fullPath
        }
      }
    }
  } catch { /* ignore */ }
  return undefined
}

function setupAntiIdle(
  sessionId: string,
  session: ActiveSession,
  intervalSec: number = 60,
  idleString: string = '\x00'
): void {
  if (session.antiIdleTimer) {
    clearInterval(session.antiIdleTimer)
  }

  session.antiIdleTimer = setInterval(() => {
    if (session.stream && activeSessions.has(sessionId)) {
      try {
        session.stream.write(idleString)
      } catch { /* ignore write errors */ }
    }
  }, intervalSec * 1000)
}

const activeSessions   = new Map<string, ActiveSession>()

interface ForwardServer {
  server:    net.Server
  sessionId: string
}
const activeForwards = new Map<string, ForwardServer>() // key = forwardId

// ── SOCKS proxy handler ───────────────────────────────────────────────────────

function handleSocksConnection(sock: net.Socket, sshClient: Client): void {
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    sock.removeListener('data', onGreeting)
    sock.destroy()
  }

  sock.on('error', cleanup)
  sock.on('close', cleanup)

  let buf = Buffer.alloc(0)

  const onGreeting = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    if (buf.length > 1024) {
      cleanup()
      return
    }
    if (buf.length < 2) return
    sock.removeListener('data', onGreeting)
    sock.off('error', cleanup)
    sock.off('close', cleanup)

    if (buf[0] === 0x04) {
      handleSocks4(sock, sshClient, buf)
    } else if (buf[0] === 0x05) {
      sock.write(Buffer.from([0x05, 0x00])) // no auth
      buf = Buffer.alloc(0)
      handleSocks5Request(sock, sshClient)
    } else {
      sock.destroy()
    }
  }

  sock.on('data', onGreeting)
}

function handleSocks5Request(sock: net.Socket, sshClient: Client): void {
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    sock.removeListener('data', onRequest)
    sock.destroy()
  }

  sock.on('error', cleanup)
  sock.on('close', cleanup)

  let buf = Buffer.alloc(0)

  const onRequest = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    if (buf.length > 1024) {
      cleanup()
      return
    }
    if (buf.length < 4) return

    if (buf[0] !== 0x05 || buf[1] !== 0x01) {
      sock.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      sock.destroy()
      return
    }

    const atyp = buf[3]
    let host = ''
    let port = 0
    let end  = 0

    if (atyp === 0x01) { // IPv4
      if (buf.length < 10) return
      host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`
      port = buf.readUInt16BE(8)
      end  = 10
    } else if (atyp === 0x03) { // Domain
      if (buf.length < 5) return
      const len = buf[4]
      if (buf.length < 5 + len + 2) return
      host = buf.slice(5, 5 + len).toString()
      port = buf.readUInt16BE(5 + len)
      end  = 5 + len + 2
    } else if (atyp === 0x04) { // IPv6
      if (buf.length < 22) return
      const parts: string[] = []
      for (let i = 0; i < 16; i += 2) parts.push(buf.readUInt16BE(4 + i).toString(16))
      host = parts.join(':')
      port = buf.readUInt16BE(20)
      end  = 22
    } else {
      sock.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      sock.destroy()
      return
    }

    sock.removeListener('data', onRequest)
    sock.off('error', cleanup)
    sock.off('close', cleanup)
    const remaining = buf.slice(end)

    sshClient.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
      if (err) {
        sock.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        sock.destroy()
        return
      }
      sock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      if (remaining.length > 0) stream.write(remaining)

      let closed = false
      const cleanupPipe = () => {
        if (closed) return
        closed = true
        sock.destroy()
        stream.destroy()
      }

      sock.pipe(stream)
      stream.pipe(sock)

      sock.on('close', cleanupPipe)
      sock.on('error', cleanupPipe)
      stream.on('close', cleanupPipe)
      stream.on('error', cleanupPipe)
    })
  }

  sock.on('data', onRequest)
}

function handleSocks4(sock: net.Socket, sshClient: Client, buf: Buffer): void {
  if (buf.length < 9 || buf[1] !== 0x01) {
    sock.write(Buffer.from([0x00, 0x5b, 0, 0, 0, 0, 0, 0]))
    sock.destroy()
    return
  }
  const port = buf.readUInt16BE(2)
  const host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`

  sshClient.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
    if (err) {
      sock.write(Buffer.from([0x00, 0x5b, 0, 0, 0, 0, 0, 0]))
      sock.destroy()
      return
    }
    sock.write(Buffer.from([0x00, 0x5a, 0, 0, 0, 0, 0, 0]))

    let closed = false
    const cleanupPipe = () => {
      if (closed) return
      closed = true
      sock.destroy()
      stream.destroy()
    }

    sock.pipe(stream)
    stream.pipe(sock)

    sock.on('close', cleanupPipe)
    sock.on('error', cleanupPipe)
    stream.on('close', cleanupPipe)
    stream.on('error', cleanupPipe)
  })
}

function connectViaProxy(
  proxy: { type: 'socks5' | 'socks4' | 'http'; host: string; port: number; username?: string; password?: string },
  targetHost: string, targetPort: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxy.port, proxy.host, () => {
      if (proxy.type === 'http') {
        const auth = proxy.username && proxy.password
          ? `\r\nProxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`
          : ''
        sock.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}${auth}\r\n\r\n`)
        sock.once('data', (chunk) => {
          const resp = chunk.toString()
          if (resp.includes('200')) resolve(sock)
          else { sock.destroy(); reject(new Error(`HTTP proxy rejected: ${resp.split('\r\n')[0]}`)) }
        })
      } else {
        // SOCKS4/5
        if (proxy.type === 'socks5') {
          const hasAuth = proxy.username && proxy.password
          const authMethods = hasAuth ? Buffer.from([0x05, 0x02, 0x00, 0x02]) : Buffer.from([0x05, 0x01, 0x00])
          sock.write(authMethods)
          sock.once('data', (greeting) => {
            if (greeting[1] === 0x02 && hasAuth) {
              const uBuf = Buffer.from(proxy.username!)
              const pBuf = Buffer.from(proxy.password!)
              const authBuf = Buffer.concat([Buffer.from([0x01, uBuf.length]), uBuf, Buffer.from([pBuf.length]), pBuf])
              sock.write(authBuf)
              sock.once('data', (authResp) => {
                if (authResp[1] !== 0x00) { sock.destroy(); return reject(new Error('SOCKS5 auth failed')) }
                sendSocks5Connect(sock, targetHost, targetPort, resolve, reject)
              })
            } else if (greeting[1] === 0x00) {
              sendSocks5Connect(sock, targetHost, targetPort, resolve, reject)
            } else {
              sock.destroy(); reject(new Error('SOCKS5 no acceptable auth method'))
            }
          })
        } else {
          // SOCKS4
          const portBuf = Buffer.alloc(2)
          portBuf.writeUInt16BE(targetPort, 0)
          const ipBuf = Buffer.from([0, 0, 0, 1]) // SOCKS4a: invalid IP
          const userBuf = Buffer.from(proxy.username ?? '')
          const hostBuf = Buffer.from(targetHost)
          const req = Buffer.concat([Buffer.from([0x04, 0x01]), portBuf, ipBuf, userBuf, Buffer.from([0x00]), hostBuf, Buffer.from([0x00])])
          sock.write(req)
          sock.once('data', (resp) => {
            if (resp[1] === 0x5a) resolve(sock)
            else { sock.destroy(); reject(new Error(`SOCKS4 rejected: code ${resp[1]}`)) }
          })
        }
      }
    })
    sock.on('error', (err) => reject(new Error(`Proxy connection failed: ${err.message}`)))
    sock.setTimeout(15000, () => { sock.destroy(); reject(new Error('Proxy connection timeout')) })
  })
}

function sendSocks5Connect(sock: net.Socket, host: string, port: number, resolve: (s: net.Socket) => void, reject: (e: Error) => void) {
  const hostBuf = Buffer.from(host)
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port, 0)
  const req = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf])
  sock.write(req)
  sock.once('data', (resp) => {
    if (resp[1] === 0x00) { sock.setTimeout(0); resolve(sock) }
    else { sock.destroy(); reject(new Error(`SOCKS5 connect failed: code ${resp[1]}`)) }
  })
}

export function setupSshHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    'ssh:connect',
    (
      _,
      payload: {
        sessionId: string
        host: string
        port: number
        username: string
        password?: string
        privateKey?: string
        passphrase?: string
        cols?: number
        rows?: number
        readyTimeout?: number
        keepaliveInterval?: number
        keepaliveCountMax?: number
        agentForwarding?: boolean
        agentSocketPath?: string
        antiIdle?: boolean
        antiIdleInterval?: number
        antiIdleString?: string
        // True color and sixel support
        trueColor?: boolean
        sixel?: boolean
        // Zmodem file transfer
        zmodemEnabled?: boolean
        jumpHost?: {
          host: string
          port: number
          username: string
          password?: string
          privateKey?: string
          passphrase?: string
          agentForwarding?: boolean
          agentSocketPath?: string
        }
        proxy?: {
          type: 'socks5' | 'socks4' | 'http'
          host: string
          port: number
          username?: string
          password?: string
        }
      }
    ) => {
      return new Promise((resolve, reject) => {
        const sessionId = payload.sessionId
        // A newer connect for the same tab supersedes any attempt in flight.
        pendingConnects.get(sessionId)?.cancel()
        if (activeSessions.has(sessionId)) {
          teardownSession(sessionId)
        }

        // Every client / socket created by this attempt, so a cancel or a
        // failure can close all of them (nothing is leaked when the tab is
        // closed mid-connect).
        const owned: Array<Client | net.Socket> = []
        let cancelled = false

        let settled = false
        const settle = (result: { success: boolean; error?: string }) => {
          if (settled) return
          settled = true
          if (pendingConnects.get(sessionId) === attempt) pendingConnects.delete(sessionId)
          if (!result.success) {
            for (const c of owned) silenceAndEnd(c)
          }
          if (result.success) resolve(result)
          else reject(result)
        }

        const attempt: PendingConnect = {
          cancel: () => {
            cancelled = true
            settle({ success: false, error: 'Connection cancelled' })
          }
        }
        pendingConnects.set(sessionId, attempt)

        const newClient = (): Client => {
          const c = new Client()
          owned.push(c)
          return c
        }

        const resolveAgent = (enabled?: boolean, socketPath?: string): string | undefined => {
          if (!enabled) return undefined
          const agentPath = socketPath || getDefaultAgentSocket()
          // Named pipes (Windows) can't be checked with existsSync reliably
          if (!agentPath || (process.platform !== 'win32' && !fs.existsSync(agentPath))) {
            console.warn(`[SSH] Agent forwarding requested for ${sessionId} but no agent socket was found`)
            return undefined
          }
          return agentPath
        }

        // ssh2 reports an unreachable agent as an 'error' with level 'agent'
        // and then moves on to the next auth method — not a connection failure.
        const isAgentError = (err: Error) => (err as Error & { level?: string }).level === 'agent'

        const buildConnectConfig = (
          client: Client,
          host: string, port: number, username: string,
          password?: string, privateKey?: string, passphrase?: string,
          readyTimeout?: number, keepaliveInterval?: number,
          keepaliveCountMax?: number,
          agentPath?: string,
          sock?: NodeJS.ReadableStream
        ): ConnectConfig => {
          const cfg: ConnectConfig = {
            host, port, username, readyTimeout,
            // Transport-level keepalive handled by ssh2 (milliseconds; 0 disables)
            keepaliveInterval, keepaliveCountMax,
            hostVerifier: createHostVerifier(client, host, port, getWindow),
          }
          if (sock) cfg.sock = sock as never
          if (privateKey) {
            cfg.privateKey = privateKey
            if (passphrase) cfg.passphrase = passphrase
          } else if (password) {
            cfg.password = password
          }
          if (agentPath) {
            cfg.agent = agentPath
            cfg.agentForward = true
          }
          return cfg
        }

        const openShell = (client: Client, jumpClient: Client | null) => {
          if (cancelled) return
          // Build terminal type with feature flags
          const termFeatures: string[] = ['xterm-256color']
          if (payload.trueColor) termFeatures.push('tc')
          if (payload.sixel) termFeatures.push('sixel')

          const termOptions = {
            term: termFeatures.join('-'),
            cols: payload.cols || DEFAULT_TERMINAL_COLS,
            rows: payload.rows || DEFAULT_TERMINAL_ROWS
          }

          client.shell(termOptions, (err, stream) => {
            if (err) {
              return settle({ success: false, error: err.message })
            }
            if (cancelled) {
              // Tab was closed while the shell was opening
              stream.on('error', noop)
              silenceAndEnd(client)
              if (jumpClient) silenceAndEnd(jumpClient)
              return
            }

            let pending = ''
            const session: ActiveSession = {
              sessionId,
              client,
              jumpClient,
              stream,
              flushTimer: null,
              antiIdleTimer: null
            }
            activeSessions.set(sessionId, session)

            // Setup anti-idle if requested
            if (payload.antiIdle && payload.antiIdleInterval && payload.antiIdleInterval > 0) {
              const idleString = payload.antiIdleString || '\x00'
              setupAntiIdle(sessionId, session, payload.antiIdleInterval, idleString)
            }

            // Only act if this connection is still the live one for the tab —
            // a reconnect reuses the sessionId, and a stale close/error from
            // the previous connection must not tear down the new one.
            const isCurrent = () => activeSessions.get(sessionId)?.client === client

            const flush = () => {
              if (!isCurrent()) return
              session.flushTimer = null
              if (pending) {
                getWindow()?.webContents.send('ssh:data', sessionId, pending)
                pending = ''
              }
            }
            const scheduleFlush = () => {
              if (isCurrent() && !session.flushTimer) session.flushTimer = setTimeout(flush, 4)
            }

            // Zmodem detection buffer
            let zmodemBuffer = Buffer.alloc(0)
            const ZMODEM_BUFFER_SIZE = 4096

            stream.on('data', (data: Buffer) => {
              // Check for Zmodem sequences if enabled
              if (payload.zmodemEnabled) {
                zmodemBuffer = Buffer.concat([zmodemBuffer, data])
                if (zmodemBuffer.length > ZMODEM_BUFFER_SIZE) {
                  zmodemBuffer = zmodemBuffer.slice(-ZMODEM_BUFFER_SIZE)
                }

                const detection = handleZmodemDetection(sessionId, zmodemBuffer, true)
                if (detection.detected) {
                  // Notify renderer of Zmodem detection
                  getWindow()?.webContents.send('zmodem:detected', sessionId, { type: detection.type })
                  // Keep data in stream (zmodem will handle it)
                }
              }

              pending += data.toString('utf-8')
              scheduleFlush()
            })
            stream.stderr.on('data', (data: Buffer) => { pending += data.toString('utf-8'); scheduleFlush() })

            const onGone = () => {
              if (!isCurrent()) return
              teardownSession(sessionId)
              getWindow()?.webContents.send('ssh:closed', sessionId)
            }
            stream.on('close', onGone)

            client.removeAllListeners('error')
            client.on('error', onGone)

            settle({ success: true })
          })
        }

        if (payload.jumpHost) {
          // ── Jump Host flow ────────────────────────────────────────────────────
          const jh = payload.jumpHost
          const jumpClient = newClient()

          jumpClient.on('error', (err) => {
            if (!isAgentError(err)) settle({ success: false, error: `Jump host: ${err.message}` })
          })

          jumpClient.on('ready', () => {
            if (cancelled) return
            jumpClient.forwardOut(
              '127.0.0.1', 0,
              payload.host, payload.port,
              (err, tunnel) => {
                if (err) {
                  return settle({ success: false, error: `Tunnel: ${err.message}` })
                }
                if (cancelled) {
                  tunnel.destroy()
                  return
                }

                const client = newClient()
                client.on('error', (err) => {
                  if (!isAgentError(err)) settle({ success: false, error: err.message })
                })
                client.on('ready', () => openShell(client, jumpClient))

                client.connect(buildConnectConfig(
                  client,
                  payload.host, payload.port, payload.username,
                  payload.password, payload.privateKey, payload.passphrase,
                  payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
                  payload.keepaliveCountMax ?? 3,
                  resolveAgent(payload.agentForwarding, payload.agentSocketPath),
                  tunnel
                ))
              }
            )
          })

          jumpClient.connect(buildConnectConfig(
            jumpClient,
            jh.host, jh.port, jh.username,
            jh.password, jh.privateKey, jh.passphrase,
            payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
            payload.keepaliveCountMax ?? 3,
            resolveAgent(jh.agentForwarding, jh.agentSocketPath)
          ))

        } else {
          // ── Direct connection (possibly through proxy) ─────────────────────
          const connectDirect = (sock?: net.Socket) => {
            if (cancelled) {
              sock?.destroy()
              return
            }
            if (sock) owned.push(sock)
            const client = newClient()
            client.on('error', (err) => {
              if (!isAgentError(err)) settle({ success: false, error: err.message })
            })
            client.on('ready', () => openShell(client, null))
            client.connect(buildConnectConfig(
              client,
              payload.host, payload.port, payload.username,
              payload.password, payload.privateKey, payload.passphrase,
              payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
              payload.keepaliveCountMax ?? 3,
              resolveAgent(payload.agentForwarding, payload.agentSocketPath),
              sock
            ))
          }

          if (payload.proxy) {
            connectViaProxy(payload.proxy, payload.host, payload.port)
              .then((proxySock) => connectDirect(proxySock))
              .catch((err) => settle({ success: false, error: `Proxy: ${err.message}` }))
          } else {
            connectDirect()
          }
        }
      })
    }
  )

  ipcMain.on('ssh:send', (_, sessionId: string, data: string) => {
    const session = activeSessions.get(sessionId)
    if (session) {
      session.stream.write(data)
    }
  })

  ipcMain.handle('ssh:resize', (_, sessionId: string, cols: number, rows: number) => {
    const session = activeSessions.get(sessionId)
    if (session) {
      session.stream.setWindow(rows, cols, 0, 0)
      return true
    }
    return false
  })

  ipcMain.handle('ssh:disconnect', (_, sessionId: string) => {
    pendingConnects.get(sessionId)?.cancel()
    teardownSession(sessionId)
    return true
  })

  ipcMain.handle('ssh:disconnect-all', () => {
    for (const pending of [...pendingConnects.values()]) pending.cancel()
    for (const id of [...activeSessions.keys()]) {
      teardownSession(id)
    }
    activeSessions.clear()
    return true
  })

  // ── Port Forwarding ───────────────────────────────────────────────────────────

  ipcMain.handle('ssh:forward-start', (_, payload: {
    forwardId: string
    sessionId: string
    type:       'local' | 'dynamic'
    localPort:  number
    remoteHost: string
    remotePort: number
  }) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const session = activeSessions.get(payload.sessionId)
      if (!session) return resolve({ success: false, error: 'Session not connected' })

      if (activeForwards.has(payload.forwardId)) {
        return resolve({ success: false, error: 'Forward already active' })
      }

      const server = net.createServer((sock) => {
        sock.on('error', () => sock.destroy())

        if (payload.type === 'dynamic') {
          handleSocksConnection(sock, session.client)
          return
        }

        // Local forward
        session.client.forwardOut(
          sock.remoteAddress ?? '127.0.0.1', sock.remotePort ?? 0,
          payload.remoteHost, payload.remotePort,
          (err, stream) => {
            if (err) { sock.destroy(); return }
            sock.pipe(stream)
            stream.pipe(sock)
            stream.on('close', () => sock.destroy())
            sock.on('close', () => stream.destroy())
          }
        )
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        resolve({ success: false, error: err.message })
      })

      server.listen(payload.localPort, '127.0.0.1', () => {
        activeForwards.set(payload.forwardId, { server, sessionId: payload.sessionId })
        resolve({ success: true })
      })
    })
  })

  ipcMain.handle('ssh:forward-stop', (_, forwardId: string) => {
    const fwd = activeForwards.get(forwardId)
    if (!fwd) return false
    fwd.server.close()
    activeForwards.delete(forwardId)
    return true
  })

  ipcMain.handle('ssh:forward-stop-session', (_, sessionId: string) => {
    for (const id of [...activeForwards.keys()]) {
      const fwd = activeForwards.get(id)
      if (fwd?.sessionId === sessionId) {
        fwd.server.close()
        activeForwards.delete(id)
      }
    }
    return true
  })

  ipcMain.handle('ssh:forward-list', (_, sessionId: string) => {
    const result: string[] = []
    for (const [id, fwd] of activeForwards) {
      if (fwd.sessionId === sessionId) result.push(id)
    }
    return result
  })

  // ── Zmodem File Transfer ────────────────────────────────────────────────────
  // Setup handlers for lrzsz file transfers over terminal
  setupZmodemHandlers(
    ipcMain,
    getWindow,
    (sessionId: string, data: string) => {
      const session = activeSessions.get(sessionId)
      if (session?.stream) {
        try {
          session.stream.write(data)
        } catch { /* ignore write errors on closed stream */ }
      }
    }
  )
}
