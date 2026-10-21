import { useState } from 'react'
import {
  X, BookOpen, Cpu, Keyboard,
  ShieldCheck, Wrench, Zap, ShieldAlert,
  Terminal, Plus, PlayCircle, Network,
  ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  open:         boolean
  onClose:      () => void
  initialTab?:  'start' | 'aria' | 'shortcuts'
}

type Tab = 'start' | 'aria' | 'shortcuts'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'start',     label: 'Getting Started', icon: BookOpen  },
  { id: 'aria',      label: 'ARIA Guide',       icon: Cpu       },
  { id: 'shortcuts', label: 'Shortcuts',        icon: Keyboard  },
]

export function HelpDialog({ open, onClose, initialTab = 'start' }: Props): JSX.Element | null {
  const [tab, setTab] = useState<Tab>(initialTab)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer',
                  tab === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'start'     && <StartTab />}
          {tab === 'aria'      && <AriaTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
        </div>
      </div>
    </div>
  )
}

// ── Getting Started ──────────────────────────────────────────────────────────

function StartTab(): JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl+'

  const steps = [
    {
      num: '01', icon: Plus,
      title: 'Add a host',
      desc: 'Click "+ New Host" or press ⌘N to save an SSH, Telnet, or Serial connection to your library.',
      color: 'text-muted-foreground', bg: 'bg-muted border-transparent',
    },
    {
      num: '02', icon: Zap,
      title: 'Or use Quick Connect',
      desc: `Press ${mod}K to connect to any host instantly without saving it first.`,
      color: 'text-muted-foreground', bg: 'bg-muted border-transparent',
    },
    {
      num: '03', icon: Terminal,
      title: 'Open a session',
      desc: 'Click any host card to open a terminal session. Use Split view to manage multiple at once.',
      color: 'text-muted-foreground', bg: 'bg-muted border-transparent',
    },
    {
      num: '04', icon: Cpu,
      title: 'Ask ARIA',
      desc: `Press ${mod}⇧A to open the AI panel. ARIA can diagnose issues, run commands, and explain anything on your devices.`,
      color: 'text-muted-foreground', bg: 'bg-muted border-transparent',
    },
  ]

  const features = [
    { icon: Network,   label: 'SSH · Telnet · Serial',   color: 'text-muted-foreground' },
    { icon: Cpu,       label: 'ARIA AI Assistant',        color: 'text-muted-foreground'    },
    { icon: ShieldCheck, label: 'Encrypted credential vault', color: 'text-muted-foreground' },
    { icon: Zap,       label: 'Quick Connect',            color: 'text-muted-foreground'  },
  ]

  return (
    <div className="p-6 space-y-8">
      {/* Steps */}
      <div>
        <SectionLabel>Getting started in 4 steps</SectionLabel>
        <div className="relative space-y-3 mt-4">
          <div className="absolute left-[19px] top-10 bottom-10 w-px bg-border" />
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.num} className="flex items-start gap-3">
                <div className={`relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${step.bg}`}>
                  <Icon className={`w-4 h-4 ${step.color}`} />
                </div>
                <div className="flex-1 p-3.5 rounded-xl border border-border bg-background/50 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-2xs font-semibold text-subtle font-mono">{step.num}</span>
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Features */}
      <div>
        <SectionLabel>What&apos;s included</SectionLabel>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {features.map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-border/60 bg-background/40">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ARIA Guide ───────────────────────────────────────────────────────────────

function AriaTab(): JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl+'

  return (
    <div className="p-6 space-y-8">

      {/* What is ARIA */}
      <div>
        <SectionLabel>What is ARIA?</SectionLabel>
        <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/15 shrink-0 mt-0.5">
              <Cpu className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">AI-Native Network Assistant</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ARIA is your built-in AI copilot powered by Claude. It can read your terminal output, run diagnostic commands, explain device configurations, troubleshoot issues, and even make configuration changes — all within your active SSH/Telnet session.
              </p>
              <p className="text-xs text-muted-foreground">
                Open with <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-2xs font-mono">{mod}⇧A</kbd>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Modes */}
      <div>
        <SectionLabel>Modes — what ARIA may do</SectionLabel>
        <div className="mt-4 space-y-2">
          <ModeCard
            icon={<ShieldCheck className="w-4 h-4 text-muted-foreground" />}
            title="Investigate"
            badge="Default"
            badgeColor="text-muted-foreground border-border"
            desc="Read-only diagnosis — show, display, ping, traceroute… ARIA runs these by itself and never changes the device. Heavy commands (show tech, captures) ask first."
          />
          <ModeCard
            icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
            title="Change"
            desc="ARIA proposes a change plan: the evidence, the exact lines, pre-checks, verification and rollback. Nothing runs until you approve; NetCopilot applies it with the device's own safety net, verifies, and you choose Keep or Roll back."
          />
          <ModeCard
            icon={<PlayCircle className="w-4 h-4 text-muted-foreground" />}
            title="Autopilot"
            desc="Lab and staging devices only: ARIA approves and confirms its own change plans, with the same safety nets. Production devices always need your approval."
          />
        </div>
      </div>

      {/* Environments */}
      <div>
        <SectionLabel>Production, staging and lab</SectionLabel>
        <div className="mt-4 p-4 rounded-xl border border-border bg-background/50">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every connection is <strong className="text-foreground">Production</strong> unless you mark it Staging or Lab in its connection settings.
            Settings → ARIA → Change Policy can keep production read-only or require a reason for changes outside a maintenance window.
            Every plan is kept in <strong className="text-foreground">Change History</strong>.
          </p>
        </div>
      </div>

      {/* Block patterns */}
      <div>
        <SectionLabel>Blocked Command Patterns</SectionLabel>
        <div className="mt-4 p-4 rounded-xl border border-border bg-background/50 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-danger shrink-0" />
            <p className="text-sm font-semibold text-foreground">Always-blocked safety list</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            In every mode, any command matching your block list is <strong className="text-foreground">automatically rejected</strong> — no approval prompt. Add patterns like <code className="px-1 py-0.5 rounded bg-muted text-2xs font-mono">rm -rf</code>, <code className="px-1 py-0.5 rounded bg-muted text-2xs font-mono">reload</code>, <code className="px-1 py-0.5 rounded bg-muted text-2xs font-mono">write erase</code> to protect critical operations.
          </p>
          <p className="text-xs text-muted-foreground">Configure in Settings → ARIA → Blocked Command Patterns</p>
        </div>
      </div>

      {/* Tips */}
      <div>
        <SectionLabel>Tips</SectionLabel>
        <div className="mt-4 space-y-2">
          {[
            { icon: '', text: 'Ask ARIA in plain language — "why is eth0 down?" or "show me running processes sorted by CPU"' },
            { icon: '', text: 'ARIA reads your terminal output automatically. You don\'t need to paste it — just ask.' },
            { icon: '', text: 'Mark lab and staging gear in the connection settings — Autopilot only works there.' },
            { icon: '', text: 'In Change mode, read the plan\'s rollback lines before approving — they are what runs if you click Roll back.' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3 px-3.5 py-2.5 rounded-lg bg-background/50 border border-border/40">
              <span className="text-base shrink-0 mt-0.5">{icon}</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Shortcuts ────────────────────────────────────────────────────────────────

function ShortcutsTab(): JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')
  const mod   = isMac ? '⌘' : 'Ctrl'
  const shift = '⇧'

  const sections = [
    {
      title: 'Sessions',
      items: [
        { keys: [`${mod}K`, `${mod}T`], label: 'Quick Connect / New Tab' },
        { keys: [`${mod}W`],            label: 'Close active tab' },
        { keys: [`${mod}D`],            label: 'Toggle split view' },
        { keys: [`${mod}1–9`],          label: 'Switch to tab 1–9' },
      ],
    },
    {
      title: 'Terminal',
      items: [
        { keys: [`${mod}F`],  label: 'Search in terminal' },
        { keys: [`${mod}+`],  label: 'Zoom in' },
        { keys: [`${mod}−`],  label: 'Zoom out' },
        { keys: [`${mod}0`],  label: 'Reset zoom' },
      ],
    },
    {
      title: 'AI (ARIA)',
      items: [
        { keys: [`${mod}${shift}A`], label: 'Toggle ARIA panel' },
      ],
    },
    {
      title: 'App',
      items: [
        { keys: [`${mod},`], label: 'Open Settings' },
        { keys: ['?'],       label: 'Open Help' },
        { keys: ['Esc'],     label: 'Close dialog / cancel' },
      ],
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <p className="text-xs text-muted-foreground">
        {isMac ? 'macOS' : 'Windows / Linux'} key bindings
      </p>
      {sections.map((section) => (
        <div key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <div className="mt-3 space-y-1">
            {section.items.map((sc) => (
              <div
                key={sc.label}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm text-foreground">{sc.label}</span>
                <div className="flex items-center gap-1.5">
                  {sc.keys.map((key, i) => (
                    <span key={key} className="flex items-center gap-1">
                      {i > 0 && <span className="text-xs text-subtle">or</span>}
                      <kbd className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-muted border border-border/80 text-foreground text-2xs font-mono font-medium leading-none shadow-[0_1px_0_0_hsl(var(--border))]">
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
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">{children}</p>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  )
}

function ModeCard({ icon, title, badge, badgeColor, desc }: {
  icon:        React.ReactNode
  title:       string
  badge?:      string
  badgeColor?: string
  desc:        string
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background/50">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {badge && (
            <span className={cn('text-2xs font-semibold px-2 py-0.5 rounded-full border', badgeColor)}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-subtle shrink-0 mt-0.5" />
    </div>
  )
}
