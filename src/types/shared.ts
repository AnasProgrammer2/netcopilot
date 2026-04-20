export type Protocol = 'ssh' | 'telnet' | 'serial'
export type AuthType = 'password' | 'key' | 'key+password'
export type DeviceType =
  | 'auto'
  | 'linux'
  | 'cisco-ios'
  | 'cisco-iosxe'
  | 'cisco-nxos'
  | 'cisco-asa'
  | 'junos'
  | 'arista-eos'
  | 'panos'
  | 'nokia-sros'
  | 'huawei-vrp'
  | 'mikrotik'
  | 'fortios'
  | 'hp-procurve'
  | 'f5-tmos'
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

export interface SerialConfig {
  path: string
  baudRate: number
  dataBits: 5 | 6 | 7 | 8
  stopBits: 1 | 1.5 | 2
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space'
  rtscts: boolean
  xon: boolean
  xoff: boolean
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
  serialConfig?: SerialConfig
  autoReconnect?: boolean
  reconnectDelay?: number
  createdAt: number
  updatedAt: number
  lastConnectedAt?: number
}
