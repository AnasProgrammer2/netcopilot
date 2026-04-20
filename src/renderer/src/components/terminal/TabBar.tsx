import { useState, useRef, useEffect } from 'react'
import { X, Plus, PanelLeftClose, PanelRightClose, ChevronDown, Sparkles, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { terminalRegistry } from '../../lib/terminalRegistry'
import { useAppStore } from '../../store'
import { Session } from '../../types'
import { cn } from '../../lib/utils'

export function TabBar(): JSX.Element {
  const {
    sessions, activeSessionId, splitSessionId,
    setActiveSession, closeSession, setQuickConnectOpen, setSplitSession,
    aiPanelOpen, setAiPanelOpen,
  } = useAppStore()

  const [splitMenuOpen, setSplitMenuOpen] = useState(false)
  const splitMenuRef = useRef<HTMLDivElement>(null)

  // Close split menu on outside click
  useEffect(() => {
    if (!splitMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setSplitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [splitMenuOpen])

  const canSplit = sessions.length >= 2

  return (
    <div className="flex items-end border-b border-border bg-sidebar overflow-x-auto shrink-0 h-10 gap-px pl-1">
      {sessions.map((session) => (
        <Tab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          isSplit={session.id === splitSessionId}
          onActivate={() => setActiveSession(session.id)}
          onClose={() => {
            if (session.id === splitSessionId) setSplitSession(null)
            // Generate session summary from ARIA messages before closing
            const { aiMessages } = useAppStore.getState()
            const cmds = aiMessages.filter(m => m.toolCalls?.length).flatMap(m => m.toolCalls ?? []).filter(t => t.status === 'done')
            if (cmds.length > 0) {
              const names = [...new Set(cmds.map(t => t.command.split(' ').slice(0, 3).join(' ')))].slice(0, 3)
              toast.info(`Session closed — ${session.connection.name}`, {
                description: `ARIA ran ${cmds.length} command${cmds.length > 1 ? 's' : ''}: ${names.join(', ')}${cmds.length > 3 ? '…' : ''}`,
                duration: 5000,
              })
            }
            closeSession(session.id)
          }}
        />
      ))}

      {/* New session button */}
      <button
        onClick={() => setQuickConnectOpen(true)}
        className="shrink-0 self-center flex items-center justify-center w-7 h-7 ml-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        title="New session (⌘K)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* AI Copilot toggle */}
      <button
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
        title={aiPanelOpen ? 'Close ARIA' : 'Open ARIA'}
        className={cn(
          'shrink-0 self-center flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ml-auto',
          aiPanelOpen
            ? 'text-primary bg-primary/15 hover:bg-primary/25'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">ARIA AI</span>
      </button>

      {/* Split button */}
      <div ref={splitMenuRef} className="relative shrink-0 self-center mr-2">
        {splitSessionId ? (
          <button
            onClick={() => setSplitSession(null)}
            title="Close split view"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
            Split
          </button>
        ) : (
          <button
            onClick={() => canSplit && setSplitMenuOpen(v => !v)}
            title={canSplit ? 'Split view' : 'Open another session to split'}
            disabled={!canSplit}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
            Split
            {canSplit && <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {/* Split session picker */}
        {splitMenuOpen && (
          <div className="absolute right-0 top-full mt-1 z-30 bg-popover border border-border rounded-lg shadow-xl w-48 py-1 overflow-hidden">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              Show alongside
            </p>
            {sessions
              .filter(s => s.id !== activeSessionId)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSplitSession(s.id); setSplitMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.connection.color || '#8b5cf6' }}
                  />
                  <span className="truncate">{s.connection.name}</span>
                </button>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}

interface TabProps {
  session: Session
  isActive: boolean
  isSplit: boolean
  onActivate: () => void
  onClose: () => void
}

function Tab({ session, isActive, isSplit, onActivate, onClose }: TabProps): JSX.Element {
  const statusDot = {
    connecting:   'bg-amber-400 animate-pulse',
    connected:    'bg-emerald-400',
    disconnected: 'bg-muted-foreground/50',
    error:        'bg-red-400',
  }[session.status]

  return (
    <div
      onClick={onActivate}
      className={cn(
        'relative flex items-center gap-1.5 px-3 h-9 cursor-pointer shrink-0 group max-w-52 select-none',
        'rounded-t-md border border-b-0 transition-colors',
        isActive
          ? 'bg-background border-border text-foreground z-10'
          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-background/40',
        isSplit && !isActive && 'border-primary/30 bg-primary/5 text-primary/80'
      )}
    >
      {isActive && (
        <span className="absolute bottom-[-1px] left-0 right-0 h-px bg-background" />
      )}

      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 transition-colors', statusDot)} />

      <span className="text-xs font-medium truncate flex-1 leading-none">
        {session.connection.name}
      </span>

      {/* Reconnect button — only when disconnected or error */}
      {(session.status === 'disconnected' || session.status === 'error') && (
        <button
          onClick={(e) => { e.stopPropagation(); terminalRegistry.get(session.id)?.reconnect() }}
          title="Reconnect"
          className="shrink-0 p-0.5 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-all"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}

      {isSplit && !isActive && (
        <span className="text-[9px] font-semibold text-primary/70 uppercase tracking-wider shrink-0">split</span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className={cn(
          'shrink-0 p-0.5 rounded hover:bg-accent transition-all',
          isActive ? 'opacity-50 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
