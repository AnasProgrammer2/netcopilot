import { Settings, Zap, Network, HelpCircle } from 'lucide-react'
import { useAppStore } from '../store'

interface Props {
  onShortcuts: () => void
}

export function TitleBar({ onShortcuts }: Props): JSX.Element {
  const { setSettingsOpen, setQuickConnectOpen, sessions } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const activeSessions = sessions.filter(s => s.status === 'connected').length

  return (
    <div
      className="drag-region h-11 flex items-center justify-between border-b border-border bg-sidebar shrink-0"
      style={{ paddingLeft: isMac ? '80px' : '16px', paddingRight: '12px' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 no-drag">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/15">
          <Network className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight">AI Network</span>
        <span className="hidden sm:inline text-[10px] text-muted-foreground/40 font-medium ml-0.5 tracking-wider uppercase">
          beta
        </span>
        {activeSessions > 0 && (
          <span className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 tabular-nums">
            {activeSessions} live
          </span>
        )}
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
          onClick={onShortcuts}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Keyboard Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4" />
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
