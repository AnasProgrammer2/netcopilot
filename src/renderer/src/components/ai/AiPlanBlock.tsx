import { useState } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Circle, Loader } from 'lucide-react'
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
    <div className="my-1 rounded-md border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-2.5 h-8 hover:bg-accent/50 transition-colors text-left"
      >
        <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">Plan</span>
        <span className="text-2xs text-subtle tabular-nums">{doneCount}/{plan.steps.length}</span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-subtle shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-subtle shrink-0" />}
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <p className="text-xs text-foreground leading-relaxed">{plan.objective}</p>
          <ol className="space-y-1">
            {plan.steps.map((step, i) => {
              const status = stepStatus(i)
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">
                    {status === 'done'    && <CheckCircle2 className="w-3.5 h-3.5 text-subtle" />}
                    {status === 'active'  && <Loader className="w-3.5 h-3.5 text-foreground animate-spin" />}
                    {status === 'pending' && <Circle className="w-3.5 h-3.5 text-subtle" />}
                  </span>
                  <span className={cn(
                    'text-xs leading-relaxed',
                    status === 'active' ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {step}
                  </span>
                </li>
              )
            })}
          </ol>
          {isDone && <p className="text-2xs text-subtle">Plan completed</p>}
        </div>
      )}
    </div>
  )
}
