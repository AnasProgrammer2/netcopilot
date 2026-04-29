/**
 * Parses a ~/.ssh/config file into an array of parsed host entries.
 * Ignores wildcard entries (Host *, Host ?, etc.).
 */

export interface SshConfigHost {
  /** The Host alias (connection name) */
  name: string
  /** HostName directive — falls back to name if absent */
  hostname: string
  port: number
  username: string
  identityFile?: string
  /** Raw key-value pairs for reference */
  extra: Record<string, string>
}

export function parseSshConfig(content: string): SshConfigHost[] {
  const hosts: SshConfigHost[] = []
  let current: Partial<SshConfigHost & { extra: Record<string, string> }> | null = null

  const finalizeCurrent = () => {
    if (!current?.name) return
    // Skip wildcards / patterns
    if (current.name.includes('*') || current.name.includes('?') || current.name.includes('!')) return
    hosts.push({
      name:         current.name,
      hostname:     current.hostname ?? current.name,
      port:         current.port     ?? 22,
      username:     current.username ?? '',
      identityFile: current.identityFile,
      extra:        current.extra    ?? {}
    })
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // Key/value — supports both "Key Value" and "Key=Value"
    const match = line.match(/^(\w[\w-]*)\s*[= ]\s*(.+)$/)
    if (!match) continue
    const [, key, value] = match
    const k = key.toLowerCase()

    if (k === 'host') {
      finalizeCurrent()
      current = { name: value.trim(), extra: {} }
    } else if (current) {
      switch (k) {
        case 'hostname':       current.hostname     = value.trim(); break
        case 'port':           current.port         = parseInt(value) || 22; break
        case 'user':           current.username     = value.trim(); break
        case 'identityfile':   current.identityFile = value.trim(); break
        default:               current.extra![key]  = value.trim()
      }
    }
  }

  finalizeCurrent()
  return hosts
}
