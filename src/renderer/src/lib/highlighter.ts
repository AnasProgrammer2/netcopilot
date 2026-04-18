/**
 * Terminal Syntax Highlighter
 * Applies ANSI colors to terminal output based on device type
 */

import { DeviceType } from '../types'

// ANSI color helpers
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[91m',
  green:   '\x1b[92m',
  yellow:  '\x1b[93m',
  blue:    '\x1b[94m',
  magenta: '\x1b[95m',
  cyan:    '\x1b[96m',
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  orange:  '\x1b[38;5;208m',
  teal:    '\x1b[38;5;87m',
}

const HAS_ANSI = /\x1b\[[\d;]*m/
const STRIP_ANSI = /\x1b\[[\d;]*m/g

function hasAnsi(s: string): boolean { return HAS_ANSI.test(s) }
function stripAnsi(s: string): string { return s.replace(STRIP_ANSI, '') }

function col(color: string, text: string): string {
  return `${color}${text}${C.reset}`
}

// Replace pattern in plain text (no ANSI), returns colored string
function applyPattern(line: string, pattern: RegExp, colorFn: (m: string) => string): string {
  return line.replace(pattern, (m) => colorFn(m))
}

// Common patterns shared across devices
const IP_RE    = /\b(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?\b/g
const IPV6_RE  = /\b([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}\b/g
const MAC_RE   = /\b([0-9a-fA-F]{2}[.:-]){5}[0-9a-fA-F]{2}\b/gi

function colorIPs(line: string): string {
  return line
    .replace(IP_RE,  (m) => col(C.cyan,    m))
    .replace(IPV6_RE,(m) => col(C.teal,    m))
    .replace(MAC_RE, (m) => col(C.magenta, m))
}

// ─────────────────────────────────────────────────────────────────────────────
// LINUX / Ubuntu / Debian
// ─────────────────────────────────────────────────────────────────────────────
function highlightLinux(line: string): string {
  const plain = stripAnsi(line)

  // Already has server-side ANSI (like bash prompt colors) — just enhance errors/warnings
  if (hasAnsi(line)) {
    if (/\b(error|failed|denied|fatal|critical|abort)/i.test(plain))
      return `${C.red}${plain}${C.reset}`
    if (/\b(warning|warn)\b/i.test(plain))
      return `${C.yellow}${plain}${C.reset}`
    return line
  }

  // Root/user prompt:  root@host:~# or user@host:~$
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+/.test(plain)) {
    return applyPattern(plain, /^([a-zA-Z0-9._-]+)(@)([a-zA-Z0-9._-]+)(:.+?)([$#])/, (m) => {
      return m
        .replace(/^([a-zA-Z0-9._-]+)/, (u) => col(C.bold + C.green, u))
        .replace(/@/, col(C.gray, '@'))
        .replace(/(?<=@)([a-zA-Z0-9._-]+)/, (h) => col(C.green, h))
        .replace(/(:.+?)([$#])$/, (_, path, ch) =>
          col(C.blue, path) + col(C.bold + C.white, ch)
        )
    })
  }

  // Error keywords
  if (/\b(error|failed|denied|fatal|critical|not found|no such file|permission denied|abort)/i.test(plain))
    return col(C.red, plain)

  // Warning keywords
  if (/\b(warning|warn|deprecated|caution)\b/i.test(plain))
    return col(C.yellow, plain)

  // Success keywords
  if (/\b(ok|done|success|enabled|started|active|running|passed|complete)\b/i.test(plain))
    return col(C.green, plain)

  // Systemd status lines
  if (/\[ *OK *\]/i.test(plain))    return plain.replace(/\[ *OK *\]/i, col(C.bold + C.green, '[ OK ]'))
  if (/\[FAILED\]/i.test(plain))    return plain.replace(/\[FAILED\]/i, col(C.bold + C.red, '[FAILED]'))
  if (/\[WARNING\]/i.test(plain))   return plain.replace(/\[WARNING\]/i, col(C.bold + C.yellow, '[WARNING]'))

  // Package manager lines
  if (/^(Installing|Removing|Upgrading|Fetching|Get:|Hit:|Ign:)/i.test(plain))
    return col(C.cyan, plain)

  // sudo / su
  if (/^sudo|^su /.test(plain)) return col(C.yellow, plain)

  return colorIPs(plain)
}

// ─────────────────────────────────────────────────────────────────────────────
// CISCO IOS / IOS-XE / NX-OS
// ─────────────────────────────────────────────────────────────────────────────
function highlightCisco(line: string): string {
  const plain = stripAnsi(line)

  // Cisco error: lines starting with %
  if (/^%/.test(plain)) {
    if (/%(.*)(error|down|fail|invalid|denied|bad|reject|not|unable)/i.test(plain))
      return col(C.red, plain)
    if (/%(.*)(warn|caution|minor|notification)/i.test(plain))
      return col(C.yellow, plain)
    if (/%(.*)(up|success|ok|accept|adj|neighbor)/i.test(plain))
      return col(C.green, plain)
    return col(C.orange, plain)  // generic syslog
  }

  // Privilege prompt: Router# or Router(config)#
  if (/^[A-Za-z0-9._-]+(\([^)]+\))?[>#]$/.test(plain.trim()))
    return col(C.bold + C.yellow, plain)

  // Interface status table (show interfaces / show ip int brief)
  if (/^(GigabitEthernet|FastEthernet|TenGigabitEthernet|HundredGigE|Loopback|Vlan|Tunnel|Serial|Bundle-Ether|mgmt)/i.test(plain)) {
    let out = plain
    // Interface name → cyan
    out = out.replace(
      /^(GigabitEthernet|FastEthernet|TenGigabitEthernet|HundredGigE|Loopback|Vlan|Tunnel|Serial|Bundle-Ether|mgmt\d*)/i,
      (m) => col(C.bold + C.cyan, m)
    )
    // Status: up → green, down → red
    out = out.replace(/\bup\b/g,   col(C.green, 'up'))
    out = out.replace(/\bdown\b/g, col(C.red, 'down'))
    out = out.replace(/\badministratively down\b/g, col(C.red, 'administratively down'))
    return colorIPs(out)
  }

  // Short interface names in show commands: Gi0/0, Fa0/1, Te1/0/1
  let out = plain
  out = out.replace(/\b(Gi|Fa|Te|Hu|Lo|Vl|Tu|Se|Po|Mg)\d+[/\d]*/g, (m) => col(C.cyan, m))
  out = out.replace(/\bup\b/g,   col(C.green, 'up'))
  out = out.replace(/\bdown\b/g, col(C.red,   'down'))

  // BGP/OSPF neighbor states
  out = out.replace(/\b(Established|Full|2WAY|EXSTART|EXCHANGE|LOADING)\b/g, (m) => col(C.green, m))
  out = out.replace(/\b(Idle|Active|Connect|Down|Attempt)\b/g, (m) => col(C.red, m))

  // VRF names
  out = out.replace(/\bvrf\s+(\S+)/gi, (m, v) => `vrf ${col(C.magenta, v)}`)

  // Table headers (all caps line)
  if (/^[A-Z][A-Z\s]{10,}$/.test(plain.trim()))
    return col(C.bold + C.gray, plain)

  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// JUNIPER JunOS
// ─────────────────────────────────────────────────────────────────────────────
function highlightJunos(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: user@hostname>  or  user@hostname#
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+[>#]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  // [edit] hierarchy
  if (/^\[edit.*\]/.test(plain.trim()))
    return col(C.yellow, plain)

  // Commit messages
  if (/commit complete/i.test(plain)) return col(C.bold + C.green, plain)
  if (/commit failed/i.test(plain))   return col(C.bold + C.red, plain)
  if (/syntax error/i.test(plain))    return col(C.red, plain)

  // Interface names: ge-0/0/0, xe-0/0/0, et-0/0/0, ae0, lo0
  let out = plain
  out = out.replace(/\b(ge|xe|et|fe|ae|lo|irb|em|fxp|vme|bme|ms|mt|pp|gr|ip|pd|pe|si|sp|vt|lsq|lsi|dsc|gre|ipip|jsrv|llt|mtun|pimd|pime|tap|vcp|vt)-?\d+[/\d.]*/gi,
    (m) => col(C.cyan, m))

  // Physical / protocol up/down
  out = out.replace(/\bPhysical link is (\w+)/i, (_, s) =>
    `Physical link is ${s.toLowerCase() === 'up' ? col(C.green, s) : col(C.red, s)}`)

  // error / warning
  if (/\berror\b/i.test(plain))   return col(C.red, plain)
  if (/\bwarning\b/i.test(plain)) return col(C.yellow, plain)

  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// ARISTA EOS
// ─────────────────────────────────────────────────────────────────────────────
function highlightArista(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: hostname#  or  hostname(config)#
  if (/^[A-Za-z0-9._-]+(\([^)]+\))?#$/.test(plain.trim()))
    return col(C.bold + C.green, plain)

  // % errors (same as Cisco)
  if (/^%/.test(plain)) return col(C.red, plain)

  let out = plain
  // Interface names: Ethernet1, Management0, Loopback0, Port-Channel1, Vlan10
  out = out.replace(/\b(Ethernet|Management|Loopback|Port-Channel|Vlan|Tunnel|Vxlan)\d+/gi,
    (m) => col(C.cyan, m))
  out = out.replace(/\bconnected\b/gi,    col(C.green,  'connected'))
  out = out.replace(/\bnotconnect\b/gi,   col(C.red,    'notconnect'))
  out = out.replace(/\berrdisabled\b/gi,  col(C.red,    'errdisabled'))
  out = out.replace(/\bup\b/g,            col(C.green,  'up'))
  out = out.replace(/\bdown\b/g,          col(C.red,    'down'))

  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// NOKIA SR-OS
// ─────────────────────────────────────────────────────────────────────────────
function highlightNokia(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: A:hostname# or B:hostname>
  if (/^[A-Z]:[A-Za-z0-9._-]+[#>]/.test(plain.trim()))
    return col(C.bold + C.magenta, plain)

  // MINOR / MAJOR / CRITICAL syslog
  if (/\bCRITICAL\b/.test(plain)) return col(C.bold + C.red, plain)
  if (/\bMAJOR\b/.test(plain))    return col(C.red, plain)
  if (/\bMINOR\b/.test(plain))    return col(C.yellow, plain)
  if (/\bWARNING\b/.test(plain))  return col(C.yellow, plain)

  let out = plain
  // Port notation: 1/1/1, 1/1/c1
  out = out.replace(/\b\d+\/\d+\/[c\d]+\b/g, (m) => col(C.cyan, m))
  out = out.replace(/\boper-state\s+(up|inService)/gi,   (m) => col(C.green, m))
  out = out.replace(/\boper-state\s+(down|outOfService)/gi, (m) => col(C.red, m))
  out = out.replace(/\bUp\b/g,   col(C.green, 'Up'))
  out = out.replace(/\bDown\b/g, col(C.red,   'Down'))

  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// PALO ALTO PAN-OS
// ─────────────────────────────────────────────────────────────────────────────
function highlightPanos(line: string): string {
  const plain = stripAnsi(line)

  if (/^admin@[A-Za-z0-9._-]+[>#]/.test(plain.trim()))
    return col(C.bold + C.orange, plain)

  if (/\b(error|failed|denied|invalid)\b/i.test(plain)) return col(C.red, plain)
  if (/\b(warning)\b/i.test(plain))                     return col(C.yellow, plain)
  if (/\b(completed|success|active)\b/i.test(plain))    return col(C.green, plain)

  return colorIPs(plain)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export function highlightLine(line: string, deviceType: DeviceType): string {
  switch (deviceType) {
    case 'linux':       return highlightLinux(line)
    case 'cisco-ios':
    case 'cisco-iosxe':
    case 'cisco-nxos':  return highlightCisco(line)
    case 'junos':       return highlightJunos(line)
    case 'arista-eos':  return highlightArista(line)
    case 'panos':       return highlightPanos(line)
    default:            return colorIPs(stripAnsi(line))
  }
}

/**
 * Buffered highlighter — handles partial lines arriving in chunks.
 * Call process(chunk) on every data event, it returns colorized output.
 */
export class TerminalHighlighter {
  private buffer = ''
  private deviceType: DeviceType

  constructor(deviceType: DeviceType) {
    this.deviceType = deviceType
  }

  process(data: string): string {
    this.buffer += data
    let out = ''

    // Split on newline boundaries, keep last partial line in buffer
    const parts = this.buffer.split(/(\r?\n)/)
    // parts = [line, sep, line, sep, ..., lastPartial]
    // Every even index is content, odd is separator
    for (let i = 0; i < parts.length - 1; i += 2) {
      const lineContent = parts[i]
      const sep         = parts[i + 1] ?? ''
      out += highlightLine(lineContent, this.deviceType) + sep
    }

    // Last element is the incomplete line — keep buffered
    this.buffer = parts[parts.length - 1]

    return out
  }

  flush(): string {
    const remaining = this.buffer ? highlightLine(this.buffer, this.deviceType) : ''
    this.buffer = ''
    return remaining
  }
}
