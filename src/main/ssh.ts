import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel } from 'ssh2'

interface ActiveSession {
  client: Client
  stream: ClientChannel
  flushTimer: ReturnType<typeof setTimeout> | null
}

function teardownSession(sessionId: string): void {
  const session = activeSessions.get(sessionId)
  if (!session) return
  if (session.flushTimer) clearTimeout(session.flushTimer)
  session.stream.removeAllListeners()
  session.client.removeAllListeners()
  try { session.client.end() } catch { /* already closed */ }
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
      }
    ) => {
      return new Promise((resolve, reject) => {
        // Close any pre-existing session with the same ID to prevent leaks
        if (activeSessions.has(payload.sessionId)) {
          teardownSession(payload.sessionId)
        }

        const client = new Client()
        let settled = false

        const settle = (result: { success: boolean; error?: string }) => {
          if (settled) return
          settled = true
          if (result.success) resolve(result)
          else reject(result)
        }

        client.on('ready', () => {
          const termOptions = {
            term: 'xterm-256color',
            cols: payload.cols || 220,
            rows: payload.rows || 50
          }

          client.shell(termOptions, (err, stream) => {
            if (err) {
              client.end()
              return settle({ success: false, error: err.message })
            }

            // Batch small data chunks to reduce IPC overhead
            let pending = ''

            activeSessions.set(payload.sessionId, { client, stream, flushTimer: null })

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
              if (s && !s.flushTimer) {
                s.flushTimer = setTimeout(flush, 4)
              }
            }

            stream.on('data', (data: Buffer) => {
              pending += data.toString('utf-8')
              scheduleFlush()
            })

            stream.stderr.on('data', (data: Buffer) => {
              pending += data.toString('utf-8')
              scheduleFlush()
            })

            stream.on('close', () => {
              if (activeSessions.has(payload.sessionId)) {
                teardownSession(payload.sessionId)
                getWindow()?.webContents.send('ssh:closed', payload.sessionId)
              }
            })

            // After successful connect, errors should close the stream gracefully
            client.removeAllListeners('error')
            client.on('error', () => {
              if (activeSessions.has(payload.sessionId)) {
                teardownSession(payload.sessionId)
                getWindow()?.webContents.send('ssh:closed', payload.sessionId)
              }
            })

            settle({ success: true })
          })
        })

        client.on('error', (err) => {
          settle({ success: false, error: err.message })
        })

        const connectConfig: Parameters<Client['connect']>[0] = {
          host: payload.host,
          port: payload.port,
          username: payload.username,
          readyTimeout: payload.readyTimeout ?? 30000,
          keepaliveInterval: payload.keepaliveInterval ?? 30000
        }

        if (payload.privateKey) {
          connectConfig.privateKey = payload.privateKey
          if (payload.passphrase) {
            connectConfig.passphrase = payload.passphrase
          }
        } else if (payload.password) {
          connectConfig.password = payload.password
        }

        client.connect(connectConfig)
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
