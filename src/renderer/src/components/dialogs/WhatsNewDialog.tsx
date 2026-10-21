import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, X } from 'lucide-react'
import { useWhatsNew } from '../../lib/whatsNew'
import { stripTitle } from '../../../../shared/releaseNotes'

/** Release notes shown once after an update, or from Help → What's New. */
export function WhatsNewDialog(): JSX.Element | null {
  const notes = useWhatsNew((s) => s.notes)
  const close = useWhatsNew((s) => s.close)

  useEffect(() => {
    if (!notes.length) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notes.length, close])

  if (!notes.length) return null
  const latest = notes[0].version

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="bg-card border border-border rounded-xl shadow-2xl w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p id="whats-new-title" className="text-base font-semibold text-foreground">What&apos;s new in NetCopilot {latest}</p>
            <p className="text-xs text-muted-foreground">
              {notes.length > 1 ? `Everything since your last update — ${notes.length} versions.` : 'Here is what this update brings.'}
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 select-text">
          {notes.map((n) => (
            <section key={n.version}>
              {notes.length > 1 && (
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Version {n.version}</p>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => <h3 className="mt-4 mb-2 text-sm font-semibold text-foreground">{children}</h3>,
                  h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-sm font-semibold text-foreground">{children}</h4>,
                  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-foreground/90">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 space-y-1.5 pl-4 list-disc marker:text-muted-foreground">{children}</ul>,
                  li: ({ children }) => <li className="text-sm leading-relaxed text-foreground/90">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 [&_p]:mb-0">{children}</blockquote>
                  ),
                  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
                  a: ({ children }) => <span className="text-primary">{children}</span>,
                }}
              >
                {stripTitle(n.markdown)}
              </ReactMarkdown>
            </section>
          ))}
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-border shrink-0">
          <button
            onClick={close}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
