import { useState } from 'react'
import { X, Check, Minus, Plus, ChevronDown } from 'lucide-react'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'
import { TERMINAL_THEMES } from '../../lib/terminalThemes'

const FONT_FAMILIES = [
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Cascadia Code',
  'SF Mono',
  'Consolas',
  'monospace'
]

export function ThemePanel(): JSX.Element {
  const { setThemePanelOpen, terminalSettings, applySettings } = useAppStore()
  const [fontOpen, setFontOpen] = useState(false)

  const applyTheme = async (themeId: string) => {
    applySettings({ terminalTheme: themeId })
    await window.api.store.setSetting('terminalTheme', themeId)
  }

  const updateFont = async (fontFamily: string) => {
    applySettings({ fontFamily })
    await window.api.store.setSetting('fontFamily', fontFamily)
  }

  const updateSize = async (fontSize: number) => {
    const clamped = Math.min(24, Math.max(10, fontSize))
    applySettings({ fontSize: clamped })
    await window.api.store.setSetting('fontSize', clamped)
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Terminal Themes</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {TERMINAL_THEMES.length} themes available
          </p>
        </div>
        <button
          onClick={() => setThemePanelOpen(false)}
          title="Close"
          aria-label="Close theme panel"
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Font section */}
      <div className="px-3 pt-3 pb-2 border-b border-border shrink-0 space-y-3">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2">Font</p>
          <div className="relative">
            <button
              onClick={() => setFontOpen(!fontOpen)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer',
                fontOpen
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40 bg-accent/30'
              )}
            >
              <span
                className="text-[13px] font-medium text-foreground truncate"
                style={{ fontFamily: `"${terminalSettings.fontFamily}", monospace` }}
              >
                {terminalSettings.fontFamily}
              </span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ml-2', fontOpen && 'rotate-180')} />
            </button>

            {fontOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFontOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-2xl z-50 py-1 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                  {FONT_FAMILIES.map((f) => (
                    <button
                      key={f}
                      onClick={() => { updateFont(f); setFontOpen(false) }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer',
                        terminalSettings.fontFamily === f
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-accent'
                      )}
                    >
                      <span style={{ fontFamily: `"${f}", monospace` }} className="text-[13px] truncate min-w-0">{f}</span>
                      {terminalSettings.fontFamily === f && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-foreground">Text Size</span>
          <div className="flex items-center">
            <button
              onClick={() => updateSize(terminalSettings.fontSize - 1)}
              title="Decrease font size"
              aria-label="Decrease font size"
              className="w-8 h-8 flex items-center justify-center rounded-l-lg border border-border bg-accent/50 hover:bg-accent text-foreground transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="w-10 h-8 flex items-center justify-center border-y border-border bg-background text-[13px] font-semibold tabular-nums select-none">
              {terminalSettings.fontSize}
            </div>
            <button
              onClick={() => updateSize(terminalSettings.fontSize + 1)}
              title="Increase font size"
              aria-label="Increase font size"
              className="w-8 h-8 flex items-center justify-center rounded-r-lg border border-border bg-accent/50 hover:bg-accent text-foreground transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Themes label */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">Themes</p>
      </div>

      {/* Theme list */}
      <div className="flex-1 overflow-y-auto py-1 px-2 space-y-1">
        {TERMINAL_THEMES.map((theme) => {
          const isSelected = terminalSettings.terminalTheme === theme.id
          const p = theme.preview

          return (
            <button
              key={theme.id}
              onClick={() => applyTheme(theme.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left cursor-pointer group',
                isSelected
                  ? 'border-primary/60 bg-primary/8 shadow-[0_0_0_1px] shadow-primary/20'
                  : 'border-transparent hover:border-border hover:bg-accent/50'
              )}
            >
              {/* Color swatch — mini terminal preview */}
              <div
                className="shrink-0 w-11 h-9 rounded-lg overflow-hidden flex flex-col justify-center gap-[3px] px-[6px]"
                style={{ background: p.bg }}
              >
                <div className="flex gap-[3px] items-center">
                  <div className="w-3 h-[3px] rounded-full" style={{ background: p.green }} />
                  <div className="w-4 h-[3px] rounded-full opacity-35" style={{ background: p.fg }} />
                </div>
                <div className="flex gap-[3px] items-center">
                  <div className="w-2 h-[3px] rounded-full" style={{ background: p.blue }} />
                  <div className="w-2.5 h-[3px] rounded-full" style={{ background: p.red }} />
                  <div className="w-1.5 h-[3px] rounded-full" style={{ background: p.yellow }} />
                </div>
                <div className="flex gap-[3px] items-center">
                  <div className="w-5 h-[3px] rounded-full opacity-25" style={{ background: p.fg }} />
                </div>
              </div>

              {/* Name + badge */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-[13px] font-medium leading-tight truncate',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}>
                  {theme.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {theme.dark ? 'Dark' : 'Light'}
                </p>
              </div>

              {/* Active checkmark */}
              {isSelected ? (
                <div className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              ) : (
                <div className="shrink-0 w-5 h-5 rounded-full border border-border group-hover:border-primary/40 transition-colors" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
