/** Small LAB / STG marker; production is the unmarked default. Neutral on purpose:
 *  it is information, not a warning. */
export function EnvTag({ environment }: { environment: 'staging' | 'lab' }): JSX.Element {
  return (
    <span
      title={environment === 'lab' ? 'Lab device — ARIA Autopilot allowed' : 'Staging device — ARIA Autopilot allowed'}
      className="shrink-0 px-1 rounded border border-border text-2xs font-medium text-muted-foreground leading-[15px]"
    >
      {environment === 'lab' ? 'LAB' : 'STG'}
    </span>
  )
}
