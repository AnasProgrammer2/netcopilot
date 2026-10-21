import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, GitCompareArrows, Search, X } from 'lucide-react'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'
import { CHANGE_STATUS, ChangeDetails, ENV_BADGE } from '../ai/ChangeCard'
import type { ChangeRecord } from '../../../../shared/changeControl'

/** Every change ARIA proposed, with what ran, the diff and how it ended. */
export function ChangeHistoryDialog(): JSX.Element | null {
  const open    = useAppStore((s) => s.changeHistoryOpen)
  const setOpen = useAppStore((s) => s.setChangeHistoryOpen)
  const live    = useAppStore((s) => s.aiChanges)
  const [records, setRecords]   = useState<ChangeRecord[]>([])
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    window.api.changes.list(500).then(setRecords).catch(() => setRecords([]))
  }, [open, live])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) =>
      [r.id, r.plan.title, r.deviceName, r.host, r.status, r.environment].some((v) => v.toLowerCase().includes(q)))
  }, [records, query])

  if (!open) return null
  const current = filtered.find((r) => r.id === selected) ?? filtered[0] ?? null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-[920px] max-w-[94vw] h-[640px] max-h-[86vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border shrink-0">
          <GitCompareArrows className="w-4 h-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Change History</p>
            <p className="text-xs text-muted-foreground">Every change ARIA proposed — who approved it, what ran, and how it ended.</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* List */}
          <div className="w-[320px] shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="p-2.5 border-b border-border/60">
              <div className="flex items-center gap-2 h-8 px-2.5 rounded-md bg-muted/60 border border-border/60">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search device, title, status…"
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {records.length === 0 ? 'No changes yet. Changes ARIA proposes in Change or Autopilot mode appear here.' : 'No matches.'}
                </p>
              )}
              {filtered.map((r) => {
                const st = CHANGE_STATUS[r.status]
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors',
                      current?.id === r.id ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <p className="text-xs font-medium text-foreground truncate">{r.plan.title}</p>
                    <p className="text-2xs text-muted-foreground truncate mt-0.5">
                      {r.deviceName} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn('px-1.5 py-px rounded border text-2xs font-semibold', ENV_BADGE[r.environment].className)}>
                        {ENV_BADGE[r.environment].label}
                      </span>
                      <span className={cn('px-1.5 py-px rounded border text-2xs font-medium', st.className)}>{st.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Detail */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {current ? (
              <div className="space-y-3 select-text">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-mono text-muted-foreground">{current.id}</p>
                    <p className="text-base font-semibold text-foreground leading-snug">{current.plan.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {current.deviceName} · {current.host} · {current.deviceType} · {current.environment}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {CHANGE_STATUS[current.status].label}
                      {current.approvedBy && ` · approved by ${current.approvedBy === 'user' ? 'you' : 'Autopilot'}`}
                      {current.overrideReason && ` · outside window: ${current.overrideReason}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => window.api.changes.export(current.id, 'record')}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-muted hover:bg-accent text-xs font-medium transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Export record
                    </button>
                    {!!current.snapshotLines && (
                      <button
                        onClick={() => window.api.changes.export(current.id, 'snapshot')}
                        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-muted hover:bg-accent text-xs font-medium transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Config before
                      </button>
                    )}
                  </div>
                </div>
                <ChangeDetails record={current} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Select a change</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
