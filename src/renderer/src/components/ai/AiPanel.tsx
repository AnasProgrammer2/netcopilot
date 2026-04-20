import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { nanoid } from 'nanoid'
import { X, Send, Sparkles, Trash2, Square, ShieldCheck, Wrench, AlertCircle, ChevronDown, Check, Eye, EyeOff, ShieldAlert, RotateCcw, Download } from 'lucide-react'
import { useAppStore, AiMessage as AiMessageType, AiPermission, AiApproval } from '../../store'
import { cn } from '../../lib/utils'
import { AiMessage } from './AiMessage'
import { Session } from '../../types'
import { terminalRegistry } from '../../lib/terminalRegistry'
import { DeviceType } from '../../types'

// ── Quick Commands per device type ────────────────────────────────────────────
const QUICK_COMMANDS: Record<DeviceType | 'default', string[]> = {
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
    aiMessages, aiStreaming, aiAgentActive, aiPermission, aiApproval, aiBlacklist, aiTokens, aiModel,
    addAiMessage, appendAiChunk, finalizeAiStream, updateAiToolCall, clearAiMessages,
    setAiStreaming, setAiAgentActive, setAiPanelOpen,
  } = useAppStore()

  // Per-session overrides — start from global settings, can be changed mid-chat
  // Reset to global defaults when conversation is cleared
  const [sessionPermission, setSessionPermission] = useState<AiPermission>(aiPermission)
  const [sessionApproval,   setSessionApproval]   = useState<AiApproval>(aiApproval)
  const [sessionBlacklist,  setSessionBlacklist]  = useState<string[]>(aiBlacklist)
  const [autoWatch,         setAutoWatch]          = useState(true)
  const [historyCommands,   setHistoryCommands]    = useState<string[]>([])
  const prevMessageCount = useRef(0)

  // Sequential command queue — prevents race condition when auto-executing multiple commands
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    if (aiMessages.length === 0 && prevMessageCount.current > 0) {
      setSessionPermission(aiPermission)
      setSessionApproval(aiApproval)
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

  // Sync per-session flags to window bridge so closed effects can read latest values
  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__aiAutoWatch'] = autoWatch
  }, [autoWatch])

  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__sessionApproval'] = sessionApproval
  }, [sessionApproval])

  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__sessionBlacklist'] = sessionBlacklist
  }, [sessionBlacklist])

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

  // Subscribe to AI IPC events
  useEffect(() => {
    const offChunk = window.api.ai.onChunk((chunk) => {
      appendAiChunk(chunk)
    })

    const offDone = window.api.ai.onDone((usage) => {
      useAppStore.getState().finalizeAiStream(usage)
      useAppStore.getState().setAiAgentActive(false)
    })

    const offError = window.api.ai.onError((err) => {
      useAppStore.getState().finalizeAiStream()
      useAppStore.getState().setAiAgentActive(false)
      useAppStore.getState().addAiMessage({
        id: nanoid(),
        role: 'assistant',
        content: `⚠️ ${err}`,
      })
    })

    const offPlan = window.api.ai.onPlan(({ objective, steps }) => {
      // Finalize any streaming text before showing the plan card
      useAppStore.getState().finalizeAiStream()
      useAppStore.getState().addAiPlan({ objective, steps })
    })

    const offToolCall = window.api.ai.onToolCall(async ({ id, command, reason, targetSession }) => {
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

      const toolCall = { id, command, reason, status: 'pending' as const, targetSession }

      // Attach the tool call to the assistant message
      updateAiToolCall(targetMsg.id, id, toolCall)

      // Read latest per-session values from window bridge (avoids stale closure)
      const currentApproval   = (window as unknown as Record<string, unknown>)['__sessionApproval']  as AiApproval ?? 'ask'
      const currentBlacklist  = (window as unknown as Record<string, unknown>)['__sessionBlacklist'] as string[] ?? []

      const isBlacklisted = currentBlacklist.some((p) =>
        p.trim() && command.toLowerCase().includes(p.trim().toLowerCase())
      )

      if (isBlacklisted) {
        updateAiToolCall(targetMsg.id, id, { status: 'blocked' })
        await window.api.ai.toolResult(id, '(command blocked by blacklist)')
        return
      }

      if (currentApproval === 'auto' || currentApproval === 'blacklist') {
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

      // Detect --More-- paging prompts and automatically advance through them
      const MORE_PATTERN = /--\s*[Mm]ore\s*--|<--- More --->|\s+---- More ----/

      const sendData = (d: string) => {
        if (targetSessionId && sendToSession) sendToSession(targetSessionId, d)
        else sendToTerminal(d)
      }

      // Collect terminal output from the correct session only
      offData = collectTerminalOutput((data) => {
        output += data
        clearTimeout(timer)

        // If device is paginating, send space to get the next page
        if (MORE_PATTERN.test(data)) {
          sendData(' ')
          // Continue collecting — don't reset the debounce yet
          timer = setTimeout(finish, 3000)
          return
        }

        timer = setTimeout(finish, 2000)
      }, resolvedSessionId)

      // Send the command to the correct session
      sendData(command + '\r')

      // Safety timeout: if no output arrives in 8s, finish anyway
      timer = setTimeout(finish, 8000)
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

  const sendMessage = useCallback(async (text: string, isProactive = false, proactiveContext?: string) => {
    if (!text.trim() && !isProactive) return

    if (!isProactive) {
      addAiMessage({ id: nanoid(), role: 'user', content: text })
      // Smart History: persist command keyed by device type (resolve 'auto' to 'generic')
      const rawDt = activeSession?.connection.deviceType ?? 'generic'
      const deviceType = rawDt === 'auto' ? 'generic' : rawDt
      window.api.history.record(deviceType, text.trim())
        .then(() => window.api.history.get(deviceType, 12))
        .then((rows) => setHistoryCommands(rows.map(r => r.command)))
        .catch(() => {/* ignore */})
    }

    setAiStreaming(true)
    setAiAgentActive(true)

    const ctx  = proactiveContext ?? getTerminalContext()
    const conn = activeSession?.connection

    // Build history AFTER adding the user message (reads fresh state via getState())
    const history = buildMessages()

    // For proactive: append the auto-analysis request
    const messages = isProactive
      ? history.concat([{ role: 'user', content: `[AUTO] Analyze this terminal output:\n${ctx}` }])
      : history

    if (messages.length === 0) {
      finalizeAiStream()
      return
    }

    await window.api.ai.chat({
      messages,
      terminalContext: ctx,
      deviceType:      conn?.deviceType ?? 'generic',
      host:            conn?.host ?? 'unknown',
      protocol:        conn?.protocol ?? 'ssh',
      permission:      sessionPermission,
      isProactive,
      model:           aiModel,
      sessions: allSessions?.map(s => ({
        sessionId:  s.id,
        name:       s.connection.name,
        host:       s.connection.host,
        deviceType: s.connection.deviceType ?? 'generic',
        protocol:   s.connection.protocol ?? 'ssh',
      })),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAiMessage, setAiStreaming, finalizeAiStream, getTerminalContext, activeSession, sessionPermission])

  // Keep sessionApproval accessible from the closed onToolCall effect via a window bridge
  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__sessionApproval'] = sessionApproval
  }, [sessionApproval])

  // Expose sendMessage so TerminalTab can trigger proactive analysis
  useEffect(() => {
    (window as unknown as Record<string, unknown>)['__aiSendProactive'] = (ctx: string) => {
      const msg: AiMessageType = { id: nanoid(), role: 'auto', content: `Analyzing output...` }
      addAiMessage(msg)
      sendMessage('', true, ctx)
    }
    return () => {
      delete (window as unknown as Record<string, unknown>)['__aiSendProactive']
    }
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
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        {/* ARIA logo */}
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-sm font-bold text-foreground tracking-tight">ARIA</span>

        {/* Model chip */}
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground/70 font-medium border border-border/50 leading-none hidden sm:inline shrink-0">
          {aiModel.replace('claude-', '').replace('-4-5', ' 4.5')}
        </span>

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
              <span className={cn('text-[10px] font-medium truncate', color)}>
                {activeSession.connection.name}
              </span>
            </div>
          )
        })()}
        {/* Split View indicator */}
        {splitSession && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary/70 font-medium shrink-0">
            ⇄ {splitSession.connection.name}
          </span>
        )}
        {!activeSession && <span className="flex-1" />}

        {/* Token counter next to clear button */}
        {(aiTokens.input > 0 || aiTokens.output > 0) && (
          <span
            title={`Input: ${aiTokens.input.toLocaleString()} · Output: ${aiTokens.output.toLocaleString()}`}
            className="text-[10px] font-mono text-muted-foreground/50 select-none cursor-default"
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
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted/50 border border-border">
            <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground/70">No active session</p>
            <p className="text-xs text-muted-foreground/60 max-w-[180px] leading-relaxed">
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
                  <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150" />
                  <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                </div>

                {/* Heading */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">
                    Hi, I'm ARIA
                  </p>
                  <p className="text-xs text-muted-foreground/70 leading-relaxed max-w-[200px]">
                    Your AI network engineer.<br/>
                    Connected to <span className="font-semibold text-foreground/60">{activeSession.connection.name}</span>.
                  </p>
                </div>

                {/* Capability chips */}
                <div className="flex flex-wrap gap-1.5 justify-center max-w-[220px]">
                  {['Diagnose issues', 'Read configs', 'Run commands', 'Plan changes'].map(cap => (
                    <span key={cap} className="text-[10px] px-2 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary/70 font-medium">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiMessages.map((msg) => (
              <AiMessage
                key={msg.id}
                message={msg}
                approval={sessionApproval}
                blacklist={sessionBlacklist}
                onApproveCommand={handleApproveCommand}
                onBlockCommand={handleBlockCommand}
              />
            ))}

            {/* Thinking indicator — shown when agent is active but not streaming text */}
            {aiAgentActive && !aiStreaming && (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-primary" />
                </div>
                <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-card/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
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
                        'shrink-0 text-[11px] px-3 py-1.5 rounded-full flex items-center gap-1',
                        historySet.has(cmd)
                          ? 'bg-amber-500/8 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 hover:border-amber-500/35'
                          : 'bg-primary/6 border border-primary/15 text-primary/70 hover:bg-primary/12 hover:border-primary/30 hover:text-primary',
                        'transition-all whitespace-nowrap font-medium'
                      )}
                    >
                      {historySet.has(cmd) && (
                        <svg className="w-2.5 h-2.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                      )}
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Input box */}
          <div className="border-t border-border px-3 pt-2 pb-2 shrink-0">
            <div className="bg-card/60 border border-border rounded-xl">
              {/* Text area row */}
              <div className="flex items-end gap-2 px-3 pt-2.5 pb-1">
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
                    'flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground',
                    'outline-none max-h-32 overflow-y-auto leading-relaxed',
                    'disabled:opacity-50'
                  )}
                  style={{ minHeight: '20px' }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                  }}
                />
              </div>

              {/* Toolbar row */}
              <div className="flex items-center gap-1 px-2 pb-2">
                {/* Permission selector */}
                <ModeSelector
                  value={sessionPermission}
                  onChange={setSessionPermission}
                />

                {/* Divider */}
                <span className="w-px h-3.5 bg-border/60 mx-0.5" />

                {/* Approval selector */}
                <ApprovalSelector
                  value={sessionApproval}
                  onChange={setSessionApproval}
                />

                {/* Divider */}
                <span className="w-px h-3.5 bg-border/60 mx-0.5" />

                {/* Per-session blacklist */}
                <BlacklistButton
                  blacklist={sessionBlacklist}
                  onChange={setSessionBlacklist}
                />

                {/* Divider */}
                <span className="w-px h-3.5 bg-border/60 mx-0.5" />

                {/* Auto Watch toggle */}
                <button
                  onClick={() => setAutoWatch(v => !v)}
                  title={autoWatch ? 'Auto Watch ON — click to disable' : 'Auto Watch OFF — click to enable'}
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-md transition-all border',
                    autoWatch
                      ? 'text-primary/80 border-transparent hover:border-border hover:bg-muted/50'
                      : 'text-muted-foreground/40 border-transparent hover:border-border hover:bg-muted/50'
                  )}
                >
                  {autoWatch
                    ? <Eye    className="w-3.5 h-3.5" />
                    : <EyeOff className="w-3.5 h-3.5" />
                  }
                </button>

                {/* Push send/stop to the right */}
                <div className="flex-1" />

                {aiStreaming ? (
                  <button
                    onClick={() => window.api.ai.cancel()}
                    title="Stop generation"
                    className="shrink-0 p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!input.trim()}
                    title="Send (Enter)"
                    className="shrink-0 p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/40 mt-1.5 px-1">
              Enter to send · Shift+Enter for newline
            </p>
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
  options: { id: T; label: string; short: string; icon?: JSX.Element; dimColor: string; activeColor: string }[]
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
      className="bg-popover border border-border/80 rounded-lg shadow-2xl min-w-[148px] py-1 overflow-hidden"
    >
      {options.map((opt) => {
        const isActive = value === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => { onChange(opt.id); setOpen(false) }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors text-left',
              isActive
                ? `${opt.activeColor} bg-muted/60`
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span className="flex-1">{opt.label}</span>
            {isActive && <Check className="w-3 h-3 shrink-0 opacity-80" />}
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

function ModeSelector({ value, onChange }: { value: AiPermission; onChange: (v: AiPermission) => void }): JSX.Element {
  return (
    <PillSelect
      value={value}
      onChange={onChange}
      options={[
        {
          id: 'troubleshoot', label: 'Troubleshoot', short: 'Scan',
          icon: <ShieldCheck className="w-3 h-3" />,
          dimColor: 'text-amber-500/70', activeColor: 'text-amber-400',
        },
        {
          id: 'full-access', label: 'Full Access', short: 'Full',
          icon: <Wrench className="w-3 h-3" />,
          dimColor: 'text-red-500/70', activeColor: 'text-red-400',
        },
      ]}
    />
  )
}

function ApprovalSelector({ value, onChange }: { value: AiApproval; onChange: (v: AiApproval) => void }): JSX.Element {
  return (
    <PillSelect
      value={value}
      onChange={onChange}
      align="right"
      options={[
        {
          id: 'ask',       label: 'Ask each time',    short: 'Ask',
          dimColor: 'text-primary/60',    activeColor: 'text-primary',
        },
        {
          id: 'auto',      label: 'Auto-approve',     short: 'Auto',
          dimColor: 'text-emerald-500/60', activeColor: 'text-emerald-400',
        },
        {
          id: 'blacklist', label: 'Block patterns',   short: 'Block',
          dimColor: 'text-orange-500/60', activeColor: 'text-orange-400',
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
        <span>Block</span>
        {activeCount > 0 && (
          <span className="text-[10px] opacity-70">({activeCount})</span>
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
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
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
                'bg-black/30 border border-white/10 rounded-lg px-2.5 py-2',
                'text-foreground/80 placeholder:text-muted-foreground/40',
                'focus:outline-none focus:border-primary/40',
              )}
              placeholder={'reload\nshutdown\nrm -rf\n...'}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/60">
            <span className="text-[10px] text-muted-foreground/50">
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

/** Strip ANSI escape sequences from terminal output */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
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
        <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider">
          Action Required
        </span>
      </div>
      <code className="block w-full text-xs font-mono bg-black/20 rounded px-2 py-1.5 text-foreground/90 break-all mb-1">
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
