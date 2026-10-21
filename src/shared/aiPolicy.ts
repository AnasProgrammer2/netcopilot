export type AiPermission = 'troubleshoot' | 'full-access'
export type AiApproval   = 'ask' | 'auto'

/** Result of evaluating a command against the active safety policy. */
export type PolicyDecision = {
  /** Hard block — command must not run. */
  blockReason: string | null
  /**
   * Soft gate — even in Auto Pilot / full-access, the UI must pause for an
   * explicit user click. Used for high-risk config changes that are not
   * covered by the denylist alone.
   */
  requiresConfirmation: boolean
}

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

/** Commands that change device state in ways worth a second look (full-access evaluation). */
const DEFAULT_HIGH_RISK_CONFIRM: string[] = [
  'configure terminal', 'configure', 'conf t', 'config t',
  'write memory', 'write mem', 'wr mem', 'wr ',
  'copy running-config', 'copy run',
  'commit', 'rollback',
  'interface ', 'no interface',
  'ip route', 'ipv6 route', 'route-map',
  'access-list', 'ip access-list',
  'iptables', 'nft ', 'ufw ',
  'systemctl', 'service ',
  'mount ', 'umount ',
  'useradd', 'userdel', 'passwd',
  'chmod ', 'chown ',
  'mkfs', 'fdisk', 'parted',
]

export function isHighRiskCommand(
  command: string,
  patterns: string[] = DEFAULT_HIGH_RISK_CONFIRM,
): boolean {
  return isBlacklisted(command, patterns)
}

export function enforcePolicy(
  command:    string,
  permission: AiPermission,
  blacklist:  string[],
  highRiskPatterns: string[] = DEFAULT_HIGH_RISK_CONFIRM,
): string | null {
  return evaluatePolicy(command, permission, blacklist, highRiskPatterns).blockReason
}

/**
 * Characters a device's line editor acts on (DEL, backspace, Ctrl-U, Tab
 * completion, ESC sequences…) plus invisible / bidi-reordering Unicode. With
 * any of them, what the device finally runs can differ from the text that was
 * policy-checked and shown for approval — `reloadx\x7f` would pass as
 * "reloadx" and run `reload`. A command is one printable line.
 */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/

export function hasUnsafeCharacters(command: string): boolean {
  return UNSAFE_CHARS.test(command)
}

export function evaluatePolicy(
  command:    string,
  permission: AiPermission,
  blacklist:  string[],
  highRiskPatterns: string[] = DEFAULT_HIGH_RISK_CONFIRM,
): PolicyDecision {
  if (!command || typeof command !== 'string') {
    return {
      blockReason: '(rejected by safety policy: empty or non-string command)',
      requiresConfirmation: false,
    }
  }
  if (hasUnsafeCharacters(command)) {
    return {
      blockReason: '(rejected by safety policy: command contains control or invisible characters — send one plain printable command)',
      requiresConfirmation: false,
    }
  }
  if (isBlacklisted(command, blacklist)) {
    return {
      blockReason: '(rejected by server-side blacklist — refine or ask the user to whitelist this command)',
      requiresConfirmation: false,
    }
  }
  if (permission === 'troubleshoot') {
    if (hasShellChaining(command)) {
      return {
        blockReason: '(rejected: troubleshoot mode does not allow command chaining, redirection or shell substitution. Switch to Fix Mode or Auto Pilot.)',
        requiresConfirmation: false,
      }
    }
    if (!isReadOnlyCommand(command)) {
      return {
        blockReason: '(rejected: troubleshoot mode allows read-only commands only. Switch to Fix Mode or Auto Pilot for state-changing operations.)',
        requiresConfirmation: false,
      }
    }
    return { blockReason: null, requiresConfirmation: false }
  }

  // full-access: denylist already applied; high-risk still needs a human click.
  // A plain read-only command (`show ip route`) is never high-risk, even when
  // it contains a high-risk phrase like "ip route".
  const readOnly = !hasShellChaining(command) && isReadOnlyCommand(command)
  return {
    blockReason: null,
    requiresConfirmation: !readOnly && isHighRiskCommand(command, highRiskPatterns),
  }
}

export function mergeBlacklists(stored: string[], sessionExtra?: string[]): string[] {
  const merged = [...stored]
  for (const raw of sessionExtra ?? []) {
    const p = raw.trim()
    if (p && !merged.some((x) => x.toLowerCase() === p.toLowerCase())) merged.push(p)
  }
  return merged
}

/** Ensure locked core patterns are always present regardless of user edits. */
export function withLockedBlacklist(userList: string[], locked: string[]): string[] {
  return mergeBlacklists(locked, userList)
}

// Read-only, but heavy on a busy control plane or long-running.
const HEAVY_READ_ONLY = [
  /^sh(o(w)?)?\s+tech/i,
  /^tcpdump\b/i,
  /^diagnose\s+sniffer\b/i,
  /^(ping|traceroute)\b.*\b(repeat|count|-c)\s*(\d{3,})/i,
  /^ping\b.*\s-f\b/i,
]

/** Read-only, but costly enough on a busy device to need a click. */
export function isHeavyReadOnly(command: string): boolean {
  const c = command.trim()
  return HEAVY_READ_ONLY.some((re) => re.test(c))
}

/** A command ARIA may run by itself through run_command: one plain read-only line. */
export function isInspectionCommand(command: string): boolean {
  return !hasUnsafeCharacters(command) && !hasShellChaining(command) && isReadOnlyCommand(command)
}

export interface ToolCallContext {
  /** Turn started by Auto Watch from device output, not by the user. */
  isProactive:      boolean
  /** Session the chat belongs to. */
  sessionId:        string
  /** Session the model asked to run the command on (target_session). */
  targetSession?:   string
  /** Sessions the user has open and shared with ARIA. */
  knownSessionIds:  string[]
  /** Whether propose_change is available (Change / Autopilot mode). */
  changesAllowed:   boolean
}

export interface ToolCallVerdict {
  blockReason:          string | null
  /** Read-only but heavy, proactive or on another session: the UI waits for a click. */
  requiresConfirmation: boolean
  /** Main's decision that the command may run without a click. */
  autoApprove:          boolean
}

/**
 * Final decision for one run_command call. run_command only inspects: it runs
 * read-only commands in every mode, and anything that changes the device has
 * to go through a change plan (propose_change). Main decides — the renderer
 * only auto-runs when `autoApprove` is true. Device output can steer the
 * model, so nothing a proactive (Auto Watch) turn or a cross-session command
 * asks for runs unattended.
 */
export function decideToolCall(
  command:   string,
  ctx:       ToolCallContext,
  blacklist: string[],
): ToolCallVerdict {
  const block = (reason: string): ToolCallVerdict => ({ blockReason: reason, requiresConfirmation: false, autoApprove: false })

  const target = ctx.targetSession || ctx.sessionId
  if (target !== ctx.sessionId && !ctx.knownSessionIds.includes(target)) {
    return block('(rejected: target_session is not one of the sessions open in this conversation)')
  }
  if (!command || typeof command !== 'string' || !command.trim()) {
    return block('(rejected by safety policy: empty or non-string command)')
  }
  if (hasUnsafeCharacters(command)) {
    return block('(rejected by safety policy: command contains control or invisible characters — send one plain printable command)')
  }
  if (isBlacklisted(command, blacklist)) {
    return block('(rejected by the blocked-commands list — refine the command or ask the engineer)')
  }
  if (!isInspectionCommand(command)) {
    return block(ctx.changesAllowed
      ? '(rejected: run_command only runs single read-only commands. To change the device, call propose_change with a full change plan.)'
      : '(rejected: Investigate mode is read-only. Describe the fix and ask the engineer to switch ARIA to Change mode.)')
  }

  const heavy        = isHeavyReadOnly(command)
  const crossSession = target !== ctx.sessionId
  const needsClick   = heavy || ctx.isProactive || crossSession
  return { blockReason: null, requiresConfirmation: needsClick, autoApprove: !needsClick }
}
