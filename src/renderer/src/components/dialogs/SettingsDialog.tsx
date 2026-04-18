import { useState, useEffect } from 'react'
import {
  X, Monitor, Terminal, Shield, Info,
  Sun, Moon, Laptop, Check, ChevronRight
} from 'lucide-react'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'

// ─── Settings data model ────────────────────────────────────────────────────
interface AppSettings {
  // Appearance
  theme: 'dark' | 'light' | 'system'
  accentColor: string
  sidebarWidth: number

  // Terminal
  fontSize: number
  fontFamily: string
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  lineHeight: number

  // Connection
  keepaliveInterval: number
  connectTimeout: number
  sshDefaultPort: number
  telnetDefaultPort: number

  // Security
  savePasswords: boolean
  autoLockMinutes: number
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
  savePasswords: true,
  autoLockMinutes: 0
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

type SettingsSection = 'appearance' | 'terminal' | 'connection' | 'security' | 'about'

const NAV: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'appearance', label: 'Appearance',  icon: Monitor  },
  { id: 'terminal',   label: 'Terminal',    icon: Terminal  },
  { id: 'connection', label: 'Connection',  icon: Shield    },
  { id: 'security',   label: 'Security',    icon: Shield    },
  { id: 'about',      label: 'About',       icon: Info      },
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
    // Persist all settings
    for (const [k, v] of Object.entries(settings)) {
      await window.api.store.setSetting(k, v)
    }
    // Apply live — updates terminal settings, sidebar width, accent color immediately
    applySettings(settings as unknown as Record<string, unknown>)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-foreground">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left nav */}
          <nav className="w-44 shrink-0 border-r border-border p-2 space-y-0.5 overflow-y-auto">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors',
                  section === id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {section === id && <ChevronRight className="w-3 h-3 ml-auto" />}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {section === 'appearance' && <AppearanceSection settings={settings} update={update} />}
            {section === 'terminal'   && <TerminalSection   settings={settings} update={update} />}
            {section === 'connection' && <ConnectionSection settings={settings} update={update} />}
            {section === 'security'   && <SecuritySection   settings={settings} update={update} />}
            {section === 'about'      && <AboutSection />}
          </div>
        </div>

        {/* Footer */}
        {section !== 'about' && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
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
        <div className="flex gap-3">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => update('theme', value)}
              className={cn(
                'flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors',
                settings.theme === value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Theme changes apply on next restart</p>
      </Group>

      <Group title="Accent Color">
        <div className="flex gap-2 flex-wrap">
          {ACCENT_COLORS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => update('accentColor', value)}
              title={label}
              className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 relative"
              style={{
                backgroundColor: value,
                borderColor: settings.accentColor === value ? '#fff' : 'transparent'
              }}
            >
              {settings.accentColor === value && (
                <Check className="w-3 h-3 text-white absolute inset-0 m-auto" />
              )}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Sidebar Width">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={200} max={420} step={10}
            value={settings.sidebarWidth}
            onChange={(e) => update('sidebarWidth', parseInt(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-foreground w-12 text-right">{settings.sidebarWidth}px</span>
        </div>
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
            <label className="text-xs text-muted-foreground">Family</label>
            <select
              value={settings.fontFamily}
              onChange={(e) => update('fontFamily', e.target.value)}
              className={inputCls}
            >
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Size</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min={10} max={20} step={1}
                value={settings.fontSize}
                onChange={(e) => update('fontSize', parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm w-8 text-right">{settings.fontSize}px</span>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div
          className="mt-2 p-3 rounded-md bg-[#0d0f14] border border-border"
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
        <div className="flex items-center gap-3">
          <input
            type="range" min={1.0} max={2.0} step={0.1}
            value={settings.lineHeight}
            onChange={(e) => update('lineHeight', parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm w-8 text-right">{settings.lineHeight.toFixed(1)}</span>
        </div>
      </Group>

      <Group title="Cursor">
        <div className="flex gap-2">
          {(['bar', 'block', 'underline'] as const).map((style) => (
            <button
              key={style}
              onClick={() => update('cursorStyle', style)}
              className={cn(
                'flex-1 py-2 text-xs rounded-md border transition-colors capitalize',
                settings.cursorStyle === style
                  ? 'bg-primary border-primary text-white'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
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
        <div className="flex items-center gap-3">
          <input
            type="range" min={500} max={20000} step={500}
            value={settings.scrollback}
            onChange={(e) => update('scrollback', parseInt(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm w-16 text-right">{settings.scrollback.toLocaleString()} lines</span>
        </div>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Connect timeout (sec)</label>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={120} step={5}
                value={settings.connectTimeout}
                onChange={(e) => update('connectTimeout', parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm w-8 text-right">{settings.connectTimeout}s</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">SSH keepalive (sec)</label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={120} step={5}
                value={settings.keepaliveInterval}
                onChange={(e) => update('keepaliveInterval', parseInt(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm w-8 text-right">
                {settings.keepaliveInterval === 0 ? 'off' : `${settings.keepaliveInterval}s`}
              </span>
            </div>
          </div>
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
          <label className="text-xs text-muted-foreground">
            Lock app after inactivity
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={60} step={5}
              value={settings.autoLockMinutes}
              onChange={(e) => update('autoLockMinutes', parseInt(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm w-16 text-right">
              {settings.autoLockMinutes === 0 ? 'Disabled' : `${settings.autoLockMinutes} min`}
            </span>
          </div>
        </div>
      </Group>
    </>
  )
}

// ─── Section: About ───────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Terminal className="w-8 h-8 text-primary" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground">NetTerm</h3>
        <p className="text-sm text-muted-foreground">Version 0.1.0</p>
      </div>
      <div className="w-full max-w-xs space-y-2 mt-2">
        {[
          { label: 'Electron',  value: process.versions.electron ?? '—' },
          { label: 'Node.js',   value: process.versions.node ?? '—'     },
          { label: 'Chrome',    value: process.versions.chrome ?? '—'   },
          { label: 'Platform',  value: navigator.userAgent.includes('Mac') ? 'macOS' : 'Windows' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-mono text-xs">{value}</span>
          </div>
        ))}
      </div>
      <a
        href="https://github.com/AnasProgrammer2/netterm"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline mt-2"
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

const inputCls = 'w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
      <div className="border-t border-border" />
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
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          value ? 'bg-primary' : 'bg-border'
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-4' : 'translate-x-0.5'
        )} />
      </button>
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
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </div>
  )
}
