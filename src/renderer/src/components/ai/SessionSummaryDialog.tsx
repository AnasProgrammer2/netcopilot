import { X, Sparkles, Terminal, CheckCircle2, MessageSquare } from 'lucide-react'
import { cn } from '../../lib/utils'
import { AiToolCall } from '../../store'

export interface SessionSummaryData {
  sessionName: string
  host:        string
  commands:    AiToolCall[]
  messages:    { role: string; content: string }[]
}

interface Props {
  data:    SessionSummaryData
  onClose: () => void
}


export function SessionSummaryDialog({ data, onClose }: Props): JSX.Element {
  const { sessionName, host, commands, messages } = data

  // Build a brief text summary from the last assistant message
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const summary = lastAssistant?.content?.slice(0, 320) ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-[480px] max-h-[80vh] flex flex-col rounded-2xl border border-border/70 bg-background shadow-2xl shadow-black/40 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/8 via-transparent to-transparent shrink-0">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/35 to-primary/10 border border-primary/20 shadow-sm shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">ARIA Session Summary</p>
            <p className="text-xs text-muted-foreground/70 truncate">
              {sessionName}
              {host ? <span className="opacity-60"> · {host}</span> : null}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 bg-muted/20 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Terminal className="w-3.5 h-3.5 text-primary/70" />
            <span><span className="font-semibold text-foreground">{commands.length}</span> command{commands.length !== 1 ? 's' : ''} run</span>
          </div>
          <span className="w-px h-3 bg-border/60" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span><span className="font-semibold text-foreground">{commands.filter(c => c.status === 'done').length}</span> completed</span>
          </div>
          <span className="w-px h-3 bg-border/60" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5 text-primary/50" />
            <span><span className="font-semibold text-foreground">{messages.filter(m => m.role === 'user').length}</span> prompts</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

          {/* AI Summary text */}
          {summary && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">What ARIA did</p>
              <p className="text-xs text-foreground/80 leading-relaxed bg-card/50 border border-border/40 rounded-xl px-3 py-2.5 line-clamp-5">
                {summary}
              </p>
            </div>
          )}

          {/* Commands list */}
          {commands.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Commands executed</p>
              <div className="space-y-1">
                {commands.map((cmd, i) => (
                  <div
                    key={cmd.id ?? i}
                    className={cn(
                      'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs',
                      cmd.status === 'done'
                        ? 'bg-emerald-500/5 border-emerald-500/15'
                        : cmd.status === 'blocked'
                          ? 'bg-red-500/5 border-red-500/15'
                          : 'bg-muted/30 border-border/30'
                    )}
                  >
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1 shrink-0',
                      cmd.status === 'done'    ? 'bg-emerald-400'
                      : cmd.status === 'blocked' ? 'bg-red-400'
                      : 'bg-muted-foreground/40'
                    )} />
                    <code className="flex-1 font-mono text-[11px] text-foreground/90 break-all leading-relaxed">
                      {cmd.command}
                    </code>
                    {cmd.output && (
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 max-w-[80px] truncate">
                        {cmd.output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim().split('\n')[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 bg-muted/10 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
