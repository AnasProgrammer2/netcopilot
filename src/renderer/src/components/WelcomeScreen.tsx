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
      color:  'text-violet-400',
      bg:     'bg-violet-500/10 border-violet-500/20',
    },
    {
      num:    '02',
      icon:   Zap,
      title:  'Or connect instantly',
      desc:   `Use Quick Connect (${mod}K) to jump into any host without saving.`,
      action: { label: 'Quick Connect', onClick: () => setQuickConnectOpen(true) },
      color:  'text-amber-400',
      bg:     'bg-amber-500/10 border-amber-500/20',
    },
    {
      num:    '03',
      icon:   Cpu,
      title:  'Let ARIA assist you',
      desc:   `Open the AI panel (${mod}⇧A) — ask ARIA to diagnose, configure, or explain anything on your device.`,
      action: null,
      color:  'text-sky-400',
      bg:     'bg-sky-500/10 border-sky-500/20',
    },
  ]

  const features = [
    { icon: Network,    label: 'SSH · Telnet · Serial',  color: 'text-violet-400' },
    { icon: Cpu,        label: 'ARIA AI Assistant',       color: 'text-sky-400'    },
    { icon: Shield,     label: 'Encrypted credential vault', color: 'text-emerald-400' },
    { icon: Monitor,    label: 'Multi-tab sessions',      color: 'text-blue-400'   },
    { icon: Key,        label: 'SSH key management',      color: 'text-amber-400'  },
    { icon: GitBranch,  label: 'Port forwarding / SOCKS', color: 'text-pink-400'   },
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto flex flex-col items-center px-6 pt-12 pb-12 bg-background">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-5 text-center max-w-md mb-14">
        {/* Icon with layered glow */}
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl scale-150 opacity-60" />
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/20">
            <Terminal className="w-9 h-9 text-primary drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Welcome to <span className="text-primary">NetCopilot</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            Your AI-powered network terminal. Manage connections across SSH, Telnet &amp; Serial — all with an intelligent assistant at your side.
          </p>
        </div>

        {/* Primary CTAs */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => setConnectionDialogOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4" />
            New Host
          </button>
          <button
            onClick={() => setQuickConnectOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border text-foreground text-sm font-medium hover:bg-accent transition-all cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            Quick Connect
          </button>
        </div>
      </div>

      {/* ── Getting started — timeline layout ────────────────────────────── */}
      <div className="w-full max-w-lg mb-14">
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mb-5">
          Getting started
        </p>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-10 bottom-10 w-px bg-gradient-to-b from-border via-border/50 to-transparent" />

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
                        <span className="text-[10px] font-bold text-muted-foreground/40 font-mono">{step.num}</span>
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
        <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mb-4">
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
      <p className="text-xs text-muted-foreground/40 text-center">
        Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono mx-0.5">?</kbd> anytime to see keyboard shortcuts
      </p>
    </div>
  )
}
