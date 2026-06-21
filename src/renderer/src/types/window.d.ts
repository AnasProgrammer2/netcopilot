import { Connection, ConnectionGroup, SSHKey, SftpFileEntry, Snippet, SnippetFolder } from '.'

interface JumpHostPayload {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

interface SshConnectPayload {
  sessionId: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  cols?: number
  rows?: number
  readyTimeout?: number
  keepaliveInterval?: number
  keepaliveCountMax?: number
  // SSH Agent Forwarding
  agentForwarding?: boolean
  agentSocketPath?: string
  // Anti-idle
  antiIdle?: boolean
  antiIdleInterval?: number
  antiIdleString?: string
  // Terminal display features
  trueColor?: boolean
  sixel?: boolean
  // Zmodem
  zmodemEnabled?: boolean
  // Jump Host
  jumpHost?: JumpHostPayload
  // Proxy
  proxy?: {
    type: 'socks5' | 'socks4' | 'http'
    host: string
    port: number
    username?: string
    password?: string
  }
}

interface TelnetConnectPayload {
  sessionId: string
  host: string
  port: number
  cols?: number
  rows?: number
}

interface SerialPort {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  locationId?: string
  productId?: string
  vendorId?: string
}

interface SerialConnectPayload {
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

declare global {
  interface Window {
    api: {
      appInfo: {
        versions: { electron: string; node: string; chrome: string }
        platform: string
        arch: string
        getVersion(): Promise<string>
      }
      updater: {
        check(): Promise<{ success: boolean; updateAvailable?: boolean; updateInfo?: { version: string } | null; error?: string }>
        openRelease(url: string): void
        onUpdateAvailable(cb: (info: { version: string; releaseDate: string; releaseNotes: string | null }) => void): () => void
        onError(cb: (message: string) => void): () => void
      }
      store: {
        getConnections(): Promise<Connection[]>
        saveConnection(conn: Connection): Promise<Connection>
        deleteConnection(id: string): Promise<boolean>
        getGroups(): Promise<ConnectionGroup[]>
        saveGroup(group: ConnectionGroup): Promise<ConnectionGroup>
        deleteGroup(id: string): Promise<boolean>
        getSshKeys(): Promise<SSHKey[]>
        saveSshKey(key: SSHKey): Promise<SSHKey>
        deleteSshKey(id: string): Promise<boolean>
        getSnippets(): Promise<Snippet[]>
        saveSnippet(snippet: Snippet): Promise<Snippet>
        deleteSnippet(id: string): Promise<boolean>
        getSnippetFolders(): Promise<SnippetFolder[]>
        saveSnippetFolder(folder: SnippetFolder): Promise<SnippetFolder>
        deleteSnippetFolder(id: string): Promise<boolean>
        getSetting(key: string): Promise<unknown>
        setSetting(key: string, value: unknown): Promise<boolean>
      }
      credentials: {
        save(key: string, value: string): Promise<{ success: boolean }>
        get(key: string): Promise<string | null>
        delete(key: string): Promise<boolean>
      }
  log: {
    start(sessionName: string, config?: { enabled: boolean; sizeMB: number; maxFiles: number }): Promise<string | null>
    startAt(filePath: string, sessionName: string, config?: { enabled: boolean; sizeMB: number; maxFiles: number }): Promise<string | null>
    append(filePath: string, data: string): Promise<boolean>
    stop(filePath: string): Promise<boolean>
    setRotationConfig(config: { enabled: boolean; sizeMB: number; maxFiles: number }): Promise<boolean>
  }
      file: {
        export(content: string, filename?: string): Promise<{ success: boolean; filePath?: string }>
        import(): Promise<string | null>
        selectFolder(): Promise<string | null>
        getDefaultLogDir(): Promise<string>
        readSshConfig(pickFile?: boolean): Promise<string | null>
        readTextFile(opts?: { title?: string; extensions?: string[] }): Promise<string | null>
      }
      ssh: {
        connect(payload: SshConnectPayload): Promise<{ success: boolean }>
        send(sessionId: string, data: string): void
        resize(sessionId: string, cols: number, rows: number): Promise<boolean>
        disconnect(sessionId: string): Promise<boolean>
        forwardStart(payload: {
          forwardId: string; sessionId: string; type: 'local' | 'dynamic'
          localPort: number; remoteHost: string; remotePort: number
        }): Promise<{ success: boolean; error?: string }>
        forwardStop(forwardId: string): Promise<boolean>
        forwardStopSession(sessionId: string): Promise<boolean>
        onData(cb: (sessionId: string, data: string) => void): () => void
        onClosed(cb: (sessionId: string) => void): () => void
      }
      sftp: {
        connect(payload: {
          sessionId: string; host: string; port: number; username: string
          password?: string; privateKey?: string; passphrase?: string
        }): Promise<{ success: boolean; error?: string }>
        home(sessionId: string): Promise<{ success: boolean; path?: string; error?: string }>
        list(sessionId: string, remotePath: string): Promise<{ success: boolean; entries?: SftpFileEntry[]; error?: string }>
        download(sessionId: string, remotePaths: string[]): Promise<{ success: boolean; canceled?: boolean; localDir?: string; error?: string }>
        upload(sessionId: string, remotePath: string): Promise<{ success: boolean; canceled?: boolean; error?: string }>
        delete(sessionId: string, remotePath: string, isDirectory: boolean): Promise<{ success: boolean; error?: string }>
        rename(sessionId: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }>
        mkdir(sessionId: string, remotePath: string): Promise<{ success: boolean; error?: string }>
        disconnect(sessionId: string): Promise<boolean>
        onProgress(cb: (sessionId: string, filePath: string, transferred: number, total: number) => void): () => void
        onClosed(cb: (sessionId: string) => void): () => void
      }
      zmodem: {
        receiveStart(sessionId: string, suggestedName?: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
        sendStart(sessionId: string): Promise<{ success: boolean; fileName?: string; fileSize?: number; cancelled?: boolean; error?: string }>
        processData(sessionId: string, data: string): Promise<{ handled: boolean; complete?: boolean }>
        abort(sessionId: string): Promise<{ success: boolean }>
        status(sessionId: string): Promise<{ isReceiving: boolean; filePath?: string; fileSize?: number; bytesTransferred: number; progress: number } | null>
        onDetect(cb: (evt: { sessionId: string; type: 'receive' | 'send' }) => void): () => void
      }
      telnet: {
        connect(payload: TelnetConnectPayload): Promise<{ success: boolean }>
        send(sessionId: string, data: string): void
        resize(sessionId: string, cols: number, rows: number): Promise<boolean>
        disconnect(sessionId: string): Promise<boolean>
        onData(cb: (sessionId: string, data: string) => void): () => void
        onClosed(cb: (sessionId: string) => void): () => void
      }
    serial: {
      listPorts(): Promise<SerialPort[]>
      connect(payload: SerialConnectPayload): Promise<{ success: boolean }>
      send(sessionId: string, data: string): void
      disconnect(sessionId: string): Promise<boolean>
      onData(cb: (sessionId: string, data: string) => void): () => void
      onClosed(cb: (sessionId: string) => void): () => void
      onError(cb: (sessionId: string, error: string) => void): () => void
    }
    auth: {
      hasMasterPassword(): Promise<boolean>
      setMasterPassword(password: string): Promise<{ success: boolean; error?: string }>
      verifyMasterPassword(password: string): Promise<boolean>
      clearMasterPassword(currentPassword: string): Promise<{ success: boolean; error?: string }>
    }
    history: {
      record(deviceType: string, command: string): Promise<boolean>
      get(deviceType: string, limit?: number): Promise<Array<{ command: string; count: number; last_used: number }>>
      clear(deviceType?: string): Promise<boolean>
    }
    license: {
      get(): Promise<string | null>
      set(key: string): Promise<boolean>
      verify(): Promise<{ valid: boolean; plan: string; expiresAt: string | null; reason?: string }>
      activate(key: string): Promise<{ valid: boolean; plan: string; expiresAt: string | null; reason?: string }>
      getDeviceId(): Promise<string>
    }
    ai: {
      chat(payload: unknown): Promise<void>
      cancel(sessionId?: string): void
      toolResult(callId: string, output: string): Promise<void>
      resetBlacklist(): Promise<string[]>
      exportMarkdown(payload: { host: string; messages: Array<{ role: string; content: string; toolCalls?: Array<{ command: string; output?: string }> }> }): Promise<{ success: boolean; filePath?: string }>
      onChunk(cb: (evt: { sessionId: string; text: string }) => void): () => void
      onDone(cb: (evt: { sessionId: string; inputTokens?: number; outputTokens?: number }) => void): () => void
      onToolCall(cb: (call: { sessionId: string; id: string; command: string; reason: string; targetSession?: string; policyBlock?: string }) => void): () => void
      onError(cb: (evt: { sessionId: string; message: string }) => void): () => void
      onPlan(cb: (plan: { sessionId: string; objective: string; steps: string[] }) => void): () => void
    }
    window: {
      minimize(): Promise<void>
      maximize(): Promise<void>
      close(): Promise<void>
      isMaximized(): Promise<boolean>
      onMaximizedChange(cb: (maximized: boolean) => void): () => void
    }
    connection: {
      ping(host: string, port: number): Promise<{ alive: boolean; latency?: number }>
    }
  }
}
}

export {}
