import { useRef, useState, useCallback } from 'react'
import { useAppStore } from '../../store'
import { TabBar } from './TabBar'
import { TerminalTab } from './TerminalTab'
import { AiPanel } from '../ai/AiPanel'
import { HomeScreen } from '../home/HomeScreen'
import { terminalRegistry } from '../../lib/terminalRegistry'

const AI_PANEL_DEFAULT_WIDTH = 340
const AI_PANEL_MIN_WIDTH     = 260
const AI_PANEL_MAX_WIDTH     = 600

export function TerminalArea(): JSX.Element {
  const { sessions, activeSessionId, splitSessionId, aiPanelOpen } = useAppStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const isSplit       = !!splitSessionId && sessions.some(s => s.id === splitSessionId) && sessions.length >= 2

  // AI panel width (resizable via drag handle)
  const [aiWidth, setAiWidth]     = useState(AI_PANEL_DEFAULT_WIDTH)
  const dragStartX                = useRef<number>(0)
  const dragStartWidth            = useRef<number>(AI_PANEL_DEFAULT_WIDTH)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragStartX.current     = e.clientX
    dragStartWidth.current = aiWidth

    const onMove = (ev: MouseEvent) => {
      const delta    = dragStartX.current - ev.clientX
      const newWidth = Math.max(AI_PANEL_MIN_WIDTH, Math.min(AI_PANEL_MAX_WIDTH, dragStartWidth.current + delta))
      setAiWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [aiWidth])

  // Callbacks for AiPanel — includes split session context when active
  const getTerminalContext = useCallback((lines = 120) => {
    if (!activeSessionId) return ''
    const primary = terminalRegistry.get(activeSessionId)?.getContext(lines) ?? ''
    if (!isSplit || !splitSessionId) return primary
    const splitSession = sessions.find(s => s.id === splitSessionId)
    const secondary = terminalRegistry.get(splitSessionId)?.getContext(lines) ?? ''
    if (!secondary) return primary
    return `=== ${activeSession?.connection.name ?? 'Primary'} ===\n${primary}\n\n=== ${splitSession?.connection.name ?? 'Secondary'} ===\n${secondary}`
  }, [activeSessionId, splitSessionId, isSplit, sessions, activeSession])

  const sendToTerminal = useCallback((data: string) => {
    if (!activeSessionId || !activeSession) return
    terminalRegistry.get(activeSessionId)?.sendData(data)
  }, [activeSessionId, activeSession])

  // Route a command to a specific session by ID (used by ARIA multi-session)
  const sendToSession = useCallback((sessionId: string, data: string) => {
    terminalRegistry.get(sessionId)?.sendData(data)
  }, [])

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <TabBar />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Home screen — shown when no sessions */}
        {sessions.length === 0 && (
          <div className="flex-1 overflow-hidden">
            <HomeScreen />
          </div>
        )}

        {/* Terminal pane */}
        {sessions.length > 0 && (
        <div className="flex-1 relative overflow-hidden flex flex-col min-w-0 min-h-0">
          <div className="flex-1 relative overflow-hidden flex min-h-0">
            {sessions.map((session) => {
              const isActive   = session.id === activeSessionId
              const isSplitPane = isSplit && session.id === splitSessionId

              if (!isActive && !isSplitPane) {
                return (
                  <div key={session.id} className="hidden">
                    <TerminalTab session={session} />
                  </div>
                )
              }

              if (isSplit) {
                return (
                  <div
                    key={session.id}
                    className={`flex-1 overflow-hidden${isActive && !isSplitPane ? ' border-r border-border' : ''}`}
                  >
                    <TerminalTab session={session} />
                  </div>
                )
              }

              return (
                <div key={session.id} className="absolute inset-0">
                  <TerminalTab session={session} />
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* AI panel */}
        {aiPanelOpen && (
          <>
            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors bg-border/40"
            />
            <div className="shrink-0 flex flex-col overflow-hidden min-h-0" style={{ width: aiWidth }}>
              <AiPanel
                activeSession={activeSession}
                splitSession={isSplit ? sessions.find(s => s.id === splitSessionId) ?? null : null}
                allSessions={sessions}
                getTerminalContext={getTerminalContext}
                sendToTerminal={sendToTerminal}
                sendToSession={sendToSession}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
