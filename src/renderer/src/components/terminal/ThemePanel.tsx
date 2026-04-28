import { X, Check } from 'lucide-react'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'
import { TERMINAL_THEMES } from '../../lib/terminalThemes'

export function ThemePanel(): JSX.Element {
  const { setThemePanelOpen, terminalSettings, applySettings } = useAppStore()

  const applyTheme = async (themeId: string) => {
    applySettings({ terminalTheme: themeId })
    await window.api.store.setSetting('terminalTheme', themeId)
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
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Theme list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
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
