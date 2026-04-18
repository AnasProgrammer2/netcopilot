import { IpcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'

interface SerialSession {
  port: SerialPort
}

const activeSessions = new Map<string, SerialSession>()

export function setupSerialHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  // List available serial ports on the system
  ipcMain.handle('serial:list-ports', async () => {
    try {
      const ports = await SerialPort.list()
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
        locationId: p.locationId,
        productId: p.productId,
        vendorId: p.vendorId
      }))
    } catch {
      return []
    }
  })

  // Open a serial port connection
  ipcMain.handle(
    'serial:connect',
    (
      _,
      payload: {
        sessionId: string
        path: string
        baudRate: number
        dataBits?: 5 | 6 | 7 | 8
        stopBits?: 1 | 1.5 | 2
        parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
        rtscts?: boolean
        xon?: boolean
        xoff?: boolean
      }
    ) => {
      return new Promise((resolve, reject) => {
        const port = new SerialPort({
          path: payload.path,
          baudRate: payload.baudRate,
          dataBits: payload.dataBits ?? 8,
          stopBits: payload.stopBits ?? 1,
          parity: payload.parity ?? 'none',
          rtscts: payload.rtscts ?? false,
          xon: payload.xon ?? false,
          xoff: payload.xoff ?? false,
          autoOpen: false
        })

        port.open((err) => {
          if (err) {
            return reject({ success: false, error: err.message })
          }

          activeSessions.set(payload.sessionId, { port })

          port.on('data', (data: Buffer) => {
            getWindow()?.webContents.send(
              'serial:data',
              payload.sessionId,
              data.toString('utf-8')
            )
          })

          port.on('close', () => {
            activeSessions.delete(payload.sessionId)
            getWindow()?.webContents.send('serial:closed', payload.sessionId)
          })

          port.on('error', (portErr) => {
            getWindow()?.webContents.send('serial:error', payload.sessionId, portErr.message)
          })

          resolve({ success: true })
        })
      })
    }
  )

  // Send data to serial port
  ipcMain.on('serial:send', (_, sessionId: string, data: string) => {
    const session = activeSessions.get(sessionId)
    if (session?.port.isOpen) {
      session.port.write(data)
    }
  })

  // Close serial port
  ipcMain.handle('serial:disconnect', (_, sessionId: string) => {
    const session = activeSessions.get(sessionId)
    if (session) {
      if (session.port.isOpen) {
        session.port.close()
      }
      activeSessions.delete(sessionId)
    }
    return true
  })
}
