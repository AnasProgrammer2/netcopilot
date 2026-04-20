import { useState, useEffect } from 'react'
import appIcon from '../../assets/icon.png'
import {
  X, Monitor, Terminal, Network, Lock, Info, FileText,
  Sun, Moon, Laptop, Check, ChevronRight, FolderOpen,
  Sparkles, Eye, EyeOff, ShieldCheck, Wrench, Zap
} from 'lucide-react'
import { useAppStore, AiPermission, AiApproval } from '../../store'
import { cn } from '../../lib/utils'

// ─── Settings data model ────────────────────────────────────────────────────
interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  sidebarWidth: number
  fontSize: number
  fontFamily: string
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  lineHeight: number
  keepaliveInterval: number
  connectTimeout: number
  sshDefaultPort: number
  telnetDefaultPort: number
  autoReconnect: boolean
  reconnectDelay: number
  savePasswords: boolean
  autoLockMinutes: number
  // Logging
  autoLog: boolean
  logDirectory: string
  logStripAnsi: boolean
  logTimestamp: boolean
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  accentColor: '#8b5cf6',
  sidebarWidth: 260,
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  lineHeight: 1.4,
  keepaliveInterval: 30,
  connectTimeout: 30,
  sshDefaultPort: 22,
  telnetDefaultPort: 23,
  autoReconnect: true,
  reconnectDelay: 10,
  savePasswords: true,
  autoLockMinutes: 0,
  // Logging
  autoLog: false,
  logDirectory: '',
  logStripAnsi: true,
  logTimestamp: false,
}

const inputCls = 'w-full px-3 py-2 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'

const ACCENT_COLORS = [
  { label: 'Violet',  value: '#8b5cf6' },
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Cyan',    value: '#06b6d4' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Orange',  value: '#f97316' },
]

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Consolas',
  'monospace'
]

type SettingsSection = 'appearance' | 'terminal' | 'connection' | 'logging' | 'security' | 'ai' | 'about'

const NAV: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Monitor   },
  { id: 'terminal',   label: 'Terminal',   icon: Terminal  },
  { id: 'connection', label: 'Connection', icon: Network   },
  { id: 'logging',    label: 'Logging',    icon: FileText  },
  { id: 'security',   label: 'Security',   icon: Lock      },
  { id: 'ai',         label: 'ARIA',        icon: Sparkles  },
  { id: 'about',      label: 'About',      icon: Info      },
]

// ─── Main component ──────────────────────────────────────────────────────────
export function SettingsDialog(): JSX.Element {
  const { settingsOpen, setSettingsOpen, applySettings } = useAppStore()
  const [section, setSection] = useState<SettingsSection>('appearance')
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return
    const load = async () => {
      const keys = Object.keys(DEFAULTS) as (keyof AppSettings)[]
      const loaded: Partial<AppSettings> = {}
      for (const k of keys) {
        const v = await window.api.store.getSetting(k)
        if (v !== undefined && v !== null) loaded[k] = v as never
      }
      setSettings((prev) => ({ ...prev, ...loaded }))
    }
    load()
  }, [settingsOpen])

  if (!settingsOpen) return <></>

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    for (const [k, v] of Object.entries(settings)) {
      await window.api.store.setSetting(k, v)
    }
    applySettings(settings as unknown as Record<string, unknown>)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base text-foreground tracking-tight">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left nav */}
          <nav className="w-44 shrink-0 border-r border-border p-2 space-y-0.5 overflow-y-auto bg-sidebar/50">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors',
                  section === id
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
                {section === id && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {section === 'appearance' && <AppearanceSection settings={settings} update={update} />}
            {section === 'terminal'   && <TerminalSection   settings={settings} update={update} />}
            {section === 'connection' && <ConnectionSection settings={settings} update={update} />}
            {section === 'logging'    && <LoggingSection    settings={settings} update={update} />}
            {section === 'security'   && <SecuritySection   settings={settings} update={update} />}
            {section === 'ai'         && <AiSection />}
            {section === 'about'      && <AboutSection />}
          </div>
        </div>

        {/* Footer */}
        {section !== 'about' && section !== 'ai' && (
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-sidebar/30 shrink-0">
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors min-w-[110px] justify-center',
                saved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-primary text-white hover:bg-primary/90'
              )}
            >
              {saved && <Check className="w-3.5 h-3.5" />}
              {saved ? 'Saved!' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section: Appearance ─────────────────────────────────────────────────────
function AppearanceSection({ settings, update }: SectionProps) {
  const themes: { value: AppSettings['theme']; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'dark',   label: 'Dark',   icon: Moon   },
    { value: 'light',  label: 'Light',  icon: Sun    },
    { value: 'system', label: 'System', icon: Laptop },
  ]

  return (
    <>
      <Group title="Theme">
        <div className="flex gap-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => update('theme', value)}
              className={cn(
                'flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all',
                settings.theme === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-transparent bg-secondary text-muted-foreground hover:border-border hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Accent Color">
        <div className="flex gap-2 flex-wrap">
          {ACCENT_COLORS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => update('accentColor', value)}
              title={label}
              className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110 relative flex items-center justify-center"
              style={{
                backgroundColor: value,
                borderColor: settings.accentColor === value ? '#fff' : 'transparent',
                outline: settings.accentColor === value ? `2px solid ${value}` : 'none',
                outlineOffset: '2px'
              }}
            >
              {settings.accentColor === value && (
                <Check className="w-3 h-3 text-white" />
              )}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Sidebar Width">
        <SliderRow
          min={200} max={420} step={10}
          value={settings.sidebarWidth}
          onChange={(v) => update('sidebarWidth', v)}
          display={`${settings.sidebarWidth}px`}
        />
      </Group>
    </>
  )
}

// ─── Section: Terminal ────────────────────────────────────────────────────────
function TerminalSection({ settings, update }: SectionProps) {
  return (
    <>
      <Group title="Font">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Family</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => update('fontFamily', e.target.value)}
              className={inputCls}
            >
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Size</label>
            <SliderRow
              min={10} max={20} step={1}
              value={settings.fontSize}
              onChange={(v) => update('fontSize', v)}
              display={`${settings.fontSize}px`}
            />
          </div>
        </div>

        {/* Live preview */}
        <div
          className="mt-1 p-3 rounded-md bg-[#0d0f14] border border-border"
          style={{ fontFamily: `"${settings.fontFamily}", monospace`, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}
        >
          <span style={{ color: '#92e991' }}>root</span>
          <span style={{ color: '#6b7280' }}>@</span>
          <span style={{ color: '#69ff94' }}>router</span>
          <span style={{ color: '#60a5fa' }}>:~#</span>
          <span style={{ color: '#e8eaf0' }}> show ip interface brief</span>
          <br />
          <span style={{ color: '#6b7280' }}>GigabitEthernet0/0   192.168.1.1   </span>
          <span style={{ color: '#69ff94' }}>up</span>
          <span style={{ color: '#6b7280' }}>   </span>
          <span style={{ color: '#69ff94' }}>up</span>
        </div>
      </Group>

      <Group title="Line Height">
        <SliderRow
          min={1.0} max={2.0} step={0.1}
          value={settings.lineHeight}
          onChange={(v) => update('lineHeight', parseFloat(v.toFixed(1)))}
          display={settings.lineHeight.toFixed(1)}
        />
      </Group>

      <Group title="Cursor">
        <div className="flex gap-2">
          {(['bar', 'block', 'underline'] as const).map((style) => (
            <button
              key={style}
              onClick={() => update('cursorStyle', style)}
              className={cn(
                'flex-1 py-2 text-xs rounded-md border-2 transition-all capitalize font-medium',
                settings.cursorStyle === style
                  ? 'bg-primary border-primary text-white'
                  : 'border-transparent bg-secondary text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {style}
            </button>
          ))}
        </div>
        <Toggle
          label="Blinking cursor"
          value={settings.cursorBlink}
          onChange={(v) => update('cursorBlink', v)}
        />
      </Group>

      <Group title="Scrollback Buffer">
        <SliderRow
          min={500} max={20000} step={500}
          value={settings.scrollback}
          onChange={(v) => update('scrollback', v)}
          display={`${settings.scrollback.toLocaleString()} lines`}
          displayWidth="w-20"
        />
      </Group>
    </>
  )
}

// ─── Section: Connection ──────────────────────────────────────────────────────
function ConnectionSection({ settings, update }: SectionProps) {
  return (
    <>
      <Group title="Default Ports">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="SSH" type="number"
            value={settings.sshDefaultPort}
            onChange={(v) => update('sshDefaultPort', parseInt(v))}
          />
          <LabeledInput
            label="Telnet" type="number"
            value={settings.telnetDefaultPort}
            onChange={(v) => update('telnetDefaultPort', parseInt(v))}
          />
        </div>
      </Group>

      <Group title="Timeouts">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-muted-foreground">Connect timeout</label>
              <span className="text-xs text-foreground">{settings.connectTimeout}s</span>
            </div>
            <input type="range" min={5} max={120} step={5}
              value={settings.connectTimeout}
              onChange={(e) => update('connectTimeout', parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-muted-foreground">SSH keepalive</label>
              <span className="text-xs text-foreground">
                {settings.keepaliveInterval === 0 ? 'off' : `${settings.keepaliveInterval}s`}
              </span>
            </div>
            <input type="range" min={0} max={120} step={5}
              value={settings.keepaliveInterval}
              onChange={(e) => update('keepaliveInterval', parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </Group>

      <Group title="Auto Reconnect">
        <Toggle
          label="Reconnect automatically on disconnect"
          description="Applies to new connections by default — can be overridden per connection"
          value={settings.autoReconnect}
          onChange={(v) => update('autoReconnect', v)}
        />
        {settings.autoReconnect && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between">
              <label className="text-xs font-medium text-muted-foreground">Delay before reconnect</label>
              <span className="text-xs text-foreground">{settings.reconnectDelay}s</span>
            </div>
            <input
              type="range" min={3} max={60} step={1}
              value={settings.reconnectDelay}
              onChange={(e) => update('reconnectDelay', parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        )}
      </Group>
    </>
  )
}

// ─── Section: Logging ─────────────────────────────────────────────────────────
function LoggingSection({ settings, update }: SectionProps) {
  const [loadingDefault, setLoadingDefault] = useState(false)

  const pickFolder = async () => {
    const folder = await window.api.file.selectFolder()
    if (folder) update('logDirectory', folder)
  }

  const loadDefaultDir = async () => {
    if (settings.logDirectory) return
    setLoadingDefault(true)
    const dir = await window.api.file.getDefaultLogDir()
    update('logDirectory', dir)
    setLoadingDefault(false)
  }

  // Load default dir once when autoLog is first toggled on
  const handleAutoLogToggle = async (v: boolean) => {
    update('autoLog', v)
    if (v && !settings.logDirectory) {
      const dir = await window.api.file.getDefaultLogDir()
      update('logDirectory', dir)
    }
  }

  return (
    <>
      <Group title="Auto Logging">
        <Toggle
          label="Auto-log all sessions"
          description="Every new session automatically saves a log file to the selected folder"
          value={settings.autoLog}
          onChange={handleAutoLogToggle}
        />

        {settings.autoLog && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Log Folder</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={settings.logDirectory || (loadingDefault ? 'Loading...' : '')}
                onFocus={loadDefaultDir}
                placeholder="Click Browse to select a folder..."
                className={cn(inputCls, 'flex-1 cursor-default text-xs text-muted-foreground')}
              />
              <button
                onClick={pickFolder}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-secondary text-foreground border border-border hover:bg-accent transition-colors shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Browse
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Files are named: <span className="font-mono">connection_YYYY-MM-DD_HH-MM.log</span>
            </p>
          </div>
        )}
      </Group>

      <Group title="Log Format">
        <Toggle
          label="Strip ANSI color codes"
          description="Save clean readable text without terminal escape sequences"
          value={settings.logStripAnsi}
          onChange={(v) => update('logStripAnsi', v)}
        />
        <Toggle
          label="Add timestamps to each line"
          description="Prefix every line with [HH:MM:SS] for easier debugging"
          value={settings.logTimestamp}
          onChange={(v) => update('logTimestamp', v)}
        />
      </Group>

      {/* Preview */}
      <Group title="Preview">
        <div className="p-3 rounded-md bg-[#0d0f14] border border-border font-mono text-[11px] space-y-0.5">
          {settings.logTimestamp && (
            <span className="text-muted-foreground/50">[12:34:56] </span>
          )}
          {settings.logStripAnsi ? (
            <span style={{ color: '#92e991' }}>router#</span>
          ) : (
            <><span style={{ color: '#6b7280' }}>\x1b[32m</span><span style={{ color: '#92e991' }}>router#</span><span style={{ color: '#6b7280' }}>\x1b[0m</span></>
          )}
          <span style={{ color: '#e8eaf0' }}> show version</span>
          <br />
          {settings.logTimestamp && (
            <span className="text-muted-foreground/50">[12:34:57] </span>
          )}
          <span style={{ color: '#e8eaf0' }}>Cisco IOS XE Software, Version 17.9.4</span>
        </div>
      </Group>
    </>
  )
}

// ─── Section: Security ────────────────────────────────────────────────────────
function SecuritySection({ settings, update }: SectionProps) {
  const [hasMaster, setHasMaster] = useState<boolean | null>(null)
  const [mpMode, setMpMode] = useState<'idle' | 'set' | 'change' | 'remove'>('idle')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [mpError, setMpError] = useState('')
  const [mpSuccess, setMpSuccess] = useState('')

  useEffect(() => {
    window.api.auth.hasMasterPassword().then(setHasMaster)
  }, [])

  const resetMpForm = () => { setPw1(''); setPw2(''); setCurrentPw(''); setMpError(''); setMpMode('idle') }

  const handleSetPassword = async () => {
    if (pw1.length < 4) return setMpError('At least 4 characters required')
    if (pw1 !== pw2) return setMpError('Passwords do not match')
    if (mpMode === 'change') {
      const ok = await window.api.auth.verifyMasterPassword(currentPw)
      if (!ok) return setMpError('Current password is incorrect')
      await window.api.auth.clearMasterPassword(currentPw)
    }
    const res = await window.api.auth.setMasterPassword(pw1)
    if (res.success) { setHasMaster(true); setMpSuccess('Master password set'); resetMpForm(); setTimeout(() => setMpSuccess(''), 3000) }
    else setMpError(res.error ?? 'Failed')
  }

  const handleRemovePassword = async () => {
    const res = await window.api.auth.clearMasterPassword(currentPw)
    if (res.success) { setHasMaster(false); setMpSuccess('Master password removed'); resetMpForm(); setTimeout(() => setMpSuccess(''), 3000) }
    else setMpError(res.error ?? 'Failed')
  }

  return (
    <>
      <Group title="Master Password">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Startup password</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasMaster ? 'Required every time you open NetCopilot' : 'App opens without a password'}
              </p>
            </div>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', hasMaster ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground')}>
              {hasMaster ? 'Active' : 'Off'}
            </span>
          </div>

          {mpMode === 'idle' && (
            <div className="flex gap-2">
              {!hasMaster && (
                <button onClick={() => setMpMode('set')} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90">
                  Set Password
                </button>
              )}
              {hasMaster && (
                <>
                  <button onClick={() => setMpMode('change')} className="px-3 py-1.5 text-xs rounded-md bg-secondary text-foreground border border-border hover:bg-accent">
                    Change
                  </button>
                  <button onClick={() => setMpMode('remove')} className="px-3 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20">
                    Remove
                  </button>
                </>
              )}
            </div>
          )}

          {(mpMode === 'set' || mpMode === 'change') && (
            <div className="space-y-2 border border-border rounded-lg p-3 bg-background/50">
              {mpMode === 'change' && (
                <input type="password" placeholder="Current password" value={currentPw}
                  onChange={(e) => { setCurrentPw(e.target.value); setMpError('') }}
                  className={inputCls} />
              )}
              <input type="password" placeholder="New password (min 4 chars)" value={pw1}
                onChange={(e) => { setPw1(e.target.value); setMpError('') }}
                className={inputCls} />
              <input type="password" placeholder="Confirm new password" value={pw2}
                onChange={(e) => { setPw2(e.target.value); setMpError('') }}
                className={inputCls} />
              {mpError && <p className="text-xs text-destructive">{mpError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSetPassword} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90">Save</button>
                <button onClick={resetMpForm} className="px-3 py-1.5 text-xs rounded-md bg-secondary text-foreground border border-border">Cancel</button>
              </div>
            </div>
          )}

          {mpMode === 'remove' && (
            <div className="space-y-2 border border-destructive/20 rounded-lg p-3 bg-destructive/5">
              <input type="password" placeholder="Current password to confirm" value={currentPw}
                onChange={(e) => { setCurrentPw(e.target.value); setMpError('') }}
                className={inputCls} />
              {mpError && <p className="text-xs text-destructive">{mpError}</p>}
              <div className="flex gap-2">
                <button onClick={handleRemovePassword} className="px-3 py-1.5 text-xs rounded-md bg-destructive text-white hover:opacity-90">Remove</button>
                <button onClick={resetMpForm} className="px-3 py-1.5 text-xs rounded-md bg-secondary text-foreground border border-border">Cancel</button>
              </div>
            </div>
          )}

          {mpSuccess && <p className="text-xs text-emerald-400">{mpSuccess}</p>}
        </div>
      </Group>

      <Group title="Passwords">
        <Toggle
          label="Save passwords to OS keychain"
          description="Passwords are encrypted using your OS's secure storage"
          value={settings.savePasswords}
          onChange={(v) => update('savePasswords', v)}
        />
      </Group>

      <Group title="Auto-lock">
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <label className="text-xs font-medium text-muted-foreground">Lock after inactivity</label>
            <span className="text-xs text-foreground">
              {settings.autoLockMinutes === 0 ? 'Disabled' : `${settings.autoLockMinutes} min`}
            </span>
          </div>
          <input
            type="range" min={0} max={60} step={5}
            value={settings.autoLockMinutes}
            onChange={(e) => update('autoLockMinutes', parseInt(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      </Group>

      <Group title="Database">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-foreground">Encrypted storage</p>
            <p className="text-xs text-muted-foreground mt-0.5">All data is encrypted with SQLCipher (AES-256)</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">Active ✓</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-foreground">Credential encryption</p>
            <p className="text-xs text-muted-foreground mt-0.5">Passwords encrypted via OS Keychain (safeStorage)</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">Active ✓</span>
        </div>
      </Group>
    </>
  )
}

// ─── Section: About ───────────────────────────────────────────────────────────
function AboutSection() {
  const info = window.api?.appInfo
  const platform = info?.platform === 'darwin' ? 'macOS'
    : info?.platform === 'win32' ? 'Windows'
    : info?.platform === 'linux' ? 'Linux'
    : navigator.platform

  const rows = [
    { label: 'Version',  value: '0.1.0' },
    { label: 'Electron', value: info?.versions.electron ?? '—' },
    { label: 'Node.js',  value: info?.versions.node     ?? '—' },
    { label: 'Chrome',   value: info?.versions.chrome   ?? '—' },
    { label: 'Platform', value: platform },
  ]

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <img
        src={appIcon}
        alt="NetCopilot"
        className="w-28 h-28"
        style={{ filter: 'drop-shadow(0 0 18px hsl(258 90% 66% / 0.5))' }}
      />

      <div className="text-center">
        <h3 className="text-xl font-semibold text-foreground tracking-tight">NetCopilot</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your AI-Native Network Copilot
        </p>
      </div>

      <div className="w-full rounded-lg border border-border overflow-hidden">
        {rows.map(({ label, value }, i) => (
          <div
            key={label}
            className={cn(
              'flex justify-between items-center px-4 py-2.5 text-sm',
              i % 2 === 0 ? 'bg-background' : 'bg-secondary/30'
            )}
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-mono text-xs bg-secondary px-2 py-0.5 rounded">
              {value}
            </span>
          </div>
        ))}
      </div>

      <a
        href="https://github.com/AnasProgrammer2/netcopilot"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline underline-offset-2"
      >
        github.com/AnasProgrammer2/netcopilot
      </a>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
type SectionProps = {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Toggle({ label, description, value, onChange }: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={cn(
          'relative inline-flex w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          value ? 'bg-primary' : 'bg-muted-foreground/25'
        )}
      >
        <span className={cn(
          'absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform',
          value ? 'translate-x-[23px]' : 'translate-x-[3px]'
        )} />
      </button>
    </div>
  )
}

function SliderRow({ min, max, step, value, onChange, display, displayWidth = 'w-12' }: {
  min: number; max: number; step: number
  value: number
  onChange: (v: number) => void
  display: string
  displayWidth?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className={cn('text-xs text-foreground text-right tabular-nums', displayWidth)}>{display}</span>
    </div>
  )
}

function LabeledInput({ label, type, value, onChange }: {
  label: string
  type?: string
  value: string | number
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  )
}

// ─── AI Copilot Settings Section ─────────────────────────────────────────────
function AiSection(): JSX.Element {
  const { aiPermission, aiApproval, aiBlacklist, setAiPermission, setAiApproval, setAiBlacklist } = useAppStore()

  const [apiKey, setApiKey]         = useState('')
  const [showKey, setShowKey]       = useState(false)
  const [keySaved, setKeySaved]     = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testError, setTestError]   = useState('')
  const [blacklistInput, setBlacklistInput] = useState(aiBlacklist.join(', '))

  useEffect(() => {
    window.api.ai.getApiKey().then((k) => { if (k) setApiKey(k) })
  }, [])

  // Sync blacklist textarea whenever the store value changes (e.g. after loadSettings completes)
  useEffect(() => {
    setBlacklistInput(aiBlacklist.join(', '))
  }, [aiBlacklist])

  const saveApiKey = async () => {
    if (!apiKey.trim()) return
    await window.api.ai.setApiKey(apiKey.trim())
    // Also persist permission, approval, blacklist
    await window.api.store.setSetting('ai.permission', aiPermission)
    await window.api.store.setSetting('ai.approval',   aiApproval)
    const list = blacklistInput.split(',').map(s => s.trim()).filter(Boolean)
    await window.api.store.setSetting('ai.blacklist', list)
    setAiBlacklist(list)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2500)
  }

  const testApiKey = async () => {
    const key = apiKey.trim()
    if (!key) { setTestStatus('fail'); setTestError('Enter an API key first'); return }
    setTestStatus('testing')
    setTestError('')
    try {
      // Send minimal chat to verify key — use a simple ping message
      await window.api.ai.setApiKey(key) // save first so main process can use it
      // Use a promise race with ai events
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout — no response from API')), 15000)
        const offDone  = window.api.ai.onDone(() => { clearTimeout(timeout); offDone(); offErr(); resolve() })
        const offErr   = window.api.ai.onError((e) => { clearTimeout(timeout); offDone(); offErr(); reject(new Error(e)) })
        window.api.ai.chat({
          messages:        [{ role: 'user', content: 'Reply with exactly: ok' }],
          terminalContext: '',
          deviceType:      'generic',
          host:            'test',
          protocol:        'ssh',
          permission:      'troubleshoot',
          isProactive:     false,
        })
      })
      setTestStatus('ok')
    } catch (e: unknown) {
      setTestStatus('fail')
      setTestError(e instanceof Error ? e.message : String(e))
    }
    setTimeout(() => setTestStatus('idle'), 6000)
  }

  const saveOtherSettings = async () => {
    await window.api.store.setSetting('ai.permission', aiPermission)
    await window.api.store.setSetting('ai.approval',   aiApproval)
    const list = blacklistInput.split(',').map(s => s.trim()).filter(Boolean)
    await window.api.store.setSetting('ai.blacklist', list)
    setAiBlacklist(list)
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2500)
  }

  const permissionOptions: { id: AiPermission; label: string; desc: string; icon: JSX.Element }[] = [
    {
      id:   'troubleshoot',
      label: 'Troubleshoot',
      desc:  'Read-only commands only — show, ping, ls, ps, etc. Safe for monitoring.',
      icon:  <ShieldCheck className="w-4 h-4 text-amber-400" />,
    },
    {
      id:   'full-access',
      label: 'Full Access',
      desc:  'Any command including configuration changes. Use with caution.',
      icon:  <Wrench className="w-4 h-4 text-red-400" />,
    },
  ]

  const approvalOptions: { id: AiApproval; label: string; desc: string; icon: JSX.Element }[] = [
    {
      id:   'ask',
      label: 'Ask before each command',
      desc:  'AI shows the command and waits for your approval before running.',
      icon:  <Sparkles className="w-4 h-4 text-primary" />,
    },
    {
      id:   'auto',
      label: 'Auto-approve all',
      desc:  'AI executes commands immediately without asking. Fastest workflow.',
      icon:  <Zap className="w-4 h-4 text-emerald-400" />,
    },
    {
      id:   'blacklist',
      label: 'Block specific patterns',
      desc:  'Auto-approve everything except commands matching your blacklist.',
      icon:  <Lock className="w-4 h-4 text-orange-400" />,
    },
  ]

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Sparkles className="w-4 h-4" />}
        title="ARIA"
        description="Configure ARIA — your AI-native network assistant."
      />

      {/* API Key */}
      <SettingsGroup label="Anthropic API Key">
        <p className="text-xs text-muted-foreground mb-2">
          Required to use ARIA. Your key is stored encrypted in the OS keychain.{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
            onClick={(e) => { e.preventDefault(); window.open('https://console.anthropic.com/settings/keys') }}
          >
            Get a key →
          </a>
        </p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestStatus('idle') }}
              placeholder="sk-ant-..."
              className={cn(inputCls, 'pr-9 font-mono text-xs')}
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={saveApiKey}
            className="px-3 py-2 rounded-md bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium transition-colors whitespace-nowrap"
          >
            {keySaved ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={testApiKey}
            disabled={testStatus === 'testing'}
            className={cn(
              'px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
              testStatus === 'ok'   && 'bg-emerald-500/15 text-emerald-400',
              testStatus === 'fail' && 'bg-red-500/15 text-red-400',
              testStatus === 'testing' && 'bg-muted text-muted-foreground cursor-wait',
              (testStatus === 'idle') && 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {testStatus === 'testing' ? 'Testing…' : testStatus === 'ok' ? '✓ Connected' : testStatus === 'fail' ? '✗ Failed' : 'Test'}
          </button>
        </div>

        {/* Test error details */}
        {testStatus === 'fail' && testError && (
          <p className="text-xs text-red-400 mt-1.5 px-1 leading-relaxed">{testError}</p>
        )}
      </SettingsGroup>

      {/* Permission Mode */}
      <SettingsGroup label="Agent Mode">
        <div className="space-y-2">
          {permissionOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setAiPermission(opt.id)}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                aiPermission === opt.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border hover:border-border/80 hover:bg-accent/50'
              )}
            >
              <div className="mt-0.5 shrink-0">{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  {aiPermission === opt.id && <Check className="w-3 h-3 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </SettingsGroup>

      {/* Approval Setting */}
      <SettingsGroup label="Command Execution">
        <div className="space-y-2">
          {approvalOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setAiApproval(opt.id)}
              className={cn(
                'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                aiApproval === opt.id
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border hover:border-border/80 hover:bg-accent/50'
              )}
            >
              <div className="mt-0.5 shrink-0">{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  {aiApproval === opt.id && <Check className="w-3 h-3 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </SettingsGroup>

      {/* Blacklist (only shown when blacklist mode is selected) */}
      {/* Blacklist — always shown, not only in blacklist mode */}
      <SettingsGroup label="Blocked Command Patterns">
        <div className="flex items-start justify-between mb-2 gap-2">
          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
            Commands matching any pattern below are <strong className="text-foreground">always blocked</strong>, regardless of mode or approval setting.
          </p>
          <button
            onClick={async () => {
              const defaults = await window.api.ai.resetBlacklist()
              setBlacklistInput(defaults.join(', '))
              setAiBlacklist(defaults)
            }}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors whitespace-nowrap shrink-0 mt-0.5"
          >
            Reset to defaults
          </button>
        </div>
        <textarea
          value={blacklistInput}
          onChange={(e) => setBlacklistInput(e.target.value)}
          rows={6}
          placeholder="reload, shutdown, rm -rf, write erase, ..."
          className={cn(inputCls, 'resize-y font-mono text-xs leading-relaxed')}
        />
        <p className="text-[10px] text-muted-foreground/50 mt-1">
          {blacklistInput.split(',').filter(s => s.trim()).length} patterns · comma-separated · case-insensitive substring match
        </p>
      </SettingsGroup>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={saveOtherSettings}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
        >
          {keySaved ? '✓ Settings Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{label}</h3>
      {children}
    </div>
  )
}

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }): JSX.Element {
  return (
    <div className="flex items-start gap-3 pb-2 border-b border-border">
      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}
