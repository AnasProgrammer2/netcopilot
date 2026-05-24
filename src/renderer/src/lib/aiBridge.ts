/**
 * Tiny typed event bus for cross-component AI coordination.
 *
 * Used in two cases where prop-drilling and Zustand are both awkward:
 *   1. `proactive`: TerminalTab fires when terminal output has settled — AiPanel
 *      consumes to launch an auto-analysis (Watch Mode).
 *
 * This replaces the previous `window.__aiSendProactive` etc. globals, which
 * were untyped, untestable, and polluted the window object.
 */

type Listener<T> = (payload: T) => void

interface AiBridgeEvents {
  proactive: { context: string; sessionId: string }
}

const listeners: { [K in keyof AiBridgeEvents]: Set<Listener<AiBridgeEvents[K]>> } = {
  proactive: new Set(),
}

export const aiBridge = {
  on<K extends keyof AiBridgeEvents>(event: K, cb: Listener<AiBridgeEvents[K]>): () => void {
    listeners[event].add(cb as Listener<AiBridgeEvents[K]>)
    return () => { listeners[event].delete(cb as Listener<AiBridgeEvents[K]>) }
  },

  emit<K extends keyof AiBridgeEvents>(event: K, payload: AiBridgeEvents[K]): void {
    for (const cb of listeners[event]) {
      try { cb(payload) } catch (err) { console.error('[aiBridge]', event, err) }
    }
  },
}
