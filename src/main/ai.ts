import Anthropic from '@anthropic-ai/sdk'
import { IpcMain, BrowserWindow } from 'electron'
import { getDb } from './db'
import { DEFAULT_AI_BLACKLIST } from './aiDefaults'

// ── Types ────────────────────────────────────────────────────────────────────

type AiPermission = 'troubleshoot' | 'full-access'

interface ChatPayload {
  messages:        Anthropic.MessageParam[]
  terminalContext: string
  deviceType:      string
  host:            string
  protocol:        string
  permission:      AiPermission
  isProactive:     boolean
}

// ── Module-level state ───────────────────────────────────────────────────────

let _abortController: AbortController | null = null
let _pendingToolResolve: ((output: string) => void) | null = null

// ── Tool definition ──────────────────────────────────────────────────────────

const RUN_COMMAND_TOOL: Anthropic.Tool = {
  name: 'run_command',
  description:
    'Execute a command on the connected network device or server. ' +
    'In troubleshoot mode: ONLY use read-only/display commands (show, display, ping, traceroute, ls, ps, df, cat, ip, ss, netstat, journalctl, hostname, uname, ifconfig, arp). ' +
    'In full-access mode: any command is allowed including configuration changes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: 'Exact command string to execute on the device' },
      reason:  { type: 'string', description: 'One-sentence explanation of why this command is needed' },
    },
    required: ['command', 'reason'],
  },
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(payload: ChatPayload): string {
  const deviceExpertise: Record<string, string> = {
    'cisco-ios':    'Cisco IOS router/switch — expert in IOS CLI, routing protocols (BGP, OSPF, EIGRP), VLANs, ACLs, NAT',
    'cisco-iosxe':  'Cisco IOS-XE platform — modern IOS-XE CLI, SD-WAN, advanced QoS, model-driven telemetry',
    'cisco-nxos':   'Cisco Nexus NX-OS — data center switching, vPC, EVPN/VXLAN, fabricpath, NX-API',
    'cisco-asa':    'Cisco ASA/FTD firewall — security policies, NAT, VPN (IPSec/SSL), threat inspection',
    'junos':        'Juniper JunOS — hierarchical config, commit model, routing policies, MPLS, IS-IS',
    'arista-eos':   'Arista EOS — modern Linux-based switching, EVPN, CloudVision, eAPI',
    'fortios':      'FortiGate FortiOS — UTM/NGFW policies, SD-WAN, FortiGuard services, HA clusters',
    'panos':        'Palo Alto PAN-OS — App-ID, User-ID, security zones, Panorama management',
    'mikrotik':     'MikroTik RouterOS — Winbox/CLI, BGP, OSPF, MPLS, firewall rules, tunnels',
    'hp-procurve':  'HP/Aruba ProCurve — Provision OS, spanning tree, VLAN, LACP',
    'nokia-sros':   'Nokia SR-OS — service routing, MPLS/LDP/RSVP, L2/L3 VPN services',
    'huawei-vrp':   'Huawei VRP — enterprise routing/switching, MPLS, CloudEngine data center',
    'f5-tmos':      'F5 BIG-IP TMOS — load balancing, iRules, APM, WAF, SNAT',
    'linux':        'Linux/Unix server — shell scripting, systemd, networking (ip/ss/iptables), storage, processes',
    'windows':      'Windows Server — PowerShell, Active Directory, IIS, WinRM, event logs',
    'generic':      'network device or server',
  }

  const expertise = deviceExpertise[payload.deviceType] ?? deviceExpertise['generic']
  const modeDesc  = payload.permission === 'troubleshoot'
    ? 'TROUBLESHOOT MODE — You may ONLY use read-only, display, and diagnostic commands. Never issue commands that change configuration or state.'
    : 'FULL ACCESS MODE — You may use any command including configuration changes. Exercise judgment — warn the user before destructive operations.'

  return `You are an expert Network & Systems Engineer working as a real-time AI copilot inside a terminal application called NetCopilot.

CURRENT SESSION:
- Host: ${payload.host}
- Device type: ${payload.deviceType} (${expertise})
- Protocol: ${payload.protocol}

PERMISSION LEVEL: ${modeDesc}

YOUR BEHAVIOR:
1. When automatically analyzing terminal output (tagged [AUTO]):
   - Be VERY brief (1-3 sentences maximum)
   - Only comment if something is noteworthy: errors, warnings, anomalies, misconfigurations, security issues, performance problems
   - If the output looks normal/routine, say "Looks good." or nothing meaningful at all — do NOT narrate normal output
   - Never add filler or padding

2. When the user asks you directly:
   - Give expert, actionable answers specific to ${payload.deviceType}
   - Be direct — say "Run: [command]" not "You might want to consider running..."
   - Walk through troubleshooting step by step when diagnosing issues
   - Use the run_command tool proactively to gather needed information

3. Persona: You are the expert sitting next to the user. You speak plainly, act decisively, and respect that the user is technical.

4. Language: Always respond in the same language the user writes in (if they write in Arabic, respond in Arabic; English → English; etc.)

CURRENT TERMINAL CONTEXT (last output seen):
<terminal_context>
${payload.terminalContext || '(no output yet)'}
</terminal_context>`
}

// ── Core agentic loop ────────────────────────────────────────────────────────

async function runAiLoop(
  payload: ChatPayload,
  apiKey: string,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(payload)
  const messages: Anthropic.MessageParam[] = [...payload.messages]

  _abortController = new AbortController()

  try {
    while (true) {
      if (_abortController.signal.aborted) break

      const runner = client.messages.stream(
        {
          model:      'claude-sonnet-4-5',
          max_tokens: 2048,
          system:     systemPrompt,
          tools:      [RUN_COMMAND_TOOL],
          messages,
        },
        { signal: _abortController.signal }
      )

      runner.on('text', (text) => {
        if (!_abortController?.signal.aborted) {
          getWindow()?.webContents.send('ai:chunk', text)
        }
      })

      const finalMsg = await runner.finalMessage()

      if (_abortController.signal.aborted) break

      // Check for tool use
      const toolBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      if (toolBlocks.length === 0) {
        getWindow()?.webContents.send('ai:done')
        break
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: finalMsg.content })

      // Process tool calls sequentially
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolBlock of toolBlocks) {
        if (_abortController.signal.aborted) break

        const input = toolBlock.input as { command: string; reason: string }

        // Notify renderer — it will execute and return result
        getWindow()?.webContents.send('ai:tool-call', {
          id:      toolBlock.id,
          command: input.command,
          reason:  input.reason,
        })

        // Wait for tool result from renderer (up to 120s for manual approval)
        const output = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => {
            _pendingToolResolve = null
            resolve('(no response — command was not approved or timed out)')
          }, 120000)
          _pendingToolResolve = (out: string) => {
            clearTimeout(timer)
            resolve(out)
          }
        })

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolBlock.id,
          content:     output,
        })
      }

      if (_abortController.signal.aborted) break

      // Add tool results and continue loop
      messages.push({ role: 'user', content: toolResults })
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      getWindow()?.webContents.send('ai:error', (err as Error).message)
    }
  } finally {
    _abortController = null
    _pendingToolResolve = null
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupAiHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  // Start a chat turn (streaming)
  ipcMain.handle('ai:chat', async (_, payload: ChatPayload) => {
    // Cancel any in-progress stream
    _abortController?.abort()
    _pendingToolResolve = null

    const apiKey = await loadApiKey()
    if (!apiKey) {
      getWindow()?.webContents.send('ai:error', 'No API key configured. Add your Anthropic API key in Settings → AI.')
      getWindow()?.webContents.send('ai:done')
      return
    }

    runAiLoop(payload, apiKey, getWindow).catch(() => {/* handled inside */})
  })

  // Cancel current stream
  ipcMain.on('ai:cancel', () => {
    _abortController?.abort()
    _pendingToolResolve?.('(cancelled by user)')
    _pendingToolResolve = null
  })

  // Receive tool execution result from renderer
  ipcMain.handle('ai:tool-result', (_, _callId: string, output: string) => {
    if (_pendingToolResolve) {
      _pendingToolResolve(output)
      _pendingToolResolve = null
    }
  })

  // Reset blacklist to built-in defaults (saves to DB and returns the list)
  ipcMain.handle('ai:reset-blacklist', () => {
    const db = getDb()
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('ai.blacklist', @v) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run({ v: JSON.stringify(DEFAULT_AI_BLACKLIST) })
    return DEFAULT_AI_BLACKLIST
  })

  // API key management (stored via safeStorage in credentials table)
  ipcMain.handle('ai:set-api-key', async (_, key: string) => {
    const db = getDb()
    const { safeStorage } = await import('electron')
    const encoded = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key).toString('base64')
      : Buffer.from(key).toString('base64')
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('ai.apiKey', @v) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run({ v: JSON.stringify(encoded) })
    return true
  })

  ipcMain.handle('ai:get-api-key', async () => {
    return loadApiKey()
  })
}

async function loadApiKey(): Promise<string | null> {
  try {
    const db  = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai.apiKey'").get() as { value: string } | undefined
    if (!row) return null
    const { safeStorage } = await import('electron')
    const encoded: string = JSON.parse(row.value)
    const buf = Buffer.from(encoded, 'base64')
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
  } catch {
    return null
  }
}
