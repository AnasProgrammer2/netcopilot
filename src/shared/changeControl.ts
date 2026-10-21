// ARIA change control — modes, environments, change plans and the per-vendor
// safety nets used to apply them. Pure logic shared by main, renderer and tests.
//
// The model never changes a device directly: run_command is read-only in every
// mode, and every state change goes through a change plan that the user
// approves (or, in Autopilot on lab/staging gear, that is approved
// automatically). Approved plans are executed by NetCopilot, not by the model:
// config snapshot → pre-checks → safety net → apply → verify → confirm or roll back.

import { hasUnsafeCharacters, isBlacklisted, isInspectionCommand } from './aiPolicy'

export { isHeavyReadOnly, isInspectionCommand } from './aiPolicy'

export type Environment = 'production' | 'staging' | 'lab'
export type AriaMode    = 'investigate' | 'change' | 'autopilot'
export type ChangeRisk  = 'low' | 'medium' | 'high'

export const ENVIRONMENTS: Environment[] = ['production', 'staging', 'lab']

export function normalizeEnvironment(value: unknown): Environment {
  return value === 'staging' || value === 'lab' ? value : 'production'
}

export function normalizeMode(value: unknown): AriaMode {
  return value === 'change' || value === 'autopilot' ? value : 'investigate'
}

// ── Policy ───────────────────────────────────────────────────────────────────

export interface MaintenanceWindow {
  enabled: boolean
  /** Days the window opens on, 0 = Sunday … 6 = Saturday (local time). */
  days:    number[]
  /** "HH:MM" local time. A window may cross midnight (start > end). */
  start:   string
  end:     string
}

export interface ChangePolicy {
  /** Highest ARIA mode allowed on production devices. */
  productionMaxMode: 'investigate' | 'change'
  /** Production changes outside this window need an explicit override reason. */
  maintenanceWindow: MaintenanceWindow
}

export const DEFAULT_CHANGE_POLICY: ChangePolicy = {
  productionMaxMode: 'change',
  maintenanceWindow: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '06:00' },
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function normalizePolicy(value: unknown): ChangePolicy {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ChangePolicy>
  const w = (v.maintenanceWindow && typeof v.maintenanceWindow === 'object' ? v.maintenanceWindow : {}) as Partial<MaintenanceWindow>
  const days = Array.isArray(w.days)
    ? [...new Set(w.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : DEFAULT_CHANGE_POLICY.maintenanceWindow.days
  return {
    productionMaxMode: v.productionMaxMode === 'investigate' ? 'investigate' : 'change',
    maintenanceWindow: {
      enabled: w.enabled === true,
      days,
      start: typeof w.start === 'string' && HHMM.test(w.start) ? w.start : DEFAULT_CHANGE_POLICY.maintenanceWindow.start,
      end:   typeof w.end === 'string' && HHMM.test(w.end) ? w.end : DEFAULT_CHANGE_POLICY.maintenanceWindow.end,
    },
  }
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** True when `now` (local time) falls inside the maintenance window. */
export function inMaintenanceWindow(now: Date, w: MaintenanceWindow): boolean {
  if (!w.enabled) return true
  const start = minutesOf(w.start)
  const end   = minutesOf(w.end)
  const cur   = now.getHours() * 60 + now.getMinutes()
  const day   = now.getDay()
  if (start === end) return w.days.includes(day) // whole day
  if (start < end) return w.days.includes(day) && cur >= start && cur < end
  // Overnight window: the part after midnight belongs to the previous day's window.
  if (cur >= start) return w.days.includes(day)
  if (cur < end) return w.days.includes((day + 6) % 7)
  return false
}

export interface ModeResolution {
  mode: AriaMode
  /** Why the requested mode was lowered, for the UI and the model. */
  note?: string
}

/** The mode ARIA actually runs in for a device, after environment and policy limits. */
export function resolveMode(requested: AriaMode, env: Environment, policy: ChangePolicy): ModeResolution {
  if (env !== 'production') return { mode: requested }
  if (policy.productionMaxMode === 'investigate' && requested !== 'investigate') {
    return { mode: 'investigate', note: 'Changes on production devices are disabled by your change policy.' }
  }
  if (requested === 'autopilot') {
    return { mode: 'change', note: 'Autopilot is only available on lab and staging devices — every production change needs your approval.' }
  }
  return { mode: requested }
}

// ── Change plans ─────────────────────────────────────────────────────────────

export interface ChangePlan {
  title:                  string
  rationale:              string
  risk:                   ChangeRisk
  affectsManagementPath:  boolean
  prechecks:              string[]
  changes:                string[]
  verify:                 string[]
  rollback:               string[]
  /** Cisco IOS family: save to startup-config after a successful verify. */
  persist:                boolean
}

const MAX_CHANGES   = 60
const MAX_CHECKS    = 10
const MAX_CMD_CHARS = 500

function stringList(value: unknown, field: string, max: number, required: boolean): string[] | string {
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) return `${field} must be an array of commands.`
  const list = value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
  if (required && list.length === 0) return `${field} must contain at least one command.`
  if (list.length > max) return `${field} has more than ${max} commands — split the change.`
  for (const cmd of list) {
    if (cmd.length > MAX_CMD_CHARS) return `A command in ${field} is longer than ${MAX_CMD_CHARS} characters.`
    if (hasUnsafeCharacters(cmd)) return `A command in ${field} contains control or invisible characters.`
  }
  return list
}

export function validateChangePlan(
  input:     unknown,
  blacklist: string[],
): { ok: true; plan: ChangePlan } | { ok: false; error: string } {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const title = typeof v.title === 'string' ? v.title.trim().slice(0, 140) : ''
  if (!title) return { ok: false, error: 'title is required.' }
  const rationale = typeof v.rationale === 'string' ? v.rationale.trim().slice(0, 2000) : ''
  if (!rationale) return { ok: false, error: 'rationale is required — explain the evidence for this change.' }

  const lists: Record<'prechecks' | 'changes' | 'verify' | 'rollback', string[]> = { prechecks: [], changes: [], verify: [], rollback: [] }
  for (const [field, max, required] of [
    ['prechecks', MAX_CHECKS, false],
    ['changes', MAX_CHANGES, true],
    ['verify', MAX_CHECKS, true],
    ['rollback', MAX_CHANGES, true],
  ] as const) {
    const result = stringList(v[field], field, max, required)
    if (typeof result === 'string') return { ok: false, error: result }
    lists[field] = result
  }

  for (const cmd of [...lists.prechecks, ...lists.verify]) {
    if (!isInspectionCommand(cmd)) {
      return { ok: false, error: `Pre-check and verify commands must be read-only: "${cmd}"` }
    }
  }
  for (const cmd of [...lists.changes, ...lists.rollback]) {
    if (isBlacklisted(cmd, blacklist)) {
      return { ok: false, error: `"${cmd}" is on the blocked-commands list and cannot be part of a change plan.` }
    }
  }

  const risk: ChangeRisk = v.risk === 'low' || v.risk === 'high' ? v.risk : 'medium'
  return {
    ok: true,
    plan: {
      title,
      rationale,
      risk,
      affectsManagementPath: v.affects_management_path === true,
      ...lists,
      persist: v.persist !== false,
    },
  }
}

// ── Execution recipes ────────────────────────────────────────────────────────

export type StepPhase = 'snapshot' | 'precheck' | 'arm' | 'apply' | 'verify' | 'commit' | 'rollback'

/** Answer an interactive prompt the device prints while a step runs. */
export interface PromptReply {
  /** Regular-expression source matched against the step's output. */
  when: string
  /** Text to send (followed by Enter). Empty string = just Enter. */
  send: string
}

export interface ExecStep {
  phase:    StepPhase
  command:  string
  /** Send exactly these bytes, no Enter (e.g. MikroTik Ctrl+X). Executor-only. */
  raw?:     boolean
  replies?: PromptReply[]
  /** The step's output is the device-generated config diff. */
  diff?:    boolean
}

export type SafetyNetKind = 'commit-confirmed' | 'session-timer' | 'reload-timer' | 'safe-mode' | 'checkpoint' | 'none'

export interface SafetyNet {
  kind:        SafetyNetKind
  /** Device rolls itself back after this many minutes unless confirmed. */
  minutes?:    number
  description: string
  warning?:    string
}

export interface ExecutionPlan {
  safetyNet: SafetyNet
  snapshot:  ExecStep | null
  prechecks: ExecStep[]
  arm:       ExecStep[]
  apply:     ExecStep[]
  verify:    ExecStep[]
  /** Make the change permanent / cancel the safety timer. */
  commit:    ExecStep[]
  /** Undo a change that was applied (after apply succeeded). */
  rollback:  ExecStep[]
  /** Back out when an apply step fails part-way (before the change is complete). */
  abort:     ExecStep[]
}

const SNAPSHOT_COMMANDS: Record<string, string> = {
  'cisco-ios':   'show running-config',
  'cisco-iosxe': 'show running-config',
  'cisco-nxos':  'show running-config',
  'cisco-asa':   'show running-config',
  'junos':       'show configuration | display set | no-more',
  'arista-eos':  'show running-config',
  'panos':       'show config running',
  'fortios':     'show',
  'huawei-vrp':  'display current-configuration',
  'nokia-sros':  'admin display-config',
  'mikrotik':    '/export',
  'hp-procurve': 'show running-config',
  'f5-tmos':     'list ltm',
}

// Config-mode wrappers the executor adds itself; strip them from model output
// so a plan can't leave the device in an unexpected mode or commit early.
const WRAPPER_LINES: Record<string, RegExp> = {
  'junos':       /^(configure( exclusive| private)?|edit|top|exit|quit|commit\b.*|rollback\b.*)$/i,
  'arista-eos':  /^(conf(igure)?( t(erminal)?)?|configure session.*|end|exit|commit.*|abort)$/i,
  'cisco-ios':   /^(conf(igure)?( t(erminal)?)?|end)$/i,
  'cisco-iosxe': /^(conf(igure)?( t(erminal)?)?|end)$/i,
  'cisco-nxos':  /^(conf(igure)?( t(erminal)?)?|end)$/i,
}

/** Drop config-mode wrappers (configure / end / commit …) the executor adds itself. */
export function stripWrappers(deviceType: string, commands: string[]): string[] {
  const wrapper = WRAPPER_LINES[deviceType]
  return wrapper ? commands.filter((c) => !wrapper.test(c.trim())) : commands
}

const steps = (phase: StepPhase, commands: string[], extra: Partial<ExecStep> = {}): ExecStep[] =>
  commands.map((command) => ({ phase, command, ...extra }))

/**
 * How NetCopilot applies an approved plan on a given platform. Each recipe
 * uses the platform's own rollback mechanism where it has one, so that losing
 * the session mid-change (the classic lockout) rolls the device back by itself.
 */
export function buildExecution(deviceType: string, plan: ChangePlan, changeId: string, minutes = 5): ExecutionPlan {
  // Session / checkpoint name: the change ID's date + random part (unique per change).
  const tag      = `nc${changeId.replace(/[^a-zA-Z0-9]/g, '').replace(/^CHG/i, '').slice(-12)}`
  const changes  = stripWrappers(deviceType, plan.changes)
  const rollback = stripWrappers(deviceType, plan.rollback)
  const snapshotCmd = SNAPSHOT_COMMANDS[deviceType]
  const base = {
    snapshot:  snapshotCmd ? { phase: 'snapshot' as const, command: snapshotCmd } : null,
    prechecks: steps('precheck', plan.prechecks),
    verify:    steps('verify', plan.verify),
  }

  switch (deviceType) {
    case 'junos':
      return {
        ...base,
        safetyNet: {
          kind: 'commit-confirmed', minutes,
          description: `commit confirmed ${minutes} — Junos rolls back by itself unless NetCopilot confirms after verification.`,
        },
        arm:   [],
        apply: [
          { phase: 'apply', command: 'configure' },
          ...steps('apply', changes),
          { phase: 'apply', command: 'top' },
          { phase: 'apply', command: 'show | compare | no-more', diff: true },
          { phase: 'apply', command: `commit confirmed ${minutes} comment "NetCopilot ${tag}"` },
          { phase: 'apply', command: 'exit configuration-mode' },
        ],
        commit: [
          { phase: 'commit', command: 'configure' },
          { phase: 'commit', command: `commit comment "NetCopilot ${tag} confirmed"` },
          { phase: 'commit', command: 'exit configuration-mode' },
        ],
        // `rollback 1` is the configuration before the `commit confirmed`.
        rollback: [
          { phase: 'rollback', command: 'configure' },
          { phase: 'rollback', command: 'rollback 1' },
          { phase: 'rollback', command: `commit comment "NetCopilot ${tag} rolled back"` },
          { phase: 'rollback', command: 'exit configuration-mode' },
        ],
        // Nothing was committed yet: discard the candidate.
        abort: [
          { phase: 'rollback', command: 'top' },
          { phase: 'rollback', command: 'rollback 0' },
          { phase: 'rollback', command: 'exit configuration-mode' },
        ],
      }

    case 'arista-eos': {
      const mm = String(minutes).padStart(2, '0')
      return {
        ...base,
        safetyNet: {
          kind: 'session-timer', minutes,
          description: `Config session with commit timer ${minutes} min — EOS reverts by itself unless NetCopilot confirms.`,
        },
        arm:   [],
        apply: [
          { phase: 'apply', command: `configure session ${tag}` },
          ...steps('apply', changes),
          { phase: 'apply', command: 'show session-config diffs', diff: true },
          { phase: 'apply', command: `commit timer 00:${mm}:00` },
        ],
        commit:   [{ phase: 'commit', command: `configure session ${tag} commit` }],
        rollback: [{ phase: 'rollback', command: `configure session ${tag} abort` }],
        // Still inside the uncommitted session: drop it.
        abort:    [{ phase: 'rollback', command: 'abort' }],
      }
    }

    case 'cisco-ios':
    case 'cisco-iosxe': {
      const enter = { phase: 'apply' as const, command: 'configure terminal' }
      const leave = { phase: 'apply' as const, command: 'end' }
      const persist = plan.persist
        ? [{ phase: 'commit' as const, command: 'write memory', replies: [{ when: '\\[confirm\\]', send: '' }] }]
        : []
      const rollbackSteps: ExecStep[] = [
        { phase: 'rollback', command: 'configure terminal' },
        ...steps('rollback', rollback),
        { phase: 'rollback', command: 'end' },
      ]
      if (plan.affectsManagementPath) {
        return {
          ...base,
          safetyNet: {
            kind: 'reload-timer', minutes,
            description: `reload in ${minutes} — if the change cuts NetCopilot off, the device reboots to its saved startup-config.`,
            warning: 'Any unsaved changes made before this one would also be lost if the timer fires.',
          },
          arm: [{
            phase: 'arm', command: `reload in ${minutes}`,
            replies: [
              { when: 'Save\\?\\s*\\[yes/no\\]', send: 'no' },
              { when: 'Proceed with reload\\?\\s*\\[confirm\\]', send: '' },
            ],
          }],
          apply:    [enter, ...steps('apply', changes), leave],
          commit:   [{ phase: 'commit', command: 'reload cancel' }, ...persist],
          rollback: [...rollbackSteps, { phase: 'rollback', command: 'reload cancel' }],
          abort:    [{ phase: 'rollback', command: 'end' }, ...rollbackSteps, { phase: 'rollback', command: 'reload cancel' }],
        }
      }
      return {
        ...base,
        safetyNet: {
          kind: 'none',
          description: 'Running-config snapshot plus the plan\'s rollback commands. Saved to startup-config only after verification.',
        },
        arm: [],
        apply: [enter, ...steps('apply', changes), leave],
        commit: persist,
        rollback: rollbackSteps,
        abort:    [{ phase: 'rollback', command: 'end' }, ...rollbackSteps],
      }
    }

    case 'cisco-nxos':
      return {
        ...base,
        safetyNet: {
          kind: 'checkpoint',
          description: `Checkpoint ${tag} before the change — rollback restores it exactly.`,
          warning: plan.affectsManagementPath ? 'NX-OS has no automatic timer: if the change cuts the session, recover from the console.' : undefined,
        },
        arm:      [{ phase: 'arm', command: `checkpoint ${tag}` }],
        apply:    [{ phase: 'apply', command: 'configure terminal' }, ...steps('apply', changes), { phase: 'apply', command: 'end' }],
        commit:   [{ phase: 'commit', command: `copy running-config startup-config` }],
        rollback: [{ phase: 'rollback', command: `rollback running-config checkpoint ${tag}` }],
        abort:    [{ phase: 'rollback', command: 'end' }, { phase: 'rollback', command: `rollback running-config checkpoint ${tag}` }],
      }

    case 'mikrotik':
      return {
        ...base,
        safetyNet: {
          kind: 'safe-mode',
          description: 'RouterOS Safe Mode — if the session drops, the router undoes the change by itself.',
        },
        arm:      [{ phase: 'arm', command: '\x18', raw: true }],
        apply:    steps('apply', changes),
        commit:   [{ phase: 'commit', command: '\x18', raw: true }],
        rollback: [...steps('rollback', rollback), { phase: 'rollback', command: '\x18', raw: true }],
        abort:    [...steps('rollback', rollback), { phase: 'rollback', command: '\x18', raw: true }],
      }

    default:
      return {
        ...base,
        safetyNet: {
          kind: 'none',
          description: base.snapshot
            ? 'Configuration snapshot plus the plan\'s rollback commands.'
            : 'The plan\'s rollback commands (no automatic snapshot on this platform).',
          warning: plan.affectsManagementPath ? 'This platform has no automatic timer: if the change cuts the session, recover from the console.' : undefined,
        },
        arm:      [],
        apply:    steps('apply', changes),
        commit:   [],
        rollback: steps('rollback', rollback),
        abort:    steps('rollback', rollback),
      }
  }
}

// ── Error detection while applying ───────────────────────────────────────────

const APPLY_ERRORS = [
  /^%\s*(invalid|incomplete|ambiguous|unknown|error)/im,
  /\bsyntax error\b/i,
  /\berror:/i,
  /\bcommit failed\b/i,
  /\bconfiguration check-out failed\b/i,
  /\bfailure:/i,
  /^\s*\^\s*$/m,               // caret marker under an invalid token
  /\bbad command\b/i,
  /\bexpected end of command\b/i,
  /\bunrecognized command\b/i,
]

/** True when a device rejected an apply-phase command. */
export function looksLikeApplyError(output: string): boolean {
  return APPLY_ERRORS.some((re) => re.test(output))
}

// ── Change records ───────────────────────────────────────────────────────────

export type ChangeStatus =
  | 'proposed' | 'rejected' | 'expired'
  | 'applying' | 'awaiting-confirmation'
  | 'confirmed' | 'rolled-back' | 'failed' | 'reverted-by-device'

export interface ChangeStepLog {
  phase:   StepPhase
  command: string
  output:  string
  at:      number
}

export interface ChangeRecord {
  id:            string
  sessionId:     string
  connectionId?: string
  deviceName:    string
  host:          string
  deviceType:    string
  environment:   Environment
  mode:          AriaMode
  plan:          ChangePlan
  safetyNet:     SafetyNet
  status:        ChangeStatus
  approvedBy?:   'user' | 'autopilot'
  overrideReason?: string
  /** Lines in the pre-change config snapshot (the text is kept in the encrypted app DB). */
  snapshotLines?: number
  diff?:         string
  /** While awaiting confirmation: when a timer-based safety net reverts the device (epoch ms). */
  deadline?:     number
  /** Production change outside the maintenance window — approval needs a reason. */
  needsOverride?: boolean
  /** ARIA's verdict after verification. */
  recommendation?: { decision: 'confirm' | 'rollback'; note: string }
  steps:         ChangeStepLog[]
  outcomeNote?:  string
  createdAt:     number
  updatedAt:     number
}

/** Human-readable change record, e.g. for a CAB ticket. */
export function changeRecordToMarkdown(r: ChangeRecord): string {
  const ts = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const list = (items: string[]) => (items.length ? items.map((c) => `    ${c}`).join('\n') : '    (none)')
  const lines = [
    `# Change ${r.id} — ${r.plan.title}`,
    '',
    `- **Device:** ${r.deviceName} (${r.host}, ${r.deviceType})`,
    `- **Environment:** ${r.environment}`,
    `- **Status:** ${r.status}`,
    `- **Risk:** ${r.plan.risk}${r.plan.affectsManagementPath ? ' — touches the management path' : ''}`,
    `- **Approved by:** ${r.approvedBy ?? '—'}${r.overrideReason ? ` (outside maintenance window: ${r.overrideReason})` : ''}`,
    `- **Safety net:** ${r.safetyNet.description}`,
    `- **Created:** ${ts(r.createdAt)} · **Updated:** ${ts(r.updatedAt)}`,
    r.snapshotLines ? `- **Config snapshot:** ${r.snapshotLines} lines, stored in NetCopilot` : '',
    '',
    '## Rationale',
    r.plan.rationale,
    '',
    '## Changes',
    list(r.plan.changes),
    '',
    '## Verification',
    list(r.plan.verify),
    '',
    '## Rollback',
    list(r.plan.rollback),
  ]
  if (r.diff) lines.push('', '## Device diff', '```', r.diff.trim(), '```')
  if (r.recommendation) lines.push('', '## ARIA verdict', `${r.recommendation.decision}: ${r.recommendation.note}`)
  if (r.outcomeNote) lines.push('', '## Outcome', r.outcomeNote)
  if (r.steps.length) {
    lines.push('', '## Execution log')
    for (const s of r.steps) {
      lines.push('', `**[${s.phase}] ${s.command === '\x18' ? '<Ctrl+X>' : s.command}** — ${ts(s.at)}`, '```', s.output.trim().slice(0, 4000), '```')
    }
  }
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') + '\n'
}
