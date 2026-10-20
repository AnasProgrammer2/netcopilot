import { IpcMain, BrowserWindow, dialog } from 'electron'
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2'
import * as path from 'path'
import { createHostVerifier, cancelHostKeyPrompts } from './hostKeys'

export interface SftpEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  modifyTime: number
  permissions: number
}

interface SftpSession {
  client: Client
  sftp: SFTPWrapper
}

const sftpSessions = new Map<string, SftpSession>()
/** Clients still connecting, so a disconnect during the handshake closes them. */
const pendingSftpClients = new Map<string, { client: Client; cancel: () => void }>()

/** Remove our listeners and close; keep a no-op 'error' listener so a late error can't crash main. */
function silenceAndEnd(client: Client): void {
  cancelHostKeyPrompts(client)
  client.removeAllListeners()
  client.on('error', () => { /* ignore late errors */ })
  try { client.end() } catch { /* already closed */ }
}

function teardownSftpSession(sessionId: string): void {
  const pending = pendingSftpClients.get(sessionId)
  if (pending) {
    pendingSftpClients.delete(sessionId)
    silenceAndEnd(pending.client)
    pending.cancel()
  }
  const session = sftpSessions.get(sessionId)
  if (!session) return
  silenceAndEnd(session.client)
  sftpSessions.delete(sessionId)
}

export function setupSftpHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {

  ipcMain.handle('sftp:connect', (_, payload: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    passphrase?: string
  }) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      teardownSftpSession(payload.sessionId)

      const client = new Client()
      const isPending = () => pendingSftpClients.get(payload.sessionId)?.client === client
      // Torn down (sftp:disconnect / reconnect) before the handshake finished
      pendingSftpClients.set(payload.sessionId, {
        client,
        cancel: () => resolve({ success: false, error: 'Connection cancelled' }),
      })

      client.on('error', (err) => {
        if (isPending()) pendingSftpClients.delete(payload.sessionId)
        silenceAndEnd(client)
        resolve({ success: false, error: err.message })
      })

      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (!isPending()) {
            silenceAndEnd(client)
            return resolve({ success: false, error: 'Connection cancelled' })
          }
          pendingSftpClients.delete(payload.sessionId)
          if (err) {
            silenceAndEnd(client)
            return resolve({ success: false, error: err.message })
          }
          sftpSessions.set(payload.sessionId, { client, sftp })

          client.removeAllListeners('error')
          client.on('error', () => {
            // Ignore stale errors from a connection that was replaced
            if (sftpSessions.get(payload.sessionId)?.client !== client) return
            teardownSftpSession(payload.sessionId)
            getWindow()?.webContents.send('sftp:closed', payload.sessionId)
          })

          resolve({ success: true })
        })
      })

      const cfg: ConnectConfig = {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        readyTimeout: 30000,
        keepaliveInterval: 30000,
        hostVerifier: createHostVerifier(client, payload.host, payload.port, getWindow),
      }
      if (payload.privateKey) {
        cfg.privateKey = payload.privateKey
        if (payload.passphrase) cfg.passphrase = payload.passphrase
      } else if (payload.password) {
        cfg.password = payload.password
      }

      client.connect(cfg)
    })
  })

  ipcMain.handle('sftp:home', (_, sessionId: string) => {
    return new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
      const session = sftpSessions.get(sessionId)
      if (!session) return resolve({ success: false, error: 'Not connected' })

      session.sftp.realpath('.', (err, resolvedPath) => {
        if (err) resolve({ success: true, path: '/' })
        else resolve({ success: true, path: resolvedPath })
      })
    })
  })

  ipcMain.handle('sftp:list', (_, sessionId: string, remotePath: string) => {
    return new Promise<{ success: boolean; entries?: SftpEntry[]; error?: string }>((resolve) => {
      const session = sftpSessions.get(sessionId)
      if (!session) return resolve({ success: false, error: 'Not connected' })

      session.sftp.readdir(remotePath, (err, list) => {
        if (err) return resolve({ success: false, error: err.message })

        const entries: SftpEntry[] = list
          .filter(item => item.filename !== '.' && item.filename !== '..')
          .map((item) => {
            const mode = item.attrs.mode ?? 0
            const isDirectory = (mode & 0o170000) === 0o040000
            return {
              name: item.filename,
              path: remotePath === '/' ? `/${item.filename}` : `${remotePath}/${item.filename}`,
              size: item.attrs.size ?? 0,
              isDirectory,
              modifyTime: (item.attrs.mtime ?? 0) * 1000,
              permissions: mode,
            }
          })
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        resolve({ success: true, entries })
      })
    })
  })

  ipcMain.handle('sftp:download', async (_, sessionId: string, remotePaths: string[]) => {
    const session = sftpSessions.get(sessionId)
    if (!session) return { success: false, error: 'Not connected' }

    const win = getWindow()
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose download folder',
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }

    const localDir = result.filePaths[0]

    for (const remotePath of remotePaths) {
      const fileName = path.basename(remotePath)
      const localPath = path.join(localDir, fileName)

      try {
        await new Promise<void>((resolve, reject) => {
          session.sftp.fastGet(remotePath, localPath, {
            step: (transferred: number, _chunk: number, total: number) => {
              win.webContents.send('sftp:progress', sessionId, remotePath, transferred, total)
            },
          }, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }

    return { success: true, localDir }
  })

  ipcMain.handle('sftp:upload', async (_, sessionId: string, remotePath: string) => {
    const session = sftpSessions.get(sessionId)
    if (!session) return { success: false, error: 'Not connected' }

    const win = getWindow()
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: 'Choose files to upload',
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }

    for (const localPath of result.filePaths) {
      const fileName = path.basename(localPath)
      const remoteFilePath = remotePath === '/' ? `/${fileName}` : `${remotePath}/${fileName}`

      try {
        await new Promise<void>((resolve, reject) => {
          session.sftp.fastPut(localPath, remoteFilePath, {
            step: (transferred: number, _chunk: number, total: number) => {
              win.webContents.send('sftp:progress', sessionId, localPath, transferred, total)
            },
          }, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }

    return { success: true }
  })

  ipcMain.handle('sftp:delete', (_, sessionId: string, remotePath: string, isDirectory: boolean) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const session = sftpSessions.get(sessionId)
      if (!session) return resolve({ success: false, error: 'Not connected' })

      if (isDirectory) {
        session.sftp.rmdir(remotePath, (err) => {
          if (err) resolve({ success: false, error: err.message })
          else resolve({ success: true })
        })
      } else {
        session.sftp.unlink(remotePath, (err) => {
          if (err) resolve({ success: false, error: err.message })
          else resolve({ success: true })
        })
      }
    })
  })

  ipcMain.handle('sftp:rename', (_, sessionId: string, oldPath: string, newPath: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const session = sftpSessions.get(sessionId)
      if (!session) return resolve({ success: false, error: 'Not connected' })

      session.sftp.rename(oldPath, newPath, (err) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:mkdir', (_, sessionId: string, remotePath: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const session = sftpSessions.get(sessionId)
      if (!session) return resolve({ success: false, error: 'Not connected' })

      session.sftp.mkdir(remotePath, (err) => {
        if (err) resolve({ success: false, error: err.message })
        else resolve({ success: true })
      })
    })
  })

  ipcMain.handle('sftp:disconnect', (_, sessionId: string) => {
    teardownSftpSession(sessionId)
    return true
  })
}
