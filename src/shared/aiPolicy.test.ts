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
