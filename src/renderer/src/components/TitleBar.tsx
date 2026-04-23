import { Settings, Zap, Network, HelpCircle, BookOpen, Keyboard } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store'

interface Props {
  onShortcuts: () => void
  onWelcome:   () => void
}

export function TitleBar({ onShortcuts, onWelcome }: Props): JSX.Element {
  const { setSettingsOpen, setQuickConnectOpen, sessions } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const activeSessions = sessions.filter(s => s.status === 'connected').length
  const [helpOpen, setHelpOpen] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!helpOpen) return
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [helpOpen])

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

        {/* Help dropdown */}
        <div ref={helpRef} className="relative">
          <button
            onClick={() => setHelpOpen(v => !v)}
            className={`p-1.5 rounded-md transition-colors ${helpOpen ? 'bg-accent text-foreground' : 'hover:bg-accent text-muted-foreground hover:text-foreground'}`}
            title="Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {helpOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
              <button
                onClick={() => { onWelcome(); setHelpOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="font-medium">Getting Started</p>
                  <p className="text-[11px] text-muted-foreground">Welcome &amp; onboarding</p>
                </div>
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button
                onClick={() => { onShortcuts(); setHelpOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors text-left cursor-pointer"
              >
                <Keyboard className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">Keyboard Shortcuts</p>
                  <p className="text-[11px] text-muted-foreground">Press ? anywhere</p>
                </div>
              </button>
            </div>
          )}
        </div>

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
