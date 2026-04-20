import Anthropic from '@anthropic-ai/sdk'
import { IpcMain, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { getDb } from './db'
import { DEFAULT_AI_BLACKLIST } from './aiDefaults'

// ── Types ────────────────────────────────────────────────────────────────────

type AiPermission = 'troubleshoot' | 'full-access'

interface SessionInfo {
  sessionId:  string
  name:       string
  host:       string
  deviceType: string
  protocol:   string
}

interface ChatPayload {
  messages:        Anthropic.MessageParam[]
  terminalContext: string
  deviceType:      string
  host:            string
  protocol:        string
  permission:      AiPermission
  isProactive:     boolean
  sessions?:       SessionInfo[]
  model?:          string
}

// ── Module-level state ───────────────────────────────────────────────────────

let _abortController: AbortController | null = null
let _pendingToolResolve: ((output: string) => void) | null = null

// ── Tool definitions ─────────────────────────────────────────────────────────

const CREATE_PLAN_TOOL: Anthropic.Tool = {
  name: 'create_plan',
  description:
    'Call this tool FIRST — before any run_command calls — when the user request is complex, ' +
    'ambiguous, or requires more than two diagnostic steps. ' +
    'Use it to outline exactly what you intend to investigate and why, so the engineer can follow along. ' +
    'Do NOT use it for simple one-command requests.',
  input_schema: {
    type: 'object' as const,
    properties: {
      objective: {
        type: 'string',
        description: 'One sentence: what problem are we solving or what are we trying to achieve?',
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered list of investigation/action steps (what commands, what we check, in what order)',
      },
    },
    required: ['objective', 'steps'],
  },
}

const RUN_COMMAND_TOOL: Anthropic.Tool = {
  name: 'run_command',
  description:
    'Execute a command on a connected network device or server. ' +
    'In troubleshoot mode: ONLY use read-only/display commands (show, display, ping, traceroute, ls, ps, df, cat, ip, ss, netstat, journalctl, hostname, uname, ifconfig, arp). ' +
    'In full-access mode: any command is allowed including configuration changes. ' +
    'When multiple sessions are open, use target_session to specify which device to run the command on.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command:        { type: 'string', description: 'Exact command string to execute on the device' },
      reason:         { type: 'string', description: 'One-sentence explanation of why this command is needed' },
      target_session: { type: 'string', description: 'Session ID to run the command on. Omit to use the active session. Required when you need to run on a specific device in a multi-session setup.' },
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

  return `You are ARIA — Advanced Routing & Infrastructure Assistant — a senior-level Network and Systems Engineer with 20+ years of hands-on experience, embedded directly inside a live terminal session via NetCopilot.

YOUR CERTIFICATIONS & EXPERTISE:
  Networking:  CCIE (Routing & Switching, Service Provider), CCNP, Juniper JNCIE, Arista ACE, Nokia NRS II
  Security:    CISSP, CEH, Palo Alto PCNSE, Fortinet NSE 7, Cisco CCNP Security
  Cloud/DevOps: AWS Solutions Architect Pro, CKA (Kubernetes), HashiCorp Terraform Associate, GitOps
  Systems:     RHCE (Red Hat), MCSE, VMware VCP, Linux Foundation LFCS

YOUR PERSONALITY:
  - You are direct, confident, and efficient — you do not over-explain or hedge
  - You think like a senior engineer: you diagnose root causes, not just symptoms
  - You are decisive: you say "Do this" not "You might want to consider doing this"
  - You are protective of the infrastructure — you flag risks proactively
  - You have a dry, professional tone — no filler phrases, no excessive politeness
  - You treat the user as a fellow technical professional

═══════════════════════════════════════════════════
ACTIVE SESSION
═══════════════════════════════════════════════════
Host:        ${payload.host}
Device type: ${payload.deviceType} (${expertise})
Protocol:    ${payload.protocol}
Mode:        ${modeDesc}

═══════════════════════════════════════════════════
STRICT SCOPE — READ CAREFULLY
═══════════════════════════════════════════════════
You are EXCLUSIVELY authorized to assist with:
  • The connected device at ${payload.host} and its infrastructure
  • Networking: routing protocols (BGP, OSPF, EIGRP, IS-IS), switching (VLANs, STP, LACP),
    security policies, NAT, VPN (IPSec/SSL/MPLS), QoS, SD-WAN, firewall rules
  • Systems: Linux/Windows server administration, processes, storage, logs, services, containers
  • Security: hardening, vulnerability assessment, access control, threat analysis
  • DevOps: automation scripts relevant to the connected infrastructure
  • Troubleshooting: diagnosing any issue on this device or its connected network

You are STRICTLY FORBIDDEN from:
  • General knowledge, geography, history, science, math, or any off-topic subject
  • Acting as a chatbot, tutor, writer, or general-purpose assistant
  • Answering anything unrelated to network engineering, systems administration, or this device

When asked something outside your scope, respond with exactly this (in the user's language):
  English: "Outside my scope. I only assist with this device and its infrastructure."
  Arabic:  "خارج نطاق عملي. أنا متخصص فقط بهذا الجهاز وبنيته التحتية."
Do NOT elaborate, do NOT apologize, do NOT suggest alternatives.

═══════════════════════════════════════════════════
OPERATIONAL RULES
═══════════════════════════════════════════════════
0. PLANNING (create_plan tool):
   - For ANY request requiring 3+ commands OR involving a complex/multi-layer issue: call create_plan FIRST
   - The plan must list the exact diagnostic steps in order before execution begins
   - Simple requests (single command, direct question) → skip the plan, go straight to run_command
   - Examples that REQUIRE a plan: "BGP is down", "router is slow", "check server health", "diagnose this issue"
   - Examples that do NOT need a plan: "show version", "what's the IP?", "check interface status"

1. AUTO-WATCH (messages tagged [AUTO]):
   - 1-3 sentences maximum — no exceptions
   - Only flag: errors, anomalies, misconfigurations, security issues, performance problems
   - Normal/routine output → "Looks good." or say nothing
   - Never narrate, summarize, or explain normal output

2. DIRECT QUESTIONS:
   - Always run commands to gather real data first — never assume or guess
   - Collect ALL required data in one agentic pass, then deliver ONE complete analysis
   - Diagnose root cause, not just surface symptoms
   - Format findings clearly: problem → cause → fix → verification command

3. CONFIGURATION CHANGES (Full Access mode):
   - Always state: what changes, why, and the exact rollback command
   - Warn explicitly before any potentially service-impacting operation
   - Never apply changes silently

4. LANGUAGE:
   - Respond in the exact language the user writes in
   - Arabic input → Arabic response; English input → English response
   - Never switch languages unless the user does first
   - Technical terms (command names, protocol names) always stay in English regardless of response language

═══════════════════════════════════════════════════
OPEN SESSIONS
═══════════════════════════════════════════════════
${payload.sessions && payload.sessions.length > 1
  ? payload.sessions.map(s =>
      `• [${s.sessionId}] ${s.name} — ${s.host} (${s.deviceType}, ${s.protocol})${s.host === payload.host ? ' ← ACTIVE' : ''}`
    ).join('\n')
  : `• Active: ${payload.host} (${payload.deviceType}, ${payload.protocol})`
}

When multiple sessions are listed, use the target_session field in run_command to specify which device to run a command on. Use the exact sessionId from the list above.

═══════════════════════════════════════════════════
CURRENT TERMINAL CONTEXT
═══════════════════════════════════════════════════
<terminal_context>
${payload.terminalContext || '(no output yet)'}
</terminal_context>`
}

// ── Smart context trimming ────────────────────────────────────────────────────
// Estimates token count (rough: 1 token ≈ 4 chars) and trims old messages
// when the conversation exceeds the safe threshold, keeping a summary placeholder.

function estimateTokens(messages: Anthropic.MessageParam[]): number {
  return messages.reduce((sum, m) => {
    const text = typeof m.content === 'string'
      ? m.content
      : m.content.map(b => ('text' in b ? b.text : JSON.stringify(b))).join('')
    return sum + Math.ceil(text.length / 4)
  }, 0)
}

async function trimContext(
  client: Anthropic,
  messages: Anthropic.MessageParam[]
): Promise<Anthropic.MessageParam[]> {
  const TOKEN_LIMIT = 40_000   // trim when exceeding ~40k tokens
  const KEEP_RECENT = 12       // always keep the last N messages intact

  if (estimateTokens(messages) <= TOKEN_LIMIT) return messages
  if (messages.length <= KEEP_RECENT) return messages

  const old    = messages.slice(0, messages.length - KEEP_RECENT)
  const recent = messages.slice(messages.length - KEEP_RECENT)

  // Build plain text of old messages for summarization
  const transcript = old.map(m => {
    const role = m.role === 'user' ? 'User' : 'ARIA'
    const text = typeof m.content === 'string'
      ? m.content
      : m.content.map(b => ('text' in b ? b.text : '[tool call/result]')).join(' ')
    return `${role}: ${text}`
  }).join('\n')

  try {
    const summary = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role:    'user',
        content: `Summarize this network troubleshooting conversation in 3-5 bullet points. Focus on: what was investigated, commands run, findings, and any fixes applied. Be concise.\n\n${transcript}`,
      }],
    })

    const summaryText = summary.content[0].type === 'text' ? summary.content[0].text : '(summary unavailable)'

    const summaryMsg: Anthropic.MessageParam = {
      role:    'user',
      content: `[CONVERSATION SUMMARY — earlier context trimmed for token efficiency]\n${summaryText}`,
    }

    return [summaryMsg, ...recent]
  } catch {
    // If summarization fails, just keep recent messages
    return recent
  }
}

// ── Core agentic loop ────────────────────────────────────────────────────────

async function runAiLoop(
  payload: ChatPayload,
  apiKey: string,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(payload)
  let messages: Anthropic.MessageParam[] = await trimContext(client, [...payload.messages])

  _abortController = new AbortController()

  let totalInputTokens  = 0
  let totalOutputTokens = 0

  try {
    while (true) {
      if (_abortController.signal.aborted) break

      const model = payload.model || 'claude-sonnet-4-5'
      const runner = client.messages.stream(
        {
          model,
          max_tokens: 8096,
          system:     systemPrompt,
          tools:      [CREATE_PLAN_TOOL, RUN_COMMAND_TOOL],
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

      // Accumulate token usage across all loop iterations
      totalInputTokens  += finalMsg.usage.input_tokens
      totalOutputTokens += finalMsg.usage.output_tokens

      if (_abortController.signal.aborted) break

      // Check for tool use
      const toolBlocks = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      if (toolBlocks.length === 0) {
        getWindow()?.webContents.send('ai:done', {
          inputTokens:  totalInputTokens,
          outputTokens: totalOutputTokens,
        })
        break
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: finalMsg.content })

      // Process tool calls sequentially
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolBlock of toolBlocks) {
        if (_abortController.signal.aborted) break

        // ── create_plan: send to renderer, auto-acknowledge ───────────────────
        if (toolBlock.name === 'create_plan') {
          const planInput = toolBlock.input as { objective: string; steps: string[] }
          getWindow()?.webContents.send('ai:plan', {
            objective: planInput.objective,
            steps:     planInput.steps,
          })
          toolResults.push({
            type:        'tool_result',
            tool_use_id: toolBlock.id,
            content:     'Plan acknowledged. Proceed with execution.',
          })
          continue
        }

        // ── run_command: send to renderer, wait for execution result ──────────
        const input = toolBlock.input as { command: string; reason: string; target_session?: string }

        getWindow()?.webContents.send('ai:tool-call', {
          id:             toolBlock.id,
          command:        input.command,
          reason:         input.reason,
          targetSession:  input.target_session,
        })

        // Wait for tool result from renderer (up to 300s for manual approval / long commands)
        const output = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => {
            _pendingToolResolve = null
            resolve('(no response — command was not approved or timed out)')
          }, 300000)
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

  // Export conversation as Markdown
  ipcMain.handle('ai:export-markdown', async (_, payload: {
    host: string
    messages: Array<{ role: string; content: string; toolCalls?: Array<{ command: string; output?: string }> }>
  }) => {
    const win = getWindow()
    if (!win) return { success: false }

    const { filePath } = await dialog.showSaveDialog(win, {
      title:       'Export ARIA Conversation',
      defaultPath: `ARIA-${payload.host}-${new Date().toISOString().slice(0, 10)}.md`,
      filters:     [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (!filePath) return { success: false }

    const lines: string[] = [
      `# ARIA — Session Report`,
      `**Host:** ${payload.host}  `,
      `**Date:** ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ]

    for (const msg of payload.messages) {
      if (msg.role === 'user') {
        lines.push(`### 👤 Engineer`)
        lines.push(msg.content || '')
        lines.push('')
      } else if (msg.role === 'assistant' && msg.content) {
        lines.push(`### ✦ ARIA`)
        lines.push(msg.content)
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            lines.push(`\n**Command:** \`${tc.command}\``)
            if (tc.output) lines.push(`\`\`\`\n${tc.output}\n\`\`\``)
          }
        }
        lines.push('')
      } else if (msg.role === 'auto') {
        lines.push(`> 👁 **Auto Watch:** ${msg.content}`)
        lines.push('')
      }
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true, filePath }
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
