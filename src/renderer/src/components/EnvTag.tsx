import { cn } from '../lib/utils'

/** Small LAB / STG marker; production is the unmarked default. */
export function EnvTag({ environment }: { environment: 'staging' | 'lab' }): JSX.Element {
  return (
    <span
      title={environment === 'lab' ? 'Lab device — ARIA Autopilot allowed' : 'Staging device — ARIA Autopilot allowed'}
      className={cn(
        'shrink-0 px-1 rounded text-[9px] font-semibold tracking-wide leading-[14px] border',
        environment === 'lab'
          ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25'
          : 'text-amber-500 bg-amber-500/10 border-amber-500/25',
      )}
    >
      {environment === 'lab' ? 'LAB' : 'STG'}
    </span>
  )
}
