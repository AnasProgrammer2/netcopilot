import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Usb } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, Protocol, AuthType, DeviceType, SerialConfig } from '../../types'
import { cn } from '../../lib/utils'
import type { ConnectionSettings } from '../../store'

const PROTOCOLS: { value: Protocol; label: string; defaultPort: number }[] = [
  { value: 'ssh',    label: 'SSH',    defaultPort: 22 },
  { value: 'telnet', label: 'Telnet', defaultPort: 23 },
  { value: 'serial', label: 'Serial', defaultPort: 0  }
]

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const DEFAULT_SERIAL: SerialConfig = {
  path: '',
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  rtscts: false,
  xon: false,
  xoff: false
}

const DEVICE_TYPES: { value: DeviceType; label: string; group: string }[] = [
  // Servers
  { value: 'linux',       label: 'Linux / Unix',       group: 'Servers' },
  { value: 'windows',     label: 'Windows Server',     group: 'Servers' },
  // Cisco
  { value: 'cisco-ios',   label: 'Cisco IOS',          group: 'Cisco' },
  { value: 'cisco-iosxe', label: 'Cisco IOS-XE',       group: 'Cisco' },
  { value: 'cisco-nxos',  label: 'Cisco NX-OS',        group: 'Cisco' },
  { value: 'cisco-asa',   label: 'Cisco ASA',          group: 'Cisco' },
  // Other Vendors
  { value: 'junos',       label: 'Juniper JunOS',      group: 'Routers & Switches' },
  { value: 'arista-eos',  label: 'Arista EOS',         group: 'Routers & Switches' },
  { value: 'nokia-sros',  label: 'Nokia SR-OS',        group: 'Routers & Switches' },
  { value: 'huawei-vrp',  label: 'Huawei VRP',         group: 'Routers & Switches' },
  { value: 'mikrotik',    label: 'MikroTik RouterOS',  group: 'Routers & Switches' },
  { value: 'hp-procurve', label: 'HP / Aruba ProCurve',group: 'Routers & Switches' },
  // Firewalls
  { value: 'panos',       label: 'Palo Alto PAN-OS',   group: 'Firewalls' },
  { value: 'fortios',     label: 'Fortinet FortiOS',   group: 'Firewalls' },
  // Load Balancers
  { value: 'f5-tmos',     label: 'F5 BIG-IP TMOS',    group: 'Load Balancers' },
  // Generic
  { value: 'generic',     label: 'Generic',            group: 'Other' }
]

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'
]

function emptyForm(cs: ConnectionSettings): Partial<Connection> {
  return {
    name: '',
    host: '',
    port: cs.sshDefaultPort,
    protocol: 'ssh',
    username: '',
    authType: 'password',
    tags: [],
    notes: '',
    deviceType: 'linux',
    color: COLORS[0],
    autoReconnect: cs.autoReconnect,
    reconnectDelay: cs.reconnectDelay
  }
}

export function ConnectionDialog(): JSX.Element {
  const { connectionDialogOpen, editingConnection, setConnectionDialogOpen, saveConnection, sshKeys, groups, connectionSettings } = useAppStore()
  const [form, setForm] = useState<Partial<Connection>>(emptyForm(connectionSettings))
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<string>('general')
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (connectionDialogOpen) {
      setForm(editingConnection ? { ...editingConnection } : emptyForm(connectionSettings))
      setPassword('')
      setTab('general')
      setTagInput('')
    }
  }, [connectionDialogOpen, editingConnection])

  if (!connectionDialogOpen) return <></>

  const update = <K extends keyof Connection>(key: K, value: Connection[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'protocol') {
        if (value === 'ssh') next.port = connectionSettings.sshDefaultPort
        else if (value === 'telnet') next.port = connectionSettings.telnetDefaultPort
        else next.port = 0
      }
      return next
    })
  }

  const isSerial = form.protocol === 'serial'

  const handleSave = async () => {
    if (!form.name) return
    if (!isSerial && !form.host) return
    if (isSerial && !form.serialConfig?.path) return
    setSaving(true)
    try {
      const conn = await saveConnection({
        id: editingConnection?.id,
        name: form.name!,
        host: isSerial ? (form.serialConfig?.path ?? '') : form.host!,
        port: form.port ?? 22,
        protocol: form.protocol ?? 'ssh',
        username: form.username ?? '',
        authType: form.authType ?? 'password',
        sshKeyId: form.sshKeyId,
        groupId: form.groupId,
        tags: form.tags ?? [],
        notes: form.notes ?? '',
        deviceType: form.deviceType ?? 'generic',
        color: form.color,
        startupCommands: form.startupCommands,
        serialConfig: isSerial ? (form.serialConfig ?? DEFAULT_SERIAL) : undefined,
        autoReconnect: form.autoReconnect ?? true,
        reconnectDelay: form.reconnectDelay ?? 10
      } as Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string })

      if (password && (form.authType === 'password' || form.authType === 'key+password')) {
        const savePasswords = await window.api.store.getSetting('savePasswords')
        if (savePasswords !== false) {
          await window.api.credentials.save(`${conn.id}:password`, password)
        }
      }

      setConnectionDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const updateSerial = <K extends keyof SerialConfig>(key: K, value: SerialConfig[K]) => {
    setForm((prev) => ({
      ...prev,
      serialConfig: { ...(prev.serialConfig ?? DEFAULT_SERIAL), [key]: value }
    }))
  }

  const TABS = [
    { id: 'general',  label: 'General' },
    ...(!isSerial ? [{ id: 'auth', label: 'Authentication' }] : []),
    { id: 'serial',   label: 'Serial Port', hidden: !isSerial },
    { id: 'advanced', label: 'Advanced' }
  ].filter((t) => !('hidden' in t && t.hidden && t.id !== 'serial') || isSerial) as { id: string; label: string }[]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">
            {editingConnection ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button
            onClick={() => setConnectionDialogOpen(false)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors',
                tab === t.id
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {tab === 'general' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" required>
                  <input
                    value={form.name ?? ''}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="My Router"
                    className={inputClass}
                  />
                </Field>
                <Field label="Group">
                  <select
                    value={form.groupId ?? ''}
                    onChange={(e) => update('groupId', e.target.value || undefined)}
                    className={inputClass}
                  >
                    <option value="">— No Group —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Protocol">
                  <select
                    value={form.protocol}
                    onChange={(e) => update('protocol', e.target.value as Protocol)}
                    className={inputClass}
                  >
                    {PROTOCOLS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Device Type">
                  <select
                    value={form.deviceType}
                    onChange={(e) => update('deviceType', e.target.value as DeviceType)}
                    className={inputClass}
                  >
                    {Array.from(new Set(DEVICE_TYPES.map((d) => d.group))).map((group) => (
                      <optgroup key={group} label={group}>
                        {DEVICE_TYPES.filter((d) => d.group === group).map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              </div>

              {!isSerial && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Host / IP" required>
                      <input
                        value={form.host ?? ''}
                        onChange={(e) => update('host', e.target.value)}
                        placeholder="192.168.1.1"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <Field label="Port">
                    <input
                      type="number"
                      value={form.port ?? 22}
                      onChange={(e) => update('port', parseInt(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}

              {isSerial && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                  <Usb className="w-4 h-4 text-primary shrink-0" />
                  Configure port settings in the <strong className="text-foreground">Serial Port</strong> tab
                </div>
              )}

              <Field label="Color">
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => update('color', c)}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: form.color === c ? '#fff' : 'transparent'
                      }}
                    />
                  ))}
                </div>
              </Field>

              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5 px-2 py-1.5 min-h-[38px] bg-background border border-border rounded-md focus-within:ring-1 focus-within:ring-ring">
                  {(form.tags ?? []).map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/15 text-primary rounded-full"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => update('tags', (form.tags ?? []).filter((_, j) => j !== i))}
                        className="hover:text-destructive leading-none"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                        e.preventDefault()
                        const newTag = tagInput.trim().replace(/,+$/, '')
                        if (newTag && !(form.tags ?? []).includes(newTag)) {
                          update('tags', [...(form.tags ?? []), newTag])
                        }
                        setTagInput('')
                      } else if (e.key === 'Backspace' && !tagInput && (form.tags ?? []).length > 0) {
                        update('tags', (form.tags ?? []).slice(0, -1))
                      }
                    }}
                    placeholder={(form.tags ?? []).length ? '' : 'Add tags... (Enter or comma)'}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </Field>

              <Field label="Notes">
                <textarea
                  value={form.notes ?? ''}
                  onChange={(e) => update('notes', e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className={cn(inputClass, 'resize-none')}
                />
              </Field>
            </>
          )}

          {tab === 'auth' && (
            <>
              <Field label="Username">
                <input
                  value={form.username ?? ''}
                  onChange={(e) => update('username', e.target.value)}
                  placeholder="Leave empty to enter on connect"
                  className={inputClass}
                />
              </Field>

              {form.protocol === 'ssh' && (
                <Field label="Authentication Type">
                  <div className="flex gap-2">
                    {(['password', 'key', 'key+password'] as AuthType[]).map((a) => (
                      <button
                        key={a}
                        onClick={() => update('authType', a)}
                        className={cn(
                          'flex-1 py-1.5 text-xs rounded-md border transition-colors',
                          form.authType === a
                            ? 'bg-primary border-primary text-white'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        )}
                      >
                        {a === 'key+password' ? 'Key + Pass' : a.charAt(0).toUpperCase() + a.slice(1)}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {(form.authType === 'password' || form.authType === 'key+password' || form.protocol === 'telnet') && (
                <Field label={form.authType === 'key+password' ? 'Key Passphrase' : 'Password'}>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingConnection ? '(unchanged)' : '••••••••'}
                      className={cn(inputClass, 'pr-9')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
              )}

              {(form.authType === 'key' || form.authType === 'key+password') && (
                <Field label="SSH Key">
                  <select
                    value={form.sshKeyId ?? ''}
                    onChange={(e) => update('sshKeyId', e.target.value || undefined)}
                    className={inputClass}
                  >
                    <option value="">Select a key...</option>
                    {sshKeys.map((k) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}

          {tab === 'serial' && (
            <SerialSettings
              config={form.serialConfig ?? DEFAULT_SERIAL}
              onChange={updateSerial}
              inputClass={inputClass}
            />
          )}

          {tab === 'advanced' && (
            <>
              {form.deviceType?.startsWith('cisco') && (
                <Field label="Enable Password">
                  <input
                    type="password"
                    value={form.enablePassword ?? ''}
                    onChange={(e) => update('enablePassword', e.target.value)}
                    placeholder="Cisco enable password"
                    className={inputClass}
                  />
                </Field>
              )}
              <Field label="Startup Commands">
                <textarea
                  value={(form.startupCommands ?? []).join('\n')}
                  onChange={(e) =>
                    update('startupCommands', e.target.value.split('\n').filter(Boolean))
                  }
                  placeholder="Commands to run after connecting (one per line)"
                  rows={4}
                  className={cn(inputClass, 'resize-none font-mono text-xs')}
                />
              </Field>

              {/* Auto Reconnect */}
              <div className="space-y-3 pt-1 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Auto Reconnect
                </p>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoReconnect ?? false}
                    onChange={(e) => update('autoReconnect', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    Reconnect automatically on disconnect
                  </span>
                </label>
                {form.autoReconnect && (
                  <Field label="Reconnect delay (seconds)">
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={form.reconnectDelay ?? 10}
                      onChange={(e) => update('reconnectDelay', parseInt(e.target.value) || 10)}
                      className={inputClass}
                    />
                  </Field>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => setConnectionDialogOpen(false)}
            className="px-4 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name || (!isSerial && !form.host) || (isSerial && !form.serialConfig?.path)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : editingConnection ? 'Save Changes' : 'Add Connection'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function SerialSettings({
  config, onChange, inputClass
}: {
  config: SerialConfig
  onChange: <K extends keyof SerialConfig>(key: K, value: SerialConfig[K]) => void
  inputClass: string
}): JSX.Element {
  const [ports, setPorts] = useState<{ path: string; manufacturer?: string }[]>([])
  const [loading, setLoading] = useState(false)

  const refreshPorts = async () => {
    setLoading(true)
    const list = await window.api.serial.listPorts()
    setPorts(list)
    setLoading(false)
  }

  useEffect(() => { refreshPorts() }, [])

  return (
    <div className="space-y-4">
      {/* Port path */}
      <Field label="Serial Port" required>
        <div className="flex gap-2">
          <select
            value={config.path}
            onChange={(e) => onChange('path', e.target.value)}
            className={cn(inputClass, 'flex-1')}
          >
            <option value="">Select a port...</option>
            {ports.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
              </option>
            ))}
            {config.path && !ports.find((p) => p.path === config.path) && (
              <option value={config.path}>{config.path}</option>
            )}
          </select>
          <button
            type="button"
            onClick={refreshPorts}
            disabled={loading}
            className="px-3 py-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
        <input
          value={config.path}
          onChange={(e) => onChange('path', e.target.value)}
          placeholder="Or type manually: /dev/ttyUSB0, COM3"
          className={cn(inputClass, 'mt-1.5 text-xs')}
        />
      </Field>

      {/* Baud Rate */}
      <Field label="Baud Rate">
        <select
          value={config.baudRate}
          onChange={(e) => onChange('baudRate', parseInt(e.target.value))}
          className={inputClass}
        >
          {BAUD_RATES.map((b) => (
            <option key={b} value={b}>{b.toLocaleString()}</option>
          ))}
        </select>
      </Field>

      {/* Data / Stop / Parity */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Data Bits">
          <select
            value={config.dataBits}
            onChange={(e) => onChange('dataBits', parseInt(e.target.value) as 5 | 6 | 7 | 8)}
            className={inputClass}
          >
            {[5, 6, 7, 8].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Stop Bits">
          <select
            value={config.stopBits}
            onChange={(e) => onChange('stopBits', parseFloat(e.target.value) as 1 | 1.5 | 2)}
            className={inputClass}
          >
            {[1, 1.5, 2].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Parity">
          <select
            value={config.parity}
            onChange={(e) => onChange('parity', e.target.value as SerialConfig['parity'])}
            className={inputClass}
          >
            {['none', 'even', 'odd', 'mark', 'space'].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Flow Control */}
      <Field label="Flow Control">
        <div className="flex gap-3">
          {[
            { key: 'rtscts', label: 'RTS/CTS (Hardware)' },
            { key: 'xon',    label: 'XON' },
            { key: 'xoff',   label: 'XOFF' }
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={config[key as keyof SerialConfig] as boolean}
                onChange={(e) => onChange(key as keyof SerialConfig, e.target.checked as never)}
                className="rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </label>
          ))}
        </div>
      </Field>

      {/* Common presets */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Common Presets</p>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Cisco Console', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
            { label: 'Juniper Console', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
            { label: 'Fast Console', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' }
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange('baudRate', preset.baudRate)
                onChange('dataBits', preset.dataBits as 8)
                onChange('stopBits', preset.stopBits as 1)
                onChange('parity', preset.parity as 'none')
              }}
              className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
