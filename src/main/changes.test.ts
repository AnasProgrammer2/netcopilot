import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeRecord } from '../shared/changeControl'

// ── Fakes for Electron, the DB and settings ─────────────────────────────────

const { rows, settings } = vi.hoisted(() => ({
  rows:     new Map<string, { data: string; snapshot?: string | null }>(),
  settings: {} as Record<string, unknown>,
}))

vi.mock('electron', () => ({ dialog: { showSaveDialog: vi.fn() } }))
vi.mock('./store', () => ({ getSetting: (key: string) => settings[key] }))
vi.mock('./db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      run: (arg: Record<string, unknown> | string, id?: string) => {
        if (sql.trim().startsWith('INSERT INTO change_records')) {
          const a = arg as Record<string, string>
          rows.set(a.id, { ...rows.get(a.id), data: a.data })
        } else if (sql.startsWith('UPDATE change_records SET snapshot')) {
          rows.set(id!, { ...rows.get(id!)!, snapshot: arg as string })
        }
      },
      get: (id: string) => rows.get(id),
      all: () => [],
    }),
  }),
}))

const { proposeChange, finalizeChange, setupChangeHandlers } = await import('./changes')

// ── A scripted device behind a fake renderer ────────────────────────────────

type Handler = (...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const typed: string[] = []
const statuses: string[] = []
let device: (command: string) => string = () => 'R1#'

const win = {
  webContents: {
    send: (channel: string, payload: Record<string, unknown>) => {
      if (channel === 'ai:change-status') {
        statuses.push((payload.record as ChangeRecord).status)
      }
      if (channel === 'ai:change-step') {
        typed.push(payload.command as string)
        const out = device(payload.command as string)
        queueMicrotask(() => { void handlers.get('ai:change-step-result')!(null, payload.stepId, out) })
      }
    },
  },
}

setupChangeHandlers({ handle: (ch: string, fn: Handler) => handlers.set(ch, fn) } as never, () => win as never)

const decide = (id: string, d: Record<string, unknown>) =>
  handlers.get('ai:change-decision')!(null, id, d) as Promise<{ success: boolean; error?: string }>

const latest = (): ChangeRecord => JSON.parse([...rows.values()].at(-1)!.data) as ChangeRecord

async function until(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !pred(); i++) await new Promise((r) => setTimeout(r, 5))
  if (!pred()) throw new Error('condition not reached')
}

const base = {
  plan: {
    title: 'Describe uplink', rationale: 'Missing description', risk: 'low' as const,
    affectsManagementPath: false,
    prechecks: ['show interfaces ge-0/0/0 descriptions'],
    changes: ['set interfaces ge-0/0/0 description uplink'],
    verify: ['show interfaces ge-0/0/0 descriptions'],
    rollback: ['delete interfaces ge-0/0/0 description'],
    persist: true,
  },
  chatSessionId: 'chat1', deviceName: 'r1', host: '10.0.0.1',
  deviceType: 'junos', environment: 'production' as const, mode: 'change' as const,
  autoApprove: false,
}

let n = 0
const session = () => `term${++n}` // one active change per terminal

beforeEach(() => {
  typed.length = 0
  statuses.length = 0
  device = (cmd) => (cmd.startsWith('show interfaces') ? 'ge-0/0/0 up up uplink\nuser@r1>' : 'user@r1#')
})

describe('change executor', () => {
  it('applies only after approval, then confirms on the engineer\'s click', async () => {
    const ctrl = new AbortController()
    const result = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
    await until(() => statuses.includes('proposed'))
    expect(typed).toHaveLength(0) // nothing touches the device before approval

    const id = latest().id
    expect(await decide(id, { action: 'approve' })).toEqual({ success: true })
    const text = await result

    expect(typed[0]).toBe('show configuration | display set | no-more') // snapshot first
    expect(typed).toContain('set interfaces ge-0/0/0 description uplink')
    expect(typed.some((c) => c.startsWith('commit confirmed 5'))).toBe(true)
    expect(text).toContain('awaiting confirmation')
    expect(text).toContain('<device_output>')
    expect(latest().status).toBe('awaiting-confirmation')
    expect(latest().deadline).toBeGreaterThan(Date.now())
    expect(rows.get(id)?.snapshot).toContain('user@r1')
    expect(latest().steps[0].output).toMatch(/^\(configuration snapshot/) // not kept in the record

    // ARIA recommends confirm; the engineer's click makes it final.
    const fin = finalizeChange({ changeId: id, decision: 'confirm', note: 'verified', autopilot: false, signal: ctrl.signal })
    await until(() => latest().recommendation?.decision === 'confirm')
    expect(latest().status).toBe('awaiting-confirmation')
    await decide(id, { action: 'confirm' })
    expect(await fin).toContain('confirmed')
    expect(latest().status).toBe('confirmed')
    expect(typed.at(-2)).toMatch(/^commit comment/)
  })

  it('needs a reason to approve a production change outside the maintenance window', async () => {
    // A window that is never open: no days selected.
    settings['ai.changePolicy'] = { productionMaxMode: 'change', maintenanceWindow: { enabled: true, days: [], start: '01:00', end: '02:00' } }
    try {
      const ctrl = new AbortController()
      const p = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
      await until(() => statuses.includes('proposed'))
      const id = latest().id
      expect(latest().needsOverride).toBe(true)
      expect((await decide(id, { action: 'approve' })).success).toBe(false)
      expect(typed).toHaveLength(0)
      await decide(id, { action: 'approve', overrideReason: 'P1 outage INC-42' })
      await p
      expect(latest().overrideReason).toBe('P1 outage INC-42')
      expect(latest().status).toBe('awaiting-confirmation')
    } finally {
      delete settings['ai.changePolicy']
    }
  })

  it('records a rejection and leaves the device alone', async () => {
    const ctrl = new AbortController()
    const p = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
    await until(() => statuses.includes('proposed'))
    await decide(latest().id, { action: 'reject', note: 'not now' })
    expect(await p).toContain('rejected')
    expect(latest().status).toBe('rejected')
    expect(typed).toHaveLength(0)
  })

  it('backs out automatically when the device rejects a line', async () => {
    device = (cmd) => cmd.includes('bogus')
      ? "set interfaces bogus\n         ^\nsyntax error.\n[edit]\nuser@r1#"
      : 'user@r1#'
    const ctrl = new AbortController()
    const p = proposeChange({
      ...base, targetSessionId: session(), signal: ctrl.signal,
      plan: { ...base.plan, changes: ['set interfaces bogus', 'set interfaces ge-0/0/1 disable'] },
    })
    await until(() => statuses.includes('proposed'))
    await decide(latest().id, { action: 'approve' })
    const text = await p
    expect(text).toContain('FAILED')
    expect(typed).not.toContain('set interfaces ge-0/0/1 disable') // stops at the first error
    expect(typed).toContain('rollback 0')                          // discards the candidate
    expect(typed.some((c) => c.startsWith('commit confirmed'))).toBe(false)
    expect(latest().status).toBe('failed')
  })

  it('does not touch the device when the session is gone', async () => {
    device = () => '(session is not connected)'
    const ctrl = new AbortController()
    const p = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
    await until(() => statuses.includes('proposed'))
    await decide(latest().id, { action: 'approve' })
    expect(await p).toContain('Nothing was changed')
    expect(typed).toHaveLength(1) // only the snapshot attempt
  })

  it('Autopilot approves and confirms on lab gear without clicks', async () => {
    const ctrl = new AbortController()
    const target = session()
    const text = await proposeChange({ ...base, environment: 'lab', mode: 'autopilot', autoApprove: true, targetSessionId: target, signal: ctrl.signal })
    expect(text).toContain('awaiting confirmation')
    const id = latest().id
    expect(latest().approvedBy).toBe('autopilot')
    expect(await finalizeChange({ changeId: id, decision: 'confirm', note: 'ok', autopilot: true, signal: ctrl.signal })).toContain('confirmed')
  })

  it('rolls back immediately when ARIA recommends it, and allows one change per device', async () => {
    const ctrl = new AbortController()
    const target = session()
    const p = proposeChange({ ...base, targetSessionId: target, signal: ctrl.signal })
    await until(() => statuses.includes('proposed'))
    const id = latest().id
    expect(await proposeChange({ ...base, targetSessionId: target, signal: ctrl.signal })).toContain('still proposed')
    await decide(id, { action: 'approve' })
    await p
    const out = await finalizeChange({ changeId: id, decision: 'rollback', note: 'BGP dropped', autopilot: false, signal: ctrl.signal })
    expect(out).toContain('rolled back')
    expect(typed).toContain('rollback 1')
    expect(latest().status).toBe('rolled-back')
  })

  it('marks the change reverted when the device timer runs out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      const ctrl = new AbortController()
      const p = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
      await vi.waitUntil(() => statuses.includes('proposed'))
      await decide(latest().id, { action: 'approve' })
      await p
      expect(latest().status).toBe('awaiting-confirmation')
      vi.advanceTimersByTime(5 * 60_000 + 1000)
      expect(latest().status).toBe('reverted-by-device')
    } finally {
      vi.useRealTimers()
    }
  })

  it('withdraws a proposal when the ARIA request is cancelled', async () => {
    const ctrl = new AbortController()
    const p = proposeChange({ ...base, targetSessionId: session(), signal: ctrl.signal })
    await until(() => statuses.includes('proposed'))
    ctrl.abort()
    expect(await p).toContain('withdrawn')
    expect(typed).toHaveLength(0)
  })
})
