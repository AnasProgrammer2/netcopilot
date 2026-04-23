/**
 * Global registry of active xterm Terminal instances.
 * TerminalTab registers its instance; AiPanel reads context from it.
 */
export interface TerminalHandle {
  getContext:     (lines?: number) => string
  sendData:       (data: string) => void
  scrollToBottom: () => void
  reconnect:      () => void
}

export interface StructuredContext {
  hostname:       string | null
  prompt:         string | null
  recentCommands: Array<{ command: string; output: string }>
  rawTail:        string
}

const registry = new Map<string, TerminalHandle>()

/** Extract hostname from common prompts: "Router#", "user@host:~$", "[admin@MikroTik]>", etc. */
function extractHostname(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i].trim()
    if (!line) continue
    // Cisco: "Router#" or "Router>" or "Router(config)#"
    const cisco = line.match(/^([A-Za-z0-9._-]+)(?:\([^)]*\))?[#>]\s*$/)
    if (cisco) return cisco[1]
    // Linux: "user@hostname:~$" or "root@hostname#"
    const linux = line.match(/@([A-Za-z0-9._-]+)[:\s].*[$#]\s*$/)
    if (linux) return linux[1]
    // MikroTik: "[admin@MikroTik] >"
    const mikrotik = line.match(/\[.*@([A-Za-z0-9._-]+)\]\s*[>]\s*$/)
    if (mikrotik) return mikrotik[1]
    // Junos: "user@hostname>"
    const junos = line.match(/^[A-Za-z0-9._-]+@([A-Za-z0-9._-]+)[>#]\s*$/)
    if (junos) return junos[1]
    // FortiGate: "FGT-NAME #" or "FGT-NAME $"
    const forti = line.match(/^([A-Za-z0-9._-]+)\s*[#$]\s*$/)
    if (forti) return forti[1]
  }
  return null
}

/** Detect the current prompt line (last non-empty line that looks like a prompt) */
function extractPrompt(lines: string[]): string | null {
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i].trim()
    if (!line) continue
    if (/[#>$%]\s*$/.test(line) || /\]\s*[>$#]\s*$/.test(line)) return line
  }
  return null
}

/**
 * Parse raw terminal buffer into structured context: recent command/output pairs.
 * Heuristic: a "command" is a line that matches a prompt pattern followed by text.
 */
function parseCommandOutputPairs(lines: string[], maxPairs = 5): Array<{ command: string; output: string }> {
  const promptPattern = /^.*[#>$%]\s*.+/
  const pairs: Array<{ command: string; output: string }> = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (promptPattern.test(line.trim())) {
      const cmdMatch = line.trim().match(/^.*?[#>$%]\s*(.+)$/)
      if (cmdMatch && cmdMatch[1].trim()) {
        const cmd = cmdMatch[1].trim()
        const outputLines: string[] = []
        i++
        while (i < lines.length && !promptPattern.test(lines[i].trim()) && !/^.*[#>$%]\s*$/.test(lines[i].trim())) {
          if (lines[i].trim()) outputLines.push(lines[i])
          i++
        }
        pairs.push({ command: cmd, output: outputLines.join('\n') })
        continue
      }
    }
    i++
  }

  return pairs.slice(-maxPairs)
}

/** Build a structured context object from raw terminal lines */
export function buildStructuredContext(rawContext: string): StructuredContext {
  const lines = rawContext.split('\n')
  return {
    hostname:       extractHostname(lines),
    prompt:         extractPrompt(lines),
    recentCommands: parseCommandOutputPairs(lines, 5),
    rawTail:        lines.slice(-30).join('\n'),
  }
}

/** Format structured context for the AI system prompt */
export function formatStructuredContext(ctx: StructuredContext, sessionName?: string): string {
  const parts: string[] = []

  if (sessionName) parts.push(`Session: ${sessionName}`)
  if (ctx.hostname) parts.push(`Detected hostname: ${ctx.hostname}`)
  if (ctx.prompt)   parts.push(`Current prompt: ${ctx.prompt}`)

  if (ctx.recentCommands.length > 0) {
    parts.push('\nRecent commands and outputs:')
    for (const { command, output } of ctx.recentCommands) {
      parts.push(`  > ${command}`)
      if (output) {
        const trimmed = output.length > 2000 ? output.slice(0, 2000) + '\n  ... (truncated)' : output
        parts.push(`  ${trimmed.split('\n').join('\n  ')}`)
      }
    }
  }

  if (ctx.recentCommands.length === 0 && ctx.rawTail.trim()) {
    parts.push(`\nRaw terminal output:\n${ctx.rawTail}`)
  }

  return parts.join('\n')
}

export const terminalRegistry = {
  register:   (sessionId: string, handle: TerminalHandle) => registry.set(sessionId, handle),
  unregister: (sessionId: string) => registry.delete(sessionId),
  get:        (sessionId: string) => registry.get(sessionId),
}
