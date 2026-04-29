import { useState, useEffect } from 'react'
import { FileCode, Check, ChevronDown, ChevronRight, Server, AlertCircle, FolderOpen, Loader2 } from 'lucide-react'
import { parseSshConfig, SshConfigHost } from '../../lib/sshConfigParser'
import { cn } from '../../lib/utils'

interface Props {
  onImport: (hosts: SshConfigHost[]) => Promise<void>
  onCancel: () => void
}

export function SshConfigImportDialog({ onImport, onCancel }: Props): JSX.Element {
  const [hosts, setHosts]           = useState<SshConfigHost[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [importing, setImporting]   = useState(false)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())

  const loadDefault = async () => {
    setLoading(true); setError('')
    try {
      const content = await window.api.file.readSshConfig(false)
      if (!content) { setError('~/.ssh/config not found'); setLoading(false); return }
      const parsed = parseSshConfig(content)
      if (parsed.length === 0) { setError('No hosts found in config'); setLoading(false); return }
      setHosts(parsed)
      setSelected(new Set(parsed.map((h) => h.name)))
    } catch {
      setError('Failed to read ~/.ssh/config')
    }
    setLoading(false)
  }

  const loadCustom = async () => {
    setLoading(true); setError('')
    try {
      const content = await window.api.file.readSshConfig(true)
      if (!content) { setLoading(false); return }
      const parsed = parseSshConfig(content)
      if (parsed.length === 0) { setError('No hosts found in selected file'); setLoading(false); return }
      setHosts(parsed)
      setSelected(new Set(parsed.map((h) => h.name)))
    } catch {
      setError('Failed to read selected file')
    }
    setLoading(false)
  }

  useEffect(() => { loadDefault() }, [])

  const toggleHost = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(selected.size === hosts.length ? new Set() : new Set(hosts.map((h) => h.name)))
  }

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handleImport = async () => {
    setImporting(true)
    await onImport(hosts.filter((h) => selected.has(h.name)))
    setImporting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}>
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileCode className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Import from SSH Config</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reading <code className="bg-secondary px-1 rounded text-[10px]">~/.ssh/config</code>
            </p>
          </div>
          <button
            onClick={loadCustom}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Browse
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Reading SSH config…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={loadCustom}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Browse for file
              </button>
            </div>
          )}

          {!loading && !error && hosts.length > 0 && (
            <div className="py-2">
              {/* Select all row */}
              <button
                onClick={toggleAll}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors text-left"
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                  selected.size === hosts.length ? 'bg-primary border-primary' : 'border-border'
                )}>
                  {selected.size === hosts.length && <Check className="w-3 h-3 text-white" />}
                  {selected.size > 0 && selected.size < hosts.length && (
                    <div className="w-2 h-0.5 bg-primary" />
                  )}
                </div>
                <span className="text-sm font-medium text-foreground">
                  Select all
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{selected.size} / {hosts.length}</span>
              </button>

              <div className="h-px bg-border mx-4 my-1" />

              {/* Host rows */}
              {hosts.map((host) => {
                const isSelected = selected.has(host.name)
                const isExpanded = expanded.has(host.name)
                const hasExtras  = Object.keys(host.extra).length > 0 || !!host.identityFile

                return (
                  <div key={host.name}>
                    <div className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 transition-colors">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleHost(host.name)}
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary border-primary' : 'border-border'
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>

                      {/* Icon */}
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Server className="w-3.5 h-3.5 text-primary" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{host.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {host.username ? `${host.username}@` : ''}{host.hostname}:{host.port}
                        </p>
                      </div>

                      {/* Expand button */}
                      {hasExtras && (
                        <button
                          onClick={() => toggleExpand(host.name)}
                          className="p-1 rounded hover:bg-accent text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />
                          }
                        </button>
                      )}
                    </div>

                    {/* Expanded extra fields */}
                    {isExpanded && (
                      <div className="mx-4 mb-1 px-3 py-2 bg-secondary/50 rounded-lg text-[11px] font-mono text-muted-foreground space-y-0.5">
                        {host.identityFile && (
                          <p><span className="text-foreground/60">IdentityFile</span> {host.identityFile}</p>
                        )}
                        {Object.entries(host.extra).map(([k, v]) => (
                          <p key={k}><span className="text-foreground/60">{k}</span> {v}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
            <p className="text-xs text-muted-foreground">
              {selected.size} host{selected.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onCancel} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selected.size === 0 || importing}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Import {selected.size > 0 ? selected.size : ''} host{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
