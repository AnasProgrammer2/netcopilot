import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { X, Send, Sparkles, Trash2, Square, ShieldCheck, Wrench, AlertCircle, ChevronDown, Check, Eye, EyeOff, ShieldAlert, RotateCcw, Download, Zap } from 'lucide-react'
import { useAppStore, AiMessage as AiMessageType, AiPermission, AiApproval } from '../../store'
import { cn, stripAnsi, isCommandBlacklisted } from '../../lib/utils'
import { AiMessage } from './AiMessage'
import { Session } from '../../types'
import { terminalRegistry } from '../../lib/terminalRegistry'
import { detectDeviceType } from '../../lib/deviceDetector'
import { DeviceType } from '../../types'
import { aiBridge } from '../../lib/aiBridge'

// ── Quick Commands per device type ────────────────────────────────────────────
const QUICK_COMMANDS: Record<DeviceType | 'default', string[]> = {
  'auto':         ['Show system info', 'Check interface status', 'Show running config', 'Check CPU/memory', 'Ping gateway'],
  'cisco-ios':    ['Check BGP neighbor status', 'Show interface errors', 'What routes are in the routing table?', 'Check CPU and memory usage', 'Show OSPF neighbors'],
  'cisco-iosxe':  ['Check BGP neighbor status', 'Show interface errors', 'Diagnose high CPU usage', 'Show IP SLA status', 'Check QoS policy stats'],
  'cisco-nxos':   ['Check vPC consistency', 'Show VXLAN/EVPN state', 'Check fabric links status', 'Show interface counters', 'Diagnose BGP issues'],
  'cisco-asa':    ['Check active VPN sessions', 'Show firewall hit counts', 'Check NAT translations', 'Show active connections', 'Diagnose connectivity issue'],
  'junos':        ['Show routing table summary', 'Check BGP peers', 'Show interface errors', 'Check OSPF adjacencies', 'Show commit history'],
  'arista-eos':   ['Check EVPN/BGP state', 'Show interface counters', 'Check MLAG status', 'Show hardware capacity', 'Diagnose packet drops'],
  'panos':        ['Check security policy hit counts', 'Show active sessions', 'Check threat logs', 'Verify NAT rules', 'Show interface status'],
  'fortios':      ['Check SD-WAN performance', 'Show active firewall sessions', 'Check VPN tunnel status', 'Show resource usage', 'Diagnose policy issue'],
  'mikrotik':     ['Show interface statistics', 'Check firewall rules', 'Show routing table', 'Check OSPF/BGP neighbors', 'Show active connections'],
  'nokia-sros':   ['Show service state', 'Check MPLS LSPs', 'Show interface errors', 'Check BGP peers', 'Show router info'],
  'huawei-vrp':   ['Show interface status', 'Check BGP peers', 'Show OSPF state', 'Check CPU usage', 'Show ARP table'],
  'hp-procurve':  ['Show VLAN config', 'Check spanning tree', 'Show interface stats', 'Check LACP status', 'Show MAC table'],
  'f5-tmos':      ['Check virtual server status', 'Show pool member health', 'Check active connections', 'Show SSL cert expiry', 'Diagnose traffic issue'],
  'linux':        ['Check CPU and memory usage', 'Show disk space', 'List running services', 'Check network connections', 'Show recent system errors'],
  'windows':      ['Check running services', 'Show event log errors', 'Check disk space', 'List network adapters', 'Show active connections'],
  'generic':      ['Show system info', 'Check interface status', 'Show running config', 'Check CPU/memory', 'Ping gateway'],
  'default':      ['Show system info', 'Check interface status', 'Show running config', 'Check CPU/memory', 'Ping gateway'],
}

interface Props {
  activeSession:   Session | null
  splitSession?:   Session | null
  allSessions?:    Session[]
  getTerminalContext: () => string
  sendToTerminal:  (cmd: string) => void
  sendToSession?:  (sessionId: string, cmd: string) => void
}

/** Format token count compactly: 1234 → "1.2k", 123 → "123" */
function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ── Unified agent mode (combines permission + approval) ────────────────────────
type AiMode = 'read-only' | 'fix' | 'auto-pilot'

function modeToPermission(m: AiMode): AiPermission {
  return m === 'read-only' ? 'troubleshoot' : 'full-access'
}
function modeToApproval(m: AiMode): AiApproval {
  return m === 'auto-pilot' ? 'auto' : 'ask'
}
function permApprovalToMode(p: AiPermission, a: AiApproval): AiMode {
  if (p === 'troubleshoot') return 'read-only'
  if (a === 'auto') return 'auto-pilot'
  return 'fix'
}

export function AiPanel({ activeSession, splitSession, allSessions, getTerminalContext, sendToTerminal, sendToSession }: Props): JSX.Element {
  const {
    aiMessages, aiStreaming, aiAgentActive, aiPermission, aiApproval, aiBlacklist, aiAutoWatch, aiTokens,
    licenseValid, licensePlan,
    addAiMessage, appendAiChunk, finalizeAiStream, updateAiToolCall, clearAiMessages,
    truncateAiMessagesAfter,
    setAiStreaming, setAiAgentActive, setAiPanelOpen, setAiAutoWatch,
  } = useAppStore()

  // Per-session overrides — start from global settings, can be changed mid-chat
  // Reset to global defaults when conversation is cleared
  const [sessionMode,      setSessionMode]      = useState<AiMode>(() => permApprovalToMode(aiPermission, aiApproval))
  const [sessionBlacklist, setSessionBlacklist] = useState<string[]>(aiBlacklist)
  const autoWatch = aiAutoWatch
  const setAutoWatch = setAiAutoWatch
  const [historyCommands,  setHistoryCommands]   = useState<string[]>([])
  const [privacyDismissed, setPrivacyDismissed]  = useState(() =>
    localStorage.getItem('aria-privacy-notice-accepted') === '1'
  )

  // Derived — keeps the rest of the component working without changes
  const sessionPermission = modeToPermission(sessionMode)
  const sessionApproval   = modeToApproval(sessionMode)
  const prevMessageCount = useRef(0)

  // Sequential command queue — prevents race condition when auto-executing multiple commands
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Refs mirror per-session state so the long-lived IPC `onToolCall` closure
  // (registered once on mount) always sees the latest values without needing
  // to re-subscribe every time the user changes a toggle.
  const sessionApprovalRef  = useRef<AiApproval>(sessionApproval)
  const sessionBlacklistRef = useRef<string[]>(sessionBlacklist)
  const autoWatchRef        = useRef<boolean>(autoWatch)
  const activeSessionIdRef  = useRef<string | null>(activeSession?.id ?? null)

  useEffect(() => { sessionApprovalRef.current  = sessionApproval  }, [sessionApproval])
  useEffect(() => { sessionBlacklistRef.current = sessionBlacklist }, [sessionBlacklist])
  useEffect(() => { autoWatchRef.current        = autoWatch        }, [autoWatch])
  useEffect(() => { activeSessionIdRef.current  = activeSession?.id ?? null }, [activeSession?.id])

  useEffect(() => {
    if (aiMessages.length === 0 && prevMessageCount.current > 0) {
      setSessionMode(permApprovalToMode(aiPermission, aiApproval))
      setSessionBlacklist(aiBlacklist)
    }
    prevMessageCount.current = aiMessages.length
  }, [aiMessages.length, aiPermission, aiApproval, aiBlacklist])

  // Load Smart History for the active session's device type
  useEffect(() => {
    const rawDt = activeSession?.connection.deviceType ?? 'generic'
    const deviceType = rawDt === 'auto' ? 'generic' : rawDt
    window.api.history.get(deviceType, 12).then((rows) => {
      setHistoryCommands(rows.map(r => r.command))
    }).catch(() => {/* ignore */})
  }, [activeSession?.connection.deviceType])

  const [input, setInput] = useState('')
  const bottomRef    = useRef<HTMLDivElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const userScrolled = useRef(false)

  // Track if user manually scrolled up
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      userScrolled.current = !atBottom
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll to bottom only when user is already at bottom
  useEffect(() => {
    if (!userScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [aiMessages])

  // Subscribe to AI IPC events. All events are scoped by sessionId; we filter
  // to the currently active session via `activeSessionIdRef` so other sessions'
  // ARIA chats don't bleed into this panel's UI.
  useEffect(() => {
    const forActiveSession = (sessionId: string) => sessionId === activeSessionIdRef.current

    const offChunk = window.api.ai.onChunk(({ sessionId, text }) => {
      if (!forActiveSession(sessionId)) return
      appendAiChunk(text)
    })

    const offDone = window.api.ai.onDone(({ sessionId, inputTokens, outputTokens }) => {
      if (!forActiveSession(sessionId)) return
      const usage = (typeof inputTokens === 'number' && typeof outputTokens === 'number')
        ? { inputTokens, outputTokens } : undefined
      useAppStore.getState().finalizeAiStream(usage)
      useAppStore.getState().setAiAgentActive(false)
    })

    const offError = window.api.ai.onError(({ sessionId, message }) => {
      if (!forActiveSession(sessionId)) return
      useAppStore.getState().finalizeAiStream()
      useAppStore.getState().setAiAgentActive(false)
      useAppStore.getState().addAiMessage({
        id: nanoid(),
        role: 'assistant',
        content: `⚠️ ${message}`,
      })
    })

    const offPlan = window.api.ai.onPlan(({ sessionId, objective, steps }) => {
      if (!forActiveSession(sessionId)) return
      // Finalize any streaming text before showing the plan card
      useAppStore.getState().finalizeAiStream()
      useAppStore.getState().addAiPlan({ objective, steps })
    })

    const offToolCall = window.api.ai.onToolCall(async ({ sessionId, id, command, reason, targetSession, policyBlock }) => {
      if (!forActiveSession(sessionId)) return
      // First finalize any streaming message (Claude is done generating text for this turn)
      finalizeAiStream()

      const msgs = useAppStore.getState().aiMessages

      // Find index of the last plan card and last assistant message
      const lastPlanIdx      = [...msgs].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'plan')?.i ?? -1
      const lastAssistantIdx = [...msgs].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')?.i ?? -1

      // If no assistant message exists, or the last one is BEFORE the plan card,
      // create a fresh assistant message so tool calls land AFTER the plan
      if (lastAssistantIdx < 0 || lastAssistantIdx < lastPlanIdx) {
        addAiMessage({ id: nanoid(), role: 'assistant', content: '' })
      }

      const freshMsgs = useAppStore.getState().aiMessages
      const lastMsg   = [...freshMsgs].reverse().find((m) => m.role === 'assistant')
      const targetMsg = lastMsg
      if (!targetMsg) return

      const toolCall = { id, command, reason, status: 'pending' as const, targetSession, policyBlock }

      // Attach the tool call to the assistant message
      updateAiToolCall(targetMsg.id, id, toolCall)

      // Already rejected by the main-process policy gate — the main side
      // has already pushed the rejection back to Claude. Just reflect it in
      // the UI so the user can see what was attempted and why it was blocked.
      if (policyBlock) {
        updateAiToolCall(targetMsg.id, id, { status: 'blocked', output: policyBlock })
        return
      }

      // Read latest per-session values from refs (avoids stale closure)
      const currentApproval  = sessionApprovalRef.current
      const currentBlacklist = sessionBlacklistRef.current

      if (isCommandBlacklisted(command, currentBlacklist)) {
        updateAiToolCall(targetMsg.id, id, { status: 'blocked' })
        await window.api.ai.toolResult(id, '(command blocked by blacklist)')
        return
      }

      if (currentApproval === 'auto') {
        // Chain to queue so multiple auto-commands execute sequentially, not in parallel
        const msgId = targetMsg.id
        commandQueueRef.current = commandQueueRef.current.then(async () => {
          await executeCommand(msgId, id, command, targetSession)
          // Small gap between commands so terminal settles before next one
          await new Promise(r => setTimeout(r, 600))
        })
        return
      }

      // approval === 'ask' → wait for user click (handled in AiCommandBlock → onApprove)
    })

    return () => {
      offChunk()
      offDone()
      offError()
      offPlan()
      offToolCall()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const executeCommand = useCallback(async (msgId: string, callId: string, command: string, targetSessionId?: string) => {
    updateAiToolCall(msgId, callId, { status: 'running' })

    // Determine which session to send command to
    const resolvedSessionId = targetSessionId ?? activeSession?.id
    const resolvedSession   = allSessions?.find(s => s.id === resolvedSessionId) ?? activeSession

    return new Promise<void>((resolve) => {
      let output  = ''
      let timer: ReturnType<typeof setTimeout>
      let offData: (() => void) | null = null
      let settled = false
      let chunkCount = 0
      let lastChunkAt = Date.now()

      // Adaptive idle threshold:
      //   • Fast path  (300ms) — short single-shot outputs that arrive in 1-2 chunks
      //   • Normal     (900ms) — typical multi-line show commands
      //   • Slow path  (2200ms) — long streams that arrive over time
      const idleFor = (): number => {
        if (chunkCount <= 1) return 300
        if (chunkCount <  6) return 900
        return 2200
      }

      const finish = async () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        offData?.()
        offData = null
        const out = output.trim() || '(no output)'
        updateAiToolCall(msgId, callId, { status: 'done', output: out })

        // Scroll the target terminal to prompt after command finishes
        if (resolvedSession) {
          terminalRegistry.get(resolvedSession.id)?.scrollToBottom()
        }

        await window.api.ai.toolResult(callId, out)
        resolve()
      }

      // Detect pager prompts across vendors / Unix tools and auto-advance.
      // Covered:
      //   • Cisco / Junos / Arista:  --More--, <--- More --->, ---- More ----
      //   • Huawei / Nokia:          ---- More ----, Press 'Q' to quit
      //   • Linux less / more:        :, lines N-M, (END), Press SPACE to continue
      //   • Generic:                  Press any key, Press RETURN to continue
      const MORE_PATTERN = new RegExp(
        [
          '--\\s*[Mm]ore\\s*--',
          '<---\\s*More\\s*--->',
          '----+\\s*More\\s*----+',
          'Press\\s+(?:SPACE|any\\s+key|RETURN|<space>|\\[space\\])\\s+(?:to\\s+continue|for\\s+more)?',
          '\\(END\\)',
          'lines\\s+\\d+-\\d+',
          ':\\s*$',                 // less/more bare colon prompt
          '\\bMORE\\b\\s*:',        // Windows `more` pager
        ].join('|'),
        'm'
      )

      const sendData = (d: string) => {
        if (targetSessionId && sendToSession) sendToSession(targetSessionId, d)
        else sendToTerminal(d)
      }

      // Scroll to bottom before sending so user sees the command and its output
      if (resolvedSession) {
        terminalRegistry.get(resolvedSession.id)?.scrollToBottom()
      }

      // Collect terminal output from the correct session only
      offData = collectTerminalOutput((data) => {
        output += data
        chunkCount++
        lastChunkAt = Date.now()
        clearTimeout(timer)

        // Keep scrolling to bottom as output arrives
        if (resolvedSession) {
          terminalRegistry.get(resolvedSession.id)?.scrollToBottom()
        }

        // If device is paginating, send space to get the next page
        if (MORE_PATTERN.test(data)) {
          sendData(' ')
          // Continue collecting — don't reset the debounce yet
          timer = setTimeout(finish, 3000)
          return
        }

        timer = setTimeout(finish, idleFor())
      }, resolvedSessionId)

      // Send the command to the correct session
      sendData(command + '\r')
      lastChunkAt = Date.now()

      // Safety timeout: if no output arrives at all in 8s, finish anyway
      timer = setTimeout(finish, 8000)
      void lastChunkAt
    })
  }, [updateAiToolCall, sendToTerminal, sendToSession, activeSession, allSessions])

  const handleApproveCommand = useCallback(async (msgId: string, callId: string) => {
    const msg  = useAppStore.getState().aiMessages.find((m) => m.id === msgId)
    const call = msg?.toolCalls?.find((t) => t.id === callId)
    if (!call) return
    await executeCommand(msgId, callId, call.command, call.targetSession)
  }, [executeCommand])

  const handleBlockCommand = useCallback(async (msgId: string, callId: string) => {
    updateAiToolCall(msgId, callId, { status: 'blocked' })
    await window.api.ai.toolResult(callId, '(command skipped by user)')
  }, [updateAiToolCall])

  /**
   * Edit & Retry: prefill the input box with the user message text, drop that
   * message and everything after it, and focus the input so the user can edit
   * and press Enter to re-send. Aborts any in-flight stream first.
   */
  const handleEditUserMessage = useCallback((msgId: string) => {
    const msg = useAppStore.getState().aiMessages.find(m => m.id === msgId)
    if (!msg) return
    if (aiStreaming || aiAgentActive) window.api.ai.cancel(activeSession?.id)
    truncateAiMessagesAfter(msgId, /* includeMsg */ true)
    setInput(msg.content)
    setTimeout(() => {
      inputRef.current?.focus()
      // Auto-resize textarea to fit content
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 144) + 'px'
      }
    }, 50)
  }, [aiStreaming, aiAgentActive, activeSession?.id, truncateAiMessagesAfter])

  /**
   * Regenerate: drop the last assistant message (and any trailing junk), then
   * re-send the conversation as-is so the model produces a fresh answer.
   */
  const handleRegenerate = useCallback(() => {
    const msgs = useAppStore.getState().aiMessages
    let lastAsstIdx = -1
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (lastAsstIdx === -1 && msgs[i].role === 'assistant') lastAsstIdx = i
      if (lastUserIdx === -1 && msgs[i].role === 'user')      lastUserIdx = i
      if (lastAsstIdx !== -1 && lastUserIdx !== -1) break
    }
    if (lastAsstIdx < 0 || lastUserIdx < 0 || lastUserIdx > lastAsstIdx) return
    if (aiStreaming || aiAgentActive) window.api.ai.cancel(activeSession?.id)
    // Drop the last assistant message (and any auto/plan messages after the user msg)
    truncateAiMessagesAfter(msgs[lastUserIdx].id, /* includeMsg */ false)
    userScrolled.current = false
    sendMessage('', /* isProactive */ false, undefined, /* isRegenerate */ true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiStreaming, aiAgentActive, activeSession?.id, truncateAiMessagesAfter])

  /** Always reads fresh store state to avoid stale-closure issues with async state updates */
  const buildMessages = () => {
    return useAppStore.getState().aiMessages
      .filter((m) => m.role !== 'auto' && m.role !== 'plan')  // plan cards are UI-only, never sent to Claude
      .map((m) => ({
        role:    m.role === 'user' ? 'user' : 'assistant',
        content: m.content + (m.toolCalls?.length
          ? '\n' + m.toolCalls.map((t) => `[ran: ${t.command}] → ${t.output ?? ''}`).join('\n')
          : ''),
      }))
      .filter((m) => m.content.trim())  // drop empty assistant shells (created as tool call anchors)
  }

  const sendMessage = useCallback(async (text: string, isProactive = false, proactiveContext?: string, isRegenerate = false) => {
    if (!text.trim() && !isProactive && !isRegenerate) return

    // Block if no valid license
    if (!licenseValid) {
      if (!isProactive) {
        addAiMessage({
          id:      nanoid(),
          role:    'assistant',
          content: '⚠️ No active license. Get yours at **[netcopilot.app/register](https://netcopilot.app/register)** then enter the key in Settings → ARIA.',
        })
      }
      return
    }

    if (!isProactive && !isRegenerate) {
      addAiMessage({ id: nanoid(), role: 'user', content: text })
    }

    setAiStreaming(true)
    setAiAgentActive(true)

    try {
      const ctx  = proactiveContext ?? getTerminalContext()
      const conn = activeSession?.connection

      let resolvedDeviceType = conn?.deviceType ?? 'generic'
      if (resolvedDeviceType === 'auto') {
        const rawCtx = terminalRegistry.get(activeSession?.id ?? '')?.getContext(200) ?? ''
        const detected = detectDeviceType(rawCtx)
        resolvedDeviceType = detected ?? 'generic'
      }

      const history = buildMessages()

      const messages = isProactive
        ? history.concat([{ role: 'user', content: `[AUTO] Analyze this terminal output:\n${ctx}` }])
        : history

      if (messages.length === 0) {
        finalizeAiStream()
        return
      }

      await window.api.ai.chat({
        sessionId:       activeSession?.id ?? '',
        messages,
        terminalContext: ctx,
        deviceType:      resolvedDeviceType,
        host:            conn?.host ?? 'unknown',
        protocol:        conn?.protocol ?? 'ssh',
        permission:      sessionPermission,
        sessionBlacklist,
        isProactive,
        sessions: allSessions?.map(s => ({
          sessionId:  s.id,
          name:       s.connection.name,
          host:       s.connection.host,
          deviceType: s.connection.deviceType ?? 'generic',
          protocol:   s.connection.protocol ?? 'ssh',
        })),
      })
    } catch {
      setAiStreaming(false)
      setAiAgentActive(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAiMessage, setAiStreaming, finalizeAiStream, getTerminalContext, activeSession, sessionPermission])

  // Subscribe to proactive analysis triggers from TerminalTab (Auto Watch).
  // Bridge replaces the previous `window.__aiSendProactive` global.
  useEffect(() => {
    return aiBridge.on('proactive', ({ context, sessionId }) => {
      // Only react if Auto Watch is on and the event is for the active session
      if (!autoWatchRef.current) return
      if (sessionId !== activeSessionIdRef.current) return
      const msg: AiMessageType = { id: nanoid(), role: 'auto', content: `Analyzing output...` }
      addAiMessage(msg)
      sendMessage('', true, context)
    })
  }, [sendMessage, addAiMessage])

  const handleSubmit = () => {
    if (!input.trim() || aiStreaming) return
    userScrolled.current = false
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full min-h-0 border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 shrink-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        {/* ARIA logo */}
        <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary/40 to-primary/10 shrink-0 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="absolute inset-0 rounded-lg ring-1 ring-primary/20" />
        </div>
        <span className="text-sm font-bold text-foreground tracking-tight">ARIA</span>

        {/* License plan badge */}
        {licenseValid ? (
          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 leading-none hidden sm:inline shrink-0 uppercase tracking-wide">
            {licensePlan || 'active'}
          </span>
        ) : (
          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 font-medium border border-red-500/20 leading-none hidden sm:inline shrink-0">
            No License
          </span>
        )}

        {/* Connection Health Indicator */}
        {activeSession && (() => {
          const s = activeSession.status
          const dot   = s === 'connected'    ? 'bg-emerald-400'
                      : s === 'connecting'   ? 'bg-amber-400 animate-pulse'
                      : s === 'error'        ? 'bg-red-400'
                      : 'bg-muted-foreground/40'
          const label = s === 'connected'    ? 'Connected'
                      : s === 'connecting'   ? 'Connecting…'
                      : s === 'error'        ? 'Error'
                      : 'Disconnected'
          const color = s === 'connected'    ? 'text-emerald-400'
                      : s === 'connecting'   ? 'text-amber-400'
                      : s === 'error'        ? 'text-red-400'
                      : 'text-muted-foreground/50'
          return (
            <div className="flex items-center gap-1 flex-1 min-w-0" title={`${activeSession.connection.name} — ${activeSession.connection.host} (${label})`}>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
              <span className={cn('text-[11px] font-medium truncate', color)}>
                {activeSession.connection.name}
              </span>
            </div>
          )
        })()}
        {/* Split View indicator */}
        {splitSession && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/15 text-primary/70 font-medium shrink-0">
            ⇄ {splitSession.connection.name}
          </span>
        )}
        {!activeSession && <span className="flex-1" />}

        {/* Token counter next to clear button */}
        {(aiTokens.input > 0 || aiTokens.output > 0) && (
          <span
            title={`Input: ${aiTokens.input.toLocaleString()} · Output: ${aiTokens.output.toLocaleString()}`}
            className="text-[11px] font-mono text-muted-foreground/50 select-none cursor-default"
          >
            {formatTokens(aiTokens.input + aiTokens.output)}
          </span>
        )}
        {aiMessages.length > 0 && (
          <button
            onClick={async () => {
              const msgs = aiMessages.map(m => ({
                role:      m.role,
                content:   m.content,
                toolCalls: m.toolCalls?.map(tc => ({ command: tc.command, output: tc.output })),
              }))
              await window.api.ai.exportMarkdown({ host: activeSession?.connection.host ?? 'unknown', messages: msgs })
            }}
            title="Export conversation as Markdown"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => { clearAiMessages(); commandQueueRef.current = Promise.resolve() }}
          title="Clear conversation"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setAiPanelOpen(false)}
          title="Close AI panel"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* No session notice */}
      {!activeSession && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-muted/30 blur-xl scale-150" />
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/60 border border-border/60">
              <AlertCircle className="w-5 h-5 text-muted-foreground/40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground/60">No active session</p>
            <p className="text-xs text-muted-foreground/50 max-w-[170px] leading-relaxed">
              Connect to a device to start chatting with ARIA
            </p>
          </div>
        </div>
      )}

      {/* Messages list */}
      {activeSession && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 select-text">
            {aiMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-5 px-5 py-8 text-center">
                {/* Glowing icon */}
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl bg-primary/25 blur-2xl scale-[1.8]" />
                  <div className="relative flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/25 shadow-lg shadow-primary/10">
                    <Sparkles className="w-7 h-7 text-primary drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                  </div>
                </div>

                {/* Heading */}
                <div className="space-y-2">
                  <p className="text-base font-bold text-foreground tracking-tight">
                    Hi, I'm ARIA
                  </p>
                  <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[190px]">
                    AI agent for <span className="font-semibold text-foreground/70">{activeSession.connection.name}</span>.
                    Describe a problem and I'll investigate it.
                  </p>
                </div>

                {/* Capability chips */}
                <div className="flex flex-wrap gap-1.5 justify-center max-w-[220px]">
                  {[
                    { label: 'Diagnose', icon: '🔍' },
                    { label: 'Configs',  icon: '📋' },
                    { label: 'Commands', icon: '⚡' },
                    { label: 'Plan',     icon: '🗺️' },
                  ].map(cap => (
                    <span key={cap.label} className="text-[11px] px-2.5 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary/75 font-medium flex items-center gap-1">
                      <span>{cap.icon}</span>{cap.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              // Pre-compute the index of the last user and last assistant message
              // so the action toolbar (Edit / Regenerate) only renders once.
              let lastUserIdx = -1, lastAsstIdx = -1
              for (let i = aiMessages.length - 1; i >= 0; i--) {
                if (lastUserIdx === -1 && aiMessages[i].role === 'user')      lastUserIdx = i
                if (lastAsstIdx === -1 && aiMessages[i].role === 'assistant') lastAsstIdx = i
                if (lastUserIdx !== -1 && lastAsstIdx !== -1) break
              }
              return aiMessages.map((msg, i) => (
                <AiMessage
                  key={msg.id}
                  message={msg}
                  approval={sessionApproval}
                  blacklist={sessionBlacklist}
                  isLastUser={i === lastUserIdx && !aiStreaming && !aiAgentActive}
                  isLastAssistant={i === lastAsstIdx && !aiStreaming && !aiAgentActive}
                  onApproveCommand={handleApproveCommand}
                  onBlockCommand={handleBlockCommand}
                  onEditUser={handleEditUserMessage}
                  onRegenerate={handleRegenerate}
                />
              ))
            })()}

            {/* Waiting for first token — last message is user and we're streaming */}
            {(() => {
              const lastMsg = aiMessages[aiMessages.length - 1]
              const isWaitingForFirstToken = aiStreaming && (lastMsg?.role === 'user' || lastMsg?.role === 'auto')
              if (!isWaitingForFirstToken) return null
              return (
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-spin" style={{ animationDuration: '2s' }} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-card/80 border border-border/40 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '240ms' }} />
                    <span className="text-[11px] text-muted-foreground/60 font-medium ml-1">Thinking…</span>
                  </div>
                </div>
              )
            })()}

            {/* Thinking indicator — between tool calls (agent active, not streaming) */}
            {aiAgentActive && !aiStreaming && (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-card/80 border border-border/40 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '240ms' }} />
                  <span className="text-[11px] text-muted-foreground/60 font-medium ml-1">Running…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <PendingCommandBar
            show={sessionApproval === 'ask'}
            messages={aiMessages}
            onApprove={handleApproveCommand}
            onBlock={handleBlockCommand}
          />

          {/* Quick Suggestions Bar — blends Smart History with predefined commands */}
          {!aiStreaming && !aiAgentActive && (() => {
            const rawDt    = activeSession.connection.deviceType ?? 'generic'
            const deviceType = (rawDt === 'auto' ? 'generic' : rawDt) as keyof typeof QUICK_COMMANDS
            const predef = QUICK_COMMANDS[deviceType] ?? QUICK_COMMANDS['default']
            const asked  = new Set(aiMessages.filter(m => m.role === 'user').map(m => m.content))
            const limit  = aiMessages.length === 0 ? 5 : 3

            // History items that haven't been asked yet (most-used first, already sorted by DB)
            const fromHistory = historyCommands.filter(c => !asked.has(c))
            const fromHistorySet = new Set(fromHistory)

            // Predefined items that aren't already covered by history
            const fromPredef = predef.filter(c => !asked.has(c) && !fromHistorySet.has(c))

            // Interleave: start with history, fill up with predefined
            const cmds = [...fromHistory, ...fromPredef].slice(0, limit)
            const historySet = new Set(fromHistory.slice(0, limit))

            if (cmds.length === 0) return null
            return (
              <div className="px-3 pt-1 pb-1.5 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {cmds.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => {
                        setInput(cmd)
                        setTimeout(() => inputRef.current?.focus(), 50)
                      }}
                      title={historySet.has(cmd) ? 'From your history' : undefined}
                      className={cn(
                        'shrink-0 text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1.5',
                        historySet.has(cmd)
                          ? 'bg-amber-500/10 border border-amber-500/25 text-amber-500 hover:bg-amber-500/18 hover:border-amber-500/40'
                          : 'bg-muted/60 border border-border/60 text-muted-foreground hover:bg-primary/10 hover:border-primary/25 hover:text-primary',
                        'transition-all whitespace-nowrap font-medium'
                      )}
                    >
                      {historySet.has(cmd) ? (
                        <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                      ) : (
                        <Sparkles className="w-2.5 h-2.5 shrink-0 opacity-50" />
                      )}
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Privacy notice — shown once until dismissed */}
          {licenseValid && !privacyDismissed && aiMessages.length === 0 && (
            <div className="mx-3 mb-1.5 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex-1">
                ARIA sends your terminal context and conversation to <span className="text-foreground/60 font-medium">api.netcopilot.app</span> to generate responses. Avoid using ARIA on sessions with sensitive credentials.
              </p>
              <button
                onClick={() => { localStorage.setItem('aria-privacy-notice-accepted', '1'); setPrivacyDismissed(true) }}
                className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Input box */}
          <div className="border-t border-border/40 px-3 pt-2.5 pb-3 shrink-0">
            {!licenseValid ? (
              /* ── No License Gate ── */
              <div className="flex flex-col items-center gap-3 py-4 px-3 rounded-xl border border-red-500/20 bg-red-500/5">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">License required to use ARIA</span>
                </div>
                <a
                  href="https://netcopilot.app/register"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => { e.preventDefault(); window.open('https://netcopilot.app/register') }}
                  className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                >
                  Get a License →
                </a>
                <p className="text-[11px] text-muted-foreground/60 text-center">
                  Enter your key in Settings → ARIA
                </p>
              </div>
            ) : (
              <div
                className={cn(
                  'rounded-2xl border transition-all duration-200',
                  'bg-card/80 backdrop-blur-sm',
                  'border-border/60',
                  'shadow-[0_2px_12px_rgba(0,0,0,0.15)]',
                  'focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.10),0_2px_16px_rgba(139,92,246,0.08)]'
                )}
              >
                {/* Textarea */}
                <div className="px-3.5 pt-3 pb-1">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmit()
                      }
                    }}
                    placeholder={`Ask about ${activeSession.connection.name}…`}
                    rows={1}
                    disabled={aiStreaming}
                    className={cn(
                      'w-full resize-none bg-transparent text-sm text-foreground',
                      'placeholder:text-muted-foreground/50',
                      'outline-none max-h-36 overflow-y-auto leading-relaxed',
                      'disabled:opacity-40'
                    )}
                    style={{ minHeight: '22px' }}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = Math.min(el.scrollHeight, 144) + 'px'
                    }}
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-2.5 pb-2.5 pt-1">
                  <AgentModeSelector value={sessionMode} onChange={setSessionMode} />
                  <BlacklistButton blacklist={sessionBlacklist} onChange={setSessionBlacklist} />

                  <button
                    onClick={() => setAutoWatch(!autoWatch)}
                    title={autoWatch ? 'Auto Watch ON — click to disable' : 'Auto Watch OFF — click to enable'}
                    className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-lg transition-all',
                      autoWatch
                        ? 'text-primary/70 hover:text-primary hover:bg-primary/10'
                        : 'text-muted-foreground/35 hover:text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {autoWatch ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1" />

                  {/* hint */}
                  <span className="text-[10px] text-muted-foreground/30 mr-2 hidden sm:block select-none">
                    ↵ send · ⇧↵ newline
                  </span>

                  {aiStreaming ? (
                    <button
                      onClick={() => window.api.ai.cancel(activeSession?.id)}
                      title="Stop generation"
                      className="shrink-0 flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-[11px] font-medium bg-red-500/12 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/35 transition-all"
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!input.trim()}
                      title="Send (Enter)"
                      className={cn(
                        'shrink-0 flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-150',
                        'bg-primary text-primary-foreground',
                        'shadow-[0_1px_8px_rgba(139,92,246,0.35)]',
                        'hover:brightness-110 hover:shadow-[0_2px_12px_rgba(139,92,246,0.45)]',
                        'disabled:opacity-25 disabled:cursor-not-allowed disabled:shadow-none'
                      )}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Toolbar selectors ─────────────────────────────────────────────────────────

/** Generic compact pill-selector with a dark popover dropdown */
function PillSelect<T extends string>({
  options, value, onChange, align = 'left',
}: {
  options: { id: T; label: string; short: string; icon?: JSX.Element; dimColor: string; activeColor: string; desc?: string }[]
  value: T
  onChange: (v: T) => void
  align?: 'left' | 'right'
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const current = options.find(o => o.id === value)!

  const openMenu = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setMenuPos({
      top:  r.top - 8,          // will be shifted up by transform
      left: align === 'right' ? r.right : r.left,
    })
    setOpen(true)
  }

  // Close on outside click / scroll
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const menu = open && createPortal(
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top:      menuPos.top,
        left:     menuPos.left,
        transform: align === 'right' ? 'translate(-100%, -100%)' : 'translateY(-100%)',
        zIndex:   9999,
      }}
      className="bg-popover border border-border/80 rounded-lg shadow-2xl min-w-[200px] py-1 overflow-hidden"
    >
      {options.map((opt) => {
        const isActive = value === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => { onChange(opt.id); setOpen(false) }}
            className={cn(
              'w-full flex items-start gap-2.5 px-3 py-2 text-[12px] transition-colors text-left',
              isActive
                ? `${opt.activeColor} bg-muted/60`
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            {opt.icon && <span className="shrink-0 mt-0.5">{opt.icon}</span>}
            <span className="flex-1 min-w-0">
              <span className="block font-medium leading-snug">{opt.label}</span>
              {opt.desc && (
                <span className={cn('block text-[10px] leading-relaxed mt-0.5', isActive ? 'opacity-70' : 'text-muted-foreground/60')}>
                  {opt.desc}
                </span>
              )}
            </span>
            {isActive && <Check className="w-3 h-3 shrink-0 opacity-80 mt-0.5" />}
          </button>
        )
      })}
    </div>,
    document.body
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={openMenu}
        className={cn(
          'flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-all',
          'border',
          open
            ? `${current.activeColor} border-current/40 bg-current/10`
            : `${current.dimColor} border-transparent hover:border-border hover:bg-muted/50`
        )}
      >
        {current.icon && <span className="opacity-80">{current.icon}</span>}
        <span>{current.short}</span>
        <ChevronDown className={cn('w-2.5 h-2.5 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {menu}
    </div>
  )
}

function AgentModeSelector({ value, onChange }: { value: AiMode; onChange: (v: AiMode) => void }): JSX.Element {
  return (
    <PillSelect
      value={value}
      onChange={onChange}
      options={[
        {
          id: 'read-only',   label: 'Read Only',   short: 'Read Only',
          desc: 'Diagnose only — no changes to the device. Show, ping, ls, ps…',
          icon: <ShieldCheck className="w-3 h-3" />,
          dimColor: 'text-emerald-500/70', activeColor: 'text-emerald-400',
        },
        {
          id: 'fix',         label: 'Fix Mode',    short: 'Fix Mode',
          desc: 'Can apply config changes, but asks your approval before each command.',
          icon: <Wrench className="w-3 h-3" />,
          dimColor: 'text-amber-500/70',   activeColor: 'text-amber-400',
        },
        {
          id: 'auto-pilot',  label: 'Auto Pilot',  short: 'Auto Pilot',
          desc: 'Executes commands automatically without stopping. Use with caution.',
          icon: <Zap className="w-3 h-3" />,
          dimColor: 'text-red-500/70',     activeColor: 'text-red-400',
        },
      ]}
    />
  )
}

// ── Blacklist button + popover ────────────────────────────────────────────────

function BlacklistButton({ blacklist, onChange }: { blacklist: string[]; onChange: (v: string[]) => void }): JSX.Element {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(blacklist.join('\n'))
  const ref = useRef<HTMLDivElement>(null)

  // Sync draft when blacklist prop changes (e.g. reset)
  useEffect(() => { setDraft(blacklist.join('\n')) }, [blacklist])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        applyDraft()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft])

  const applyDraft = () => {
    const list = draft.split('\n').map(s => s.trim()).filter(Boolean)
    onChange(list)
  }

  const activeCount = blacklist.filter(Boolean).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Session blacklist — commands blocked in this conversation"
        className={cn(
          'flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-all border',
          open
            ? 'text-red-400 border-red-500/30 bg-red-500/10'
            : activeCount > 0
              ? 'text-red-400/70 border-transparent hover:border-border hover:bg-muted/50'
              : 'text-muted-foreground/50 border-transparent hover:border-border hover:bg-muted/50'
        )}
      >
        <ShieldAlert className="w-3 h-3" />
        <span>Blocked</span>
        {activeCount > 0 && (
          <span className="text-[11px] opacity-70">({activeCount})</span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 bg-popover border border-border/80 rounded-xl shadow-2xl w-64">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-red-400" />
              <span className="text-xs font-semibold text-foreground">Session Blacklist</span>
            </div>
            <button
              onClick={async () => {
                const defaults = await window.api.ai.resetBlacklist()
                setDraft(defaults.join('\n'))
                onChange(defaults)
              }}
              title="Reset to defaults"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset
            </button>
          </div>

          {/* Textarea */}
          <div className="px-3 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              spellCheck={false}
              className={cn(
                'w-full font-mono text-[11px] leading-relaxed resize-none',
                'bg-muted/80 border border-border/60 rounded-lg px-2.5 py-2',
                'text-foreground/80 placeholder:text-muted-foreground/40',
                'focus:outline-none focus:border-primary/40',
              )}
              placeholder={'reload\nshutdown\nrm -rf\n...'}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground/50">
              {draft.split('\n').filter(s => s.trim()).length} patterns
            </span>
            <button
              onClick={() => { applyDraft(); setOpen(false) }}
              className="px-3 py-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Subscribe to terminal data from a specific session (or all if no filter) */
function collectTerminalOutput(cb: (data: string) => void, filterSessionId?: string): () => void {
  const handlers: Array<() => void> = []

  for (const proto of ['ssh', 'telnet', 'serial'] as const) {
    const off = window.api[proto].onData((sessionId: string, data: string) => {
      if (filterSessionId && sessionId !== filterSessionId) return
      cb(stripAnsi(data))
    })
    handlers.push(off)
  }

  return () => handlers.forEach((off) => off())
}


// ── Pending command sticky bar ────────────────────────────────────────────────

interface PendingCommandBarProps {
  show:      boolean
  messages:  AiMessageType[]
  onApprove: (msgId: string, callId: string) => void
  onBlock:   (msgId: string, callId: string) => void
}

function PendingCommandBar({ show, messages, onApprove, onBlock }: PendingCommandBarProps): JSX.Element | null {
  if (!show) return null

  const pendingCall = messages.flatMap(m => m.toolCalls ?? []).find(t => t.status === 'pending')
  const pendingMsg  = pendingCall ? messages.find(m => m.toolCalls?.some(t => t.id === pendingCall.id)) : null

  if (!pendingCall || !pendingMsg) return null

  return (
    <div className="border-t border-primary/20 bg-primary/5 px-3 py-2.5 shrink-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider">
          Action Required
        </span>
      </div>
      <code className="block w-full text-xs font-mono bg-muted/70 rounded px-2 py-1.5 text-foreground/90 break-all mb-1">
        {pendingCall.command}
      </code>
      {pendingCall.reason && (
        <p className="text-[11px] text-muted-foreground mb-2">{pendingCall.reason}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(pendingMsg.id, pendingCall.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <span>▶</span> Run
        </button>
        <button
          onClick={() => onBlock(pendingMsg.id, pendingCall.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition-colors"
        >
          <span>✕</span> Skip
        </button>
      </div>
    </div>
  )
}
