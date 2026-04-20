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
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('telnet:resize', sessionId, cols, rows),
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
  },

  // Session Logging
  log: {
    start:   (sessionName: string): Promise<string | null> => ipcRenderer.invoke('log:start', sessionName),
    startAt: (filePath: string, sessionName: string): Promise<string | null> => ipcRenderer.invoke('log:startAt', filePath, sessionName),
    append:  (filePath: string, data: string): Promise<boolean> => ipcRenderer.invoke('log:append', filePath, data),
    stop:    (filePath: string): Promise<boolean> => ipcRenderer.invoke('log:stop', filePath)
  },

  // File / folder dialogs
  file: {
    export: (content: string, filename?: string) =>
      ipcRenderer.invoke('dialog:export', content, filename),
    import: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:import'),
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectFolder'),
    getDefaultLogDir: (): Promise<string> =>
      ipcRenderer.invoke('dialog:getDefaultLogDir')
  },

  // App info
  appInfo: {
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    },
    platform: process.platform
  },

  // Serial
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:list-ports'),
    connect: (payload: unknown) => ipcRenderer.invoke('serial:connect', payload),
    send: (sessionId: string, data: string) => ipcRenderer.send('serial:send', sessionId, data),
    disconnect: (sessionId: string) => ipcRenderer.invoke('serial:disconnect', sessionId),
    onData: (cb: (sessionId: string, data: string) => void) => {
      const handler = (_: unknown, sessionId: string, data: string) => cb(sessionId, data)
      ipcRenderer.on('serial:data', handler)
      return () => ipcRenderer.removeListener('serial:data', handler)
    },
    onClosed: (cb: (sessionId: string) => void) => {
      const handler = (_: unknown, sessionId: string) => cb(sessionId)
      ipcRenderer.on('serial:closed', handler)
      return () => ipcRenderer.removeListener('serial:closed', handler)
    },
    onError: (cb: (sessionId: string, error: string) => void) => {
      const handler = (_: unknown, sessionId: string, error: string) => cb(sessionId, error)
      ipcRenderer.on('serial:error', handler)
      return () => ipcRenderer.removeListener('serial:error', handler)
    }
  },

  // Auth
  auth: {
    hasMasterPassword: () => ipcRenderer.invoke('auth:hasMasterPassword'),
    setMasterPassword: (password: string) => ipcRenderer.invoke('auth:setMasterPassword', password),
    verifyMasterPassword: (password: string) => ipcRenderer.invoke('auth:verifyMasterPassword', password),
    clearMasterPassword: (currentPassword: string) => ipcRenderer.invoke('auth:clearMasterPassword', currentPassword)
  },

  // AI Copilot
  ai: {
    chat:       (payload: unknown)                   => ipcRenderer.invoke('ai:chat', payload),
    cancel:     ()                                   => ipcRenderer.send('ai:cancel'),
    toolResult: (callId: string, output: string)     => ipcRenderer.invoke('ai:tool-result', callId, output),
    setApiKey:      (key: string)                    => ipcRenderer.invoke('ai:set-api-key', key),
    getApiKey:      ()                               => ipcRenderer.invoke('ai:get-api-key'),
    resetBlacklist: ()                               => ipcRenderer.invoke('ai:reset-blacklist'),
    onChunk:    (cb: (chunk: string) => void) => {
      const handler = (_: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('ai:chunk', handler)
      return () => ipcRenderer.removeListener('ai:chunk', handler)
    },
    onDone: (cb: (usage?: { inputTokens: number; outputTokens: number }) => void) => {
      const handler = (_: unknown, usage?: { inputTokens: number; outputTokens: number }) => cb(usage)
      ipcRenderer.on('ai:done', handler)
      return () => ipcRenderer.removeListener('ai:done', handler)
    },
    onToolCall: (cb: (call: { id: string; command: string; reason: string }) => void) => {
      const handler = (_: unknown, call: { id: string; command: string; reason: string }) => cb(call)
      ipcRenderer.on('ai:tool-call', handler)
      return () => ipcRenderer.removeListener('ai:tool-call', handler)
    },
    onError: (cb: (error: string) => void) => {
      const handler = (_: unknown, error: string) => cb(error)
      ipcRenderer.on('ai:error', handler)
      return () => ipcRenderer.removeListener('ai:error', handler)
    },
    onPlan: (cb: (plan: { objective: string; steps: string[] }) => void) => {
      const handler = (_: unknown, plan: { objective: string; steps: string[] }) => cb(plan)
      ipcRenderer.on('ai:plan', handler)
      return () => ipcRenderer.removeListener('ai:plan', handler)
    },
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
