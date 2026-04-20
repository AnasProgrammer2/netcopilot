import { useState } from 'react'
import { Terminal, CheckCircle2, XCircle, Loader2, ShieldAlert, Play } from 'lucide-react'
import { cn } from '../../lib/utils'
import { AiToolCall } from '../../store'
import { useAppStore } from '../../store'

interface Props {
  msgId:      string
  call:       AiToolCall
  approval:   'ask' | 'auto' | 'blacklist'
  blacklist:  string[]
  onApprove:  (callId: string) => void
  onBlock:    (callId: string) => void
}

export function AiCommandBlock({ call, approval, blacklist, onApprove, onBlock }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const sessions = useAppStore(s => s.sessions)

  const isBlacklisted = blacklist.some((pattern) =>
    call.command.toLowerCase().includes(pattern.toLowerCase())
  )

  // Find target session name for multi-session display
  const targetSessionName = call.targetSession
    ? sessions.find(s => s.id === call.targetSession)?.connection.name ?? call.targetSession
    : null

  const statusIcon = {
    pending:  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />,
    approved: <Play className="w-3 h-3 text-emerald-400" />,
    blocked:  <ShieldAlert className="w-3 h-3 text-red-400" />,
    running:  <Loader2 className="w-3 h-3 text-primary animate-spin" />,
    done:     <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  }[call.status]

  return (
    <div className="mt-2 rounded-lg border border-primary/20 bg-black/30 overflow-hidden text-xs">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10">
        <Terminal className="w-3 h-3 text-primary/60 shrink-0" />
        <code className="flex-1 font-mono text-primary truncate">{call.command}</code>
        {targetSessionName && (
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">
            → {targetSessionName}
          </span>
        )}
        {statusIcon}
      </div>

      {/* Reason */}
      <div className="px-3 py-1.5 text-muted-foreground border-t border-border/40 leading-relaxed">
        {call.reason}
      </div>

      {/* Action buttons — only when pending */}
      {call.status === 'pending' && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border/40">
          {isBlacklisted ? (
            <span className="flex items-center gap-1.5 text-red-400">
              <ShieldAlert className="w-3 h-3" />
              Blocked by blacklist
            </span>
          ) : approval === 'ask' ? (
            <>
              <button
                onClick={() => onApprove(call.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-medium"
              >
                <CheckCircle2 className="w-3 h-3" />
                Run
              </button>
              <button
                onClick={() => onBlock(call.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <XCircle className="w-3 h-3" />
                Skip
              </button>
            </>
          ) : (
            <span className="text-emerald-400/80">Auto-approved</span>
          )}
        </div>
      )}

      {/* Output toggle */}
      {call.output && call.status === 'done' && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full text-left px-3 py-1 border-t border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            {expanded ? '▾ Hide output' : '▸ Show output'}
          </button>
          {expanded && (
            <pre className={cn(
              'px-3 py-2 font-mono text-[11px] leading-relaxed border-t border-border/40',
              'max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-foreground/80'
            )}>
              {call.output}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
