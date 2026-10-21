import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { X, Send, Sparkles, Loader2, MoreHorizontal, Trash2, Square, Search, Wrench, AlertCircle, ChevronDown, Check, Eye, EyeOff, ShieldAlert, RotateCcw, Download, Zap, History } from 'lucide-react'
import { useAppStore, AiMessage as AiMessageType, AriaMode, ChangePolicy, isAiReady, aiDestinationLabel, AI_PROVIDER_LABELS } from '../../store'
import { ChangeCard, ENV_BADGE } from './ChangeCard'
import { normalizeEnvironment, resolveMode, type Environment } from '../../../../shared/changeControl'
import { cn, stripAnsi, isCommandBlacklisted, hasUnsafeCharacters } from '../../lib/utils'
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

export function AiPanel({ activeSession, splitSession, allSessions, getTerminalContext, sendToTerminal, sendToSession }: Props): JSX.Element {
  const {
    aiMessages, aiStreaming, aiAgentActive, aiMode, aiChangePolicy, aiBlacklist, aiAutoWatch, aiTokens,
    licenseValid, licensePlan, aiSource, aiProvider, aiConfigured, aiBaseUrl, aiModel,
    addAiMessage, appendAiChunk, finalizeAiStream, updateAiToolCall, clearAiMessages,
    truncateAiMessagesAfter,
    setAiStreaming, setAiAgentActive, setAiPanelOpen, setAiAutoWatch, setSettingsOpen, setChangeHistoryOpen,
  } = useAppStore()
  const aiReady = isAiReady({ aiSource, aiConfigured, licenseValid })

  // Per-session overrides — start from global settings, can be changed mid-chat
  // Reset to global defaults when conversation is cleared
  const [sessionMode,      setSessionMode]      = useState<AriaMode>(aiMode)
  const [sessionBlacklist, setSessionBlacklist] = useState<string[]>(aiBlacklist)
  const autoWatch = aiAutoWatch
  const setAutoWatch = setAiAutoWatch
  const [historyCommands,  setHistoryCommands]   = useState<string[]>([])
  const [privacyDismissed, setPrivacyDismissed]  = useState(() =>
    localStorage.getItem('aria-privacy-notice-accepted') === '1'
  )

  // The device's environment and the change policy can lower the picked mode
  // (main applies the same rule; this keeps the selector honest).
  const activeEnv: Environment = normalizeEnvironment(activeSession?.connection.environment)
  const modeResolution = resolveMode(sessionMode, activeEnv, aiChangePolicy)
  const prevMessageCount = useRef(0)

  // Sequential command queue — prevents race condition when auto-executing multiple commands
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Refs mirror per-session state so the long-lived IPC `onToolCall` closure
  // (registered once on mount) always sees the latest values without needing
  // to re-subscribe every time the user changes a toggle.
  const sessionBlacklistRef = useRef<string[]>(sessionBlacklist)
  const autoWatchRef        = useRef<boolean>(autoWatch)
  const activeSessionIdRef  = useRef<string | null>(activeSession?.id ?? null)

  useEffect(() => { sessionBlacklistRef.current = sessionBlacklist }, [sessionBlacklist])
  useEffect(() => { autoWatchRef.current        = autoWatch        }, [autoWatch])
  useEffect(() => { activeSessionIdRef.current  = activeSession?.id ?? null }, [activeSession?.id])

  useEffect(() => {
    if (aiMessages.length === 0 && prevMessageCount.current > 0) {
      setSessionMode(aiMode)
      setSessionBlacklist(aiBlacklist)
    }
    prevMessageCount.current = aiMessages.length
  }, [aiMessages.length, aiMode, aiBlacklist])

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

    const offToolCall = window.api.ai.onToolCall(async ({ sessionId, id, command, reason, targetSession, policyBlock, requiresConfirmation, autoApprove }) => {
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

      const toolCall = {
        id, command, reason, status: 'pending' as const, targetSession, policyBlock, requiresConfirmation, autoApprove,
      }

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
      const currentBlacklist = sessionBlacklistRef.current

      if (isCommandBlacklisted(command, currentBlacklist)) {
        updateAiToolCall(targetMsg.id, id, { status: 'blocked' })
        await window.api.ai.toolResult(id, '(command blocked by blacklist)')
        return
      }

      // Main clears plain read-only inspection for unattended runs; heavy
      // commands, Auto Watch turns and other devices wait for a click.
      if (autoApprove === true && !requiresConfirmation) {
        // Chain to queue so multiple auto-commands execute sequentially, not in parallel
        const msgId = targetMsg.id
        commandQueueRef.current = commandQueueRef.current.then(async () => {
          await executeCommand(msgId, id, command, targetSession)
          // Small gap between commands so terminal settles before next one
          await new Promise(r => setTimeout(r, 600))
        })
        return
      }

      // Otherwise wait for a click (AiCommandBlock → onApprove)
    })

    return () => {
      offChunk()
      offDone()
      offError()
      offPlan()
      offToolCall()
    }
  }, [])

  const executeCommand = useCallback(async (msgId: string, callId: string, command: string, targetSessionId?: string) => {
    // Last line of defence before bytes reach the device's line editor.
    if (hasUnsafeCharacters(command)) {
      updateAiToolCall(msgId, callId, { status: 'blocked', output: '(blocked: control or invisible characters)' })
      await window.api.ai.toolResult(callId, '(command blocked: control or invisible characters)')
      return
    }
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
  }, [aiStreaming, aiAgentActive, activeSession?.id, truncateAiMessagesAfter])

  /** Always reads fresh store state to avoid stale-closure issues with async state updates */
  const buildMessages = () => {
    const { aiMessages: msgs, aiChanges } = useAppStore.getState()
    return msgs
      .filter((m) => m.role !== 'auto' && m.role !== 'plan')  // plan cards are UI-only
      .map((m) => {
        if (m.role !== 'change') return m
        // Keep change IDs in the history so ARIA can refer back to them later.
        const r = m.changeId ? aiChanges[m.changeId]?.record : undefined
        return { ...m, role: 'assistant' as const, content: r ? `[change ${r.id} on ${r.deviceName}: "${r.plan.title}" — ${r.status}]` : '' }
      })
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

    if (!aiReady) {
      if (!isProactive) {
        addAiMessage({
          id:      nanoid(),
          role:    'assistant',
          content: aiSource === 'byok'
            ? '⚠️ Your AI provider is not set up. Add an API key or a local endpoint (Ollama / LM Studio) in Settings → ARIA.'
            : '⚠️ No active license. Get yours at **[netcopilot.app/register](https://netcopilot.app/register)** then enter the key in Settings → ARIA.',
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
        ? history.concat([{ role: 'user', content: '[AUTO] Analyze the latest terminal output.' }])
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
        deviceName:      conn?.name,
        connectionId:    conn?.id,
        host:            conn?.host ?? 'unknown',
        protocol:        conn?.protocol ?? 'ssh',
        environment:     normalizeEnvironment(conn?.environment),
        mode:            sessionMode,
        sessionBlacklist,
        isProactive,
        sessions: allSessions?.filter(s => s.type !== 'sftp').map(s => ({
          sessionId:    s.id,
          name:         s.connection.name,
          host:         s.connection.host,
          deviceType:   s.connection.deviceType ?? 'generic',
          protocol:     s.connection.protocol ?? 'ssh',
          environment:  normalizeEnvironment(s.connection.environment),
          connectionId: s.connection.id,
        })),
      })
    } catch {
      setAiStreaming(false)
      setAiAgentActive(false)
    }
  }, [addAiMessage, setAiStreaming, finalizeAiStream, getTerminalContext, activeSession, allSessions, sessionMode, sessionBlacklist, aiReady, aiSource])

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
      {/* Header — one quiet row: identity, device, and a single overflow menu */}
      <div className="flex items-center gap-2 h-10 px-3 border-b border-border shrink-0">
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        <span
          className="text-sm font-semibold text-foreground"
          title={aiSource === 'byok' && aiConfigured
            ? `${aiProvider === 'custom' ? aiDestinationLabel(aiProvider, aiBaseUrl) : AI_PROVIDER_LABELS[aiProvider]} · ${aiModel}`
            : licenseValid ? `NetCopilot ${licensePlan || ''}`.trim() : undefined}
        >
          ARIA
        </span>
        {!aiReady && (
          <span className="text-2xs text-danger shrink-0">{aiSource === 'byok' ? 'Not set up' : 'No license'}</span>
        )}

        {activeSession ? (() => {
          const s = activeSession.status
          const problem = s === 'connecting' ? 'bg-warning' : s === 'error' || s === 'disconnected' ? 'bg-danger' : null
          return (
            <div className="flex items-center gap-1.5 flex-1 min-w-0 text-xs text-muted-foreground" title={`${activeSession.connection.name} — ${activeSession.connection.host}`}>
              <span className="text-subtle">·</span>
              {problem && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', problem)} />}
              <span className="truncate">{activeSession.connection.name}</span>
              {splitSession && <span className="truncate text-subtle">⇄ {splitSession.connection.name}</span>}
              <span
                title={activeEnv === 'production' ? 'Production — every change needs your approval' : `${activeEnv} — Autopilot allowed`}
                className="shrink-0 px-1 rounded border border-border text-2xs text-muted-foreground leading-[15px]"
              >
                {ENV_BADGE[activeEnv].label}
              </span>
            </div>
          )
        })() : <span className="flex-1" />}

        {(aiTokens.input > 0 || aiTokens.output > 0) && (
          <span
            title={`Input: ${aiTokens.input.toLocaleString()} · Output: ${aiTokens.output.toLocaleString()} tokens`}
            className="text-2xs font-mono text-subtle select-none cursor-default"
          >
            {formatTokens(aiTokens.input + aiTokens.output)}
          </span>
        )}
        <PanelMenu
          items={[
            { label: 'Change history', icon: <History className="w-3.5 h-3.5" />, onClick: () => setChangeHistoryOpen(true) },
            ...(aiMessages.length > 0 ? [
              {
                label: 'Export conversation', icon: <Download className="w-3.5 h-3.5" />,
                onClick: () => {
                  const msgs = aiMessages.map(m => ({
                    role:      m.role,
                    content:   m.content,
                    toolCalls: m.toolCalls?.map(tc => ({ command: tc.command, output: tc.output })),
                  }))
                  void window.api.ai.exportMarkdown({ host: activeSession?.connection.host ?? 'unknown', messages: msgs })
                },
              },
              { label: 'Clear conversation', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => { clearAiMessages(); commandQueueRef.current = Promise.resolve() } },
            ] : []),
          ]}
        />
        <button
          onClick={() => setAiPanelOpen(false)}
          title="Close ARIA"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* No session notice */}
      {!activeSession && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
          <AlertCircle className="w-5 h-5 text-subtle" />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-muted-foreground">No active session</p>
            <p className="text-xs text-subtle max-w-[170px] leading-relaxed">
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
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6 py-8 text-center">
                <Sparkles className="w-5 h-5 text-subtle" />
                <p className="text-sm font-medium text-foreground">Ask ARIA about {activeSession.connection.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
                  Describe a problem. ARIA investigates with read-only commands
                  {modeResolution.mode === 'investigate' ? '.' : ' and proposes changes for your approval.'}
                </p>
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
              return aiMessages.map((msg, i) => msg.role === 'change' && msg.changeId ? (
                <div key={msg.id} className="px-3 py-1.5">
                  <ChangeCard changeId={msg.changeId} />
                </div>
              ) : (
                <AiMessage
                  key={msg.id}
                  message={msg}
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

            {/* Activity — one quiet line while ARIA thinks or runs commands */}
            {(() => {
              const lastMsg = aiMessages[aiMessages.length - 1]
              const waitingFirstToken = aiStreaming && (lastMsg?.role === 'user' || lastMsg?.role === 'auto')
              const between = aiAgentActive && !aiStreaming
              if (!waitingFirstToken && !between) return null
              return (
                <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {waitingFirstToken ? 'Thinking…' : 'Working…'}
                </div>
              )
            })()}

            <div ref={bottomRef} />
          </div>

          {/* Quick Suggestions Bar — blends Smart History with predefined commands */}
          {aiMessages.length === 0 && !aiStreaming && !aiAgentActive && (() => {
            const rawDt    = activeSession.connection.deviceType ?? 'generic'
            const deviceType = (rawDt === 'auto' ? 'generic' : rawDt) as keyof typeof QUICK_COMMANDS
            const predef = QUICK_COMMANDS[deviceType] ?? QUICK_COMMANDS['default']
            const asked  = new Set(aiMessages.filter(m => m.role === 'user').map(m => m.content))
            const limit  = 4

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
              <div className="px-3 pb-2 shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {cmds.map((cmd) => (
                    <button
                      key={cmd}
                      onClick={() => {
                        setInput(cmd)
                        setTimeout(() => inputRef.current?.focus(), 50)
                      }}
                      title={historySet.has(cmd) ? 'From your history' : undefined}
                      className="max-w-full truncate text-xs px-2.5 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Privacy notice — shown once until dismissed */}
          {aiReady && !privacyDismissed && aiMessages.length === 0 && (
            <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-muted/50 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-subtle shrink-0 mt-0.5" />
              <p className="text-2xs text-muted-foreground leading-relaxed flex-1">
                {aiSource === 'byok'
                  ? <>ARIA sends your terminal context directly to <span className="text-muted-foreground font-medium">{aiDestinationLabel(aiProvider, aiBaseUrl)}</span>, not through NetCopilot servers. Avoid using ARIA on sessions with sensitive credentials.</>
                  : <>ARIA sends your terminal context and conversation to <span className="text-muted-foreground font-medium">api.netcopilot.app</span> to generate responses. Avoid using ARIA on sessions with sensitive credentials.</>}
              </p>
              <button
                onClick={() => { localStorage.setItem('aria-privacy-notice-accepted', '1'); setPrivacyDismissed(true) }}
                className="shrink-0 text-subtle hover:text-muted-foreground transition-colors"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Input box */}
          <div className="px-3 pt-1 pb-3 shrink-0">
            {!aiReady ? (
              <div className="flex flex-col items-center gap-3 py-4 px-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
                  <span className="text-xs font-medium">
                    {aiSource === 'byok' ? 'Set up an AI provider to use ARIA' : 'License required to use ARIA'}
                  </span>
                </div>
                {aiSource === 'byok' ? (
                  <button
                    onClick={() => setSettingsOpen(true, 'ai')}
                    className="text-xs px-4 h-8 inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                  >
                    Set up provider →
                  </button>
                ) : (
                  <a
                    href="https://netcopilot.app/register"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => { e.preventDefault(); window.open('https://netcopilot.app/register') }}
                    className="text-xs px-4 h-8 inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                  >
                    Get a License →
                  </a>
                )}
                <p className="text-2xs text-muted-foreground text-center">
                  {aiSource === 'byok' ? 'Claude, OpenAI, Grok, or a local model (Ollama / LM Studio)' : 'Enter your key in Settings → ARIA'}
                </p>
              </div>
            ) : (
              <div
                className="rounded-lg border border-border bg-card transition-colors focus-within:border-primary/60"
              >
                {/* Textarea */}
                <div className="px-3 pt-2.5 pb-1">
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
                      'placeholder:text-subtle',
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
                <div className="flex items-center gap-1 px-2 pb-2 pt-1 whitespace-nowrap">
                  <AgentModeSelector value={modeResolution.mode} onChange={setSessionMode} environment={activeEnv} policy={aiChangePolicy} />
                  <BlacklistButton blacklist={sessionBlacklist} onChange={setSessionBlacklist} />

                  <button
                    onClick={() => setAutoWatch(!autoWatch)}
                    title={autoWatch ? 'Auto Watch ON — click to disable' : 'Auto Watch OFF — click to enable'}
                    className={cn(
                      'flex items-center justify-center w-6 h-6 rounded-md transition-colors hover:bg-accent',
                      autoWatch ? 'text-muted-foreground hover:text-foreground' : 'text-subtle hover:text-muted-foreground'
                    )}
                  >
                    {autoWatch ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  <div className="flex-1" />

                  {aiStreaming ? (
                    <button
                      onClick={() => window.api.ai.cancel(activeSession?.id)}
                      title="Stop generation"
                      className="shrink-0 flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium border border-border text-foreground hover:bg-accent transition-colors"
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!input.trim()}
                      title="Send (Enter) · Shift+Enter for a new line"
                      className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:bg-muted disabled:text-subtle disabled:cursor-not-allowed"
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
  options: { id: T; label: string; short: string; icon?: JSX.Element; dimColor: string; activeColor: string; desc?: string; disabledReason?: string }[]
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
        const disabled = !!opt.disabledReason
        return (
          <button
            key={opt.id}
            disabled={disabled}
            title={opt.disabledReason}
            onClick={() => { onChange(opt.id); setOpen(false) }}
            className={cn(
              'w-full flex items-start gap-2.5 px-3 py-2 text-xs transition-colors text-left',
              disabled
                ? 'text-subtle cursor-not-allowed'
                : isActive
                  ? `${opt.activeColor} bg-muted/60`
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            {opt.icon && <span className="shrink-0 mt-0.5">{opt.icon}</span>}
            <span className="flex-1 min-w-0">
              <span className="block font-medium leading-snug">{opt.label}</span>
              {(opt.disabledReason ?? opt.desc) && (
                <span className={cn('block text-2xs leading-relaxed mt-0.5', isActive ? 'opacity-70' : 'text-muted-foreground')}>
                  {opt.disabledReason ?? opt.desc}
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
          'flex items-center gap-1 h-6 px-2 rounded-md text-2xs font-medium transition-all',
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

/** Overflow menu for secondary panel actions (one control instead of four icons). */
function PanelMenu({ items }: { items: { label: string; icon: JSX.Element; onClick: () => void }[] }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="More"
        className={cn('p-1 rounded-md transition-colors', open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[190px] py-1 rounded-lg border border-border bg-popover shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => { setOpen(false); it.onClick() }}
              className="w-full flex items-center gap-2 px-3 h-8 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <span className="text-muted-foreground">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentModeSelector({ value, onChange, environment, policy }: {
  value:       AriaMode
  onChange:    (v: AriaMode) => void
  environment: Environment
  policy:      ChangePolicy
}): JSX.Element {
  const prodLocked = environment === 'production' && policy.productionMaxMode === 'investigate'
  return (
    <PillSelect
      value={value}
      onChange={onChange}
      options={[
        {
          id: 'investigate', label: 'Investigate', short: 'Investigate',
          desc: 'Read-only. ARIA runs show / display / ping commands to diagnose and never changes the device.',
          icon: <Search className="w-3 h-3" />,
          dimColor: 'text-muted-foreground', activeColor: 'text-foreground',
        },
        {
          id: 'change', label: 'Change', short: 'Change',
          desc: 'ARIA can propose change plans. Nothing runs until you approve; NetCopilot applies it with a safety net and rollback.',
          icon: <Wrench className="w-3 h-3" />,
          dimColor: 'text-warning', activeColor: 'text-warning',
          disabledReason: prodLocked ? 'Your change policy keeps production devices read-only.' : undefined,
        },
        {
          id: 'autopilot', label: 'Autopilot', short: 'Autopilot',
          desc: 'Lab and staging only: ARIA applies and confirms its own change plans, with the same safety nets.',
          icon: <Zap className="w-3 h-3" />,
          dimColor: 'text-danger', activeColor: 'text-danger',
          disabledReason: environment === 'production' ? 'Not available on production devices — mark the device as lab or staging.' : undefined,
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
        title={`Blocked commands for this conversation (${activeCount})`}
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
          open ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <ShieldAlert className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 bg-popover border border-border/80 rounded-lg shadow-xl w-64">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3 text-danger" />
              <span className="text-xs font-semibold text-foreground">Session Blacklist</span>
            </div>
            <button
              onClick={async () => {
                const defaults = await window.api.ai.resetBlacklist()
                setDraft(defaults.join('\n'))
                onChange(defaults)
              }}
              title="Reset to defaults"
              className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
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
                'w-full font-mono text-2xs leading-relaxed resize-none',
                'bg-muted/80 border border-border/60 rounded-lg px-2.5 py-2',
                'text-foreground placeholder:text-subtle',
                'focus:outline-none focus:border-primary/40',
              )}
              placeholder={'reload\nshutdown\nrm -rf\n...'}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/60">
            <span className="text-2xs text-subtle">
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
