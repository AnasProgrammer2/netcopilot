/**
 * Locked core denylist — always enforced in every mode. Users cannot remove
 * these via Settings; they are merged at policy evaluation time.
 */
export const LOCKED_AI_BLACKLIST: string[] = [
  'write erase',
  'erase startup-config',
  'erase nvram',
  'factory-reset',
  'factory reset',
  'reload',
  'reboot',
  'shutdown',
  'poweroff',
  'halt',
  'rm -rf',
  'mkfs',
  'dd if=',
  'shred',
  'wipefs',
  'crypto key zeroize',
  'request system zeroize',
  '/system reset-configuration',
  'execute reset',
  'execute formatlogdisk',
  'format c:',
]

/**
 * Default AI command blacklist — seeded into the DB on first run.
 * Users can edit/extend these via Settings → AI or the per-session toolbar.
 * Locked patterns above are always applied even if removed from this list.
 */
export const DEFAULT_AI_BLACKLIST: string[] = [
  ...LOCKED_AI_BLACKLIST,

  // ── Cisco IOS / IOS-XE / NX-OS ────────────────────────────────
  'no ip route 0.0.0.0',
  'no router',
  'no interface',
  'no vlan',
  'clear crypto',
  'no access-list',
  'no ip access-list',

  // ── Linux / Unix ───────────────────────────────────────────────
  'chmod 777 /',
  '> /dev/',
  'systemctl stop',
  'service stop',
  'iptables -F',
  'iptables --flush',

  // ── Junos ──────────────────────────────────────────────────────
  'request system reboot',
  'request system halt',

  // ── MikroTik ──────────────────────────────────────────────────
  '/system reboot',

  // ── Windows ───────────────────────────────────────────────────
  'shutdown /r',
  'shutdown /s',
  'Remove-Item -Recurse',
  'del /f /s /q',
]

/**
 * High-risk patterns that remain allowed in full-access (not hard-blocked)
 * but must always pause for explicit user confirmation — even in Auto Pilot.
 * This is the capability layer beyond the denylist alone.
 */
export const HIGH_RISK_CONFIRM_PATTERNS: string[] = [
  'configure terminal',
  'configure',
  'conf t',
  'config t',
  'write memory',
  'write mem',
  'wr mem',
  'wr ',
  'copy running-config',
  'copy run',
  'commit',
  'rollback',
  'interface ',
  'no interface',
  'ip route',
  'ipv6 route',
  'route-map',
  'access-list',
  'ip access-list',
  'iptables',
  'nft ',
  'ufw ',
  'systemctl',
  'service ',
  'mount ',
  'umount ',
  'useradd',
  'userdel',
  'passwd',
  'chmod ',
  'chown ',
  'mkfs',
  'fdisk',
  'parted',
]
