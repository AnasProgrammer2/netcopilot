import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Eye, Copy, Check, Sparkles } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '../../lib/utils'
import { AiMessage as AiMessageType, AiToolCall } from '../../store'
import { AiCommandBlock } from './AiCommandBlock'
import { AiPlanBlock } from './AiPlanBlock'

interface Props {
  message:          AiMessageType
  approval:         'ask' | 'auto' | 'blacklist'
  blacklist:        string[]
  onApproveCommand: (msgId: string, callId: string) => void
  onBlockCommand:   (msgId: string, callId: string) => void
}

/** Returns 'rtl' if the text starts with Arabic/Hebrew chars, else 'ltr' */
function detectDir(text: string): 'rtl' | 'ltr' {
  const rtlPattern = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF]/
  const firstWord  = text.trimStart().slice(0, 60)
  return rtlPattern.test(firstWord) ? 'rtl' : 'ltr'
}

export function AiMessage({ message, approval, blacklist, onApproveCommand, onBlockCommand }: Props): JSX.Element {
  const isUser      = message.role === 'user'
  const isProactive = message.role === 'auto'
  const isPlan      = message.role === 'plan'
  const dir         = detectDir(message.content)
  const isRtl       = dir === 'rtl'

  // Plan messages render as a standalone card (no avatar bubble)
  if (isPlan && message.plan) {
    return (
      <div className="px-3 py-1">
        <AiPlanBlock plan={message.plan} msgId={message.id} />
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2.5 px-3 py-2 group', (isUser || isRtl) && !isProactive ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      <div className={cn(
        'w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-1',
        isUser      ? 'bg-primary/20 text-primary'
        : isProactive ? 'bg-muted text-muted-foreground'
        :               'bg-primary/15 text-primary'
      )}>
        {isUser ? <User className="w-3 h-3" />
          : isProactive ? <Eye className="w-3 h-3" />
          : <Sparkles className="w-3 h-3" />}
      </div>

      {/* Bubble */}
      <div
        dir={dir}
        className={cn(
          'flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm leading-relaxed relative',
          isUser
            ? 'bg-primary/15 text-foreground ml-10'
            : isProactive
              ? 'bg-muted/30 text-muted-foreground text-xs italic'
              : 'bg-card/60 text-foreground'
        )}
      >
        {isProactive && (
          <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider block mb-1">
            Auto Watch
          </span>
        )}

        {/* Markdown content */}
        {message.content && (
          <div className="prose-ai">
            {isUser || isProactive ? (
              <span className="whitespace-pre-wrap break-words">
                {message.content}
              </span>
            ) : (
              <MarkdownContent content={message.content} />
            )}
            {message.streaming && (
              <span className="inline-block w-0.5 h-3.5 bg-primary ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Tool calls — always ltr */}
        {(message.toolCalls ?? []).length > 0 && (
          <div dir="ltr">
            {(message.toolCalls ?? []).map((call: AiToolCall) => (
              <AiCommandBlock
                key={call.id}
                msgId={message.id}
                call={call}
                approval={approval}
                blacklist={blacklist}
                onApprove={(callId) => onApproveCommand(message.id, callId)}
                onBlock={(callId)   => onBlockCommand(message.id, callId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Code blocks ────────────────────────────────────────────────────
        code({ inline, className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
          const code = String(children).replace(/\n$/, '')
          if (inline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-muted border border-border/60 font-mono text-[12px] text-primary/90"
                {...props}
              >
                {code}
              </code>
            )
          }
          return <CodeBlock code={code} className={className} />
        },

        // ── Paragraphs ─────────────────────────────────────────────────────
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        },

        // ── Headings ───────────────────────────────────────────────────────
        h1({ children }) { return <h1 className="text-base font-bold mt-3 mb-1.5 text-foreground">{children}</h1> },
        h2({ children }) { return <h2 className="text-sm font-bold mt-3 mb-1 text-foreground">{children}</h2> },
        h3({ children }) { return <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground/90">{children}</h3> },

        // ── Lists ──────────────────────────────────────────────────────────
        ul({ children }) {
          return <ul className="mb-2 pl-4 space-y-0.5 list-disc marker:text-muted-foreground/60">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-2 pl-4 space-y-0.5 list-decimal marker:text-muted-foreground/60">{children}</ol>
        },
        li({ children }) {
          return <li className="text-sm leading-relaxed">{children}</li>
        },

        // ── Blockquote ─────────────────────────────────────────────────────
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic text-xs">
              {children}
            </blockquote>
          )
        },

        // ── Table ──────────────────────────────────────────────────────────
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          )
        },
        thead({ children }) { return <thead className="bg-muted/40">{children}</thead> },
        th({ children })   {
          return <th className="px-3 py-1.5 text-left font-semibold text-foreground/80 border-b border-border/60">{children}</th>
        },
        td({ children })   {
          return <td className="px-3 py-1.5 border-b border-border/30 text-muted-foreground">{children}</td>
        },

        // ── Horizontal rule ────────────────────────────────────────────────
        hr() { return <hr className="my-3 border-border/40" /> },

        // ── Strong / Em ────────────────────────────────────────────────────
        strong({ children }) { return <strong className="font-semibold text-foreground">{children}</strong> },
        em({ children })     { return <em className="italic text-foreground/80">{children}</em> },

        // ── Links ──────────────────────────────────────────────────────────
        a({ children, href }) {
          const isSafe = href && /^https?:\/\/|^mailto:/i.test(href)
          return (
            <a
              href={isSafe ? href : undefined}
              onClick={(e) => { e.preventDefault(); if (isSafe) window.open(href) }}
              className="text-primary hover:underline cursor-pointer"
            >
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ── Code block with copy button ───────────────────────────────────────────────

// Map common aliases to Prism language identifiers
const LANG_MAP: Record<string, string> = {
  'ios': 'cisco_ios', 'cisco': 'cisco_ios', 'cisco-ios': 'cisco_ios',
  'nxos': 'cisco_ios', 'iosxe': 'cisco_ios',
  'sh': 'bash', 'shell': 'bash', 'zsh': 'bash',
  'py': 'python', 'js': 'javascript', 'ts': 'typescript',
  'yml': 'yaml', 'conf': 'nginx', 'cfg': 'nginx',
  'txt': 'none',
}

function useIsLightMode(): boolean {
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'))
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setLight(document.documentElement.classList.contains('light'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return light
}

function CodeBlock({ code, className }: { code: string; className?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const isLight = useIsLightMode()

  const rawLang = className?.replace('language-', '') ?? ''
  const language = LANG_MAP[rawLang] ?? rawLang
  const hasHighlight = language && language !== 'none' && language !== ''

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-2 rounded-lg border border-border/60 overflow-hidden bg-muted/80 dark:bg-muted/50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border/60">
        <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-wider">
          {rawLang || 'code'}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
            : <><Copy className="w-3 h-3" />Copy</>
          }
        </button>
      </div>
      {/* Code content */}
      {hasHighlight ? (
        <SyntaxHighlighter
          language={language}
          style={isLight ? oneLight : vscDarkPlus}
          customStyle={{
            margin: 0, padding: '10px 12px',
            fontSize: '12px', lineHeight: '1.6',
            background: 'transparent',
            overflowX: 'auto',
          }}
          codeTagProps={{ style: { fontFamily: 'inherit' } }}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre className="px-3 py-2.5 overflow-x-auto text-[12px] leading-relaxed font-mono text-foreground whitespace-pre">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
