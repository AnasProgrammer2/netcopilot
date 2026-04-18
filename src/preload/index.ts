import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Store
  store: {
    getConnections: () => ipcRenderer.invoke('store:get-connections'),
    saveConnection: (conn: unknown) => ipcRenderer.invoke('store:save-connection', conn),
    deleteConnection: (id: string) => ipcRenderer.invoke('store:delete-connection', id),
    getGroups: () => ipcRenderer.invoke('store:get-groups'),
    saveGroup: (group: unknown) => ipcRenderer.invoke('store:save-group', group),
    deleteGroup: (id: string) => ipcRenderer.invoke('store:delete-group', id),
    getSshKeys: () => ipcRenderer.invoke('store:get-ssh-keys'),
    saveSshKey: (key: unknown) => ipcRenderer.invoke('store:save-ssh-key', key),
    deleteSshKey: (id: string) => ipcRenderer.invoke('store:delete-ssh-key', id),
    getSetting: (key: string) => ipcRenderer.invoke('store:get-setting', key),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke('store:set-setting', key, value)
  },

  // Credentials
  credentials: {
    save: (key: string, value: string) => ipcRenderer.invoke('credentials:save', key, value),
    get: (key: string) => ipcRenderer.invoke('credentials:get', key),
    delete: (key: string) => ipcRenderer.invoke('credentials:delete', key)
  },

  // SSH
  ssh: {
    connect: (payload: unknown) => ipcRenderer.invoke('ssh:connect', payload),
    send: (sessionId: string, data: string) => ipcRenderer.send('ssh:send', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    onData: (cb: (sessionId: string, data: string) => void) => {
      const handler = (_: unknown, sessionId: string, data: string) => cb(sessionId, data)
      ipcRenderer.on('ssh:data', handler)
      return () => ipcRenderer.removeListener('ssh:data', handler)
    },
    onClosed: (cb: (sessionId: string) => void) => {
      const handler = (_: unknown, sessionId: string) => cb(sessionId)
      ipcRenderer.on('ssh:closed', handler)
      return () => ipcRenderer.removeListener('ssh:closed', handler)
    }
  },

  // Telnet
  telnet: {
    connect: (payload: unknown) => ipcRenderer.invoke('telnet:connect', payload),
    send: (sessionId: string, data: string) => ipcRenderer.send('telnet:send', sessionId, data),
    disconnect: (sessionId: string) => ipcRenderer.invoke('telnet:disconnect', sessionId),
    onData: (cb: (sessionId: string, data: string) => void) => {
      const handler = (_: unknown, sessionId: string, data: string) => cb(sessionId, data)
      ipcRenderer.on('telnet:data', handler)
      return () => ipcRenderer.removeListener('telnet:data', handler)
    },
    onClosed: (cb: (sessionId: string) => void) => {
      const handler = (_: unknown, sessionId: string) => cb(sessionId)
      ipcRenderer.on('telnet:closed', handler)
      return () => ipcRenderer.removeListener('telnet:closed', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
