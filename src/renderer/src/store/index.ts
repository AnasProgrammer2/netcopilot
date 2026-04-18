import { create } from 'zustand'
import { Connection, ConnectionGroup, SSHKey, Session } from '../types'
import { nanoid } from 'nanoid'

interface AppState {
  // Data
  connections: Connection[]
  groups: ConnectionGroup[]
  sshKeys: SSHKey[]

  // Sessions (active terminal tabs)
  sessions: Session[]
  activeSessionId: string | null

  // UI state
  sidebarWidth: number
  quickConnectOpen: boolean
  connectionDialogOpen: boolean
  editingConnection: Connection | null

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

  // Actions - UI
  setSidebarWidth: (width: number) => void
  setQuickConnectOpen: (open: boolean) => void
  setConnectionDialogOpen: (open: boolean, connection?: Connection | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  groups: [],
  sshKeys: [],
  sessions: [],
  activeSessionId: null,
  sidebarWidth: 260,
  quickConnectOpen: false,
  connectionDialogOpen: false,
  editingConnection: null,

  loadConnections: async () => {
    const connections = await window.api.store.getConnections()
    set({ connections })
  },

  saveConnection: async (connData) => {
    const now = Date.now()
    const conn: Connection = {
      id: connData.id || nanoid(),
      createdAt: now,
      ...connData,
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
      id: groupData.id || nanoid(),
      ...groupData
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
      id: keyData.id || nanoid(),
      createdAt: Date.now(),
      ...keyData
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

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setQuickConnectOpen: (open) => set({ quickConnectOpen: open }),

  setConnectionDialogOpen: (open, connection = null) =>
    set({ connectionDialogOpen: open, editingConnection: connection })
}))
