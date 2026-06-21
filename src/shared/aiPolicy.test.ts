import { describe, expect, it } from 'vitest'
import {
  enforcePolicy,
  hasShellChaining,
  isBlacklisted,
  isReadOnlyCommand,
  mergeBlacklists,
} from './aiPolicy'

describe('hasShellChaining', () => {
  it('detects semicolon, pipe, and ampersand chaining', () => {
    expect(hasShellChaining('show version; write erase')).toBe(true)
    expect(hasShellChaining('ls | rm -rf /')).toBe(true)
    expect(hasShellChaining('ping 8.8.8.8 && reboot')).toBe(true)
    expect(hasShellChaining('true || shutdown')).toBe(true)
  })

  it('detects command substitution', () => {
    expect(hasShellChaining('echo $(rm -rf /)')).toBe(true)
    expect(hasShellChaining('echo `id`')).toBe(true)
  })

  it('allows simple read-only commands', () => {
    expect(hasShellChaining('show ip interface brief')).toBe(false)
    expect(hasShellChaining('ping 8.8.8.8')).toBe(false)
  })
})

describe('isReadOnlyCommand', () => {
  it('allows vendor read-only verbs', () => {
    expect(isReadOnlyCommand('show version')).toBe(true)
    expect(isReadOnlyCommand('display ip routing-table')).toBe(true)
    expect(isReadOnlyCommand('Get-NetAdapter')).toBe(true)
  })

  it('rejects state-changing verbs', () => {
    expect(isReadOnlyCommand('configure terminal')).toBe(false)
    expect(isReadOnlyCommand('write memory')).toBe(false)
  })

  it('rejects chained commands even when the first verb is read-only', () => {
    expect(isReadOnlyCommand('show version; write erase')).toBe(false)
    expect(isReadOnlyCommand('ls; rm -rf /')).toBe(false)
  })
})

describe('isBlacklisted', () => {
  it('matches multi-word patterns as substrings', () => {
    expect(isBlacklisted('write erase', ['write erase'])).toBe(true)
  })

  it('uses word boundaries for single tokens', () => {
    expect(isBlacklisted('show ip route', ['route'])).toBe(true)
    expect(isBlacklisted('show ip router', ['route'])).toBe(false)
  })
})

describe('enforcePolicy', () => {
  const blacklist = ['write erase', 'reload']

  it('allows read-only commands in troubleshoot mode', () => {
    expect(enforcePolicy('show ip bgp summary', 'troubleshoot', blacklist)).toBeNull()
  })

  it('blocks chained commands in troubleshoot mode', () => {
    const result = enforcePolicy('show version; ping 1.1.1.1', 'troubleshoot', [])
    expect(result).toContain('command chaining')
  })

  it('blocks blacklisted commands in full-access mode', () => {
    expect(enforcePolicy('reload', 'full-access', blacklist)).not.toBeNull()
  })

  it('allows state-changing commands in full-access when not blacklisted', () => {
    expect(enforcePolicy('configure terminal', 'full-access', blacklist)).toBeNull()
  })

  it('rejects empty commands', () => {
    expect(enforcePolicy('', 'troubleshoot', blacklist)).toContain('empty')
  })
})

describe('mergeBlacklists', () => {
  it('deduplicates case-insensitively', () => {
    expect(mergeBlacklists(['Reload'], ['reload', 'shutdown'])).toEqual(['Reload', 'shutdown'])
  })
})
