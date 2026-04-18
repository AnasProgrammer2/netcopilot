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
  | 'nokia-sros'
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
