/**
 * Global registry of active xterm Terminal instances.
 * TerminalTab registers its instance; AiPanel reads context from it.
 */
export interface TerminalHandle {
  getContext:     (lines?: number) => string
  sendData:       (data: string) => void
  scrollToBottom: () => void
  reconnect:      () => void
}

const registry = new Map<string, TerminalHandle>()

export const terminalRegistry = {
  register:   (sessionId: string, handle: TerminalHandle) => registry.set(sessionId, handle),
  unregister: (sessionId: string) => registry.delete(sessionId),
  get:        (sessionId: string) => registry.get(sessionId),
}
