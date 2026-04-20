import { useState } from 'react'
import { X, Plus, Trash2, Play, Square, ArrowRight, Globe } from 'lucide-react'
import { useAppStore } from '../../store'
import { PortForwardRule } from '../../types'
import { cn } from '../../lib/utils'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'

interface Props {
  open:      boolean
  onClose:   () => void
  sessionId: string | null   // active session to bind forwards to
}

const inputCls = 'w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40'

export function PortForwardDialog({ open, onClose, sessionId }: Props): JSX.Element | null {
  const {
    portForwardRules, activeForwardIds,
    savePortForwardRule, deletePortForwardRule, startForward, stopForward,
    sessions,
  } = useAppStore()

  const session = sessions.find(s => s.id === sessionId)
  const rules   = portForwardRules.filter(r => r.connectionId === session?.connectionId)

  const [adding,    setAdding]    = useState(false)
  const [form, setForm] = useState<Partial<PortForwardRule>>({ type: 'local', localPort: 8080, remotePort: 80, remoteHost: '' })

  if (!open) return null

  const saveNew = () => {
    if (!form.localPort || !form.remoteHost || !form.remotePort || !session) return
    savePortForwardRule({
      id:           nanoid(),
      connectionId: session.connectionId,
      type:         form.type ?? 'local',
      localPort:    form.localPort,
      remoteHost:   form.remoteHost,
      remotePort:   form.remotePort,
      description:  form.description,
    })
    setAdding(false)
    setForm({ type: 'local', localPort: 8080, remotePort: 80, remoteHost: '' })
  }

  const toggle = async (rule: PortForwardRule) => {
    if (!sessionId) return
    if (activeForwardIds.has(rule.id)) {
      await stopForward(rule.id)
      toast.info(`Forwarding stopped — localhost:${rule.localPort}`)
    } else {
      const ok = await startForward(rule.id, sessionId)
      if (ok) toast.success(`Forwarding active — localhost:${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`)
      else     toast.error('Failed to start forwarding — check port availability')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Globe className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Port Forwarding</p>
            {session && (
              <p className="text-xs text-muted-foreground">{session.connection.name} — {session.connection.host}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {rules.length === 0 && !adding && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Globe className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60">No forwarding rules yet</p>
              <p className="text-xs text-muted-foreground/40">Forward local ports to remote services via SSH tunnel</p>
            </div>
          )}

          {rules.map(rule => {
            const active = activeForwardIds.has(rule.id)
            return (
              <div key={rule.id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-all',
                active ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card/50'
              )}>
                {/* Status dot */}
                <span className={cn('w-2 h-2 rounded-full shrink-0', active ? 'bg-emerald-400' : 'bg-muted-foreground/30')} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {rule.description && (
                    <p className="text-xs font-semibold text-foreground mb-0.5">{rule.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-primary">localhost:{rule.localPort}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-foreground/70">{rule.remoteHost}:{rule.remotePort}</span>
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-sans uppercase">
                      {rule.type}
                    </span>
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggle(rule)}
                  disabled={!sessionId || session?.status !== 'connected'}
                  className={cn(
                    'shrink-0 p-1.5 rounded-lg transition-all',
                    active
                      ? 'text-emerald-400 hover:bg-emerald-500/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                    (!sessionId || session?.status !== 'connected') && 'opacity-40 cursor-not-allowed'
                  )}
                  title={active ? 'Stop forwarding' : 'Start forwarding'}
                >
                  {active ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* Delete */}
                <button
                  onClick={() => deletePortForwardRule(rule.id)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}

          {/* Add form */}
          {adding && (
            <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Rule</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as 'local' | 'dynamic' }))}
                    className={inputCls}
                  >
                    <option value="local">Local (L)</option>
                    <option value="dynamic" disabled>Dynamic / SOCKS (soon)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Local Port</label>
                  <input
                    type="number"
                    min={1} max={65535}
                    value={form.localPort ?? ''}
                    onChange={e => setForm(f => ({ ...f, localPort: parseInt(e.target.value) }))}
                    placeholder="8080"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Remote Host</label>
                  <input
                    value={form.remoteHost ?? ''}
                    onChange={e => setForm(f => ({ ...f, remoteHost: e.target.value }))}
                    placeholder="192.168.1.1"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Remote Port</label>
                  <input
                    type="number"
                    min={1} max={65535}
                    value={form.remotePort ?? ''}
                    onChange={e => setForm(f => ({ ...f, remotePort: parseInt(e.target.value) }))}
                    placeholder="80"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Description (optional)</label>
                <input
                  value={form.description ?? ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Web panel, Database, ..."
                  className={inputCls}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveNew}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Save Rule
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="px-4 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">
            localhost:<span className="font-mono">port</span> → remote via SSH tunnel
          </p>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
