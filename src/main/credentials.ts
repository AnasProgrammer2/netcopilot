import { IpcMain, safeStorage } from 'electron'
import Store from 'electron-store'

const credStore = new Store<{ credentials: Record<string, string> }>({
  name: 'credentials',
  defaults: { credentials: {} }
})

export function setupCredentialHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('credentials:save', (_, key: string, value: string) => {
    try {
      const encrypted = safeStorage.encryptString(value)
      const credentials = credStore.get('credentials', {})
      credentials[key] = encrypted.toString('base64')
      credStore.set('credentials', credentials)
      return { success: true }
    } catch {
      const credentials = credStore.get('credentials', {})
      credentials[key] = Buffer.from(value).toString('base64')
      credStore.set('credentials', credentials)
      return { success: true }
    }
  })

  ipcMain.handle('credentials:get', (_, key: string) => {
    try {
      const credentials = credStore.get('credentials', {})
      const encoded = credentials[key]
      if (!encoded) return null
      const buf = Buffer.from(encoded, 'base64')
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf)
      }
      return buf.toString()
    } catch {
      return null
    }
  })

  ipcMain.handle('credentials:delete', (_, key: string) => {
    const credentials = credStore.get('credentials', {})
    delete credentials[key]
    credStore.set('credentials', credentials)
    return true
  })
}
