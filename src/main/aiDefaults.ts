/**
 * Default AI command blacklist — seeded into the DB on first run.
 * Users can edit/extend these via Settings → AI or the per-session toolbar.
 */
export const DEFAULT_AI_BLACKLIST: string[] = [
  // ── Universal destructive ──────────────────────────────────────
  'reload',
  'reboot',
  'shutdown',
  'poweroff',
  'halt',
  'write erase',
  'erase startup-config',
  'erase nvram',
  'factory-reset',
  'factory reset',

  // ── Cisco IOS / IOS-XE / NX-OS ────────────────────────────────
  'no ip route 0.0.0.0',
  'no router',
  'no interface',
  'no vlan',
  'crypto key zeroize',
  'clear crypto',
  'no access-list',
  'no ip access-list',

  // ── Linux / Unix ───────────────────────────────────────────────
  'rm -rf',
  'mkfs',
  'dd if=',
  'chmod 777 /',
  '> /dev/',
  'shred',
  'wipefs',
  'systemctl stop',
  'service stop',
  'iptables -F',
  'iptables --flush',

  // ── FortiGate ──────────────────────────────────────────────────
  'execute reset',
  'execute formatlogdisk',

  // ── Junos ──────────────────────────────────────────────────────
  'request system reboot',
  'request system halt',
  'request system zeroize',

  // ── MikroTik ──────────────────────────────────────────────────
  '/system reset-configuration',
  '/system reboot',

  // ── Windows ───────────────────────────────────────────────────
  'shutdown /r',
  'shutdown /s',
  'format c:',
  'Remove-Item -Recurse',
  'del /f /s /q',
]
