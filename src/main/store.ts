import { IpcMain } from 'electron'
import Store from 'electron-store'
import { Connection, ConnectionGroup, SSHKey } from '../types/shared'

const store = new Store<{
  connections: Connection[]
  groups: ConnectionGroup[]
  sshKeys: SSHKey[]
  settings: Record<string, unknown>
}>({
  defaults: {
    connections: [],
    groups: [],
    sshKeys: [],
    settings: {}
  }
})

export function setupStoreHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('store:get-connections', () => store.get('connections', []))

  ipcMain.handle('store:save-connection', (_, connection: Connection) => {
    const connections = store.get('connections', [])
    const idx = connections.findIndex((c) => c.id === connection.id)
    if (idx >= 0) {
      connections[idx] = connection
    } else {
      connections.push(connection)
    }
    store.set('connections', connections)
    return connection
  })

  ipcMain.handle('store:delete-connection', (_, id: string) => {
    const connections = store.get('connections', []).filter((c) => c.id !== id)
    store.set('connections', connections)
    return true
  })

  ipcMain.handle('store:get-groups', () => store.get('groups', []))

  ipcMain.handle('store:save-group', (_, group: ConnectionGroup) => {
    const groups = store.get('groups', [])
    const idx = groups.findIndex((g) => g.id === group.id)
    if (idx >= 0) {
      groups[idx] = group
    } else {
      groups.push(group)
    }
    store.set('groups', groups)
    return group
  })

  ipcMain.handle('store:delete-group', (_, id: string) => {
    const groups = store.get('groups', []).filter((g) => g.id !== id)
    store.set('groups', groups)
    return true
  })

  ipcMain.handle('store:get-ssh-keys', () => store.get('sshKeys', []))

  ipcMain.handle('store:save-ssh-key', (_, key: SSHKey) => {
    const keys = store.get('sshKeys', [])
    const idx = keys.findIndex((k) => k.id === key.id)
    if (idx >= 0) {
      keys[idx] = key
    } else {
      keys.push(key)
    }
    store.set('sshKeys', keys)
    return key
  })

  ipcMain.handle('store:delete-ssh-key', (_, id: string) => {
    const keys = store.get('sshKeys', []).filter((k) => k.id !== id)
    store.set('sshKeys', keys)
    return true
  })

  ipcMain.handle('store:get-setting', (_, key: string) => {
    const settings = store.get('settings', {})
    return settings[key]
  })

  ipcMain.handle('store:set-setting', (_, key: string, value: unknown) => {
    const settings = store.get('settings', {})
    settings[key] = value
    store.set('settings', settings)
    return true
  })
}
