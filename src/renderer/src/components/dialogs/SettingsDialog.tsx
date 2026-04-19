import { useState, useEffect } from 'react'
import {
  X, Monitor, Terminal, Network, Lock, Info, FileText,
  Sun, Moon, Laptop, Check, ChevronRight, FolderOpen
} from 'lucide-react'
import { useAppStore } from '../../store'
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
  accentColor: '#3b82f6',
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

const ACCENT_COLORS = [
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Violet',  value: '#8b5cf6' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Cyan',    value: '#06b6d4' },
  { label: 'Orange',  value: '#f97316' },
]

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Consolas',
  'monospace'
]

type SettingsSection = 'appearance' | 'terminal' | 'connection' | 'logging' | 'security' | 'about'

const NAV: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Monitor   },
  { id: 'terminal',   label: 'Terminal',   icon: Terminal  },
  { id: 'connection', label: 'Connection', icon: Network   },
  { id: 'logging',    label: 'Logging',    icon: FileText  },
  { id: 'security',   label: 'Security',   icon: Lock      },
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
            {section === 'about'      && <AboutSection />}
          </div>
        </div>

        {/* Footer */}
        {section !== 'about' && (
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
  return (
    <>
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
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Terminal className="w-8 h-8 text-primary" />
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground tracking-tight">NetTerm</h3>
        <p className="text-sm text-muted-foreground mt-1">
          SSH · Telnet · Serial Console Client
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
        href="https://github.com/AnasProgrammer2/netterm"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline underline-offset-2"
      >
        github.com/AnasProgrammer2/netterm
      </a>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
type SectionProps = {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

const inputCls = 'w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors'

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
