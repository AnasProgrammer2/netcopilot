// Types one change-plan step into a terminal for the main-process executor and
// collects the device's response. Unlike ARIA's inspection commands (which
// finish after a quiet period), a change step finishes only when the device
// shows its prompt again — a slow commit must not run into the next line.

import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../store'
import { terminalRegistry } from './terminalRegistry'
import { stripAnsi } from './utils'

/** Kept in sync with the executor in src/main/changes.ts. */
export const STEP_TIMED_OUT = '(step timed out waiting for the device prompt)'

// Device pagers. (No bare ":" — that is a normal end-of-line on many devices.)
const PAGER_RE = /--\s*More\s*--|<---\s*More\s*--->|----+\s*More\s*----+|Press\s+(?:SPACE|any\s+key|RETURN)\s+(?:to\s+continue|for\s+more)?/i

// A device prompt at the end of the output: "R1(config-if)#", "user@r1#",
// "[admin@MikroTik] <SAFE>", "<HUAWEI>", "[~HUAWEI-Gi0/0/1]", "FGT # ", "$ ".
const PROMPT_END_RE = /[>#$%\]]\s?$/

const SETTLE_MS = 250

export function lastLine(output: string): string {
  const lines = output.replace(/\r/g, '').split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) return lines[i]
  }
  return ''
}

/** True when the device is back at a prompt after `command` was echoed. */
export function isAtPrompt(output: string, command: string): boolean {
  const line = lastLine(output).trimEnd()
  if (!PROMPT_END_RE.test(line)) return false
  // The echo of the command itself ("R1#show run") is not the next prompt.
  const cmd = command.trim()
  return !cmd || !line.endsWith(cmd)
}

export function runChangeStep(req: ChangeStepRequest): Promise<string> {
  const session = useAppStore.getState().sessions.find((s) => s.id === req.sessionId)
  const term    = terminalRegistry.get(req.sessionId)
  if (!session || session.status !== 'connected' || !term) return Promise.resolve('(session is not connected)')

  return new Promise<string>((resolve) => {
    let output   = ''
    let since    = 0
    let settled  = false
    let received = false
    let settle: ReturnType<typeof setTimeout> | undefined
    const replies = req.replies.map((r) => ({ re: safeRegExp(r.when), send: r.send, used: false }))

    const finish = (note?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(settle)
      clearTimeout(hard)
      offs.forEach((off) => off())
      const out = output.trim() || '(no output)'
      resolve(note ? `${out}\n${note}` : out)
    }

    const onData = (data: string): void => {
      output  += stripAnsi(data)
      received = true
      clearTimeout(settle)

      const fresh = output.slice(since)
      for (const r of replies) {
        if (!r.used && r.re?.test(fresh)) {
          r.used = true
          since  = output.length
          term.sendData(`${r.send}\r`)
          return
        }
      }
      if (PAGER_RE.test(data)) {
        term.sendData(' ')
        return
      }
      if (received && isAtPrompt(output, req.raw ? '' : req.command)) {
        settle = setTimeout(() => finish(), SETTLE_MS)
      }
    }

    const offs = (['ssh', 'telnet', 'serial'] as const).map((proto) =>
      window.api[proto].onData((sessionId: string, data: string) => {
        if (sessionId === req.sessionId) onData(data)
      }),
    )
    const hard = setTimeout(() => finish(STEP_TIMED_OUT), req.timeoutMs)

    term.scrollToBottom()
    term.sendData(req.raw ? req.command : `${req.command}\r`)
  })
}

function safeRegExp(source: string): RegExp | null {
  try { return new RegExp(source, 'i') } catch { return null }
}

/**
 * App-wide listeners for change plans: executor steps must run, and change
 * cards must update, even when the ARIA panel is closed or another tab is active.
 */
export function useChangeEvents(): void {
  useEffect(() => {
    const offStep = window.api.changes.onStep(async (req) => {
      const output = await runChangeStep(req)
      await window.api.changes.stepResult(req.stepId, output)
    })
    const offStatus = window.api.changes.onStatus((evt) => {
      const st = useAppStore.getState()
      st.upsertAiChange(evt)
      if (evt.chatSessionId === st.activeSessionId && !st.aiMessages.some((m) => m.changeId === evt.record.id)) {
        st.finalizeAiStream()
        st.addAiMessage({ id: nanoid(), role: 'change', content: '', changeId: evt.record.id })
      }
    })
    return () => { offStep(); offStatus() }
  }, [])
}
