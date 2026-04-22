import { useState } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, Target, CheckCircle2, Circle, Loader } from 'lucide-react'
import { AiPlan, useAppStore } from '../../store'
import { cn } from '../../lib/utils'

interface Props {
  plan:  AiPlan
  msgId: string   // id of this plan message — used to find tool calls that came after it
}

type StepStatus = 'done' | 'active' | 'pending'

export function AiPlanBlock({ plan, msgId }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { aiMessages, aiAgentActive } = useAppStore()

  // Count tool calls that appeared AFTER this plan message
  const planIdx = aiMessages.findIndex(m => m.id === msgId)
  const laterMessages = planIdx >= 0 ? aiMessages.slice(planIdx + 1) : []

  const allToolCalls = laterMessages.flatMap(m => m.toolCalls ?? [])
  const completedCount = allToolCalls.filter(t => t.status === 'done' || t.status === 'blocked').length
  const hasRunning     = allToolCalls.some(t => t.status === 'running' || t.status === 'pending')

  const isDone = !aiAgentActive && completedCount > 0

  function stepStatus(i: number): StepStatus {
    if (i < completedCount) return 'done'
    if (i === completedCount && (hasRunning || aiAgentActive)) return 'active'
    return 'pending'
  }

  const doneCount = Math.min(completedCount, plan.steps.length)

  return (
    <div className="my-2 rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-primary/10 transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
          <ClipboardList className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
            Investigation Plan
          </span>
          {!expanded && (
            <span className="ml-2 text-[11px] text-muted-foreground">
              {doneCount}/{plan.steps.length} steps
            </span>
          )}
        </div>
        {/* Progress fraction */}
        {expanded && aiAgentActive && (
          <span className="text-[11px] font-mono text-primary/50 mr-1">
            {doneCount}/{plan.steps.length}
          </span>
        )}
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-primary/60 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-primary/60 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Objective */}
          <div className="flex items-start gap-2 pt-0.5">
            <Target className="w-3.5 h-3.5 text-primary/70 mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/80 leading-relaxed">{plan.objective}</p>
          </div>

          {/* Thin progress bar */}
          {plan.steps.length > 0 && (
            <div className="h-0.5 bg-primary/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/50 transition-all duration-500"
                style={{ width: `${(doneCount / plan.steps.length) * 100}%` }}
              />
            </div>
          )}

          {/* Steps */}
          <ol className="space-y-1.5">
            {plan.steps.map((step, i) => {
              const status = stepStatus(i)
              return (
                <li key={i} className={cn('flex items-start gap-2.5 transition-opacity', status === 'pending' ? 'opacity-40' : 'opacity-100')}>
                  {/* Step icon */}
                  <div className="shrink-0 mt-0.5">
                    {status === 'done' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {status === 'active' && (
                      <Loader className="w-4 h-4 text-primary animate-spin" />
                    )}
                    {status === 'pending' && (
                      <Circle className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <span className={cn(
                    'text-xs leading-relaxed',
                    status === 'done'   ? 'text-foreground/50 line-through'  : '',
                    status === 'active' ? 'text-foreground font-medium'       : '',
                    status === 'pending'? 'text-foreground/60'                : '',
                  )}>
                    {step}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* Footer */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {isDone ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="text-[11px] text-emerald-500/70">Plan completed</span>
              </>
            ) : aiAgentActive ? (
              <>
                <Loader className="w-3 h-3 text-primary/50 animate-spin shrink-0" />
                <span className="text-[11px] text-muted-foreground/60">Executing plan...</span>
              </>
            ) : (
              <>
                <Circle className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <span className="text-[11px] text-muted-foreground/40">Pending</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
