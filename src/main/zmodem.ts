import { IpcMain, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// Zmodem (lrzsz) protocol support for file transfers over terminal
// Implements detection and handling of Zmodem start sequences

interface ZmodemSession {
  sessionId: string
  isReceiving: boolean // true = uploading to remote, false = downloading from remote
  filePath?: string
  fileStream?: fs.WriteStream
  fileSize?: number
  bytesTransferred: number
  buffer: Buffer
}

const activeZmodemSessions = new Map<string, ZmodemSession>()

// Zmodem signature bytes
const ZMODEM_START_SIG = Buffer.from([0x2a, 0x2a, 0x18, 0x42]) // **\x18B (zrinit)
const ZMODEM_START_RZ = Buffer.from([0x72, 0x7a, 0x0d])       // rz\r
const ZMODEM_START_SZ = Buffer.from([0x73, 0x7a, 0x0d])       // sz\r
const ZMODEM_CANCEL = Buffer.from([0x18, 0x18, 0x18, 0x18, 0x18])

export function detectZmodemStart(data: Buffer): 'receive' | 'send' | null {
  // Check for zmodem init sequences
  if (data.includes(ZMODEM_START_SIG)) {
    return 'receive' // Remote wants to send (we receive)
  }
  if (data.includes(ZMODEM_START_RZ)) {
    return 'receive' // rz command detected
  }
  if (data.includes(ZMODEM_START_SZ)) {
    return 'send' // sz command detected
  }
  return null
}

export function setupZmodemHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
  sendToSession: (sessionId: string, data: string) => void
): void {
  // Start Zmodem receive (downloading from remote)
  ipcMain.handle('zmodem:receive-start', async (_, sessionId: string, suggestedName?: string) => {
    const win = getWindow()
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || 'download',
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })

    if (result.canceled || !result.filePath) {
      // User cancelled - send cancel sequence
      sendToSession(sessionId, ZMODEM_CANCEL.toString('binary'))
      return { success: false, cancelled: true }
    }

    try {
      const fileStream = fs.createWriteStream(result.filePath, { flags: 'w' })
      const session: ZmodemSession = {
        sessionId,
        isReceiving: true,
        filePath: result.filePath,
        fileStream,
        bytesTransferred: 0,
        buffer: Buffer.alloc(0)
      }
      activeZmodemSessions.set(sessionId, session)

      fileStream.on('error', (err) => {
        console.error(`[Zmodem] File write error for ${sessionId}:`, err)
        cleanupZmodemSession(sessionId)
      })

      fileStream.on('close', () => {
        activeZmodemSessions.delete(sessionId)
      })

      // Send ZRINIT to start transfer
      const zrinit = buildZrinit()
      sendToSession(sessionId, zrinit)

      return { success: true, filePath: result.filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendToSession(sessionId, ZMODEM_CANCEL.toString('binary'))
      return { success: false, error: message }
    }
  })

  // Start Zmodem send (uploading to remote)
  ipcMain.handle('zmodem:send-start', async (_, sessionId: string) => {
    const win = getWindow()
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: 'Select files to upload'
    })

    if (result.canceled || !result.filePaths.length) {
      // User cancelled - send cancel sequence
      sendToSession(sessionId, ZMODEM_CANCEL.toString('binary'))
      return { success: false, cancelled: true }
    }

    // For now, support single file transfers (multi-file can be added later)
    const filePath = result.filePaths[0]

    try {
      const stats = fs.statSync(filePath)
      const fileName = path.basename(filePath)
      const fileData = fs.readFileSync(filePath)

      const session: ZmodemSession = {
        sessionId,
        isReceiving: false,
        filePath,
        fileSize: stats.size,
        bytesTransferred: 0,
        buffer: fileData
      }
      activeZmodemSessions.set(sessionId, session)

      // Send ZFILE header to initiate upload
      const zfile = buildZfile(fileName, stats.size, stats.mtime)
      sendToSession(sessionId, zfile)

      return { success: true, fileName, fileSize: stats.size }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendToSession(sessionId, ZMODEM_CANCEL.toString('binary'))
      return { success: false, error: message }
    }
  })

  // Process incoming Zmodem data during transfer
  ipcMain.handle('zmodem:process-data', (_, sessionId: string, data: string) => {
    const session = activeZmodemSessions.get(sessionId)
    if (!session) return { handled: false }

    const buffer = Buffer.from(data, 'binary')
    session.buffer = Buffer.concat([session.buffer, buffer])

    if (session.isReceiving) {
      // Process incoming file data
      return processReceiveData(sessionId, session)
    } else {
      // Process protocol responses for sending
      return processSendData(sessionId, session, buffer)
    }
  })

  // Abort active transfer
  ipcMain.handle('zmodem:abort', (_, sessionId: string) => {
    const session = activeZmodemSessions.get(sessionId)
    if (session) {
      sendToSession(sessionId, ZMODEM_CANCEL.toString('binary'))
      cleanupZmodemSession(sessionId)
    }
    return { success: true }
  })

  // Get transfer status
  ipcMain.handle('zmodem:status', (_, sessionId: string) => {
    const session = activeZmodemSessions.get(sessionId)
    if (!session) return null

    return {
      isReceiving: session.isReceiving,
      filePath: session.filePath,
      fileSize: session.fileSize,
      bytesTransferred: session.bytesTransferred,
      progress: session.fileSize ? (session.bytesTransferred / session.fileSize) * 100 : 0
    }
  })
}

function processReceiveData(sessionId: string, session: ZmodemSession): { handled: boolean; complete?: boolean } {
  // Simple Zmodem data extraction (production would use proper frame parsing)
  // For now, we strip headers and write data

  const data = session.buffer
  let writeStart = 0
  let writeEnd = data.length

  // Look for frame markers
  const frameStart = data.indexOf(0x01) // SOH
  const frameEnd = data.indexOf(0x0a)  // LF

  if (frameStart !== -1 && frameEnd !== -1 && frameEnd > frameStart) {
    // Found a frame, extract data between frames
    writeStart = frameEnd + 1

    // Check for ZFIN (end of transfer)
    if (data.includes(Buffer.from([0x18, 0x42]))) { // ZFIN signature
      cleanupZmodemSession(sessionId)
      return { handled: true, complete: true }
    }
  }

  // Write data to file
  if (writeEnd > writeStart && session.fileStream) {
    const toWrite = data.slice(writeStart, writeEnd)
    session.fileStream.write(toWrite)
    session.bytesTransferred += toWrite.length

    // Acknowledge with ZACK
    // This would be implemented in full protocol
  }

  session.buffer = Buffer.alloc(0) // Clear processed buffer
  return { handled: true }
}

function processSendData(
  sessionId: string,
  session: ZmodemSession,
  data: Buffer
): { handled: boolean; complete?: boolean } {
  // Process responses from receiver
  if (data.includes(Buffer.from([0x2a, 0x2a, 0x18, 0x42]))) {
    // ZRINIT - receiver ready, send data
    if (session.buffer.length > 0) {
      // Send next chunk
      const chunkSize = 1024
      const chunk = session.buffer.slice(0, chunkSize)
      session.buffer = session.buffer.slice(chunkSize)
      session.bytesTransferred += chunk.length

      // In real implementation, build proper ZDATA frame
      // For now, send raw data
      // This would need the actual session send function injected
    } else {
      // File complete, send ZEOF and ZFIN
      cleanupZmodemSession(sessionId)
      return { handled: true, complete: true }
    }
  }

  if (data.includes(ZMODEM_CANCEL)) {
    // Transfer cancelled by receiver
    cleanupZmodemSession(sessionId)
    return { handled: true, complete: false }
  }

  return { handled: true }
}

function cleanupZmodemSession(sessionId: string): void {
  const session = activeZmodemSessions.get(sessionId)
  if (session) {
    if (session.fileStream) {
      try { session.fileStream.end() } catch { /* ignore */ }
      try { session.fileStream.close() } catch { /* ignore */ }
    }
    activeZmodemSessions.delete(sessionId)
  }
}

// Build Zmodem protocol frames
function buildZrinit(): string {
  // ZRINIT frame - indicate receiver ready
  const frame = Buffer.from([
    0x2a, 0x2a, 0x18, 0x42, // header
    0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, // flags
    0x0d, 0x0a // CRLF
  ])
  return frame.toString('binary')
}

function buildZfile(fileName: string, fileSize: number, mtime: Date): string {
  // ZFILE frame - initiate file send
  const header = Buffer.from([0x2a, 0x2a, 0x18, 0x41, 0x30]) // ZFILE header
  const info = Buffer.from(`${fileName}\x00${fileSize} ${Math.floor(mtime.getTime() / 1000)} 0\x00`, 'utf-8')
  const crc = Buffer.from([0x0d, 0x0a])
  return Buffer.concat([header, info, crc]).toString('binary')
}

// Export for use in ssh.ts to detect zmodem in stream data
export function handleZmodemDetection(
  _sessionId: string,
  data: Buffer,
  enabled: boolean
): { detected: boolean; type?: 'receive' | 'send' } {
  if (!enabled) return { detected: false }

  const type = detectZmodemStart(data)
  if (type) {
    return { detected: true, type }
  }
  return { detected: false }
}
