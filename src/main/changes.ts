// ARIA change executor. ARIA proposes a change plan; NetCopilot — not the
// model — runs it: snapshot → pre-checks → safety net → apply → verify, then
// waits for the engineer to confirm or roll back. Each step is typed into the
// target terminal by the renderer (`ai:change-step`), so the engineer sees
// exactly what happens on the device.

import { BrowserWindow, IpcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import { getDb } from './db'
import { getSetting } from './store'
import {
  type AriaMode,
  type ChangePlan,
  type ChangeRecord,
  type ChangeStatus,
  type Environment,
  type ExecStep,
  type ExecutionPlan,
  buildExecution,
  changeRecordToMarkdown,
  stripWrappers,
  inMaintenanceWindow,
  looksLikeApplyError,
  normalizePolicy,
  type ChangePolicy,
} from '../shared/changeControl'

const APPROVAL_TIMEOUT_MS   = 15 * 60_000
const CONFIRM_MINUTES       = 5
/** Without a device timer, a change waits this long for confirm / roll back before ARIA stops waiting. */
const UNTIMED_WAIT_MS       = 15 * 60_000
const STEP_TIMEOUT_MS       = 90_000
const SNAPSHOT_TIMEOUT_MS   = 180_000
const OUTPUT_TO_MODEL_CHARS = 6000

export function loadChangePolicy(): ChangePolicy {
  return normalizePolicy(getSetting('ai.changePolicy'))
}

// ── Persistence ──────────────────────────────────────────────────────────────

function saveRecord(r: ChangeRecord, snapshot?: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO change_records (id, connection_id, device_name, host, environment, status, title, data, created_at, updated_at)
    VALUES (@id, @connection_id, @device_name, @host, @environment, @status, @title, @data, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at
  `).run({
    id:            r.id,
    connection_id: r.connectionId ?? null,
    device_name:   r.deviceName,
    host:          r.host,
    environment:   r.environment,
    status:        r.status,
    title:         r.plan.title,
    data:          JSON.stringify(r),
    created_at:    r.createdAt,
    updated_at:    r.updatedAt,
  })
  if (snapshot !== undefined) {
    db.prepare('UPDATE change_records SET snapshot = ? WHERE id = ?').run(snapshot, r.id)
  }
}

function loadRecord(id: string): ChangeRecord | null {
  const row = getDb().prepare('SELECT data FROM change_records WHERE id = ?').get(id) as { data?: string } | undefined
  if (!row?.data) return null
  try { return JSON.parse(row.data) as ChangeRecord } catch { return null }
}

// ── Live state ───────────────────────────────────────────────────────────────

interface Decision {
  action:          'approve' | 'reject' | 'confirm' | 'rollback'
  overrideReason?: string
  note?:           string
}

interface LiveChange {
  record:          ChangeRecord
  execution:       ExecutionPlan
  /** Chat (ARIA conversation) the change belongs to. */
  chatSessionId:   string
  /** Terminal session the steps are typed into. */
  targetSessionId: string
  /** Resolves the current wait (approval or confirmation). */
  waiter?:         (d: Decision | 'timeout' | 'cancelled') => void
  deadlineTimer?:  ReturnType<typeof setTimeout>
  /** Set while commit / rollback steps are running so a second click is ignored. */
  busy:            boolean
}

const live         = new Map<string, LiveChange>()
const pendingSteps = new Map<string, (output: string) => void>()

let getWin: () => BrowserWindow | null = () => null

function emit(c: LiveChange): void {
  c.record.updatedAt = Date.now()
  saveRecord(c.record)
  getWin()?.webContents.send('ai:change-status', {
    chatSessionId:   c.chatSessionId,
    targetSessionId: c.targetSessionId,
    record:          c.record,
    execution:       c.execution,
  })
}

function setStatus(c: LiveChange, status: ChangeStatus, note?: string): void {
  c.record.status = status
  if (note) c.record.outcomeNote = note
  emit(c)
}

function isActiveOn(targetSessionId: string): LiveChange | undefined {
  for (const c of live.values()) {
    if (c.targetSessionId === targetSessionId && ['proposed', 'applying', 'awaiting-confirmation'].includes(c.record.status)) return c
  }
  return undefined
}

// ── Steps ────────────────────────────────────────────────────────────────────

function runStep(c: LiveChange, step: ExecStep, timeoutMs = STEP_TIMEOUT_MS): Promise<string> {
  const win = getWin()
  if (!win) return Promise.resolve('(NetCopilot window is not available)')
  const stepId = randomUUID()
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      if (pendingSteps.delete(stepId)) resolve('(no result from the terminal — step timed out)')
    }, timeoutMs + 5_000)
    pendingSteps.set(stepId, (output) => {
      clearTimeout(timer)
      resolve(output)
    })
    win.webContents.send('ai:change-step', {
      stepId,
      changeId:  c.record.id,
      sessionId: c.targetSessionId,
      phase:     step.phase,
      command:   step.command,
      raw:       step.raw === true,
      replies:   step.replies ?? [],
      timeoutMs,
    })
  }).then((output) => {
    // The snapshot is stored on its own (and never exported in the record).
    const logged = step.phase === 'snapshot' ? `(configuration snapshot: ${output.split('\n').length} lines)` : output.slice(0, 20_000)
    c.record.steps.push({ phase: step.phase, command: step.command, output: logged, at: Date.now() })
    emit(c)
    return output
  })
}

/** Step outputs that mean the terminal never ran the command at all. */
const NOT_RUN = /^\((no result from the terminal|session is not connected|NetCopilot window is not available)/
/** Set by the renderer when the device never came back to its prompt (src/renderer/src/lib/changeRunner.ts). */
const STEP_TIMED_OUT = '(step timed out waiting for the device prompt)'

/** Run steps in order; stop at the first one the device rejects. */
async function runSteps(c: LiveChange, steps: ExecStep[], checkErrors: boolean): Promise<{ ok: boolean; outputs: string[]; failed?: string }> {
  const outputs: string[] = []
  for (const step of steps) {
    const out = await runStep(c, step)
    outputs.push(out)
    if (NOT_RUN.test(out.trim())) return { ok: false, outputs, failed: `${showCmd(step)}: ${out.trim()}` }
    if (out.includes(STEP_TIMED_OUT)) return { ok: false, outputs, failed: `${showCmd(step)}: no prompt from the device` }
    if (checkErrors && !step.diff && looksLikeApplyError(out)) return { ok: false, outputs, failed: showCmd(step) }
  }
  return { ok: true, outputs }
}

function clip(text: string, max = OUTPUT_TO_MODEL_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text
}

function wrapOutput(text: string): string {
  return `<device_output>\n${escapeDeviceOutput(text)}\n</device_output>`
}

/** Keep device text from closing (or opening) our untrusted-data wrapper. */
export function escapeDeviceOutput(text: string): string {
  return text.replace(/<(\/?)device_output/gi, '&lt;$1device_output')
}

const showCmd = (s: ExecStep) => (s.command === '\x18' ? '<Ctrl+X>' : s.command)

function transcript(steps: ExecStep[], outputs: string[]): string {
  return steps.map((s, i) => `> ${showCmd(s)}\n${(outputs[i] ?? '').trim()}`).join('\n\n')
}

// ── Waiting for the engineer ─────────────────────────────────────────────────

function waitForDecision(c: LiveChange, timeoutMs: number, signal?: AbortSignal): Promise<Decision | 'timeout' | 'cancelled'> {
  return new Promise((resolve) => {
    let done = false
    const finish = (d: Decision | 'timeout' | 'cancelled') => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (c.waiter === finish) c.waiter = undefined
      resolve(d)
    }
    const onAbort = () => finish('cancelled')
    const timer   = setTimeout(() => finish('timeout'), timeoutMs)
    signal?.addEventListener('abort', onAbort)
    c.waiter = finish
  })
}

// ── Propose → approve → apply → verify ───────────────────────────────────────

export interface ProposeOptions {
  plan:            ChangePlan
  chatSessionId:   string
  targetSessionId: string
  connectionId?:   string
  deviceName:      string
  host:            string
  deviceType:      string
  environment:     Environment
  mode:            AriaMode
  /** Autopilot on lab / staging gear: no approval click. */
  autoApprove:     boolean
  signal:          AbortSignal
}

/** Runs a proposal up to verification and returns the tool result for the model. */
export async function proposeChange(o: ProposeOptions): Promise<string> {
  const busy = isActiveOn(o.targetSessionId)
  if (busy) {
    return `(rejected: change ${busy.record.id} is still ${busy.record.status} on this device. Finish it with finalize_change before proposing another.)`
  }

  // What the engineer approves is exactly what runs: no stray configure / end / commit.
  o = { ...o, plan: { ...o.plan, changes: stripWrappers(o.deviceType, o.plan.changes), rollback: stripWrappers(o.deviceType, o.plan.rollback) } }
  if (o.plan.changes.length === 0) {
    return '(change plan rejected: after removing configure / commit / end lines nothing is left to apply)'
  }

  const id        = `CHG-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`
  const execution = buildExecution(o.deviceType, o.plan, id, CONFIRM_MINUTES)
  const policy    = loadChangePolicy()
  const now       = Date.now()
  const c: LiveChange = {
    record: {
      id,
      sessionId:     o.chatSessionId,
      connectionId:  o.connectionId,
      deviceName:    o.deviceName,
      host:          o.host,
      deviceType:    o.deviceType,
      environment:   o.environment,
      mode:          o.mode,
      plan:          o.plan,
      safetyNet:     execution.safetyNet,
      status:        'proposed',
      needsOverride: o.environment === 'production' && !inMaintenanceWindow(new Date(), policy.maintenanceWindow),
      steps:         [],
      createdAt:     now,
      updatedAt:     now,
    },
    execution,
    chatSessionId:   o.chatSessionId,
    targetSessionId: o.targetSessionId,
    busy:            false,
  }
  live.set(id, c)
  emit(c)

  // ── Approval ──
  if (o.autoApprove) {
    c.record.approvedBy = 'autopilot'
  } else {
    const d = await waitForDecision(c, APPROVAL_TIMEOUT_MS, o.signal)
    if (d === 'timeout') {
      setStatus(c, 'expired', 'Not approved within 15 minutes.')
      return `Change ${id} expired: the engineer did not approve it within 15 minutes. Nothing was changed on the device.`
    }
    if (d === 'cancelled') {
      setStatus(c, 'rejected', 'Withdrawn: the ARIA request was cancelled.')
      return `Change ${id} was withdrawn. Nothing was changed on the device.`
    }
    if (d.action !== 'approve') {
      setStatus(c, 'rejected', d.note ? `Rejected: ${d.note}` : 'Rejected by the engineer.')
      return `The engineer rejected change ${id}${d.note ? `: "${d.note}"` : ''}. Nothing was changed on the device. Do not re-propose the same plan; ask what they want instead.`
    }
    c.record.approvedBy = 'user'
    if (d.overrideReason) c.record.overrideReason = d.overrideReason
  }

  return applyChange(c)
}

async function applyChange(c: LiveChange): Promise<string> {
  const { execution: x, record: r } = c
  setStatus(c, 'applying')

  // 1. Snapshot — kept in the encrypted app DB, never sent to the model.
  if (x.snapshot) {
    const snap = await runStep(c, x.snapshot, SNAPSHOT_TIMEOUT_MS)
    if (NOT_RUN.test(snap.trim())) {
      setStatus(c, 'failed', `Could not take a configuration snapshot (${snap.trim()}). Nothing was changed.`)
      return `Change ${r.id} stopped before touching the device: the configuration snapshot failed (${snap.trim()}). Nothing was changed.`
    }
    r.snapshotLines = snap.split('\n').length
    saveRecord(r, snap)
    emit(c)
  }

  // 2. Pre-checks (baseline for verification).
  const pre = await runSteps(c, x.prechecks, false)
  if (!pre.ok) {
    setStatus(c, 'failed', `Pre-checks could not run (${pre.failed}). Nothing was changed.`)
    return `Change ${r.id} stopped before touching the device: a pre-check could not run (${pre.failed}). Nothing was changed.`
  }

  // 3. Arm the safety net (Cisco reload timer, NX-OS checkpoint, MikroTik Safe Mode).
  const arm = await runSteps(c, x.arm, true)
  if (!arm.ok) {
    setStatus(c, 'failed', `The safety net could not be armed (${arm.failed}). Nothing was changed.`)
    return `Change ${r.id} stopped before touching the device: arming the safety net failed at "${arm.failed}".\n${wrapOutput(clip(transcript(x.arm, arm.outputs)))}`
  }

  // 4. Apply.
  const apply = await runSteps(c, x.apply, true)
  const diffIdx = x.apply.findIndex((s) => s.diff)
  if (diffIdx >= 0 && apply.outputs[diffIdx] !== undefined) r.diff = apply.outputs[diffIdx].slice(0, 20_000)
  if (!apply.ok) {
    const abort = await runSteps(c, x.abort, false)
    const note  = abort.ok
      ? `The device rejected "${apply.failed}". NetCopilot backed the change out automatically.`
      : `The device rejected "${apply.failed}", and backing out did not complete (${abort.failed}). Check the device now.`
    setStatus(c, 'failed', note)
    return [
      `Change ${r.id} FAILED while applying. ${note}`,
      'Apply transcript:',
      wrapOutput(clip(transcript(x.apply.slice(0, apply.outputs.length), apply.outputs))),
      'Back-out transcript:',
      wrapOutput(clip(transcript(x.abort.slice(0, abort.outputs.length), abort.outputs), 3000)),
      'Explain to the engineer what went wrong. Do not retry automatically.',
    ].join('\n')
  }

  // 5. Verify.
  const verify = await runSteps(c, x.verify, false)

  const timed = ['commit-confirmed', 'session-timer', 'reload-timer'].includes(x.safetyNet.kind)
  if (timed && x.safetyNet.minutes) {
    // The timer started at the arm / commit step; measure from there.
    const armedAt = r.steps.find((s) => /^(reload in|commit confirmed|commit timer)/.test(s.command))?.at ?? Date.now()
    r.deadline = armedAt + x.safetyNet.minutes * 60_000
    c.deadlineTimer = setTimeout(() => onDeadline(c), Math.max(0, r.deadline - Date.now()))
  }
  setStatus(c, 'awaiting-confirmation')

  const until = r.deadline ? new Date(r.deadline).toLocaleTimeString() : null
  return [
    `Change ${r.id} applied on ${r.deviceName}. Safety net: ${x.safetyNet.description}`,
    r.diff ? `Device diff:\n${wrapOutput(clip(r.diff, 4000))}` : '',
    x.prechecks.length ? `Pre-checks (before the change):\n${wrapOutput(clip(transcript(x.prechecks, pre.outputs)))}` : '',
    `Verification (after the change):\n${wrapOutput(clip(transcript(x.verify, verify.outputs)))}`,
    verify.ok ? '' : `Some verification commands could not run (${verify.failed}).`,
    `Status: awaiting confirmation${until ? ` — the device reverts by itself at ${until} unless confirmed` : ''}.`,
    'Compare before and after. Then call finalize_change with decision "confirm" only if verification shows the intended result and nothing regressed; otherwise "rollback". Give your evidence in `note`.',
  ].filter(Boolean).join('\n\n')
}

function onDeadline(c: LiveChange): void {
  if (c.record.status !== 'awaiting-confirmation' || c.busy) return
  const what = c.execution.safetyNet.kind === 'reload-timer'
    ? 'The reload timer fired: the device is rebooting to its saved startup-config.'
    : 'The safety timer expired: the device rolled the change back by itself.'
  c.record.deadline = undefined
  setStatus(c, 'reverted-by-device', what)
  c.waiter?.({ action: 'rollback', note: 'timer expired' })
}

// ── Confirm / roll back ──────────────────────────────────────────────────────

async function finalize(c: LiveChange, action: 'confirm' | 'rollback', by: string): Promise<string> {
  if (c.busy) return `(change ${c.record.id} is already being finalized)`
  if (c.record.status !== 'awaiting-confirmation') return `(change ${c.record.id} is ${c.record.status}; nothing to finalize)`
  c.busy = true
  clearTimeout(c.deadlineTimer)
  setStatus(c, 'applying')
  const steps  = action === 'confirm' ? c.execution.commit : c.execution.rollback
  const result = await runSteps(c, steps, true)
  c.record.deadline = undefined
  c.busy = false
  if (action === 'confirm') {
    if (result.ok) {
      setStatus(c, 'confirmed', `Confirmed by ${by}.`)
      return `Change ${c.record.id} confirmed and made permanent.`
    }
    const timed = ['commit-confirmed', 'session-timer', 'reload-timer'].includes(c.execution.safetyNet.kind)
    setStatus(c, 'failed', `Confirming failed at "${result.failed}".${timed ? ' The device timer may still revert the change — check it now.' : ''}`)
    return `Confirming change ${c.record.id} FAILED at "${result.failed}".\n${wrapOutput(clip(transcript(steps.slice(0, result.outputs.length), result.outputs)))}`
  }
  if (result.ok) {
    setStatus(c, 'rolled-back', `Rolled back by ${by}.`)
    return `Change ${c.record.id} rolled back.`
  }
  setStatus(c, 'failed', `Rollback did not complete ("${result.failed}"). Check the device now.`)
  return `Rolling back change ${c.record.id} FAILED at "${result.failed}". The engineer must check the device.\n${wrapOutput(clip(transcript(steps.slice(0, result.outputs.length), result.outputs)))}`
}

export interface FinalizeOptions {
  changeId:  string
  decision:  'confirm' | 'rollback'
  note:      string
  /** The conversation runs in Autopilot. */
  autopilot: boolean
  signal:    AbortSignal
}

/** finalize_change tool. Rollback always runs; confirm needs the engineer unless autonomous. */
export async function finalizeChange(o: FinalizeOptions): Promise<string> {
  const c = live.get(o.changeId)
  if (!c) return `(unknown change id ${o.changeId})`
  if (c.record.status !== 'awaiting-confirmation') return `(change ${o.changeId} is ${c.record.status}; nothing to finalize)`

  c.record.recommendation = { decision: o.decision, note: o.note.slice(0, 1000) }
  emit(c)

  if (o.decision === 'rollback') return finalize(c, 'rollback', 'ARIA')
  // Autopilot may confirm only what it was allowed to approve (lab / staging).
  if (o.autopilot && c.record.approvedBy === 'autopilot') return finalize(c, 'confirm', 'ARIA (Autopilot)')

  const waitMs = c.record.deadline ? Math.max(0, c.record.deadline - Date.now()) + 2_000 : UNTIMED_WAIT_MS
  const d = await waitForDecision(c, waitMs, o.signal)
  if (d === 'cancelled') return `Recommendation recorded. The engineer will confirm or roll back change ${o.changeId} from the change card.`
  if (d === 'timeout') {
    return (c.record.status as ChangeStatus) === 'reverted-by-device'
      ? `The engineer did not confirm in time; ${c.record.outcomeNote}`
      : `The engineer has not decided yet. Change ${o.changeId} stays applied and awaiting confirmation.`
  }
  // The click itself runs finalize(); report how it ended.
  return reportOutcome(c)
}

async function reportOutcome(c: LiveChange): Promise<string> {
  for (let i = 0; i < 600 && (c.busy || c.record.status === 'applying'); i++) await new Promise((r) => setTimeout(r, 200))
  return `Change ${c.record.id} is now ${c.record.status}.${c.record.outcomeNote ? ` ${c.record.outcomeNote}` : ''}`
}

// ── IPC ──────────────────────────────────────────────────────────────────────

export function setupChangeHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null): void {
  getWin = getWindow

  ipcMain.handle('ai:change-step-result', (_, stepId: string, output: string) => {
    const resolve = pendingSteps.get(stepId)
    if (!resolve) return false
    pendingSteps.delete(stepId)
    resolve(typeof output === 'string' ? output : '')
    return true
  })

  ipcMain.handle('ai:change-decision', async (_, changeId: string, decision: Decision) => {
    const c = live.get(changeId)
    if (!c) return { success: false, error: 'This change is no longer active.' }
    const action = decision?.action
    if (c.record.status === 'proposed') {
      if (action === 'approve') {
        const reason = typeof decision.overrideReason === 'string' ? decision.overrideReason.trim().slice(0, 500) : ''
        if (c.record.needsOverride && reason.length < 5) {
          return { success: false, error: 'Outside the maintenance window — give a reason to approve.' }
        }
        c.waiter?.({ action: 'approve', overrideReason: reason || undefined })
        return { success: true }
      }
      if (action === 'reject') {
        c.waiter?.({ action: 'reject', note: typeof decision.note === 'string' ? decision.note.slice(0, 500) : undefined })
        return { success: true }
      }
    }
    if (c.record.status === 'awaiting-confirmation' && (action === 'confirm' || action === 'rollback')) {
      const waiter = c.waiter
      const done   = finalize(c, action, 'the engineer')
      waiter?.({ action })
      await done
      return { success: true }
    }
    return { success: false, error: `Change is ${c.record.status}.` }
  })

  ipcMain.handle('changes:list', (_, limit?: number) => {
    const n    = Math.min(Math.max(Number(limit) || 200, 1), 1000)
    const rows = getDb().prepare('SELECT data FROM change_records ORDER BY created_at DESC LIMIT ?').all(n) as { data: string }[]
    return rows.flatMap((row) => {
      try { return [JSON.parse(row.data) as ChangeRecord] } catch { return [] }
    })
  })

  ipcMain.handle('changes:get-snapshot', (_, id: string) => {
    const row = getDb().prepare('SELECT snapshot FROM change_records WHERE id = ?').get(id) as { snapshot?: string | null } | undefined
    return row?.snapshot ?? null
  })

  ipcMain.handle('changes:export', async (_, id: string, what: 'record' | 'snapshot' = 'record') => {
    const win = getWindow()
    const r   = loadRecord(id)
    if (!win || !r) return { success: false }
    let content: string
    if (what === 'snapshot') {
      const row = getDb().prepare('SELECT snapshot FROM change_records WHERE id = ?').get(id) as { snapshot?: string | null } | undefined
      if (!row?.snapshot) return { success: false }
      content = row.snapshot
    } else {
      content = changeRecordToMarkdown(r)
    }
    const ext = what === 'snapshot' ? 'txt' : 'md'
    const { filePath } = await dialog.showSaveDialog(win, {
      title:       what === 'snapshot' ? 'Save configuration snapshot' : 'Export change record',
      defaultPath: `${r.id}-${r.deviceName.replace(/[^\w.-]+/g, '_')}${what === 'snapshot' ? '-before' : ''}.${ext}`,
      filters:     [{ name: what === 'snapshot' ? 'Text' : 'Markdown', extensions: [ext] }],
    })
    if (!filePath) return { success: false }
    await writeFile(filePath, content, 'utf-8')
    return { success: true, filePath }
  })

  // A record left 'applying' / 'proposed' by a crash or quit is not live any more.
  try {
    const db = getDb()
    const stale = db.prepare("SELECT data FROM change_records WHERE status IN ('proposed','applying','awaiting-confirmation')").all() as { data: string }[]
    for (const row of stale) {
      try {
        const r = JSON.parse(row.data) as ChangeRecord
        r.status      = r.status === 'proposed' ? 'expired' : 'failed'
        r.outcomeNote = r.status === 'expired'
          ? 'NetCopilot closed before the change was approved.'
          : 'NetCopilot closed while this change was in progress. Check the device: a device timer may have reverted it.'
        r.deadline    = undefined
        r.updatedAt   = Date.now()
        saveRecord(r)
      } catch { /* skip unreadable */ }
    }
  } catch (err) {
    console.warn('[changes] could not close stale records:', err)
  }
}
