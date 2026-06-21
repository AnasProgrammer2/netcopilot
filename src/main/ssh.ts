import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import { DEFAULT_TERMINAL_COLS, DEFAULT_TERMINAL_ROWS } from '../types/shared'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { handleZmodemDetection, setupZmodemHandlers } from './zmodem'

interface ActiveSession {
  sessionId:    string
  client:       Client
  jumpClient:   Client | null   // non-null when tunnelled via jump host
  stream:       ClientChannel
  flushTimer:   ReturnType<typeof setTimeout> | null
  // Keep-alive / Anti-idle
  keepAliveTimer: ReturnType<typeof setInterval> | null
  antiIdleTimer:  ReturnType<typeof setInterval> | null
  // Agent forwarding
  agentSocket?:   string
  agentListener?: net.Server
  // Connection config reference for reconnect
  connectionConfig?: SshConnectionConfig
}

interface SshConnectionConfig {
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

function teardownSession(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return

  // Clear all timers
  if (session.flushTimer) clearTimeout(session.flushTimer)
  if (session.keepAliveTimer) clearInterval(session.keepAliveTimer)
  if (session.antiIdleTimer) clearInterval(session.antiIdleTimer)

  // Close agent forwarding socket
  if (session.agentListener) {
    try { session.agentListener.close() } catch { /* ignore */ }
  }

  session.stream.removeAllListeners()
  session.client.removeAllListeners()
  try { session.client.end() } catch { /* already closed */ }
  if (session.jumpClient) {
    session.jumpClient.removeAllListeners()
    try { session.jumpClient.end() } catch { /* already closed */ }
  }
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

  // Windows: Pageant or OpenSSH agent
  if (process.platform === 'win32') {
    // Windows uses named pipes, handled differently by ssh2
    return undefined
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

function setupAgentForwarding(
  client: Client,
  sessionId: string,
  agentSocketPath?: string
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socketPath = agentSocketPath || getDefaultAgentSocket()
    if (!socketPath || !fs.existsSync(socketPath)) {
      resolve(undefined)
      return
    }

  // Request agent forwarding from server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).openssh_agent(socketPath, (err: Error | undefined, _agentStream: unknown) => {
      if (err) {
        console.warn(`[SSH] Agent forwarding failed for ${sessionId}:`, err.message)
        resolve(undefined)
        return
      }

      console.log(`[SSH] Agent forwarding enabled for ${sessionId} via ${socketPath}`)
      resolve(socketPath)
    })
  })
}

// ── Keep-Alive & Anti-Idle ───────────────────────────────────────────────────

function setupKeepAlive(
  sessionId: string,
  session: ActiveSession,
  intervalMs: number = 30000,
  countMax: number = 3
): void {
  if (session.keepAliveTimer) {
    clearInterval(session.keepAliveTimer)
  }

  let failures = 0
  session.keepAliveTimer = setInterval(() => {
    if (!activeSessions.has(sessionId)) {
      clearInterval(session.keepAliveTimer!)
      return
    }

    try {
      // Send SSH keepalive request
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pingFn = (session.client as any).openssh_ping
      if (typeof pingFn === 'function') {
        pingFn(() => { failures = 0 }) // Reset on success
      }
    } catch {
      failures++
      if (failures >= countMax) {
        // Connection appears dead, trigger disconnect
        teardownSession(sessionId)
      }
    }
  }, intervalMs)
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
        if (activeSessions.has(payload.sessionId)) {
          teardownSession(payload.sessionId)
        }

        let settled = false
        const settle = (result: { success: boolean; error?: string }) => {
          if (settled) return
          settled = true
          if (result.success) resolve(result)
          else reject(result)
        }

        const buildConnectConfig = (
          host: string, port: number, username: string,
          password?: string, privateKey?: string, passphrase?: string,
          readyTimeout?: number, keepaliveInterval?: number,
          keepaliveCountMax?: number,
          sock?: NodeJS.ReadableStream
        ): ConnectConfig => {
          const cfg: ConnectConfig = {
            host, port, username, readyTimeout, keepaliveInterval, keepaliveCountMax
          }
          if (sock) cfg.sock = sock as never
          if (privateKey) {
            cfg.privateKey = privateKey
            if (passphrase) cfg.passphrase = passphrase
          } else if (password) {
            cfg.password = password
          }
          return cfg
        }

        const openShell = async (client: Client, jumpClient: Client | null) => {
          // Build terminal type with feature flags
          const termFeatures: string[] = ['xterm-256color']
          if (payload.trueColor) termFeatures.push('tc')
          if (payload.sixel) termFeatures.push('sixel')

          const termOptions = {
            term: termFeatures.join('-'),
            cols: payload.cols || DEFAULT_TERMINAL_COLS,
            rows: payload.rows || DEFAULT_TERMINAL_ROWS
          }

          client.shell(termOptions, async (err, stream) => {
            if (err) {
              client.end()
              jumpClient?.end()
              return settle({ success: false, error: err.message })
            }

            let pending = ''
            const session: ActiveSession = {
              sessionId: payload.sessionId,
              client,
              jumpClient,
              stream,
              flushTimer: null,
              keepAliveTimer: null,
              antiIdleTimer: null
            }
            activeSessions.set(payload.sessionId, session)

            // Setup agent forwarding if requested
            if (payload.agentForwarding) {
              const agentPath = await setupAgentForwarding(client, payload.sessionId, payload.agentSocketPath)
              session.agentSocket = agentPath
            }

            // Setup jump host agent forwarding if requested
            if (jumpClient && payload.jumpHost?.agentForwarding) {
              await setupAgentForwarding(jumpClient, `${payload.sessionId}-jump`, payload.jumpHost.agentSocketPath)
            }

            // Setup keep-alive at transport level
            if (payload.keepaliveInterval && payload.keepaliveInterval > 0) {
              setupKeepAlive(payload.sessionId, session, payload.keepaliveInterval * 1000, payload.keepaliveCountMax || 3)
            }

            // Setup anti-idle if requested
            if (payload.antiIdle && payload.antiIdleInterval && payload.antiIdleInterval > 0) {
              const idleString = payload.antiIdleString || '\x00'
              setupAntiIdle(payload.sessionId, session, payload.antiIdleInterval, idleString)
            }

            const flush = () => {
              const s = activeSessions.get(payload.sessionId)
              if (s) s.flushTimer = null
              if (pending) {
                getWindow()?.webContents.send('ssh:data', payload.sessionId, pending)
                pending = ''
              }
            }
            const scheduleFlush = () => {
              const s = activeSessions.get(payload.sessionId)
              if (s && !s.flushTimer) s.flushTimer = setTimeout(flush, 4)
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

                const detection = handleZmodemDetection(payload.sessionId, zmodemBuffer, true)
                if (detection.detected) {
                  // Notify renderer of Zmodem detection
                  getWindow()?.webContents.send('zmodem:detected', payload.sessionId, { type: detection.type })
                  // Keep data in stream (zmodem will handle it)
                }
              }

              pending += data.toString('utf-8')
              scheduleFlush()
            })
            stream.stderr.on('data', (data: Buffer) => { pending += data.toString('utf-8'); scheduleFlush() })
            stream.on('close', () => {
              if (activeSessions.has(payload.sessionId)) {
                teardownSession(payload.sessionId)
                getWindow()?.webContents.send('ssh:closed', payload.sessionId)
              }
            })

            client.removeAllListeners('error')
            client.on('error', () => {
              if (activeSessions.has(payload.sessionId)) {
                teardownSession(payload.sessionId)
                getWindow()?.webContents.send('ssh:closed', payload.sessionId)
              }
            })

            settle({ success: true })
          })
        }

        if (payload.jumpHost) {
          // ── Jump Host flow ────────────────────────────────────────────────────
          const jh = payload.jumpHost
          const jumpClient = new Client()

          jumpClient.on('error', (err) => settle({ success: false, error: `Jump host: ${err.message}` }))

          jumpClient.on('ready', () => {
            jumpClient.forwardOut(
              '127.0.0.1', 0,
              payload.host, payload.port,
              (err, tunnel) => {
                if (err) {
                  jumpClient.end()
                  return settle({ success: false, error: `Tunnel: ${err.message}` })
                }

                const client = new Client()
                client.on('error', (err) => {
                  jumpClient.end()
                  settle({ success: false, error: err.message })
                })
                client.on('ready', () => openShell(client, jumpClient))

                client.connect(buildConnectConfig(
                  payload.host, payload.port, payload.username,
                  payload.password, payload.privateKey, payload.passphrase,
                  payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
                  payload.keepaliveCountMax ?? 3,
                  tunnel
                ))
              }
            )
          })

          jumpClient.connect(buildConnectConfig(
            jh.host, jh.port, jh.username,
            jh.password, jh.privateKey, jh.passphrase,
            payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
            payload.keepaliveCountMax ?? 3
          ))

        } else {
          // ── Direct connection (possibly through proxy) ─────────────────────
          const connectDirect = (sock?: net.Socket) => {
            const client = new Client()
            client.on('error', (err) => settle({ success: false, error: err.message }))
            client.on('ready', () => openShell(client, null))
            client.connect(buildConnectConfig(
              payload.host, payload.port, payload.username,
              payload.password, payload.privateKey, payload.passphrase,
              payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000,
              payload.keepaliveCountMax ?? 3,
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
    teardownSession(sessionId)
    return true
  })

  ipcMain.handle('ssh:disconnect-all', () => {
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
