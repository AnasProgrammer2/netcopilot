import { create } from 'zustand'
import { Connection, ConnectionGroup, SSHKey, Session, PortForwardRule } from '../types'
import { nanoid } from 'nanoid'

// ── AI Copilot types ─────────────────────────────────────────────────────────

export type AiPermission = 'troubleshoot' | 'full-access'
export type AiApproval   = 'ask' | 'auto'


export interface AiToolCall {
  id:             string
  command:        string
  reason:         string
  status:         'pending' | 'approved' | 'blocked' | 'running' | 'done'
  output?:        string
  targetSession?: string  // session ID to run command on (multi-session support)
}

export interface AiPlan {
  objective: string
  steps:     string[]
}

export interface AiMessage {
  id:        string
  role:      'user' | 'assistant' | 'auto' | 'plan'  // plan = investigation plan card
  content:   string
  streaming?: boolean
  toolCalls?: AiToolCall[]
  plan?:     AiPlan
}

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
  openSftpSession: (connection: Connection) => string
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

  // Port Forwarding
  portForwardRules:    PortForwardRule[]
  activeForwardIds:    Set<string>
  savePortForwardRule: (rule: Omit<PortForwardRule, 'id'> & { id?: string }) => void
  deletePortForwardRule: (id: string) => void
  startForward:        (ruleId: string, sessionId: string) => Promise<boolean>
  stopForward:         (ruleId: string) => Promise<void>

  // Session logging (path stored per session so TabBar can show indicator)
  setSessionLogging: (sessionId: string, path: string | null) => void

  // AI Copilot
  aiPanelOpen:  boolean
  // License state
  licenseKey:    string
  licenseValid:  boolean
  licensePlan:   string
  licenseExpiry: string | null
  deviceId:      string

  setLicenseKey:    (key: string) => void
  setLicenseStatus: (status: { valid: boolean; plan: string; expiresAt: string | null }) => void
  setDeviceId:      (id: string) => void

  aiPermission: AiPermission
  aiApproval:   AiApproval
  aiBlacklist:  string[]
  aiModel:      string
  aiMessages:   AiMessage[]
  aiStreaming:  boolean
  aiAgentActive: boolean
  aiTokens:     { input: number; output: number }

  setAiPanelOpen:    (open: boolean) => void
  setAiPermission:   (p: AiPermission) => void
  setAiApproval:     (a: AiApproval) => void
  setAiBlacklist:    (list: string[]) => void
  setAiModel:        (model: string) => void
  addAiMessage:      (msg: AiMessage) => void
  addAiPlan:         (plan: AiPlan) => void
  appendAiChunk:     (chunk: string) => void
  finalizeAiStream:  (usage?: { inputTokens: number; outputTokens: number }) => void
  updateAiToolCall:  (msgId: string, callId: string, patch: Partial<AiToolCall>) => void
  clearAiMessages:   () => void
  setAiStreaming:    (v: boolean) => void
  setAiAgentActive:  (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  groups: [],
  sshKeys: [],
  sessions: [],
  activeSessionId: null,
  terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
  connectionSettings: { ...DEFAULT_CONNECTION_SETTINGS },

  // License initial state
  licenseKey:    '',
  licenseValid:  false,
  licensePlan:   '',
  licenseExpiry: null,
  deviceId:      '',

  setLicenseKey:    (key) => set({ licenseKey: key }),
  setLicenseStatus: (s)   => set({ licenseValid: s.valid, licensePlan: s.plan, licenseExpiry: s.expiresAt }),
  setDeviceId:      (id)  => set({ deviceId: id }),

  // AI Copilot initial state
  aiPanelOpen:  false,
  aiPermission: 'troubleshoot',
  aiApproval:   'ask',
  aiBlacklist:  [],
  aiModel:      'claude-sonnet-4-5',
  aiMessages:   [],
  aiStreaming:  false,
  aiAgentActive: false,
  aiTokens:     { input: 0, output: 0 },
  sidebarWidth: 260,
  quickConnectOpen: false,
  connectionDialogOpen: false,
  editingConnection: null,
  settingsOpen: false,
  splitSessionId:    null,
  portForwardRules:  [],
  activeForwardIds:  new Set<string>(),

  loadConnections: async () => {
    const connections = await window.api.store.getConnections()
    set({ connections })
  },

  saveConnection: async (connData) => {
    const now = Date.now()
    const existing = connData.id ? get().connections.find((c) => c.id === connData.id) : undefined
    const conn: Connection = {
      ...connData,
      id: connData.id || nanoid(),
      createdAt: existing?.createdAt ?? now,
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
    // Ungroup any connections that belonged to this group so they remain visible
    const orphans = get().connections.filter((c) => c.groupId === id)
    for (const conn of orphans) {
      await window.api.store.saveConnection({ ...conn, groupId: undefined })
    }
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      connections: state.connections.map((c) =>
        c.groupId === id ? { ...c, groupId: undefined } : c
      )
    }))
  },

  loadSshKeys: async () => {
    const sshKeys = await window.api.store.getSshKeys()
    set({ sshKeys })
  },

  saveSshKey: async (keyData) => {
    const existing = keyData.id ? get().sshKeys.find((k) => k.id === keyData.id) : undefined
    const key: SSHKey = {
      ...keyData,
      id: keyData.id || nanoid(),
      createdAt: existing?.createdAt ?? Date.now()
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
      activeSessionId: sessionId,
      // New connection → fresh AI conversation
      aiMessages:    [],
      aiTokens:      { input: 0, output: 0 },
      aiAgentActive: false,
      aiStreaming:   false,
    }))
    return sessionId
  },

  openSftpSession: (connection) => {
    const sessionId = nanoid()
    const session: Session = {
      id: sessionId,
      connectionId: connection.id,
      connection,
      status: 'connecting',
      type: 'sftp',
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: sessionId,
    }))
    return sessionId
  },

  closeSession: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId)
      let activeSessionId = state.activeSessionId
      let clearAi = false
      if (activeSessionId === sessionId) {
        activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null
        clearAi = true
      }
      return {
        sessions,
        activeSessionId,
        // Switching active session → clear AI conversation
        ...(clearAi ? { aiMessages: [], aiTokens: { input: 0, output: 0 }, aiAgentActive: false, aiStreaming: false } : {}),
      }
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
    set((state) => ({
      activeSessionId: sessionId,
      // Switching tabs → clear AI conversation for the new session context
      ...(state.activeSessionId !== sessionId ? {
        aiMessages:    [],
        aiTokens:      { input: 0, output: 0 },
        aiAgentActive: false,
        aiStreaming:   false,
      } : {}),
    }))
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

    const sidebarWidth  = (await window.api.store.getSetting('sidebarWidth')  as number | null) ?? 260
    const accentColor   = (await window.api.store.getSetting('accentColor')   as string | null) ?? '#8b5cf6'
    const theme         = (await window.api.store.getSetting('theme')          as string | null) ?? 'light'
    const aiPermission  = (await window.api.store.getSetting('ai.permission')  as AiPermission | null) ?? 'troubleshoot'
    const aiApproval    = (await window.api.store.getSetting('ai.approval')    as AiApproval | null)   ?? 'ask'
    const aiBlacklistRaw = await window.api.store.getSetting('ai.blacklist')
    const aiBlacklist   = Array.isArray(aiBlacklistRaw) ? aiBlacklistRaw as string[] : []
    const aiModel       = (await window.api.store.getSetting('ai.model')       as string | null) ?? 'claude-sonnet-4-5'

    // Load license state
    const licenseKey = await window.api.license.get()
    const deviceId   = await window.api.license.getDeviceId()

    set({
      terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS, ...ts },
      connectionSettings: { ...DEFAULT_CONNECTION_SETTINGS, ...cs },
      sidebarWidth,
      aiPermission,
      aiModel,
      aiApproval,
      aiBlacklist,
      licenseKey: licenseKey ?? '',
      deviceId,
    })

    // Verify license in background (non-blocking)
    if (licenseKey) {
      window.api.license.verify().then((status) => {
        set({ licenseValid: status.valid, licensePlan: status.plan, licenseExpiry: status.expiresAt })
      }).catch(() => { /* network unavailable — don't block */ })
    }

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
    // Reject files over 10 MB to guard against DoS / malformed input
    if (content.length > 10 * 1024 * 1024) return -1
    try {
      const parsed = JSON.parse(content)
      // Basic schema guard: must be a plain object (not array, null, etc.)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return -1
      const data = parsed as { connections?: unknown[]; groups?: unknown[] }
      // Only accept array-shaped fields; ignore unknown keys
      const incoming: Connection[]      = (Array.isArray(data.connections) ? data.connections : []) as Connection[]
      const inGroups: ConnectionGroup[] = (Array.isArray(data.groups)      ? data.groups      : []) as ConnectionGroup[]

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

  // ── AI Copilot actions ─────────────────────────────────────────────────────
  setAiPanelOpen:  (open) => set({ aiPanelOpen: open }),
  setAiPermission: (p) => set({ aiPermission: p }),
  setAiApproval:   (a) => set({ aiApproval: a }),
  setAiBlacklist:  (list) => set({ aiBlacklist: list }),
  setAiModel:      (model) => set({ aiModel: model }),
  setAiStreaming:   (v) => set({ aiStreaming: v }),
  setAiAgentActive: (v) => set({ aiAgentActive: v }),
  clearAiMessages: () => set({ aiMessages: [], aiTokens: { input: 0, output: 0 }, aiAgentActive: false }),

  addAiMessage: (msg) =>
    set((state) => ({ aiMessages: [...state.aiMessages, msg] })),

  addAiPlan: (plan) =>
    set((state) => ({
      aiMessages: [
        ...state.aiMessages,
        { id: nanoid(), role: 'plan' as const, content: '', plan },
      ],
    })),

  appendAiChunk: (chunk) =>
    set((state) => {
      const msgs = [...state.aiMessages]
      const last = msgs[msgs.length - 1]
      if (last && last.streaming) {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
        return { aiMessages: msgs }
      }
      // Start a new streaming assistant message
      return {
        aiMessages: [...msgs, { id: nanoid(), role: 'assistant', content: chunk, streaming: true }]
      }
    }),

  finalizeAiStream: (usage) =>
    set((state) => ({
      aiMessages: state.aiMessages.map((m) =>
        m.streaming ? { ...m, streaming: false } : m
      ),
      aiStreaming: false,
      aiTokens: usage
        ? {
            input:  state.aiTokens.input  + usage.inputTokens,
            output: state.aiTokens.output + usage.outputTokens,
          }
        : state.aiTokens,
    })),

  updateAiToolCall: (msgId, callId, patch) =>
    set((state) => ({
      aiMessages: state.aiMessages.map((m) => {
        if (m.id !== msgId) return m
        const existing = (m.toolCalls ?? []).find((t) => t.id === callId)
        if (existing) {
          return { ...m, toolCalls: m.toolCalls!.map((t) => t.id === callId ? { ...t, ...patch } : t) }
        }
        // New tool call — append it
        return { ...m, toolCalls: [...(m.toolCalls ?? []), patch as AiToolCall] }
      })
    })),

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

  // ── Port Forwarding ──────────────────────────────────────────────────────────

  savePortForwardRule: (rule) => {
    const { nanoid } = require('nanoid')
    set((state) => {
      const id    = rule.id ?? nanoid()
      const full  = { ...rule, id } as PortForwardRule
      const exist = state.portForwardRules.findIndex(r => r.id === id)
      return {
        portForwardRules: exist >= 0
          ? state.portForwardRules.map(r => r.id === id ? full : r)
          : [...state.portForwardRules, full]
      }
    })
  },

  deletePortForwardRule: (id) => {
    set((state) => ({
      portForwardRules: state.portForwardRules.filter(r => r.id !== id),
      activeForwardIds: new Set([...state.activeForwardIds].filter(x => x !== id)),
    }))
    window.api.ssh.forwardStop(id).catch(() => {})
  },

  startForward: async (ruleId, sessionId) => {
    const rule = get().portForwardRules.find(r => r.id === ruleId)
    if (!rule) return false
    const res = await window.api.ssh.forwardStart({
      forwardId:  ruleId,
      sessionId,
      type:       rule.type,
      localPort:  rule.localPort,
      remoteHost: rule.remoteHost,
      remotePort: rule.remotePort,
    })
    if (res.success) {
      set((state) => ({ activeForwardIds: new Set([...state.activeForwardIds, ruleId]) }))
    }
    return res.success
  },

  stopForward: async (ruleId) => {
    await window.api.ssh.forwardStop(ruleId).catch(() => {})
    set((state) => {
      const next = new Set(state.activeForwardIds)
      next.delete(ruleId)
      return { activeForwardIds: next }
    })
  },
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
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return // ignore invalid hex values
  const hsl = hexToHsl(hex)
  document.documentElement.style.setProperty('--primary', hsl)
  document.documentElement.style.setProperty('--ring', hsl)
  document.documentElement.style.setProperty('--sidebar-primary', hsl)
  document.documentElement.style.setProperty('--sidebar-ring', hsl)
}
