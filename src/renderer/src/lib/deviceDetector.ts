/**
 * deviceDetector.ts
 *
 * Analyses raw terminal output (banner + prompt) to determine the
 * DeviceType of a connected device. Called automatically when a
 * connection is configured as deviceType = 'auto'.
 *
 * Detection order: most-specific patterns first to avoid false
 * positives (e.g. IOS-XE must be tested before generic IOS).
 */

import type { DeviceType } from '../types'

/** Strip ANSI escape codes from a string */
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[mGKHFABCDJSTPM]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\r/g, '')
}

interface Rule {
  type: DeviceType
  patterns: RegExp[]
}

const RULES: Rule[] = [
  // ── Cisco ────────────────────────────────────────────────────────────────────
  { type: 'cisco-nxos',  patterns: [/NX-OS|Nexus Operating System|NXOS/i] },
  { type: 'cisco-iosxe', patterns: [/IOS.XE|IOS-XE|Cisco IOS XE/i] },
  { type: 'cisco-asa',   patterns: [/Adaptive Security Appliance|Cisco ASA|asa.*software/i] },
  { type: 'cisco-ios',   patterns: [/Cisco IOS(?! XE)/i, /\bIOS\b.*Copyright.*Cisco/i] },

  // ── Juniper ──────────────────────────────────────────────────────────────────
  { type: 'junos',       patterns: [/JUNOS|Juniper Networks.*Junos/i] },

  // ── Arista ───────────────────────────────────────────────────────────────────
  { type: 'arista-eos',  patterns: [/Arista Networks|Arista EOS|\bEOS\b.*Arista/i] },

  // ── Palo Alto ────────────────────────────────────────────────────────────────
  { type: 'panos',       patterns: [/PAN-OS|Palo Alto Networks/i] },

  // ── Fortinet ─────────────────────────────────────────────────────────────────
  { type: 'fortios',     patterns: [/FortiOS|FortiGate/i] },

  // ── MikroTik ─────────────────────────────────────────────────────────────────
  { type: 'mikrotik',    patterns: [/MikroTik|RouterOS/i] },

  // ── Nokia (SROS) ─────────────────────────────────────────────────────────────
  { type: 'nokia-sros',  patterns: [/TiMOS|Nokia.*Service Router|SROS/i] },

  // ── Huawei ───────────────────────────────────────────────────────────────────
  { type: 'huawei-vrp',  patterns: [/Huawei|VRP|HUAWEI/i] },

  // ── HP ProCurve / Comware ────────────────────────────────────────────────────
  { type: 'hp-procurve', patterns: [/ProCurve|HP.*Comware|H3C|Comware Software/i] },

  // ── F5 ───────────────────────────────────────────────────────────────────────
  { type: 'f5-tmos',     patterns: [/BIG-IP|F5 Networks|TMOS/i] },

  // ── Windows ──────────────────────────────────────────────────────────────────
  { type: 'windows',     patterns: [/Microsoft Windows|Windows PowerShell|C:\\\\.*>/i] },

  // ── Linux (last — very broad) ────────────────────────────────────────────────
  {
    type: 'linux',
    patterns: [
      /Ubuntu|Debian|CentOS|Red Hat|Fedora|Alpine Linux|Arch Linux/i,
      /GNU\/Linux/i,
      /Last login:.*(pts|tty)/i,
      /\$\s*$/, // shell prompt ending with $
    ]
  },
]

/**
 * Detect device type from raw terminal output.
 * Returns null if unable to determine (caller should probe further).
 */
export function detectDeviceType(rawOutput: string): DeviceType | null {
  const text = strip(rawOutput)
  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      return rule.type
    }
  }
  return null
}

/**
 * Returns the single probe command to send when banner detection fails.
 * The response should then be passed back to detectDeviceType().
 */
export const PROBE_COMMAND = 'show version'

/**
 * Human-readable label for each device type (used in toast notifications).
 */
export const DEVICE_LABELS: Record<DeviceType, string> = {
  'auto':        'Auto-detect',
  'cisco-ios':   'Cisco IOS',
  'cisco-iosxe': 'Cisco IOS XE',
  'cisco-nxos':  'Cisco NX-OS',
  'cisco-asa':   'Cisco ASA',
  'junos':       'Junos (Juniper)',
  'arista-eos':  'Arista EOS',
  'panos':       'PAN-OS (Palo Alto)',
  'nokia-sros':  'Nokia SR-OS',
  'huawei-vrp':  'Huawei VRP',
  'mikrotik':    'MikroTik RouterOS',
  'fortios':     'FortiOS',
  'hp-procurve': 'HP ProCurve',
  'f5-tmos':     'F5 TMOS',
  'linux':       'Linux',
  'windows':     'Windows',
  'generic':     'Generic',
}
