export type AiPermission = 'troubleshoot' | 'full-access'

/**
 * Verbs allowed as the first token of a troubleshoot-mode command.
 *
 * Deliberately excluded (can execute or write): env, find, sed, awk, less,
 * more, view (pager/editor `+cmd` / `!cmd` escapes). Verbs that are read-only
 * only with certain arguments are listed here AND in ARG_RULES below.
 */
const READ_ONLY_VERBS = new Set<string>([
  'show', 'display', 'get', 'list', 'print',
  'ping', 'traceroute', 'tracert', 'mtr', 'pathping',
  'ls', 'll', 'ps', 'df', 'du', 'top', 'htop', 'cat', 'tail', 'head',
  'grep', 'egrep', 'fgrep', 'wc', 'locate',
  'ss', 'netstat', 'ip', 'ifconfig', 'arp', 'route', 'hostname', 'uname', 'uptime',
  'journalctl', 'dmesg', 'dig', 'nslookup', 'host', 'resolvectl', 'getent',
  'tcpdump', 'lsof', 'whoami', 'who', 'w', 'id', 'date',
  'get-', 'test-', 'measure-', 'compare-', 'find-', 'select-',
])

// ── Pipe filters ─────────────────────────────────────────────────────────────
// `show logging | include X` style output filters (Cisco/Arista/Huawei/Junos)
// plus a few read-only text filters. Vendor filters may be abbreviated
// (`| i`, `| inc`, `| sec`) as long as the abbreviation is not also a prefix of
// a filter that writes (`| append`, `| redirect`, `| tee`, `| save`).
const VENDOR_PIPE_FILTERS = [
  'include', 'exclude', 'begin', 'section', 'count', 'match', 'except',
  'no-more', 'last', 'trim', 'display', 'json',
]
const UNSAFE_PIPE_FILTERS = ['append', 'redirect', 'tee', 'save']
const EXACT_PIPE_FILTERS = new Set<string>([
  'grep', 'egrep', 'fgrep', 'head', 'tail', 'wc', 'findstr', 'select-string',
])

function isSafePipeFilter(segment: string): boolean {
  const tok = firstCommandToken(segment)
  if (!tok) return false
  if (EXACT_PIPE_FILTERS.has(tok)) return true
  if (UNSAFE_PIPE_FILTERS.some((f) => f.startsWith(tok))) return false
  return VENDOR_PIPE_FILTERS.some((f) => f.startsWith(tok))
}

/**
 * Shell chaining / substitution / redirection — never allowed in troubleshoot
 * mode. A single `|` is tolerated only when every piped segment is a known
 * read-only output filter (`show run | include hostname`).
 */
export function hasShellChaining(cmd: string): boolean {
  const trimmed = cmd.trim()
  if (!trimmed) return false
  if (/\n|\r/.test(trimmed)) return true
  if (/\|\||&&/.test(trimmed)) return true
  if (/[;&]/.test(trimmed)) return true
  // Redirection (>, >>, <, <<, <(...), >(...))
  if (/[<>]/.test(trimmed)) return true
  // Command / parameter / arithmetic substitution
  if (/\$\(|\$\{|`/.test(trimmed)) return true
  if (trimmed.includes('|')) {
    const segments = trimmed.split('|')
    if (!segments[0].trim()) return true
    for (const seg of segments.slice(1)) {
      if (!isSafePipeFilter(seg)) return true
    }
  }
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

// ── Argument rules for verbs that can also change state ──────────────────────
// Each rule receives the arguments in their ORIGINAL case (some tools use
// case-sensitive flags, e.g. tcpdump -c vs -C) and returns true when the
// invocation is read-only.

const isOption = (a: string): boolean => a.startsWith('-')

/** True when any short-option cluster (`-abc`) contains one of `letters`. */
function hasShortFlag(args: string[], letters: string): boolean {
  return args.some((a) => /^-[^-]/.test(a) && [...a.slice(1)].some((ch) => letters.includes(ch)))
}

/** `ip [OPTIONS] OBJECT [show|list|get ...]` — omitting the command means "show". */
function ipIsReadOnly(args: string[]): boolean {
  let i = 0
  while (i < args.length && isOption(args[i])) {
    const opt = args[i].toLowerCase()
    // -b / -batch run commands from a file; -force continues past errors in batch mode
    if (opt === '-b' || (opt.length >= 3 && ('-batch'.startsWith(opt) || '-force'.startsWith(opt)))) {
      return false
    }
    // Options that take a value
    if (['-n', '-netns', '-rc', '-rcvbuf', '-l', '-loops', '-f', '-family'].includes(opt)) i++
    i++
  }
  const object = args[i]?.toLowerCase()
  if (!object) return true // `ip` alone prints usage
  const command = args[i + 1]?.toLowerCase()
  if (command === undefined) return true // default action is show/list
  // Exact spellings only: iproute2 resolves abbreviations in source order, so
  // e.g. `ip link s` means `set`, not `show`.
  return ['show', 'sho', 'sh', 'list', 'lst', 'get'].includes(command)
}

const ARG_RULES: Record<string, (args: string[]) => boolean> = {
  ip: ipIsReadOnly,

  // `hostname NAME` / `hostname -F file` / `hostname -b` set the hostname.
  hostname: (args) => args.every((a) =>
    ['-a', '-A', '-d', '-f', '-i', '-I', '-s', '-y', '--fqdn', '--long', '--short', '--domain',
      '--ip-address', '--all-ip-addresses', '--all-fqdns', '--alias', '--nis'].includes(a)),

  // `date -s` / `date MMDDhhmm` set the clock; only formats are allowed.
  date: (args) => args.every((a) =>
    a.startsWith('+') || ['-u', '--utc', '--universal', '-R', '--rfc-email', '-I', '--iso-8601'].includes(a)),

  // Linux `route add/del`, Windows `route -f` (flush) / `route add`.
  route: (args) => {
    if (args[0]?.toLowerCase() === 'print') return true // Windows: route print [-4|-6] [filter]
    return args.every((a) => ['-n', '-e', '-ee', '-ne', '-en', '-nee', '-v', '-nv', '-vn', '-4', '-6'].includes(a))
  },

  // `arp -s` (set) / `arp -d` (delete) / `arp -f` (load file).
  arp: (args) => {
    if (hasShortFlag(args, 'sdfSDF')) return false
    return args.every((a) => !a.startsWith('--') || ['--all', '--numeric', '--verbose', '--device'].includes(a))
  },

  // `ifconfig eth0 down|up|<addr>` changes state; allow listing only.
  ifconfig: (args) => {
    const positional = args.filter((a) => !isOption(a))
    return positional.length <= 1 && args.every((a) => !isOption(a) || ['-a', '-s', '-v'].includes(a))
  },

  // `tcpdump -w file` writes, `-z cmd` executes a post-rotate command,
  // `-C/-G/-W` control file rotation.
  tcpdump: (args) => !hasShortFlag(args, 'wzCGW') && !args.some((a) => a.startsWith('--')),

  // `ss -K` / `ss --kill` closes sockets.
  ss: (args) => !hasShortFlag(args, 'K') && !args.some((a) => a.toLowerCase() === '--kill'),

  // `dmesg -c/-C` clear the ring buffer, `-n` sets console level, `-D/-E` toggle console.
  dmesg: (args) => !hasShortFlag(args, 'cCnDE') && !args.some((a) =>
    /^--(clear|read-clear|console-level|console-off|console-on)/.test(a.toLowerCase())),

  // `journalctl --vacuum-*`, `--rotate`, `--flush`, ... modify the journal.
  journalctl: (args) => !args.some((a) =>
    /^--(vacuum|rotate|flush|sync|relinquish-var|smart-relinquish-var|setup-keys|update-catalog)/.test(a.toLowerCase())),

  // `resolvectl dns eth0 1.1.1.1`, `flush-caches`, `revert` change resolver state.
  resolvectl: (args) => {
    const sub = args.find((a) => !isOption(a))?.toLowerCase()
    return sub === undefined || ['status', 'query', 'statistics', 'show-cache', 'show-server-state'].includes(sub)
  },
}

export function isReadOnlyCommand(cmd: string): boolean {
  const trimmed = cmd.trim()
  if (!trimmed) return false
  if (hasShellChaining(cmd)) return false
  // Pipe segments (if any) have already been validated as safe filters.
  const tokens = trimmed.split('|')[0].trim().split(/\s+/)
  const verb = tokens[0].toLowerCase()
  if (!isReadOnlyToken(verb)) return false
  const rule = ARG_RULES[verb]
  return rule ? rule(tokens.slice(1)) : true
}

// ── Blacklist matching ───────────────────────────────────────────────────────

/** Commands that run the rest of the line as another command. */
const COMMAND_WRAPPERS = new Set<string>(['do', 'run', 'sudo', 'doas', 'exec', 'nohup', 'command', 'time', 'nice', 'env'])

/**
 * Split a command line into command segments (on shell / CLI separators) and
 * each segment into tokens. Quotes are dropped so `'reload'` matches `reload`.
 */
function tokenizeSegments(command: string): string[][] {
  return command
    .toLowerCase()
    .replace(/["']/g, '')
    .split(/[;&|\n\r`]|\$\(|\$\{|[()]/)
    .map((seg) => seg.trim().split(/\s+/).filter(Boolean))
    .filter((seg) => seg.length > 0)
}

/** Index of the first "real" command token in a segment (skips `do`, `sudo -u x`, ...). */
function commandStart(tokens: string[]): number {
  let i = 0
  while (i < tokens.length && (COMMAND_WRAPPERS.has(tokens[i]) || (i > 0 && tokens[i].startsWith('-')))) i++
  return i
}

const isShortFlagCluster = (t: string): boolean => /^-[a-z]{1,3}$/.test(t)

/** Collect short-flag letters from option tokens (`-r -f`, `-fr`, `--force`). */
function collectFlagLetters(tokens: string[]): Set<string> {
  const letters = new Set<string>()
  for (const t of tokens) {
    if (t.startsWith('--') && t.length > 2) letters.add(t[2])
    else if (/^-[a-z]+$/.test(t)) for (const ch of t.slice(1)) letters.add(ch)
  }
  return letters
}

/**
 * Token-wise pattern match. A command token matches a pattern token when it is
 * equal, or — only when the match starts at the beginning of a command — when
 * it is an abbreviation of it (Cisco/Juniper style: `rel` → `reload`,
 * `wr er` → `write erase`). Short flag clusters match regardless of order or
 * grouping (`rm -fr`, `rm -r -f` → `rm -rf`).
 */
function matchesTokens(tokens: string[], start: number, pattern: string[], anchored: boolean): boolean {
  let ti = start
  for (let pi = 0; pi < pattern.length; pi++) {
    const p = pattern[pi]
    if (isShortFlagCluster(p)) {
      const rest = tokens.slice(ti)
      const letters = collectFlagLetters(rest)
      if (![...p.slice(1)].every((ch) => letters.has(ch))) return false
      // Skip the contiguous run of options so later pattern tokens line up.
      while (ti < tokens.length && tokens[ti].startsWith('-')) ti++
      continue
    }
    const t = tokens[ti]
    if (t === undefined) return false
    if (t !== p) {
      const minLen = Math.min(p.length, pattern.length > 1 ? 2 : 3)
      const isAbbrev = anchored && t.length >= minLen && p.startsWith(t)
      if (!isAbbrev) return false
    }
    ti++
  }
  return true
}

function isBlacklistedByTokens(segments: string[][], pattern: string): boolean {
  const pTokens = pattern.split(/\s+/).filter(Boolean)
  if (pTokens.length === 0) return false
  for (const tokens of segments) {
    const anchor = commandStart(tokens)
    for (let i = 0; i < tokens.length; i++) {
      if (matchesTokens(tokens, i, pTokens, i === anchor)) return true
    }
  }
  return false
}

export function isBlacklisted(command: string, patterns: string[]): boolean {
  const normalised = command.toLowerCase().replace(/\s+/g, ' ').trim()
  const segments = tokenizeSegments(command)
  for (const raw of patterns) {
    const p = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!p) continue
    if (p.includes(' ') || p.includes('/')) {
      if (normalised.includes(p)) return true
    } else {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(^|[^a-z0-9_-])${escaped}([^a-z0-9_-]|$)`, 'i')
      if (re.test(normalised)) return true
    }
    if (isBlacklistedByTokens(segments, p)) return true
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
      return '(rejected: troubleshoot mode does not allow command chaining, redirection or shell substitution. Switch to Fix Mode or Auto Pilot.)'
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
