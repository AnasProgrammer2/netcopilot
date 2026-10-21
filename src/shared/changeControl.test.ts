import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHANGE_POLICY,
  buildExecution,
  changeRecordToMarkdown,
  inMaintenanceWindow,
  looksLikeApplyError,
  normalizeEnvironment,
  normalizeMode,
  normalizePolicy,
  resolveMode,
  validateChangePlan,
  type ChangePlan,
  type ChangeRecord,
  type MaintenanceWindow,
} from './changeControl'

const BL = ['reload', 'write erase', 'shutdown']

const plan = (over: Partial<ChangePlan> = {}): ChangePlan => ({
  title: 'Set uplink description',
  rationale: 'Description is missing on the uplink.',
  risk: 'low',
  affectsManagementPath: false,
  prechecks: ['show interfaces Ethernet1 description'],
  changes: ['interface Ethernet1', 'description uplink-to-core'],
  verify: ['show interfaces Ethernet1 description'],
  rollback: ['interface Ethernet1', 'no description'],
  persist: true,
  ...over,
})

describe('normalizers', () => {
  it('default to the safe side', () => {
    expect(normalizeEnvironment(undefined)).toBe('production')
    expect(normalizeEnvironment('LAB')).toBe('production')
    expect(normalizeEnvironment('lab')).toBe('lab')
    expect(normalizeMode('auto-pilot')).toBe('investigate')
    expect(normalizeMode('autopilot')).toBe('autopilot')
  })

  it('normalizes a stored policy', () => {
    expect(normalizePolicy(null)).toEqual(DEFAULT_CHANGE_POLICY)
    const p = normalizePolicy({
      productionMaxMode: 'autopilot',
      maintenanceWindow: { enabled: true, days: [5, 9, 1, 1, 'x'], start: '25:00', end: '04:30' },
    })
    expect(p.productionMaxMode).toBe('change')
    expect(p.maintenanceWindow).toEqual({ enabled: true, days: [1, 5], start: '00:00', end: '04:30' })
  })
})

describe('resolveMode', () => {
  const policy = DEFAULT_CHANGE_POLICY

  it('never runs Autopilot on production', () => {
    const r = resolveMode('autopilot', 'production', policy)
    expect(r.mode).toBe('change')
    expect(r.note).toBeTruthy()
  })

  it('keeps the requested mode on lab and staging', () => {
    expect(resolveMode('autopilot', 'lab', policy)).toEqual({ mode: 'autopilot' })
    expect(resolveMode('autopilot', 'staging', policy)).toEqual({ mode: 'autopilot' })
    expect(resolveMode('change', 'production', policy)).toEqual({ mode: 'change' })
  })

  it('locks production to Investigate when the policy says so', () => {
    const locked = { ...policy, productionMaxMode: 'investigate' as const }
    expect(resolveMode('change', 'production', locked).mode).toBe('investigate')
    expect(resolveMode('autopilot', 'production', locked).mode).toBe('investigate')
    expect(resolveMode('change', 'lab', locked).mode).toBe('change')
  })
})

describe('inMaintenanceWindow', () => {
  // 2026-10-20 is a Tuesday (day 2).
  const at = (day: number, hh: number, mm = 0) => new Date(2026, 9, 18 + day, hh, mm)
  const w = (over: Partial<MaintenanceWindow>): MaintenanceWindow => ({ enabled: true, days: [2], start: '01:00', end: '05:00', ...over })

  it('is always open when disabled', () => {
    expect(inMaintenanceWindow(at(2, 14), w({ enabled: false }))).toBe(true)
  })

  it('checks day and time for a same-day window', () => {
    expect(inMaintenanceWindow(at(2, 3), w({}))).toBe(true)
    expect(inMaintenanceWindow(at(2, 5), w({}))).toBe(false)
    expect(inMaintenanceWindow(at(3, 3), w({}))).toBe(false)
  })

  it('handles a window that crosses midnight', () => {
    const night = w({ days: [5], start: '22:00', end: '04:00' }) // Friday night
    expect(inMaintenanceWindow(at(5, 23), night)).toBe(true)
    expect(inMaintenanceWindow(at(6, 3, 59), night)).toBe(true) // Saturday early morning
    expect(inMaintenanceWindow(at(6, 4), night)).toBe(false)
    expect(inMaintenanceWindow(at(5, 3), night)).toBe(false) // Friday early morning belongs to Thursday
  })
})

describe('validateChangePlan', () => {
  const input = {
    title: 'Fix', rationale: 'Because', risk: 'low', affects_management_path: false,
    prechecks: ['show ip interface brief'], changes: ['interface Gi0/1', 'description x'],
    verify: ['show interfaces Gi0/1 description'], rollback: ['interface Gi0/1', 'no description'],
  }

  it('accepts a complete plan', () => {
    const r = validateChangePlan(input, BL)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.plan.persist).toBe(true)
      expect(r.plan.affectsManagementPath).toBe(false)
    }
  })

  it('requires changes, verify and rollback', () => {
    for (const field of ['changes', 'verify', 'rollback']) {
      const r = validateChangePlan({ ...input, [field]: [] }, BL)
      expect(r.ok, field).toBe(false)
    }
    expect(validateChangePlan({ ...input, title: ' ' }, BL).ok).toBe(false)
    expect(validateChangePlan({ ...input, rationale: undefined }, BL).ok).toBe(false)
  })

  it('keeps pre-checks and verify read-only', () => {
    expect(validateChangePlan({ ...input, verify: ['clear ip bgp *'] }, BL).ok).toBe(false)
    expect(validateChangePlan({ ...input, prechecks: ['show run | redirect flash:x'] }, BL).ok).toBe(false)
  })

  it('screens changes and rollback against the blocked list', () => {
    expect(validateChangePlan({ ...input, changes: ['interface Gi0/1', 'shutdown'] }, BL).ok).toBe(false)
    expect(validateChangePlan({ ...input, rollback: ['rel'] }, BL).ok).toBe(false)
  })

  it('rejects control characters and oversized plans', () => {
    expect(validateChangePlan({ ...input, changes: ['description x\x7f'] }, BL).ok).toBe(false)
    expect(validateChangePlan({ ...input, changes: Array.from({ length: 61 }, (_, i) => `vlan ${i}`) }, BL).ok).toBe(false)
  })
})

describe('buildExecution', () => {
  it('Junos: commit confirmed, discard on failure, rollback 1 after commit', () => {
    const x = buildExecution('junos', plan({ changes: ['configure', 'set interfaces ge-0/0/0 description x', 'commit'] }), 'CHG-1', 5)
    expect(x.safetyNet.kind).toBe('commit-confirmed')
    const apply = x.apply.map((s) => s.command)
    expect(apply[0]).toBe('configure')
    expect(apply).toContain('set interfaces ge-0/0/0 description x')
    // The model's own configure/commit lines are stripped.
    expect(apply.filter((c) => c === 'configure')).toHaveLength(1)
    expect(apply.some((c) => c.startsWith('commit confirmed 5'))).toBe(true)
    expect(apply.filter((c) => c === 'commit')).toHaveLength(0)
    expect(x.apply.find((s) => s.diff)?.command).toMatch(/^show \| compare/)
    expect(x.abort.map((s) => s.command)).toContain('rollback 0')
    expect(x.rollback.map((s) => s.command)).toContain('rollback 1')
  })

  it('Arista: config session with commit timer', () => {
    const x = buildExecution('arista-eos', plan(), 'CHG-261020-A1B2C3', 5)
    expect(x.safetyNet.kind).toBe('session-timer')
    expect(x.apply[0].command).toBe('configure session nc261020A1B2C3')
    expect(x.apply.at(-1)?.command).toBe('commit timer 00:05:00')
    expect(x.commit[0].command).toBe('configure session nc261020A1B2C3 commit')
    expect(x.rollback[0].command).toBe('configure session nc261020A1B2C3 abort')
    expect(x.abort[0].command).toBe('abort')
  })

  it('Cisco IOS: reload timer only when the management path is touched', () => {
    const plain = buildExecution('cisco-ios', plan(), 'CHG-1')
    expect(plain.safetyNet.kind).toBe('none')
    expect(plain.arm).toHaveLength(0)
    expect(plain.commit.map((s) => s.command)).toEqual(['write memory'])

    const mgmt = buildExecution('cisco-iosxe', plan({ affectsManagementPath: true }), 'CHG-1', 5)
    expect(mgmt.safetyNet.kind).toBe('reload-timer')
    expect(mgmt.arm[0].command).toBe('reload in 5')
    expect(mgmt.arm[0].replies?.some((r) => new RegExp(r.when).test('System configuration has been modified. Save? [yes/no]:'))).toBe(true)
    expect(mgmt.commit[0].command).toBe('reload cancel')
    expect(mgmt.rollback.at(-1)?.command).toBe('reload cancel')
    expect(mgmt.abort[0].command).toBe('end')

    const noSave = buildExecution('cisco-ios', plan({ persist: false }), 'CHG-1')
    expect(noSave.commit).toHaveLength(0)
  })

  it('NX-OS: checkpoint and exact rollback', () => {
    const x = buildExecution('cisco-nxos', plan(), 'CHG-9')
    expect(x.arm[0].command).toBe('checkpoint nc9')
    expect(x.rollback[0].command).toBe('rollback running-config checkpoint nc9')
  })

  it('MikroTik: Safe Mode via raw Ctrl+X', () => {
    const x = buildExecution('mikrotik', plan({ changes: ['/interface set ether1 comment=uplink'] }), 'CHG-1')
    expect(x.safetyNet.kind).toBe('safe-mode')
    expect(x.arm).toEqual([{ phase: 'arm', command: '\x18', raw: true }])
    expect(x.commit[0].raw).toBe(true)
  })

  it('takes a snapshot where the platform has one', () => {
    expect(buildExecution('junos', plan(), 'a').snapshot?.command).toContain('display set')
    expect(buildExecution('linux', plan(), 'a').snapshot).toBeNull()
    expect(buildExecution('linux', plan(), 'a').safetyNet.description).toContain('no automatic snapshot')
  })
})

describe('looksLikeApplyError', () => {
  it('spots vendor rejections', () => {
    expect(looksLikeApplyError('% Invalid input detected at \'^\' marker.')).toBe(true)
    expect(looksLikeApplyError('syntax error, expecting <command>.')).toBe(true)
    expect(looksLikeApplyError('error: configuration check-out failed')).toBe(true)
    expect(looksLikeApplyError('bad command name foo (line 1 column 2)')).toBe(true)
    expect(looksLikeApplyError('% Incomplete command.')).toBe(true)
  })

  it('leaves normal output alone', () => {
    expect(looksLikeApplyError('R1(config-if)#')).toBe(false)
    expect(looksLikeApplyError('commit complete\nExiting configuration mode')).toBe(false)
    expect(looksLikeApplyError('[edit]\nuser@r1#')).toBe(false)
  })
})

describe('changeRecordToMarkdown', () => {
  it('renders an auditable record', () => {
    const p = plan()
    const r: ChangeRecord = {
      id: 'CHG-1', sessionId: 's1', deviceName: 'core-1', host: '10.0.0.1', deviceType: 'arista-eos',
      environment: 'production', mode: 'change', plan: p,
      safetyNet: buildExecution('arista-eos', p, 'CHG-1').safetyNet,
      status: 'confirmed', approvedBy: 'user', overrideReason: 'P1 outage',
      snapshotLines: 420, diff: '+ description uplink-to-core',
      steps: [{ phase: 'arm', command: '\x18', output: 'ok', at: 0 }],
      recommendation: { decision: 'confirm', note: 'Description present after change.' },
      outcomeNote: 'Confirmed by the engineer.', createdAt: 0, updatedAt: 0,
    }
    const md = changeRecordToMarkdown(r)
    expect(md).toContain('# Change CHG-1 — Set uplink description')
    expect(md).toContain('outside maintenance window: P1 outage')
    expect(md).toContain('420 lines')
    expect(md).toContain('## Device diff')
    expect(md).toContain('<Ctrl+X>')
    expect(md).not.toMatch(/\n\n\n/)
  })
})
