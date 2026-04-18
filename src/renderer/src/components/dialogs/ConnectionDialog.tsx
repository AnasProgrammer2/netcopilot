import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../../store'
import { Connection, Protocol, AuthType, DeviceType } from '../../types'
import { cn } from '../../lib/utils'
import { nanoid } from 'nanoid'

const PROTOCOLS: { value: Protocol; label: string; defaultPort: number }[] = [
  { value: 'ssh', label: 'SSH', defaultPort: 22 },
  { value: 'telnet', label: 'Telnet', defaultPort: 23 }
]

const DEVICE_TYPES: { value: DeviceType; label: string }[] = [
  { value: 'linux', label: 'Linux / Unix' },
  { value: 'cisco-ios', label: 'Cisco IOS' },
  { value: 'cisco-iosxe', label: 'Cisco IOS-XE' },
  { value: 'cisco-nxos', label: 'Cisco NX-OS' },
  { value: 'junos', label: 'Juniper JunOS' },
  { value: 'arista-eos', label: 'Arista EOS' },
  { value: 'panos', label: 'Palo Alto PAN-OS' },
  { value: 'windows', label: 'Windows' },
  { value: 'generic', label: 'Generic' }
]

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'
]

function emptyForm(): Partial<Connection> {
  return {
    name: '',
    host: '',
    port: 22,
    protocol: 'ssh',
    username: '',
    authType: 'password',
    tags: [],
    notes: '',
    deviceType: 'linux',
    color: COLORS[0]
  }
}

export function ConnectionDialog(): JSX.Element {
  const { connectionDialogOpen, editingConnection, setConnectionDialogOpen, saveConnection, sshKeys } = useAppStore()
  const [form, setForm] = useState<Partial<Connection>>(emptyForm())
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'general' | 'auth' | 'advanced'>('general')

  useEffect(() => {
    if (connectionDialogOpen) {
      setForm(editingConnection ? { ...editingConnection } : emptyForm())
      setPassword('')
      setTab('general')
    }
  }, [connectionDialogOpen, editingConnection])

  if (!connectionDialogOpen) return <></>

  const update = <K extends keyof Connection>(key: K, value: Connection[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'protocol') {
        next.port = PROTOCOLS.find((p) => p.value === value)?.defaultPort ?? prev.port
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!form.name || !form.host || !form.username) return
    setSaving(true)
    try {
      const conn = await saveConnection({
        id: editingConnection?.id,
        name: form.name!,
        host: form.host!,
        port: form.port ?? 22,
        protocol: form.protocol ?? 'ssh',
        username: form.username!,
        authType: form.authType ?? 'password',
        sshKeyId: form.sshKeyId,
        groupId: form.groupId,
        tags: form.tags ?? [],
        notes: form.notes ?? '',
        deviceType: form.deviceType ?? 'linux',
        color: form.color,
        startupCommands: form.startupCommands
      } as Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string })

      if (password && (form.authType === 'password' || form.authType === 'key+password')) {
        await window.api.credentials.save(`${conn.id}:password`, password)
      }

      setConnectionDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'auth', label: 'Authentication' },
    { id: 'advanced', label: 'Advanced' }
  ] as const

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
              <Field label="Name" required>
                <input
                  value={form.name ?? ''}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="My Router"
                  className={inputClass}
                />
              </Field>

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
                    {DEVICE_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

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
            disabled={saving || !form.name || !form.host}
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
