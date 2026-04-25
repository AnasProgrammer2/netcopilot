import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel, ConnectConfig } from 'ssh2'
import * as net from 'net'

interface ActiveSession {
  client:     Client
  jumpClient: Client | null   // non-null when tunnelled via jump host
  stream:     ClientChannel
  flushTimer: ReturnType<typeof setTimeout> | null
}

function teardownSession(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  if (session.flushTimer) clearTimeout(session.flushTimer)
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

const activeSessions   = new Map<string, ActiveSession>()

interface ForwardServer {
  server:    net.Server
  sessionId: string
}
const activeForwards = new Map<string, ForwardServer>() // key = forwardId

// ── SOCKS proxy handler ───────────────────────────────────────────────────────

function handleSocksConnection(sock: net.Socket, sshClient: Client): void {
  sock.on('error', () => sock.destroy())

  let buf = Buffer.alloc(0)

  const onGreeting = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
    if (buf.length < 2) return
    sock.removeListener('data', onGreeting)

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
  let buf = Buffer.alloc(0)

  const onRequest = (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk])
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
    const remaining = buf.slice(end)

    sshClient.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
      if (err) {
        sock.write(Buffer.from([0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        sock.destroy()
        return
      }
      sock.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      if (remaining.length > 0) stream.write(remaining)
      sock.pipe(stream)
      stream.pipe(sock)
      stream.on('close', () => sock.destroy())
      sock.on('close', () => stream.destroy())
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
    sock.pipe(stream)
    stream.pipe(sock)
    stream.on('close', () => sock.destroy())
    sock.on('close', () => stream.destroy())
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
        jumpHost?: {
          host: string
          port: number
          username: string
          password?: string
          privateKey?: string
          passphrase?: string
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
          sock?: NodeJS.ReadableStream
        ): ConnectConfig => {
          const cfg: ConnectConfig = { host, port, username, readyTimeout, keepaliveInterval }
          if (sock) cfg.sock = sock as never
          if (privateKey) {
            cfg.privateKey = privateKey
            if (passphrase) cfg.passphrase = passphrase
          } else if (password) {
            cfg.password = password
          }
          return cfg
        }

        const openShell = (client: Client, jumpClient: Client | null) => {
          const termOptions = { term: 'xterm-256color', cols: payload.cols || 220, rows: payload.rows || 50 }
          client.shell(termOptions, (err, stream) => {
            if (err) {
              client.end()
              jumpClient?.end()
              return settle({ success: false, error: err.message })
            }

            let pending = ''
            activeSessions.set(payload.sessionId, { client, jumpClient, stream, flushTimer: null })

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

            stream.on('data', (data: Buffer) => { pending += data.toString('utf-8'); scheduleFlush() })
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
                  tunnel
                ))
              }
            )
          })

          jumpClient.connect(buildConnectConfig(
            jh.host, jh.port, jh.username,
            jh.password, jh.privateKey, jh.passphrase,
            payload.readyTimeout ?? 30000
          ))

        } else {
          // ── Direct connection ─────────────────────────────────────────────────
          const client = new Client()
          client.on('error', (err) => settle({ success: false, error: err.message }))
          client.on('ready', () => openShell(client, null))
          client.connect(buildConnectConfig(
            payload.host, payload.port, payload.username,
            payload.password, payload.privateKey, payload.passphrase,
            payload.readyTimeout ?? 30000, payload.keepaliveInterval ?? 30000
          ))
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
}
