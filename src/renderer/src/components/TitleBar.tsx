import { Settings, Zap, HelpCircle, BookOpen, Keyboard, PanelLeftClose, PanelLeftOpen, Minus, Square, X, Copy } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store'
import { TabBar } from './terminal/TabBar'

interface Props {
  onShortcuts: () => void
  onWelcome:   () => void
}

export function TitleBar({ onShortcuts, onWelcome }: Props): JSX.Element {
  const { setSettingsOpen, setQuickConnectOpen, sessions, sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  // Windows draws native caption buttons over the bar (window-controls
  // overlay); Linux gets ours, since overlay support varies by window manager.
  const isWindows = navigator.userAgent.includes('Windows')
  const drawWindowControls = !isMac && !isWindows
  const [helpOpen, setHelpOpen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!drawWindowControls) return
    window.api.window.isMaximized().then(setIsMaximized)
    return window.api.window.onMaximizedChange(setIsMaximized)
  }, [drawWindowControls])

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
      className="drag-region h-11 flex items-center border-b border-border bg-sidebar shrink-0 gap-1"
      style={{
        // macOS: leave room for the traffic lights. Windows: leave room for
        // the native caption buttons (window-controls overlay).
        paddingLeft: isMac ? '78px' : '8px',
        paddingRight: isWindows
          ? 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 140px)) + 4px)'
          : drawWindowControls ? '0px' : '8px',
      }}
    >
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="shrink-0 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title={sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
      >
        {sidebarCollapsed
          ? <PanelLeftOpen className="w-4 h-4" />
          : <PanelLeftClose className="w-4 h-4" />
        }
      </button>

      {sessions.length > 0
        ? <TabBar />
        : <div className="flex-1 text-center text-[13px] font-semibold text-muted-foreground/80 truncate">NetCopilot</div>
      }

      {/* Global actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => setQuickConnectOpen(true)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={`Quick Connect (${isMac ? '⌘K' : 'Ctrl+K'})`}
        >
          <Zap className="w-4 h-4" />
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
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden p-1">
              <button
                onClick={() => { onWelcome(); setHelpOpen(false) }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-left group"
              >
                <BookOpen className="w-4 h-4 text-primary group-hover:text-primary-foreground shrink-0" />
                Getting Started
              </button>
              <button
                onClick={() => { onShortcuts(); setHelpOpen(false) }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-foreground hover:bg-primary hover:text-primary-foreground transition-colors text-left group"
              >
                <Keyboard className="w-4 h-4 text-muted-foreground group-hover:text-primary-foreground shrink-0" />
                <span className="flex-1">Keyboard Shortcuts</span>
                <span className="text-[11px] text-muted-foreground group-hover:text-primary-foreground/80">?</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={`Settings (${isMac ? '⌘,' : 'Ctrl+,'})`}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {drawWindowControls && (
        <div className="flex items-center self-stretch shrink-0 ml-1">
          <button
            onClick={() => window.api.window.minimize()}
            className="w-11 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.api.window.maximize()}
            className="w-11 h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={() => window.api.window.close()}
            className="w-11 h-full flex items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
