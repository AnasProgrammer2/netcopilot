import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  open:    boolean
  onClose: () => void
}

interface Shortcut {
  keys: string[]
  label: string
}

interface Section {
  title:     string
  shortcuts: Shortcut[]
}

export function ShortcutsDialog({ open, onClose }: Props): JSX.Element | null {
  if (!open) return null

  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl'
  const shift = '⇧'

  const sections: Section[] = [
    {
      title: 'Sessions',
      shortcuts: [
        { keys: [`${mod}K`, `${mod}T`],   label: 'Quick Connect / New Tab' },
        { keys: [`${mod}W`],              label: 'Close active tab' },
        { keys: [`${mod}D`],              label: 'Toggle split view' },
        { keys: [`${mod}1–9`],            label: 'Switch to tab 1–9' },
      ],
    },
    {
      title: 'Terminal',
      shortcuts: [
        { keys: [`${mod}F`],              label: 'Search in terminal' },
        { keys: [`${mod}+`],              label: 'Zoom in' },
        { keys: [`${mod}−`],              label: 'Zoom out' },
        { keys: [`${mod}0`],              label: 'Reset zoom' },
      ],
    },
    {
      title: 'AI (ARIA)',
      shortcuts: [
        { keys: [`${mod}${shift}A`],      label: 'Toggle ARIA panel' },
      ],
    },
    {
      title: 'App',
      shortcuts: [
        { keys: [`${mod},`],              label: 'Open Settings' },
        { keys: ['?'],                    label: 'Keyboard shortcuts' },
        { keys: ['Esc'],                  label: 'Close dialog / cancel' },
      ],
    },
  ]

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-foreground">Keyboard Shortcuts</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isMac ? 'macOS' : 'Windows / Linux'} key bindings
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.shortcuts.map((sc) => (
                  <div
                    key={sc.label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <span className="text-sm text-foreground/80">{sc.label}</span>
                    <div className="flex items-center gap-1.5">
                      {sc.keys.map((key, i) => (
                        <span key={key} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-xs text-muted-foreground/40">or</span>
                          )}
                          <kbd className={cn(
                            'inline-flex items-center justify-center px-2 py-1 rounded-md',
                            'bg-muted border border-border/80 text-foreground',
                            'text-[11px] font-mono font-medium leading-none',
                            'shadow-[0_1px_0_0_hsl(var(--border))]'
                          )}>
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/30 shrink-0">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">Esc</kbd> or click outside to close
          </p>
        </div>
      </div>
    </div>
  )
}
