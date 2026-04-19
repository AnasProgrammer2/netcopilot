import { create } from 'zustand'
import { Connection, ConnectionGroup, SSHKey, Session } from '../types'
import { nanoid } from 'nanoid'

export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  lineHeight: number
}

export interface ConnectionSettings {
  keepaliveInterval: number
  connectTimeout: number
  sshDefaultPort: number
  telnetDefaultPort: number
  autoReconnect: boolean
  reconnectDelay: number
}

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  lineHeight: 1.4
}

export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = {
  keepaliveInterval: 30,
  connectTimeout: 30,
  sshDefaultPort: 22,
  telnetDefaultPort: 23,
  autoReconnect: true,
  reconnectDelay: 10
}

interface AppState {
  // Data
  connections: Connection[]
  groups: ConnectionGroup[]
  sshKeys: SSHKey[]

  // Sessions (active terminal tabs)
  sessions: Session[]
  activeSessionId: string | null

  // Live settings (read from store on boot)
  terminalSettings: TerminalSettings
  connectionSettings: ConnectionSettings

  // UI state
  sidebarWidth: number
  quickConnectOpen: boolean
  connectionDialogOpen: boolean
  editingConnection: Connection | null
  settingsOpen: boolean

  // Actions - Data
  loadConnections: () => Promise<void>
  saveConnection: (conn: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<Connection>
  deleteConnection: (id: string) => Promise<void>
  loadGroups: () => Promise<void>
  saveGroup: (group: Omit<ConnectionGroup, 'id'> & { id?: string }) => Promise<ConnectionGroup>
  deleteGroup: (id: string) => Promise<void>
  loadSshKeys: () => Promise<void>
  saveSshKey: (key: Omit<SSHKey, 'id' | 'createdAt'> & { id?: string }) => Promise<SSHKey>
  deleteSshKey: (id: string) => Promise<void>

  // Actions - Sessions
  openSession: (connection: Connection) => string
  closeSession: (sessionId: string) => void
  setSessionStatus: (sessionId: string, status: Session['status'], error?: string) => void
  setActiveSession: (sessionId: string | null) => void
  updateLastConnected: (connectionId: string) => void

  // Actions - Settings
  loadSettings: () => Promise<void>
  applySettings: (patch: Record<string, unknown>) => void

  // Actions - Import / Export
  exportConnections: () => Promise<boolean>
  importConnections: () => Promise<number>

  // Actions - UI
  setSidebarWidth: (width: number) => void
  setQuickConnectOpen: (open: boolean) => void
  setConnectionDialogOpen: (open: boolean, connection?: Connection | null) => void
  setSettingsOpen: (open: boolean) => void

  // Split pane
  splitSessionId: string | null
  setSplitSession: (id: string | null) => void

  // Session logging (path stored per session so TabBar can show indicator)
  setSessionLogging: (sessionId: string, path: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  groups: [],
  sshKeys: [],
  sessions: [],
  activeSessionId: null,
  terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
  connectionSettings: { ...DEFAULT_CONNECTION_SETTINGS },
  sidebarWidth: 260,
  quickConnectOpen: false,
  connectionDialogOpen: false,
  editingConnection: null,
  settingsOpen: false,
  splitSessionId: null,

  loadConnections: async () => {
    const connections = await window.api.store.getConnections()
    set({ connections })
  },

  saveConnection: async (connData) => {
    const now = Date.now()
    const conn: Connection = {
      ...connData,
      id: connData.id || nanoid(),
      createdAt: now,
      updatedAt: now
    } as Connection

    const saved = await window.api.store.saveConnection(conn)
    set((state) => {
      const idx = state.connections.findIndex((c) => c.id === saved.id)
      if (idx >= 0) {
        const updated = [...state.connections]
        updated[idx] = saved
        return { connections: updated }
      }
      return { connections: [...state.connections, saved] }
    })
    return saved
  },

  deleteConnection: async (id) => {
    await window.api.store.deleteConnection(id)
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id)
    }))
  },

  loadGroups: async () => {
    const groups = await window.api.store.getGroups()
    set({ groups })
  },

  saveGroup: async (groupData) => {
    const group: ConnectionGroup = {
      ...groupData,
      id: groupData.id || nanoid()
    }
    const saved = await window.api.store.saveGroup(group)
    set((state) => {
      const idx = state.groups.findIndex((g) => g.id === saved.id)
      if (idx >= 0) {
        const updated = [...state.groups]
        updated[idx] = saved
        return { groups: updated }
      }
      return { groups: [...state.groups, saved] }
    })
    return saved
  },

  deleteGroup: async (id) => {
    await window.api.store.deleteGroup(id)
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id)
    }))
  },

  loadSshKeys: async () => {
    const sshKeys = await window.api.store.getSshKeys()
    set({ sshKeys })
  },

  saveSshKey: async (keyData) => {
    const key: SSHKey = {
      ...keyData,
      id: keyData.id || nanoid(),
      createdAt: Date.now()
    }
    const saved = await window.api.store.saveSshKey(key)
    set((state) => {
      const idx = state.sshKeys.findIndex((k) => k.id === saved.id)
      if (idx >= 0) {
        const updated = [...state.sshKeys]
        updated[idx] = saved
        return { sshKeys: updated }
      }
      return { sshKeys: [...state.sshKeys, saved] }
    })
    return saved
  },

  deleteSshKey: async (id) => {
    await window.api.store.deleteSshKey(id)
    set((state) => ({
      sshKeys: state.sshKeys.filter((k) => k.id !== id)
    }))
  },

  openSession: (connection) => {
    const sessionId = nanoid()
    const session: Session = {
      id: sessionId,
      connectionId: connection.id,
      connection,
      status: 'connecting'
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: sessionId
    }))
    return sessionId
  },

  closeSession: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId)
      let activeSessionId = state.activeSessionId
      if (activeSessionId === sessionId) {
        activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null
      }
      return { sessions, activeSessionId }
    })
  },

  setSessionStatus: (sessionId, status, error) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status, error, connectedAt: status === 'connected' ? Date.now() : s.connectedAt }
          : s
      )
    }))
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  updateLastConnected: (connectionId) => {
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === connectionId ? { ...c, lastConnectedAt: Date.now() } : c
      )
    }))
    const conn = get().connections.find((c) => c.id === connectionId)
    if (conn) {
      window.api.store.saveConnection({ ...conn, lastConnectedAt: Date.now() })
    }
  },

  loadSettings: async () => {
    const ts: Partial<TerminalSettings> = {}
    const cs: Partial<ConnectionSettings> = {}
    const termKeys = Object.keys(DEFAULT_TERMINAL_SETTINGS) as (keyof TerminalSettings)[]
    const connKeys = Object.keys(DEFAULT_CONNECTION_SETTINGS) as (keyof ConnectionSettings)[]

    for (const k of termKeys) {
      const v = await window.api.store.getSetting(k)
      if (v !== undefined && v !== null) ts[k] = v as never
    }
    for (const k of connKeys) {
      const v = await window.api.store.getSetting(k)
      if (v !== undefined && v !== null) cs[k] = v as never
    }

    const sidebarWidth = (await window.api.store.getSetting('sidebarWidth') as number | null) ?? 260
    const accentColor  = (await window.api.store.getSetting('accentColor')  as string | null) ?? '#3b82f6'
    const theme        = (await window.api.store.getSetting('theme')         as string | null) ?? 'dark'

    set({
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS, ...ts },
      connectionSettings: { ...DEFAULT_CONNECTION_SETTINGS, ...cs },
      sidebarWidth
    })

    applyAccentColor(accentColor)
    applyTheme(theme as 'dark' | 'light' | 'system')
  },

  applySettings: (patch) => {
    const ts: Partial<TerminalSettings> = {}
    const cs: Partial<ConnectionSettings> = {}
    const termKeys = Object.keys(DEFAULT_TERMINAL_SETTINGS)
    const connKeys = Object.keys(DEFAULT_CONNECTION_SETTINGS)

    for (const [k, v] of Object.entries(patch)) {
      if (termKeys.includes(k)) ts[k as keyof TerminalSettings] = v as never
      if (connKeys.includes(k)) cs[k as keyof ConnectionSettings] = v as never
    }

    if (Object.keys(ts).length) {
      set((s) => ({ terminalSettings: { ...s.terminalSettings, ...ts } }))
    }
    if (Object.keys(cs).length) {
      set((s) => ({ connectionSettings: { ...s.connectionSettings, ...cs } }))
    }
    if ('sidebarWidth' in patch) set({ sidebarWidth: patch.sidebarWidth as number })
    if ('accentColor'  in patch) applyAccentColor(patch.accentColor as string)
    if ('theme'        in patch) applyTheme(patch.theme as 'dark' | 'light' | 'system')
  },

  exportConnections: async () => {
    const { connections, groups } = get()
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      connections,
      groups
    }
    const filename = `netcopilot-${new Date().toISOString().slice(0, 10)}.json`
    const result = await window.api.file.export(JSON.stringify(payload, null, 2), filename)
    return result.success
  },

  importConnections: async () => {
    const content = await window.api.file.import()
    if (!content) return 0
    try {
      const data = JSON.parse(content) as {
        connections?: Connection[]
        groups?: ConnectionGroup[]
      }
      const incoming: Connection[]      = data.connections ?? []
      const inGroups: ConnectionGroup[] = data.groups      ?? []

      // Remap group IDs so we don't collide with existing ones
      const groupIdMap = new Map<string, string>()
      for (const g of inGroups) {
        const newId = nanoid()
        groupIdMap.set(g.id, newId)
        await window.api.store.saveGroup({ ...g, id: newId })
      }

      let count = 0
      for (const conn of incoming) {
        const newGroupId = conn.groupId ? (groupIdMap.get(conn.groupId) ?? undefined) : undefined
        await window.api.store.saveConnection({
          ...conn,
          id: nanoid(),
          groupId: newGroupId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        count++
      }

      await get().loadConnections()
      await get().loadGroups()
      return count
    } catch {
      return -1
    }
  },

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setQuickConnectOpen: (open) => set({ quickConnectOpen: open }),

  setConnectionDialogOpen: (open, connection = null) =>
    set({ connectionDialogOpen: open, editingConnection: connection }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setSplitSession: (id) => set({ splitSessionId: id }),

  setSessionLogging: (sessionId, path) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, loggingPath: path } : s
      )
    })),
}))

// ── Apply accent color as CSS variable ──────────────────────────────────────
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  const root = document.documentElement
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (isDark) {
    root.classList.add('dark')
    root.classList.remove('light')
    resetDarkVars()
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }
}


function resetDarkVars(): void {
  // Remove inline styles to fall back to CSS defaults (dark)
  const props = [
    '--background','--foreground','--card','--card-foreground',
    '--popover','--popover-foreground','--secondary','--secondary-foreground',
    '--muted','--muted-foreground','--accent','--accent-foreground',
    '--border','--input','--sidebar-background','--sidebar-foreground',
    '--sidebar-accent','--sidebar-accent-foreground','--sidebar-border'
  ]
  props.forEach((p) => document.documentElement.style.removeProperty(p))
}

export function applyAccentColor(hex: string): void {
  const hsl = hexToHsl(hex)
  document.documentElement.style.setProperty('--primary', hsl)
  document.documentElement.style.setProperty('--ring', hsl)
  document.documentElement.style.setProperty('--sidebar-primary', hsl)
  document.documentElement.style.setProperty('--sidebar-ring', hsl)
}
