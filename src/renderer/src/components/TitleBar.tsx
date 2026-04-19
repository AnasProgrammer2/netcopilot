import { Terminal, Settings, Zap } from 'lucide-react'
import { useAppStore } from '../store'

export function TitleBar(): JSX.Element {
  const { setSettingsOpen, setQuickConnectOpen } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <div
      className="drag-region h-11 flex items-center justify-between border-b border-border bg-sidebar shrink-0"
      style={{ paddingLeft: isMac ? '80px' : '16px', paddingRight: '12px' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 no-drag">
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground tracking-tight">NetCopilot</span>
        <span className="hidden sm:inline text-[10px] text-muted-foreground/50 font-medium ml-1 tracking-wider uppercase">
          beta
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={() => setQuickConnectOpen(true)}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Quick Connect"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{isMac ? '⌘K' : 'Ctrl+K'}</span>
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
