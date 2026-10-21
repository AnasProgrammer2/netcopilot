import { Terminal, Plus, Zap, Network, ArrowRight, Key, Monitor, Cpu, Shield, GitBranch } from 'lucide-react'
import { useAppStore } from '../store'

export function WelcomeScreen(): JSX.Element {
  const { setConnectionDialogOpen, setQuickConnectOpen } = useAppStore()
  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl+'

  const steps = [
    {
      num:    '01',
      icon:   Plus,
      title:  'Add your first host',
      desc:   'Save SSH, Telnet, or Serial connections to your library for one-click access.',
      action: { label: 'New Connection', onClick: () => setConnectionDialogOpen(true) },
      color: 'text-muted-foreground',
      bg: 'bg-muted border-transparent',
    },
    {
      num:    '02',
      icon:   Zap,
      title:  'Or connect instantly',
      desc:   `Use Quick Connect (${mod}K) to jump into any host without saving.`,
      action: { label: 'Quick Connect', onClick: () => setQuickConnectOpen(true) },
      color: 'text-muted-foreground',
      bg: 'bg-muted border-transparent',
    },
    {
      num:    '03',
      icon:   Cpu,
      title:  'Let ARIA assist you',
      desc:   `Open the AI panel (${mod}⇧A) — ask ARIA to diagnose, configure, or explain anything on your device.`,
      action: null,
      color: 'text-muted-foreground',
      bg: 'bg-muted border-transparent',
    },
  ]

  const features = [
    { icon: Network,    label: 'SSH · Telnet · Serial',  color: 'text-muted-foreground' },
    { icon: Cpu,        label: 'ARIA AI Assistant',       color: 'text-muted-foreground'    },
    { icon: Shield,     label: 'Encrypted credential vault', color: 'text-muted-foreground' },
    { icon: Monitor,    label: 'Multi-tab sessions',      color: 'text-muted-foreground'   },
    { icon: Key,        label: 'SSH key management',      color: 'text-muted-foreground'  },
    { icon: GitBranch,  label: 'Port forwarding / SOCKS', color: 'text-muted-foreground'   },
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto flex flex-col items-center px-6 pt-12 pb-12 bg-background">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-5 text-center max-w-md mb-14">
        {/* Icon with layered glow */}
        <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
          <Terminal className="w-7 h-7 text-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Welcome to NetCopilot
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            Your AI-powered network terminal. Manage connections across SSH, Telnet &amp; Serial — all with an intelligent assistant at your side.
          </p>
        </div>

        {/* Primary CTAs */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => setConnectionDialogOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Host
          </button>
          <button
            onClick={() => setQuickConnectOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4 text-muted-foreground" />
            Quick Connect
          </button>
        </div>
      </div>

      {/* ── Getting started — timeline layout ────────────────────────────── */}
      <div className="w-full max-w-lg mb-14">
        <p className="text-xs font-medium text-muted-foreground mb-4">
          Getting started
        </p>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-10 bottom-10 w-px bg-border" />

          <div className="space-y-3">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.num} className="relative flex items-start gap-4">
                  {/* Timeline node */}
                  <div className={`relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${step.bg}`}>
                    <Icon className={`w-4 h-4 ${step.color}`} />
                  </div>

                  {/* Card */}
                  <div className="flex-1 flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:bg-accent/20 transition-colors group min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-2xs font-semibold text-subtle font-mono">{step.num}</span>
                        <p className="text-sm font-semibold text-foreground">{step.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>

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
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Feature highlights ────────────────────────────────────────────── */}
      <div className="w-full max-w-lg mb-8">
        <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-4">
          What&apos;s included
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {features.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-border transition-all"
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
              <span className="text-xs text-muted-foreground font-medium truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Keyboard hint ─────────────────────────────────────────────────── */}
      <p className="text-xs text-subtle text-center">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-2xs font-mono mx-0.5">?</kbd> anytime to see keyboard shortcuts
      </p>
    </div>
  )
}
