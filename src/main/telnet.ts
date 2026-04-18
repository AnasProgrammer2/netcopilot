import { IpcMain, BrowserWindow } from 'electron'
import { Socket } from 'net'

interface TelnetSession {
  socket: Socket
}

const activeSessions = new Map<string, TelnetSession>()

const IAC = 255
const WILL = 251
const WONT = 252
const DO = 253
const DONT = 254
const SB = 250
const SE = 240
const ECHO = 1
const SUPPRESS_GO_AHEAD = 3
const NAWS = 31

function buildNawsOption(cols: number, rows: number): Buffer {
  return Buffer.from([
    IAC, SB, NAWS,
    (cols >> 8) & 0xff, cols & 0xff,
    (rows >> 8) & 0xff, rows & 0xff,
    IAC, SE
  ])
}

function stripTelnetCommands(data: Buffer): Buffer {
  const result: number[] = []
  let i = 0
  while (i < data.length) {
    if (data[i] === IAC) {
      if (i + 1 >= data.length) break
      const cmd = data[i + 1]
      if (cmd === SB) {
        while (i < data.length && !(data[i] === IAC && data[i + 1] === SE)) i++
        i += 2
      } else if (cmd === WILL || cmd === WONT || cmd === DO || cmd === DONT) {
        i += 3
      } else if (cmd === IAC) {
        result.push(255)
        i += 2
      } else {
        i += 2
      }
    } else {
      result.push(data[i])
      i++
    }
  }
  return Buffer.from(result)
}

export function setupTelnetHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    'telnet:connect',
    (
      _,
      payload: {
        sessionId: string
        host: string
        port: number
        cols?: number
        rows?: number
      }
    ) => {
      return new Promise((resolve, reject) => {
        const socket = new Socket()
        const cols = payload.cols || 220
        const rows = payload.rows || 50

        socket.setTimeout(15000)

        socket.on('connect', () => {
          socket.setTimeout(0)
          activeSessions.set(payload.sessionId, { socket })

          socket.write(Buffer.from([IAC, WILL, SUPPRESS_GO_AHEAD]))
          socket.write(Buffer.from([IAC, DO, SUPPRESS_GO_AHEAD]))
          socket.write(Buffer.from([IAC, WILL, ECHO]))
          socket.write(buildNawsOption(cols, rows))

          resolve({ success: true })
        })

        socket.on('data', (data: Buffer) => {
          const clean = stripTelnetCommands(data)
          if (clean.length > 0) {
            getWindow()?.webContents.send(
              'telnet:data',
              payload.sessionId,
              clean.toString('utf-8')
            )
          }
        })

        socket.on('close', () => {
          activeSessions.delete(payload.sessionId)
          getWindow()?.webContents.send('telnet:closed', payload.sessionId)
        })

        socket.on('error', (err) => {
          activeSessions.delete(payload.sessionId)
          reject({ success: false, error: err.message })
        })

        socket.on('timeout', () => {
          socket.destroy()
          reject({ success: false, error: 'Connection timed out' })
        })

        socket.connect(payload.port, payload.host)
      })
    }
  )

  ipcMain.on('telnet:send', (_, sessionId: string, data: string) => {
    const session = activeSessions.get(sessionId)
    if (session) {
      session.socket.write(data)
    }
  })

  ipcMain.handle('telnet:disconnect', (_, sessionId: string) => {
    const session = activeSessions.get(sessionId)
    if (session) {
      session.socket.destroy()
      activeSessions.delete(sessionId)
    }
    return true
  })
}
