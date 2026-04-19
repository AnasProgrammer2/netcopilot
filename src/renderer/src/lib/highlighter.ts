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
      (ifname) => col(C.bold + C.cyan, ifname)
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
  out = out.replace(/\bvrf\s+(\S+)/gi, (_m, v) => `vrf ${col(C.magenta, v)}`)

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
export function highlightNokia(line: string): string {
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
// CISCO ASA
// ─────────────────────────────────────────────────────────────────────────────
function highlightCiscoAsa(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: hostname# or hostname/ctx#
  if (/^[\w/.-]+(\/\w+)?[>#]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(Teardown|Denied|No route|unreachable|failed|error)\b/i.test(plain))
    return col(C.red, plain)
  if (/\b(Built|Permitted|allowed|success|established)\b/i.test(plain))
    return col(C.green, plain)
  if (/\b(warning|inspect|nat)\b/i.test(plain))
    return col(C.yellow, plain)

  let out = plain
  out = out.replace(/\b(access-list|nat|object|policy-map|class-map|service-policy|crypto|tunnel-group)\b/gi,
    (kw) => col(C.bold + C.blue, kw))
  out = out.replace(/\b(inside|outside|dmz)\b/gi, (z) => col(C.magenta, z))
  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// HUAWEI VRP
// ─────────────────────────────────────────────────────────────────────────────
function highlightHuawei(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: <hostname> or [hostname]
  if (/^[<\[][A-Za-z0-9_.-]+[>\]]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(Error|failed|invalid|down|unreachable)\b/i.test(plain))
    return col(C.red, plain)
  if (/\b(up|success|active|established)\b/i.test(plain))
    return col(C.green, plain)
  if (/\b(Warning)\b/i.test(plain))
    return col(C.yellow, plain)

  let out = plain
  out = out.replace(/\b(interface|ip route|ospf|bgp|isis|mpls|vpn-instance|acl|firewall|nat|stp|vlan)\b/gi,
    (kw) => col(C.bold + C.blue, kw))
  out = out.replace(/\b(GigabitEthernet|XGigabitEthernet|Eth-Trunk|LoopBack|Vlanif|Tunnel|Serial)\b/gi,
    (iface) => col(C.cyan, iface))
  out = out.replace(/\b(display|undo|commit|save|quit|return|sysname)\b/gi,
    (cmd) => col(C.bold + C.green, cmd))
  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// MIKROTIK ROUTEROS
// ─────────────────────────────────────────────────────────────────────────────
function highlightMikrotik(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: [admin@hostname] /path>
  if (/^\[.*@.*\]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(failure|invalid|error|no such)\b/i.test(plain))
    return col(C.red, plain)
  if (/\b(added|removed|success|running|enabled)\b/i.test(plain))
    return col(C.green, plain)
  if (/\b(disabled|warning)\b/i.test(plain))
    return col(C.yellow, plain)

  let out = plain
  // Menu paths
  out = out.replace(/(\/[\w-]+(\/[\w-]+)*)/g, (p) => col(C.bold + C.blue, p))
  // Properties
  out = out.replace(/(\w[\w-]*)=([\S]+)/g, (_, k, v) =>
    `${col(C.cyan, k)}=${col(C.yellow, v)}`)
  out = out.replace(/\b(add|remove|set|print|export|enable|disable|find|monitor)\b/gi,
    (cmd) => col(C.bold + C.green, cmd))
  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// FORTINET FORTIOS
// ─────────────────────────────────────────────────────────────────────────────
function highlightFortiOS(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: hostname # or hostname (vdom) #
  if (/^[\w-]+(\s*\([\w-]+\))?\s*[#$]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(error|failed|invalid|denied|blocked)\b/i.test(plain))
    return col(C.red, plain)
  if (/\b(success|accepted|allowed|up|established)\b/i.test(plain))
    return col(C.green, plain)
  if (/\b(warning|notice)\b/i.test(plain))
    return col(C.yellow, plain)

  let out = plain
  out = out.replace(/\b(config|edit|set|unset|append|next|end|get|show|execute|diagnose)\b/gi,
    (cmd) => col(C.bold + C.blue, cmd))
  out = out.replace(/\b(firewall|policy|address|service|vip|ipsec|ssl-vpn|router|system|interface|vdom)\b/gi,
    (kw) => col(C.magenta, kw))
  out = out.replace(/"([^"]+)"/g, (_q, v) => `"${col(C.yellow, v)}"`)
  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// HP PROCURVE / ARUBA
// ─────────────────────────────────────────────────────────────────────────────
function highlightHpProcurve(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: hostname# or hostname(config)#
  if (/^[\w-]+(\([\w/-]+\))?[#>]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(error|invalid|failed|down)\b/i.test(plain))  return col(C.red, plain)
  if (/\b(up|active|success|enabled)\b/i.test(plain))  return col(C.green, plain)
  if (/\b(warning|disabled)\b/i.test(plain))           return col(C.yellow, plain)

  let out = plain
  out = out.replace(/\b(interface|vlan|spanning-tree|trunk|lacp|qos|routing|ip|snmp|aaa)\b/gi,
    (kw) => col(C.bold + C.blue, kw))
  out = out.replace(/\b(show|configure|no|write|copy|reload)\b/gi,
    (cmd) => col(C.bold + C.green, cmd))
  return colorIPs(out)
}

// ─────────────────────────────────────────────────────────────────────────────
// F5 BIG-IP TMOS
// ─────────────────────────────────────────────────────────────────────────────
function highlightF5(line: string): string {
  const plain = stripAnsi(line)

  // Prompt: user@hostname[ctx]#
  if (/^\w+@[\w-]+(:\[\w+\])?[#(]/.test(plain.trim()))
    return col(C.bold + C.cyan, plain)

  if (/\b(error|failed|invalid|down)\b/i.test(plain))  return col(C.red, plain)
  if (/\b(success|up|active|available)\b/i.test(plain)) return col(C.green, plain)
  if (/\b(warning|standby|offline)\b/i.test(plain))    return col(C.yellow, plain)

  let out = plain
  out = out.replace(/\b(ltm|gtm|apm|asm|afm|sys|net|virtual|pool|node|monitor|profile|rule|iRule)\b/gi,
    (kw) => col(C.bold + C.blue, kw))
  out = out.replace(/\b(create|modify|delete|list|show|save|load|run|publish)\b/gi,
    (cmd) => col(C.bold + C.green, cmd))
  out = out.replace(/\{([^}]*)\}/g, (_b, body) => `{${col(C.yellow, body)}}`)
  return colorIPs(out)
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
    case 'cisco-asa':   return highlightCiscoAsa(line)
    case 'junos':       return highlightJunos(line)
    case 'arista-eos':  return highlightArista(line)
    case 'panos':       return highlightPanos(line)
    case 'nokia-sros':  return highlightNokia(line)
    case 'huawei-vrp':  return highlightHuawei(line)
    case 'mikrotik':    return highlightMikrotik(line)
    case 'fortios':     return highlightFortiOS(line)
    case 'hp-procurve': return highlightHpProcurve(line)
    case 'f5-tmos':     return highlightF5(line)
    default:            return colorIPs(stripAnsi(line))
  }
}

/**
 * Streaming highlighter — NO buffering.
 * Highlights only complete lines (ending with \r\n or \n).
 * Everything else (partial echoes, cursor moves, prompts) passes through untouched.
 */
export class TerminalHighlighter {
  private deviceType: DeviceType

  constructor(deviceType: DeviceType) {
    this.deviceType = deviceType
  }

  process(data: string): string {
    // If no newline in this chunk → it's interactive echo / prompt / control seq.
    // Pass through immediately without touching it.
    if (!data.includes('\n')) return data

    // Split at every newline boundary.
    // parts = [segment, sep, segment, sep, ..., lastSegment]
    const parts = data.split(/(\r?\n)/g)
    let out = ''

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // Newline separator — keep as-is
        out += parts[i]
      } else if (i === parts.length - 1) {
        // Last segment has no trailing newline → partial / prompt → pass through
        out += parts[i]
      } else {
        // Complete line (followed by newline) → apply highlighting
        out += highlightLine(parts[i], this.deviceType)
      }
    }

    return out
  }
}
