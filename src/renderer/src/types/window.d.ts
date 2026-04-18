import { Connection, ConnectionGroup, SSHKey } from '.'

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
      ssh: {
        connect(payload: SshConnectPayload): Promise<{ success: boolean }>
        send(sessionId: string, data: string): void
        resize(sessionId: string, cols: number, rows: number): Promise<boolean>
        disconnect(sessionId: string): Promise<boolean>
        onData(cb: (sessionId: string, data: string) => void): () => void
        onClosed(cb: (sessionId: string) => void): () => void
      }
      telnet: {
        connect(payload: TelnetConnectPayload): Promise<{ success: boolean }>
        send(sessionId: string, data: string): void
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
  }
}
}

export {}
