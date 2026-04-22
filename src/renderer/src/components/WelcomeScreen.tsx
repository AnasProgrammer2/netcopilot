import { Terminal, Plus, Zap, Network, ArrowRight, Key, Monitor, Cpu, Shield } from 'lucide-react'
import { useAppStore } from '../store'

export function WelcomeScreen(): JSX.Element {
  const { setConnectionDialogOpen, setQuickConnectOpen } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl+'

  const steps = [
    {
      num:   '1',
      icon:  Plus,
      title: 'Add your first host',
      desc:  'Save SSH, Telnet, or Serial connections to your library.',
      action: { label: 'New Connection', onClick: () => setConnectionDialogOpen(true) },
    },
    {
      num:   '2',
      icon:  Zap,
      title: 'Or connect instantly',
      desc:  `Use Quick Connect (${mod}K) to connect without saving.`,
      action: { label: 'Quick Connect', onClick: () => setQuickConnectOpen(true) },
    },
    {
      num:   '3',
      icon:  Cpu,
      title: 'Let ARIA assist you',
      desc:  `Open the AI panel (${mod}⇧A) and ask ARIA to troubleshoot, configure, or explain anything on the device.`,
      action: null,
    },
  ]

  const features = [
    { icon: Network,  label: 'SSH / Telnet / Serial' },
    { icon: Cpu,      label: 'ARIA AI Assistant' },
    { icon: Shield,   label: 'Encrypted vault' },
    { icon: Monitor,  label: 'Multi-tab + Split view' },
    { icon: Key,      label: 'SSH key management' },
    { icon: Zap,      label: 'Device auto-detection' },
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto flex flex-col items-center px-6 pt-14 pb-10 gap-12 bg-background">

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
          <Terminal className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Welcome to NetCopilot
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your AI-powered network terminal. Manage SSH, Telnet &amp; Serial connections,
            all with an intelligent assistant at your side.
          </p>
        </div>
      </div>

      {/* Getting started steps */}
      <div className="w-full max-w-lg space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Getting started
        </p>

        {steps.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.num}
              className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group"
            >
              {/* Step number */}
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">{step.num}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>

              {/* CTA */}
              {step.action && (
                <button
                  onClick={step.action.onClick}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {step.action.label}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Feature highlights */}
      <div className="w-full max-w-lg">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          What's included
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-border bg-card/50"
            >
              <Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" />
              <span className="text-xs text-muted-foreground font-medium truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="text-xs text-muted-foreground/50 text-center">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">?</kbd> anytime to see all keyboard shortcuts
      </p>
    </div>
  )
}
