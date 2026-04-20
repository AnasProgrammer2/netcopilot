import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel, ConnectConfig } from 'ssh2'

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
}

const activeSessions = new Map<string, ActiveSession>()

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
    for (const [id] of activeSessions) {
      teardownSession(id)
    }
    activeSessions.clear()
    return true
  })
}
