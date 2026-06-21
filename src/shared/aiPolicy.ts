export type AiPermission = 'troubleshoot' | 'full-access'

const READ_ONLY_VERBS = new Set<string>([
  'show', 'display', 'get', 'view', 'list', 'print',
  'ping', 'traceroute', 'tracert', 'mtr', 'pathping',
  'ls', 'll', 'ps', 'df', 'du', 'top', 'htop', 'cat', 'less', 'more', 'tail', 'head',
  'grep', 'egrep', 'fgrep', 'awk', 'sed', 'wc', 'find', 'locate',
  'ss', 'netstat', 'ip', 'ifconfig', 'arp', 'route', 'hostname', 'uname', 'uptime',
  'journalctl', 'dmesg', 'dig', 'nslookup', 'host', 'resolvectl', 'getent',
  'tcpdump', 'lsof', 'whoami', 'who', 'w', 'id', 'env', 'date',
  'get-', 'test-', 'measure-', 'compare-', 'find-', 'select-',
])

/** Shell chaining / substitution — never allowed in troubleshoot mode. */
export function hasShellChaining(cmd: string): boolean {
  const trimmed = cmd.trim()
  if (!trimmed) return false
  if (/\n|\r/.test(trimmed)) return true
  if (/\|\||&&/.test(trimmed)) return true
  if (/[|;&]/.test(trimmed)) return true
  if (/\$\(/.test(trimmed) || /`/.test(trimmed)) return true
  return false
}

function firstCommandToken(cmd: string): string {
  return cmd.trim().toLowerCase().split(/\s+/)[0] ?? ''
}

function isReadOnlyToken(token: string): boolean {
  if (!token) return false
  if (READ_ONLY_VERBS.has(token)) return true
  for (const v of READ_ONLY_VERBS) {
    if (v.endsWith('-') && token.startsWith(v)) return true
  }
  return false
}

export function isReadOnlyCommand(cmd: string): boolean {
  const trimmed = cmd.trim().toLowerCase()
  if (!trimmed) return false
  if (hasShellChaining(cmd)) return false
  return isReadOnlyToken(firstCommandToken(trimmed))
}

export function isBlacklisted(command: string, patterns: string[]): boolean {
  const normalised = command.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const raw of patterns) {
    const p = raw.trim().toLowerCase()
    if (!p) continue
    if (p.includes(' ') || p.includes('/')) {
      if (normalised.includes(p)) return true
    } else {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`, 'i')
      if (re.test(normalised)) return true
    }
  }
  return false
}

export function enforcePolicy(
  command:    string,
  permission: AiPermission,
  blacklist:  string[],
): string | null {
  if (!command || typeof command !== 'string') {
    return '(rejected by safety policy: empty or non-string command)'
  }
  if (isBlacklisted(command, blacklist)) {
    return '(rejected by server-side blacklist — refine or ask the user to whitelist this command)'
  }
  if (permission === 'troubleshoot') {
    if (hasShellChaining(command)) {
      return '(rejected: troubleshoot mode does not allow command chaining or shell operators. Switch to Fix Mode or Auto Pilot.)'
    }
    if (!isReadOnlyCommand(command)) {
      return '(rejected: troubleshoot mode allows read-only commands only. Switch to Fix Mode or Auto Pilot for state-changing operations.)'
    }
  }
  return null
}

export function mergeBlacklists(stored: string[], sessionExtra?: string[]): string[] {
  const merged = [...stored]
  for (const raw of sessionExtra ?? []) {
    const p = raw.trim()
    if (p && !merged.some((x) => x.toLowerCase() === p.toLowerCase())) merged.push(p)
  }
  return merged
}
