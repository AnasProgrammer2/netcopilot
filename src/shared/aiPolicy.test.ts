import { describe, expect, it } from 'vitest'
import {
  decideToolCall,
  enforcePolicy,
  hasUnsafeCharacters,
  evaluatePolicy,
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

  it('flags high-risk full-access commands for confirmation', () => {
    const decision = evaluatePolicy('configure terminal', 'full-access', blacklist)
    expect(decision.blockReason).toBeNull()
    expect(decision.requiresConfirmation).toBe(true)
  })

  it('does not require confirmation for read-only in full-access', () => {
    const decision = evaluatePolicy('show ip bgp summary', 'full-access', blacklist)
    expect(decision.blockReason).toBeNull()
    expect(decision.requiresConfirmation).toBe(false)
  })
})

describe('mergeBlacklists', () => {
  it('deduplicates case-insensitively', () => {
    expect(mergeBlacklists(['Reload'], ['reload', 'shutdown'])).toEqual(['Reload', 'shutdown'])
  })
})

describe('troubleshoot hardening', () => {
  it('blocks redirection and substitution', () => {
    expect(hasShellChaining('show run > flash:backup')).toBe(true)
    expect(hasShellChaining('cat /etc/passwd >> /tmp/x')).toBe(true)
    expect(hasShellChaining('cat < /etc/shadow')).toBe(true)
    expect(hasShellChaining('ping ${IFS}x')).toBe(true)
    expect(hasShellChaining('ping $(reboot)')).toBe(true)
    expect(hasShellChaining('ping `reboot`')).toBe(true)
    expect(isReadOnlyCommand('show run > flash:backup')).toBe(false)
    expect(isReadOnlyCommand('date >/etc/motd')).toBe(false)
  })

  it('allows vendor output filters after a pipe', () => {
    expect(hasShellChaining('show logging | include %LINK')).toBe(false)
    expect(isReadOnlyCommand('show logging | include X')).toBe(true)
    expect(isReadOnlyCommand('show run | i hostname')).toBe(true)
    expect(isReadOnlyCommand('show run | sec bgp')).toBe(true)
    expect(isReadOnlyCommand('show ip int brief | exclude unassigned')).toBe(true)
    expect(isReadOnlyCommand('show interfaces terse | match ge- | count')).toBe(true)
    expect(isReadOnlyCommand('display current-configuration | include sysname')).toBe(true)
    expect(isReadOnlyCommand('ps aux | grep sshd')).toBe(true)
    expect(enforcePolicy('show logging | include X', 'troubleshoot', ['reload'])).toBeNull()
  })

  it('blocks pipes into writers or arbitrary commands', () => {
    expect(isReadOnlyCommand('show run | redirect flash:x')).toBe(false)
    expect(isReadOnlyCommand('show run | tee flash:x')).toBe(false)
    expect(isReadOnlyCommand('show run | append flash:x')).toBe(false)
    expect(isReadOnlyCommand('show configuration | save /var/tmp/x')).toBe(false)
    expect(isReadOnlyCommand('show run | t flash:x')).toBe(false)
    expect(isReadOnlyCommand('cat /etc/passwd | sh')).toBe(false)
    expect(isReadOnlyCommand('ls | xargs rm')).toBe(false)
    expect(isReadOnlyCommand('ls | find / -delete')).toBe(false)
    expect(isReadOnlyCommand('| include x')).toBe(false)
  })

  it('removes verbs that can execute or write', () => {
    expect(isReadOnlyCommand('env rm -rf /')).toBe(false)
    expect(isReadOnlyCommand('find / -delete')).toBe(false)
    expect(isReadOnlyCommand('find . -exec rm {} +')).toBe(false)
    expect(isReadOnlyCommand("sed -i 's/a/b/' /etc/hosts")).toBe(false)
    expect(isReadOnlyCommand("awk 'BEGIN{system(\"reboot\")}'")).toBe(false)
    expect(isReadOnlyCommand("less '+!reboot' /etc/hosts")).toBe(false)
    expect(isReadOnlyCommand('more /etc/hosts')).toBe(false)
  })

  it('restricts tcpdump to capture-to-screen', () => {
    expect(isReadOnlyCommand('tcpdump -i eth0 -nn -c 10 port 22')).toBe(true)
    expect(isReadOnlyCommand('tcpdump -i eth0 -w /tmp/cap.pcap')).toBe(false)
    expect(isReadOnlyCommand('tcpdump -G 1 -z /tmp/evil.sh -w x')).toBe(false)
    expect(isReadOnlyCommand('tcpdump -C 1 -W 2 -w x')).toBe(false)
  })

  it('allows hostname and date only without setting arguments', () => {
    expect(isReadOnlyCommand('hostname')).toBe(true)
    expect(isReadOnlyCommand('hostname -f')).toBe(true)
    expect(isReadOnlyCommand('hostname evil')).toBe(false)
    expect(isReadOnlyCommand('hostname -F /tmp/name')).toBe(false)
    expect(isReadOnlyCommand('date')).toBe(true)
    expect(isReadOnlyCommand('date -u +%s')).toBe(true)
    expect(isReadOnlyCommand('date -s "2020-01-01"')).toBe(false)
    expect(isReadOnlyCommand('date 010100002020')).toBe(false)
  })

  it('allows route/arp only in display form', () => {
    expect(isReadOnlyCommand('route')).toBe(true)
    expect(isReadOnlyCommand('route -n')).toBe(true)
    expect(isReadOnlyCommand('route print')).toBe(true)
    expect(isReadOnlyCommand('route add default gw 10.0.0.1')).toBe(false)
    expect(isReadOnlyCommand('route del default')).toBe(false)
    expect(isReadOnlyCommand('route -f')).toBe(false)
    expect(isReadOnlyCommand('arp -a')).toBe(true)
    expect(isReadOnlyCommand('arp -n')).toBe(true)
    expect(isReadOnlyCommand('arp -d 10.0.0.1')).toBe(false)
    expect(isReadOnlyCommand('arp -s 10.0.0.1 00:11:22:33:44:55')).toBe(false)
  })

  it('allows ip only with show/list/get subcommands', () => {
    expect(isReadOnlyCommand('ip -br a')).toBe(true)
    expect(isReadOnlyCommand('ip addr show dev eth0')).toBe(true)
    expect(isReadOnlyCommand('ip route')).toBe(true)
    expect(isReadOnlyCommand('ip -4 route sh')).toBe(true)
    expect(isReadOnlyCommand('ip route get 8.8.8.8')).toBe(true)
    expect(isReadOnlyCommand('ip -n blue link list')).toBe(true)
    expect(isReadOnlyCommand('ip link set eth0 down')).toBe(false)
    expect(isReadOnlyCommand('ip link s eth0 down')).toBe(false)
    expect(isReadOnlyCommand('ip route del default')).toBe(false)
    expect(isReadOnlyCommand('ip addr flush dev eth0')).toBe(false)
    expect(isReadOnlyCommand('ip netns exec blue reboot')).toBe(false)
    expect(isReadOnlyCommand('ip -batch /tmp/cmds')).toBe(false)
    expect(isReadOnlyCommand('ip -force -b /tmp/cmds')).toBe(false)
  })

  it('restricts other state-changing flags', () => {
    expect(isReadOnlyCommand('ss -tulpn')).toBe(true)
    expect(isReadOnlyCommand('ss -K dst 10.0.0.1')).toBe(false)
    expect(isReadOnlyCommand('dmesg -T')).toBe(true)
    expect(isReadOnlyCommand('dmesg -c')).toBe(false)
    expect(isReadOnlyCommand('journalctl -u sshd -n 50')).toBe(true)
    expect(isReadOnlyCommand('journalctl --vacuum-time=1s')).toBe(false)
    expect(isReadOnlyCommand('ifconfig eth0')).toBe(true)
    expect(isReadOnlyCommand('ifconfig eth0 down')).toBe(false)
    expect(isReadOnlyCommand('resolvectl status')).toBe(true)
    expect(isReadOnlyCommand('resolvectl dns eth0 6.6.6.6')).toBe(false)
  })

  it('has no false positives on common read-only commands', () => {
    const blacklist = DEFAULT_BLACKLIST
    for (const cmd of [
      'show run',
      'show running-config',
      'show ip int brief',
      'show ip route',
      'show version',
      'display current-configuration',
      'ping 8.8.8.8',
      'traceroute 8.8.8.8',
      'show logging | include X',
      'show ip bgp summary',
      'show interfaces status',
      'ip -br a',
    ]) {
      expect(enforcePolicy(cmd, 'troubleshoot', blacklist), cmd).toBeNull()
    }
  })
})

const DEFAULT_BLACKLIST = [
  'reload', 'reboot', 'shutdown', 'poweroff', 'halt', 'write erase', 'erase startup-config',
  'erase nvram', 'factory-reset', 'no router', 'no interface', 'rm -rf', 'mkfs', 'dd if=',
  '> /dev/', 'request system reboot', 'shutdown /r', 'Remove-Item -Recurse',
]

describe('isBlacklisted abbreviations', () => {
  it('matches vendor abbreviations of blacklisted commands', () => {
    expect(isBlacklisted('rel', ['reload'])).toBe(true)
    expect(isBlacklisted('relo', ['reload'])).toBe(true)
    expect(isBlacklisted('reload in 5', ['reload'])).toBe(true)
    expect(isBlacklisted('do rel', ['reload'])).toBe(true)
    expect(isBlacklisted('wr er', ['write erase'])).toBe(true)
    expect(isBlacklisted('write   erase', ['write erase'])).toBe(true)
    expect(isBlacklisted('erase start', ['erase startup-config'])).toBe(true)
    expect(isBlacklisted('req sys reb', ['request system reboot'])).toBe(true)
    expect(isBlacklisted('no int gi0/1', ['no interface'])).toBe(true)
  })

  it('matches reordered / split short flags', () => {
    expect(isBlacklisted('rm -fr /', ['rm -rf'])).toBe(true)
    expect(isBlacklisted('rm -r -f /', ['rm -rf'])).toBe(true)
    expect(isBlacklisted('rm -Rf /', ['rm -rf'])).toBe(true)
    expect(isBlacklisted('sudo rm --recursive --force /', ['rm -rf'])).toBe(true)
    expect(isBlacklisted('rm -f file.txt', ['rm -rf'])).toBe(false)
  })

  it('matches across separators and quotes', () => {
    expect(isBlacklisted('show ver;reload', ['reload'])).toBe(true)
    expect(isBlacklisted("'reboot'", ['reboot'])).toBe(true)
  })

  it('does not treat short or embedded tokens as abbreviations', () => {
    expect(isBlacklisted('sh run', DEFAULT_BLACKLIST)).toBe(false)
    expect(isBlacklisted('show ip int brief', DEFAULT_BLACKLIST)).toBe(false)
    expect(isBlacklisted('show logging | include rel', ['reload'])).toBe(false)
    expect(isBlacklisted('wr mem', DEFAULT_BLACKLIST)).toBe(false)
    expect(isBlacklisted('show ip router', ['route'])).toBe(false)
    expect(isBlacklisted('ping relay.example.com', ['reload'])).toBe(false)
  })
})

describe('control and invisible characters', () => {
  const BL = ['reload', 'write erase', 'clear ip bgp']

  it('blocks line-editor tricks in every mode', () => {
    for (const perm of ['troubleshoot', 'full-access'] as const) {
      expect(evaluatePolicy('reloadx\x7f', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('write erasx\x7fe', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('confx\x7f t', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('show ver\x15clear ip bgp *', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('rel\x08\x08\x08reload', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('conf\t t', perm, BL).blockReason).not.toBeNull()
      expect(evaluatePolicy('show run\x1b[A', perm, BL).blockReason).not.toBeNull()
    }
  })

  it('blocks invisible and bidi-reordering unicode', () => {
    expect(hasUnsafeCharacters('show​ run')).toBe(true)
    expect(hasUnsafeCharacters('show run ‮reload')).toBe(true)
    expect(hasUnsafeCharacters('﻿show version')).toBe(true)
  })

  it('leaves normal commands alone', () => {
    expect(hasUnsafeCharacters('show ip bgp summary | include Idle')).toBe(false)
    expect(hasUnsafeCharacters('display interface brief')).toBe(false)
    expect(evaluatePolicy('show running-config', 'troubleshoot', BL).blockReason).toBeNull()
  })
})

describe('decideToolCall', () => {
  const BL = ['reload']
  const base = {
    permission: 'full-access' as const,
    approval: 'auto' as const,
    isProactive: false,
    sessionId: 's1',
    knownSessionIds: ['s1', 's2'],
  }

  it('auto-approves a normal command only in Auto Pilot', () => {
    expect(decideToolCall('show ip route', base, BL).autoApprove).toBe(true)
    expect(decideToolCall('show ip route', { ...base, approval: 'ask' }, BL).autoApprove).toBe(false)
  })

  it('never auto-approves in read-only mode, even if approval says auto', () => {
    const v = decideToolCall('show ip route', { ...base, permission: 'troubleshoot' }, BL)
    expect(v.blockReason).toBeNull()
    expect(v.autoApprove).toBe(false)
  })

  it('enforces the read-only allowlist when the session is read-only', () => {
    expect(decideToolCall('configure terminal', { ...base, permission: 'troubleshoot' }, BL).blockReason).not.toBeNull()
  })

  it('treats read-only lookups as safe but route changes as high-risk', () => {
    expect(decideToolCall('show ip route 10.0.0.0', base, BL).requiresConfirmation).toBe(false)
    expect(decideToolCall('ip route 0.0.0.0 0.0.0.0 192.0.2.1', base, BL).requiresConfirmation).toBe(true)
    expect(decideToolCall('sudo ip route add 10.9.0.0/16 via 10.0.0.1', base, BL).requiresConfirmation).toBe(true)
    expect(decideToolCall('show ip route | include 10.0', base, BL).requiresConfirmation).toBe(false)
  })

  it('does not auto-run Auto Watch turns or high-risk commands', () => {
    expect(decideToolCall('show ip route', { ...base, isProactive: true }, BL).autoApprove).toBe(false)
    const hi = decideToolCall('configure terminal', base, BL)
    expect(hi.requiresConfirmation).toBe(true)
    expect(hi.autoApprove).toBe(false)
  })

  it('requires a click for another open session and rejects unknown ones', () => {
    expect(decideToolCall('show ip route', { ...base, targetSession: 's2' }, BL).autoApprove).toBe(false)
    expect(decideToolCall('show ip route', { ...base, targetSession: 's1' }, BL).autoApprove).toBe(true)
    const v = decideToolCall('show ip route', { ...base, targetSession: 'evil' }, BL)
    expect(v.blockReason).not.toBeNull()
    expect(v.autoApprove).toBe(false)
  })

  it('still blocks blacklisted and control-character commands', () => {
    expect(decideToolCall('reload', base, BL).blockReason).not.toBeNull()
    expect(decideToolCall('reloadx\x7f', base, BL).blockReason).not.toBeNull()
  })
})

