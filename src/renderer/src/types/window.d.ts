import { Connection, ConnectionGroup, SSHKey } from '.'

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
  jumpHost?: JumpHostPayload
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
        getVersion(): Promise<string>
      }
      updater: {
        check(): Promise<{ success: boolean; updateInfo?: { version: string } | null; error?: string }>
        download(): Promise<{ success: boolean; error?: string }>
        install(): void
        openRelease(url: string): void
        onUpdateAvailable(cb: (info: { version: string; releaseDate: string; releaseNotes: string | null }) => void): () => void
        onUpdateNotAvailable(cb: () => void): () => void
        onDownloadProgress(cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): () => void
        onUpdateDownloaded(cb: (info: { version: string }) => void): () => void
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
        getSetting(key: string): Promise<unknown>
        setSetting(key: string, value: unknown): Promise<boolean>
      }
      credentials: {
        save(key: string, value: string): Promise<{ success: boolean }>
        get(key: string): Promise<string | null>
        delete(key: string): Promise<boolean>
      }
      log: {
        start(sessionName: string): Promise<string | null>
        startAt(filePath: string, sessionName: string): Promise<string | null>
        append(filePath: string, data: string): Promise<boolean>
        stop(filePath: string): Promise<boolean>
      }
      file: {
        export(content: string, filename?: string): Promise<{ success: boolean; filePath?: string }>
        import(): Promise<string | null>
        selectFolder(): Promise<string | null>
        getDefaultLogDir(): Promise<string>
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
      cancel(): void
      toolResult(callId: string, output: string): Promise<void>
      resetBlacklist(): Promise<string[]>
      exportMarkdown(payload: { host: string; messages: Array<{ role: string; content: string; toolCalls?: Array<{ command: string; output?: string }> }> }): Promise<{ success: boolean; filePath?: string }>
      onChunk(cb: (chunk: string) => void): () => void
      onDone(cb: (usage?: { inputTokens: number; outputTokens: number }) => void): () => void
      onToolCall(cb: (call: { id: string; command: string; reason: string; targetSession?: string }) => void): () => void
      onError(cb: (error: string) => void): () => void
      onPlan(cb: (plan: { objective: string; steps: string[] }) => void): () => void
    }
  }
}
}

export {}
