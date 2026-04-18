export type Protocol = 'ssh' | 'telnet' | 'serial'
export type AuthType = 'password' | 'key' | 'key+password'
export type DeviceType =
  | 'linux'
  | 'cisco-ios'
  | 'cisco-iosxe'
  | 'cisco-nxos'
  | 'junos'
  | 'arista-eos'
  | 'panos'
  | 'windows'
  | 'generic'

export interface SSHKey {
  id: string
  name: string
  publicKey: string
  createdAt: number
}

export interface ConnectionGroup {
  id: string
  name: string
  color?: string
  parentId?: string
}

export interface Connection {
  id: string
  name: string
  host: string
  port: number
  protocol: Protocol
  username: string
  authType: AuthType
  sshKeyId?: string
  groupId?: string
  tags: string[]
  notes: string
  deviceType: DeviceType
  color?: string
  jumpHostId?: string
  startupCommands?: string[]
  enablePassword?: string
  createdAt: number
  updatedAt: number
  lastConnectedAt?: number
}

export interface Session {
  id: string
  connectionId: string
  connection: Connection
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
  connectedAt?: number
}

export interface IpcSshConnectPayload {
  sessionId: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface IpcTelnetConnectPayload {
  sessionId: string
  host: string
  port: number
}

export interface TerminalDimensions {
  cols: number
  rows: number
}
