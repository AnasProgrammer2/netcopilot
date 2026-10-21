import { useState } from 'react'
import { CheckCircle2, ChevronRight, Loader2, ShieldAlert, Circle } from 'lucide-react'
import { cn, isCommandBlacklisted } from '../../lib/utils'
import { AiToolCall } from '../../store'
import { useAppStore } from '../../store'

interface Props {
  msgId:      string
  call:       AiToolCall
  blacklist:  string[]
  onApprove:  (callId: string) => void
  onBlock:    (callId: string) => void
}

/**
 * One command ARIA ran (or wants to run). Neutral by default; colour appears
 * only when something needs the engineer: a pending approval or a block.
 */
export function AiCommandBlock({ call, blacklist, onApprove, onBlock }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const sessions = useAppStore(s => s.sessions)

  const isBlacklisted = isCommandBlacklisted(call.command, blacklist)
  const needsClick    = call.status === 'pending' && !call.autoApprove && !isBlacklisted

  const targetSessionName = call.targetSession
    ? sessions.find(s => s.id === call.targetSession)?.connection.name ?? call.targetSession
    : null

  const statusIcon = {
    pending:  needsClick ? <Circle className="w-3 h-3 text-warning fill-warning" /> : <Loader2 className="w-3 h-3 text-subtle animate-spin" />,
    approved: <Loader2 className="w-3 h-3 text-subtle animate-spin" />,
    blocked:  <ShieldAlert className="w-3 h-3 text-danger" />,
    running:  <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />,
    done:     <CheckCircle2 className="w-3 h-3 text-subtle" />,
  }[call.status]

  return (
    <div className={cn(
      'mt-2 rounded-md border text-xs overflow-hidden',
      needsClick ? 'border-warning/50' : 'border-border',
    )}>
      <div className="flex items-center gap-2 px-2.5 h-8">
        {statusIcon}
        <code className="flex-1 min-w-0 font-mono text-foreground truncate" title={call.command}>{call.command}</code>
        {targetSessionName && (
          <span className="shrink-0 text-2xs text-muted-foreground">on {targetSessionName}</span>
        )}
      </div>

      {(call.reason || call.policyBlock || needsClick) && (
        <div className="px-2.5 pb-2 -mt-0.5 space-y-2">
          {call.reason && <p className="text-muted-foreground leading-relaxed">{call.reason}</p>}

          {call.policyBlock && (
            <p className="flex items-start gap-1.5 text-danger leading-relaxed">
              <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
              {call.policyBlock}
            </p>
          )}

          {call.status === 'pending' && isBlacklisted && (
            <p className="flex items-center gap-1.5 text-danger"><ShieldAlert className="w-3 h-3" />Blocked by your blocked-commands list</p>
          )}

          {needsClick && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApprove(call.id)}
                className="h-6 px-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Run
              </button>
              <button
                onClick={() => onBlock(call.id)}
                className="h-6 px-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Skip
              </button>
              <span className="text-2xs text-subtle">
                {call.targetSession ? 'Runs on another device' : 'Heavy or unprompted command — needs your OK'}
              </span>
            </div>
          )}
        </div>
      )}

      {call.output && call.status === 'done' && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-1 px-2.5 h-7 border-t border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <ChevronRight className={cn('w-3 h-3 transition-transform', expanded && 'rotate-90')} />
            Output
          </button>
          {expanded && (
            <pre className="px-2.5 py-2 font-mono text-2xs leading-relaxed border-t border-border max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-foreground select-text">
              {call.output}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
