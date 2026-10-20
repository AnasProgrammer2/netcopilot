import { useEffect, useRef, useState } from 'react'
import { ShieldQuestion, ShieldAlert } from 'lucide-react'

type HostKeyPrompt = Parameters<Parameters<typeof window.api.hostKeys.onPrompt>[0]>[0]

/**
 * SSH host key confirmation (trust on first use).
 *
 * The main process asks before trusting an unknown host key and warns loudly
 * when a host presents a different key than the one stored. Prompts are queued
 * so concurrent connections (e.g. terminal + SFTP) are answered one by one.
 * Unanswered prompts are rejected by the main process after a timeout.
 */
export function HostKeyDialog(): JSX.Element | null {
  const [queue, setQueue] = useState<HostKeyPrompt[]>([])
  const rejectRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const offPrompt = window.api.hostKeys.onPrompt((prompt) => {
      setQueue((q) => [...q, prompt])
    })
    const offCancel = window.api.hostKeys.onPromptCancel((requestId) => {
      setQueue((q) => q.filter((p) => p.requestId !== requestId))
    })
    return () => { offPrompt(); offCancel() }
  }, [])

  const current = queue[0]

  useEffect(() => {
    if (current) setTimeout(() => rejectRef.current?.focus(), 50)
  }, [current?.requestId])

  if (!current) return null

  const respond = (accept: boolean) => {
    window.api.hostKeys.respond(current.requestId, accept)
    setQueue((q) => q.filter((p) => p.requestId !== current.requestId))
  }

  const target = current.port === 22 ? current.host : `${current.host}:${current.port}`

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-[#0d0f14]/90 backdrop-blur-sm"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); respond(false) } }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="host-key-title"
        className={`bg-card border rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden ${
          current.changed ? 'border-red-500/60' : 'border-border'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            current.changed ? 'bg-red-500/15' : 'bg-primary/10'
          }`}>
            {current.changed
              ? <ShieldAlert className="w-4 h-4 text-red-400" />
              : <ShieldQuestion className="w-4 h-4 text-primary" />}
          </div>
          <div className="min-w-0">
            <p id="host-key-title" className={`text-sm font-semibold ${current.changed ? 'text-red-400' : 'text-foreground'}`}>
              {current.changed ? 'WARNING: Host key has changed!' : 'Unknown host key'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{target}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 text-xs text-muted-foreground select-text">
          {current.changed ? (
            <>
              <p className="text-foreground">
                The key presented by this host does not match the key you trusted before.
                Someone could be intercepting the connection (man-in-the-middle attack),
                or the device was reinstalled / its key regenerated.
              </p>
              <p>Do not continue unless you have verified the new fingerprint with the device administrator.</p>
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground">Previously trusted ({current.oldKeyType}):</p>
                <code className="block break-all rounded-md bg-background border border-border px-2 py-1.5 font-mono text-[11px] text-foreground/70">
                  {current.oldFingerprint}
                </code>
              </div>
            </>
          ) : (
            <p className="text-foreground">
              The authenticity of this host can&apos;t be established. Verify the fingerprint
              below with the device (e.g. <span className="font-mono">show crypto key mypubkey</span> or <span className="font-mono">ssh-keygen -lf</span>) before trusting it.
            </p>
          )}
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground">
              {current.changed ? 'New key' : 'Key'} ({current.keyType}):
            </p>
            <code className={`block break-all rounded-md bg-background border px-2 py-1.5 font-mono text-[11px] text-foreground ${
              current.changed ? 'border-red-500/40' : 'border-border'
            }`}>
              {current.fingerprint}
            </code>
          </div>
          {queue.length > 1 && (
            <p className="text-[11px] text-muted-foreground/70">{queue.length - 1} more host key prompt(s) waiting</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            ref={rejectRef}
            type="button"
            onClick={() => respond(false)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              current.changed
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {current.changed ? 'Disconnect' : 'Cancel'}
          </button>
          {current.changed ? (
            <button
              type="button"
              onClick={() => respond(true)}
              className="px-3 py-1.5 text-sm rounded-md border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              Replace key and connect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => respond(true)}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors cursor-pointer"
            >
              Trust and connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
