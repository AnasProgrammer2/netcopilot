import { useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock, Download, GitCompareArrows, Loader2,
  RotateCcw, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'
import type { ChangeRecord, ChangeStatus, Environment } from '../../../../shared/changeControl'

// Colour only where the engineer has to act (amber) or something went wrong
// (red). Finished and informational states stay neutral.
export const CHANGE_STATUS: Record<ChangeStatus, { label: string; className: string }> = {
  'proposed':              { label: 'Waiting for your approval',   className: 'text-warning border-warning/40' },
  'applying':              { label: 'Applying…',                   className: 'text-foreground border-border' },
  'awaiting-confirmation': { label: 'Applied — keep or roll back', className: 'text-warning border-warning/40' },
  'confirmed':             { label: 'Confirmed',                   className: 'text-foreground border-border' },
  'rolled-back':           { label: 'Rolled back',                 className: 'text-muted-foreground border-border' },
  'reverted-by-device':    { label: 'Reverted by the device',      className: 'text-muted-foreground border-border' },
  'failed':                { label: 'Failed',                      className: 'text-danger border-danger/40' },
  'rejected':              { label: 'Rejected',                    className: 'text-muted-foreground border-border' },
  'expired':               { label: 'Expired',                     className: 'text-muted-foreground border-border' },
}

export const ENV_BADGE: Record<Environment, { label: string; className: string }> = {
  production: { label: 'PROD', className: 'text-muted-foreground border-border' },
  staging:    { label: 'STG',  className: 'text-muted-foreground border-border' },
  lab:        { label: 'LAB',  className: 'text-muted-foreground border-border' },
}

const RISK_CLASS = {
  low:    'text-muted-foreground border-border',
  medium: 'text-warning border-warning/40',
  high:   'text-danger border-danger/40',
}

const PHASE_LABEL: Record<string, string> = {
  snapshot: 'Snapshot', precheck: 'Pre-check', arm: 'Safety net', apply: 'Apply',
  verify: 'Verify', commit: 'Confirm', rollback: 'Roll back',
}

function Badge({ className, children }: { className: string; children: React.ReactNode }): JSX.Element {
  return (
    <span className={cn('inline-flex items-center shrink-0 whitespace-nowrap px-1.5 rounded border text-2xs font-medium leading-[17px]', className)}>
      {children}
    </span>
  )
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function CommandList({ commands }: { commands: string[] }): JSX.Element {
  return (
    <pre className="font-mono text-2xs leading-relaxed rounded-md bg-muted/70 border border-border/50 px-2.5 py-2 whitespace-pre-wrap break-all text-foreground max-h-56 overflow-y-auto select-text">
      {commands.length ? commands.join('\n') : '(none)'}
    </pre>
  )
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        {title}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  )
}

/** Read-only body of a change record — used by the live card and by Change History. */
export function ChangeDetails({ record: r, compact }: { record: ChangeRecord; compact?: boolean }): JSX.Element {
  return (
    <div className="space-y-2.5">
      {!compact && <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap select-text">{r.plan.rationale}</p>}

      <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2">
        <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-2xs leading-relaxed text-foreground space-y-1">
          <p>{r.safetyNet.description}</p>
          {r.safetyNet.warning && (
            <p className="flex items-start gap-1 text-warning">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              {r.safetyNet.warning}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-2xs font-medium text-muted-foreground mb-1">Changes</p>
        <CommandList commands={r.plan.changes} />
      </div>

      {!compact && (
        <>
          <Section title={`Pre-checks and verification (${r.plan.prechecks.length} / ${r.plan.verify.length})`}>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Before</p>
            <CommandList commands={r.plan.prechecks} />
            <p className="text-2xs uppercase tracking-wider text-muted-foreground mt-2 mb-1">After</p>
            <CommandList commands={r.plan.verify} />
          </Section>
          <Section title="Rollback commands">
            <CommandList commands={r.plan.rollback} />
          </Section>
          {r.diff && (
            <Section title="Device diff" defaultOpen>
              <CommandList commands={[r.diff.trim()]} />
            </Section>
          )}
          {r.steps.length > 0 && (
            <Section title={`Execution log (${r.steps.length} steps)`}>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {r.steps.map((s, i) => (
                  <details key={i} className="rounded border border-border/50 bg-muted/30">
                    <summary className="cursor-pointer px-2 py-1 text-2xs flex items-center gap-1.5">
                      <span className="text-muted-foreground w-16 shrink-0">{PHASE_LABEL[s.phase] ?? s.phase}</span>
                      <code className="font-mono truncate text-foreground">{s.command === '\x18' ? '<Ctrl+X>' : s.command}</code>
                    </summary>
                    <pre className="px-2 py-1.5 border-t border-border/50 font-mono text-2xs whitespace-pre-wrap break-all text-foreground max-h-48 overflow-y-auto select-text">
                      {s.output}
                    </pre>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {r.recommendation && (
        <div className="flex items-start gap-2 rounded-md border border-border px-2.5 py-2 text-2xs leading-relaxed">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold">ARIA recommends {r.recommendation.decision === 'confirm' ? 'keeping' : 'rolling back'} this change.</span>{' '}
            <span className="text-foreground">{r.recommendation.note}</span>
          </p>
        </div>
      )}

      {r.outcomeNote && (
        <p className={cn('text-2xs leading-relaxed', r.status === 'failed' ? 'text-danger' : 'text-muted-foreground')}>
          {r.outcomeNote}
        </p>
      )}
    </div>
  )
}

/** Live change plan card: approve, watch it apply, then keep or roll back. */
export function ChangeCard({ changeId, compact }: { changeId: string; compact?: boolean }): JSX.Element | null {
  const evt = useAppStore((s) => s.aiChanges[changeId])
  const [busy, setBusy]     = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const now = useNow(!!evt?.record.deadline)

  // A new status means the last click has been handled.
  const status = evt?.record.status
  useEffect(() => { setBusy(false) }, [status])

  if (!evt) return null
  const r = evt.record
  const statusMeta = CHANGE_STATUS[r.status]
  const env = ENV_BADGE[r.environment]

  const decide = async (decision: ChangeDecision): Promise<void> => {
    setBusy(true)
    setError(null)
    const res = await window.api.changes.decide(r.id, decision)
    if (!res.success) {
      setBusy(false)
      setError(res.error ?? 'Could not complete that action.')
    }
  }

  const remaining = r.deadline ? Math.max(0, Math.round((r.deadline - now) / 1000)) : null
  const mmss = remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : null
  const lastStep = r.steps[r.steps.length - 1]

  return (
    <div dir="ltr" className="rounded-lg border border-border bg-card overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border">
        <GitCompareArrows className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-2xs font-semibold text-foreground whitespace-nowrap">Change plan</span>
        <span className="flex-1 min-w-0 text-2xs font-mono text-muted-foreground truncate" title={r.id}>{r.id}</span>
        <Badge className={env.className}>{env.label}</Badge>
        <Badge className={RISK_CLASS[r.plan.risk]}>{r.plan.risk.toUpperCase()}</Badge>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        <div>
          <p className="text-sm font-semibold text-foreground leading-snug">{r.plan.title}</p>
          <p className="text-2xs text-muted-foreground mt-0.5 truncate">
            {r.deviceName} · {r.host} · {r.deviceType}
            {r.plan.affectsManagementPath && <span className="text-warning"> · touches the management path</span>}
          </p>
        </div>

        <ChangeDetails record={r} compact={compact} />

        {/* Status line */}
        <div className="flex items-center gap-2">
          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
          {r.status === 'applying' && lastStep && (
            <span className="flex items-center gap-1 text-2xs text-muted-foreground min-w-0">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              <span className="truncate">{PHASE_LABEL[lastStep.phase]}: {lastStep.command === '\x18' ? '<Ctrl+X>' : lastStep.command}</span>
            </span>
          )}
          {r.status === 'awaiting-confirmation' && mmss && (
            <span className={cn('flex items-center gap-1 text-2xs font-medium tabular-nums', remaining! < 60 ? 'text-danger' : 'text-warning')}>
              <Clock className="w-3 h-3" />
              Device reverts in {mmss}
            </span>
          )}
        </div>
        {r.status === 'applying' && (
          <p className="text-2xs text-muted-foreground">NetCopilot is typing into the terminal — don&apos;t type in it until this finishes.</p>
        )}

        {/* Approval */}
        {r.status === 'proposed' && (
          <div className="space-y-2">
            {r.needsOverride && (
              <div className="space-y-1">
                <p className="flex items-center gap-1 text-2xs text-warning">
                  <AlertTriangle className="w-3 h-3" />
                  Outside the maintenance window — give a reason to approve.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. P1 outage, ticket INC-1234"
                  className="w-full h-7 px-2 rounded-md bg-background border border-border text-xs outline-none focus:border-primary/60"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                disabled={busy || (r.needsOverride && reason.trim().length < 5)}
                onClick={() => decide({ action: 'approve', overrideReason: r.needsOverride ? reason.trim() : undefined })}
                className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Approve &amp; apply
              </button>
              <button
                disabled={busy}
                onClick={() => decide({ action: 'reject' })}
                className="flex items-center justify-center gap-1.5 h-7 px-3 rounded-md bg-muted text-foreground text-xs font-medium hover:bg-accent disabled:opacity-40 transition-colors"
              >
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {r.status === 'awaiting-confirmation' && (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => decide({ action: 'confirm' })}
              className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Keep change
            </button>
            <button
              disabled={busy}
              onClick={() => decide({ action: 'rollback' })}
              className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md border border-border text-foreground text-xs font-medium hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Roll back
            </button>
          </div>
        )}

        {error && <p className="text-2xs text-danger">{error}</p>}

        {!compact && ['confirmed', 'rolled-back', 'reverted-by-device', 'failed'].includes(r.status) && (
          <button
            onClick={() => window.api.changes.export(r.id)}
            className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3 h-3" />
            Export change record
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Active changes that aren't visible in the ARIA chat right now (panel closed,
 * another tab active, or the conversation was cleared) — so an approval or a
 * running safety timer is never out of sight.
 */
export function ChangeDock(): JSX.Element | null {
  const changes         = useAppStore((s) => s.aiChanges)
  const aiPanelOpen     = useAppStore((s) => s.aiPanelOpen)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const aiMessages      = useAppStore((s) => s.aiMessages)

  const items = Object.values(changes).filter((e) =>
    ['proposed', 'applying', 'awaiting-confirmation'].includes(e.record.status) &&
    !(aiPanelOpen && e.chatSessionId === activeSessionId && aiMessages.some((m) => m.changeId === e.record.id)),
  )
  if (items.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[45] w-[360px] max-h-[70vh] overflow-y-auto space-y-2">
      {items.map((e) => (
        <div key={e.record.id} className="rounded-xl shadow-2xl bg-popover">
          <ChangeCard changeId={e.record.id} compact />
        </div>
      ))}
    </div>
  )
}
