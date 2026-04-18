import { Terminal, Settings } from 'lucide-react'

export function TitleBar(): JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <div
      className="drag-region h-11 flex items-center justify-between px-4 border-b border-border bg-sidebar shrink-0"
      style={{ paddingLeft: isMac ? '80px' : '16px' }}
    >
      <div className="flex items-center gap-2 no-drag">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">NetTerm</span>
      </div>

      <div className="flex items-center gap-1 no-drag">
        <kbd className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
          {isMac ? '⌘' : 'Ctrl'}K
          <span className="ml-1">Quick Connect</span>
        </kbd>
        <button
          className="ml-2 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
