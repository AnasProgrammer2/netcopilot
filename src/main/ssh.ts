import { IpcMain, BrowserWindow } from 'electron'
import { Client, ClientChannel } from 'ssh2'

interface ActiveSession {
  client: Client
  stream: ClientChannel
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
      }
    ) => {
      return new Promise((resolve, reject) => {
        const client = new Client()

        client.on('ready', () => {
          const termOptions = {
            term: 'xterm-256color',
            cols: payload.cols || 220,
            rows: payload.rows || 50
          }

          client.shell(termOptions, (err, stream) => {
            if (err) {
              client.end()
              return reject({ success: false, error: err.message })
            }

            activeSessions.set(payload.sessionId, { client, stream })

            stream.on('data', (data: Buffer) => {
              getWindow()?.webContents.send('ssh:data', payload.sessionId, data.toString('utf-8'))
            })

            stream.stderr.on('data', (data: Buffer) => {
              getWindow()?.webContents.send('ssh:data', payload.sessionId, data.toString('utf-8'))
            })

            stream.on('close', () => {
              activeSessions.delete(payload.sessionId)
              getWindow()?.webContents.send('ssh:closed', payload.sessionId)
            })

            resolve({ success: true })
          })
        })

        client.on('error', (err) => {
          activeSessions.delete(payload.sessionId)
          reject({ success: false, error: err.message })
        })

        const connectConfig: Parameters<Client['connect']>[0] = {
          host: payload.host,
          port: payload.port,
          username: payload.username,
          readyTimeout: 30000,
          keepaliveInterval: 30000
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
    const session = activeSessions.get(sessionId)
    if (session) {
      session.client.end()
      activeSessions.delete(sessionId)
    }
    return true
  })

  ipcMain.handle('ssh:disconnect-all', () => {
    for (const [, session] of activeSessions) {
      session.client.end()
    }
    activeSessions.clear()
    return true
  })
}
