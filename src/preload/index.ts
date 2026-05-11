import { contextBridge, ipcRenderer } from 'electron'

// ── Single-listener fanout ────────────────────────────────────────────────────
// Instead of registering one ipcRenderer listener per session (causing
// MaxListenersExceededWarning when >10 sessions are open), we keep exactly ONE
// ipcRenderer listener per channel and fan out to all registered callbacks.
function makeFanout<T extends unknown[]>(channel: string): (cb: (...args: T) => void) => () => void {
  const handlers = new Set<(...args: T) => void>()
  ipcRenderer.on(channel, (_: unknown, ...args: unknown[]) => {
    handlers.forEach(cb => cb(...(args as T)))
  })
  return (cb) => {
    handlers.add(cb)
    return () => handlers.delete(cb)
  }
}

const onSshData    = makeFanout<[string, string]>('ssh:data')
const onSshClosed  = makeFanout<[string]>('ssh:closed')
const onTelnetData   = makeFanout<[string, string]>('telnet:data')
const onTelnetClosed = makeFanout<[string]>('telnet:closed')
const onSerialData   = makeFanout<[string, string]>('serial:data')
const onSerialClosed = makeFanout<[string]>('serial:closed')
const onSerialError  = makeFanout<[string, string]>('serial:error')
const onSftpProgress = makeFanout<[string, string, number, number]>('sftp:progress')
const onSftpClosed   = makeFanout<[string]>('sftp:closed')
const onAiChunk     = makeFanout<[string]>('ai:chunk')
const onAiDone      = makeFanout<[{ inputTokens: number; outputTokens: number } | undefined]>('ai:done')
const onAiToolCall  = makeFanout<[{ id: string; command: string; reason: string; targetSession?: string }]>('ai:tool-call')
const onAiError     = makeFanout<[string]>('ai:error')
const onAiPlan      = makeFanout<[{ objective: string; steps: string[] }]>('ai:plan')
const onWindowMaximized  = makeFanout<[boolean]>('window:maximized-change')
const onUpdaterAvailable = makeFanout<[{ version: string; releaseDate: string; releaseNotes: string | null }]>('updater:update-available')
const onUpdaterError     = makeFanout<[string]>('updater:error')

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
    getSnippets: () => ipcRenderer.invoke('store:get-snippets'),
    saveSnippet: (snippet: unknown) => ipcRenderer.invoke('store:save-snippet', snippet),
    deleteSnippet: (id: string) => ipcRenderer.invoke('store:delete-snippet', id),
    getSnippetFolders: () => ipcRenderer.invoke('store:get-snippet-folders'),
    saveSnippetFolder: (folder: unknown) => ipcRenderer.invoke('store:save-snippet-folder', folder),
    deleteSnippetFolder: (id: string) => ipcRenderer.invoke('store:delete-snippet-folder', id),
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
    forwardStart: (payload: unknown) => ipcRenderer.invoke('ssh:forward-start', payload),
    forwardStop:  (forwardId: string) => ipcRenderer.invoke('ssh:forward-stop', forwardId),
    forwardStopSession: (sessionId: string) => ipcRenderer.invoke('ssh:forward-stop-session', sessionId),
    onData:   onSshData,
    onClosed: onSshClosed,
  },

  // Telnet
  telnet: {
    connect: (payload: unknown) => ipcRenderer.invoke('telnet:connect', payload),
    send: (sessionId: string, data: string) => ipcRenderer.send('telnet:send', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('telnet:resize', sessionId, cols, rows),
    disconnect: (sessionId: string) => ipcRenderer.invoke('telnet:disconnect', sessionId),
    onData:   onTelnetData,
    onClosed: onTelnetClosed,
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
      ipcRenderer.invoke('dialog:getDefaultLogDir'),
    readSshConfig: (pickFile?: boolean): Promise<string | null> =>
      ipcRenderer.invoke('dialog:read-ssh-config', pickFile ?? false),
    readTextFile: (opts?: { title?: string; extensions?: string[] }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:read-text-file', opts ?? {}),
  },

  // App info
  appInfo: {
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    },
    platform: process.platform,
    arch: process.arch,
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  },

  // Window controls (custom titlebar for Windows/Linux)
  window: {
    minimize:    () => ipcRenderer.invoke('window:minimize'),
    maximize:    () => ipcRenderer.invoke('window:maximize'),
    close:       () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: onWindowMaximized,
  },

  // Auto-updater (check only — downloads open in browser)
  updater: {
    check:       () => ipcRenderer.invoke('updater:check'),
    openRelease: (url: string) => ipcRenderer.invoke('updater:open-release', url),
    onUpdateAvailable: onUpdaterAvailable,
    onError:           onUpdaterError,
  },

  // Serial
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:list-ports'),
    connect: (payload: unknown) => ipcRenderer.invoke('serial:connect', payload),
    send: (sessionId: string, data: string) => ipcRenderer.send('serial:send', sessionId, data),
    disconnect: (sessionId: string) => ipcRenderer.invoke('serial:disconnect', sessionId),
    onData:   onSerialData,
    onClosed: onSerialClosed,
    onError:  onSerialError,
  },

  // Auth
  auth: {
    hasMasterPassword: () => ipcRenderer.invoke('auth:hasMasterPassword'),
    setMasterPassword: (password: string) => ipcRenderer.invoke('auth:setMasterPassword', password),
    verifyMasterPassword: (password: string) => ipcRenderer.invoke('auth:verifyMasterPassword', password),
    clearMasterPassword: (currentPassword: string) => ipcRenderer.invoke('auth:clearMasterPassword', currentPassword)
  },

  // Command History (Smart History)
  history: {
    record: (deviceType: string, command: string) =>
      ipcRenderer.invoke('history:record', deviceType, command),
    get: (deviceType: string, limit?: number) =>
      ipcRenderer.invoke('history:get', deviceType, limit),
    clear: (deviceType?: string) =>
      ipcRenderer.invoke('history:clear', deviceType)
  },

  // License management
  license: {
    get:        ()              => ipcRenderer.invoke('license:get'),
    set:        (key: string)   => ipcRenderer.invoke('license:set', key),
    verify:     ()              => ipcRenderer.invoke('license:verify'),
    activate:   (key: string)   => ipcRenderer.invoke('license:activate', key),
    getDeviceId: ()             => ipcRenderer.invoke('license:device-id'),
  },

  // SFTP
  sftp: {
    connect: (payload: unknown) => ipcRenderer.invoke('sftp:connect', payload),
    home:     (sessionId: string) => ipcRenderer.invoke('sftp:home', sessionId),
    list:     (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:list', sessionId, remotePath),
    download: (sessionId: string, remotePaths: string[]) => ipcRenderer.invoke('sftp:download', sessionId, remotePaths),
    upload:   (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:upload', sessionId, remotePath),
    delete:   (sessionId: string, remotePath: string, isDirectory: boolean) => ipcRenderer.invoke('sftp:delete', sessionId, remotePath, isDirectory),
    rename:   (sessionId: string, oldPath: string, newPath: string) => ipcRenderer.invoke('sftp:rename', sessionId, oldPath, newPath),
    mkdir:    (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath),
    disconnect: (sessionId: string) => ipcRenderer.invoke('sftp:disconnect', sessionId),
    onProgress: onSftpProgress,
    onClosed:   onSftpClosed,
  },

  // AI Copilot
  ai: {
    chat:          (payload: unknown)                   => ipcRenderer.invoke('ai:chat', payload),
    cancel:        ()                                   => ipcRenderer.send('ai:cancel'),
    toolResult:    (callId: string, output: string)     => ipcRenderer.invoke('ai:tool-result', callId, output),
    resetBlacklist: ()                                  => ipcRenderer.invoke('ai:reset-blacklist'),
    exportMarkdown: (payload: unknown)                  => ipcRenderer.invoke('ai:export-markdown', payload),
    onChunk:    onAiChunk,
    onDone:     onAiDone,
    onToolCall: onAiToolCall,
    onError:    onAiError,
    onPlan:     onAiPlan,
  },

  connection: {
    ping: (host: string, port: number): Promise<{ alive: boolean; latency?: number }> =>
      ipcRenderer.invoke('connection:ping', host, port),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
