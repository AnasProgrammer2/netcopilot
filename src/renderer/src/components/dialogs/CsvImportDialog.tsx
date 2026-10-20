import { useState, useEffect } from 'react'
import { FileSpreadsheet, Check, Server, AlertCircle, AlertTriangle, FolderOpen, Loader2, KeyRound } from 'lucide-react'
import { useAppStore } from '../../store'
import { parseHostCsv, hostKey, CsvHost, CsvParseResult } from '../../../../shared/hostCsvParser'
import { cn } from '../../lib/utils'
import { Connection } from '../../types'

// Same palette as GroupDialog — new groups cycle through it
const GROUP_COLORS = [
  '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#84cc16',
  '#f97316', '#64748b'
]

/**
 * Flags rows that match an existing connection (host + port + user) or an
 * earlier row in the same file. Value is the label shown in the preview.
 */
function findDuplicates(hosts: CsvHost[], connections: Connection[]): Map<number, string> {
  const existing = new Set(connections.map((c) => hostKey(c.host, c.port, c.username)))
  const seen = new Set<string>()
  const dupes = new Map<number, string>()
  for (const h of hosts) {
    const key = hostKey(h.host, h.port, h.username)
    if (existing.has(key))  dupes.set(h.row, 'already exists')
    else if (seen.has(key)) dupes.set(h.row, 'duplicate row')
    seen.add(key)
  }
  return dupes
}

interface Props {
  /** Called after a successful import with a summary for the sidebar */
  onDone: (message: string) => void
  onCancel: () => void
}

export function CsvImportDialog({ onDone, onCancel }: Props): JSX.Element {
  const { connections, groups, saveConnection, saveGroup } = useAppStore()
  const [fileName, setFileName]     = useState('')
  const [result, setResult]         = useState<CsvParseResult | null>(null)
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  // Computed once per parsed file so rows don't flip to "already exists" mid-import
  const [duplicates, setDuplicates] = useState<Map<number, string>>(new Map())
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [importing, setImporting]   = useState(false)
  const [importPasswords, setImportPasswords] = useState(true)
  const [canSavePasswords, setCanSavePasswords] = useState(true)
  const [showWarnings, setShowWarnings] = useState(false)

  // Respect the global "save passwords" setting, like ConnectionDialog does
  useEffect(() => {
    window.api.store.getSetting('savePasswords')
      .then((v) => setCanSavePasswords(v !== false))
      .catch(() => {})
  }, [])

  const hosts = result?.hosts ?? []

  const chooseFile = async () => {
    setLoading(true); setError('')
    try {
      const file = await window.api.file.readCsv()
      if (!file) { setLoading(false); return }
      if ('error' in file) { setError(file.error); setResult(null); setLoading(false); return }
      const parsed = parseHostCsv(file.content)
      setFileName(file.fileName)
      if (parsed.error) { setError(parsed.error); setResult(null); setLoading(false); return }
      if (parsed.hosts.length === 0) {
        setError(parsed.warnings[0] ?? 'No hosts found in the selected file')
        setResult(null); setLoading(false); return
      }
      // Pre-select everything that isn't a duplicate
      const dupes = findDuplicates(parsed.hosts, connections)
      setDuplicates(dupes)
      setSelected(new Set(parsed.hosts.filter((h) => !dupes.has(h.row)).map((h) => h.row)))
      setResult(parsed)
      setShowWarnings(false)
    } catch {
      setError('Failed to read the selected file')
      setResult(null)
    }
    setLoading(false)
  }

  const toggleHost = (row: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(row) ? next.delete(row) : next.add(row)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(selected.size === hosts.length ? new Set() : new Set(hosts.map((h) => h.row)))
  }

  const selectedHosts = hosts.filter((h) => selected.has(h.row))
  const passwordCount = hosts.filter((h) => h.password !== undefined).length
  const storePasswords = importPasswords && canSavePasswords

  const handleImport = async () => {
    setImporting(true)
    let count = 0
    let pwFailed = 0
    let failed = false
    try {
      // Reuse existing groups by name (case-insensitive), create the rest
      const groupIds = new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.id]))
      let colorIdx = groups.length

      for (const h of selectedHosts) {
        let groupId: string | undefined
        if (h.group) {
          const key = h.group.toLowerCase()
          groupId = groupIds.get(key)
          if (!groupId) {
            const g = await saveGroup({ name: h.group, color: GROUP_COLORS[colorIdx++ % GROUP_COLORS.length] })
            groupId = g.id
            groupIds.set(key, groupId)
          }
        }

        const conn = await saveConnection({
          name:       h.name,
          host:       h.host,
          port:       h.port,
          protocol:   h.protocol,
          username:   h.username,
          authType:   'password',
          deviceType: 'generic',
          groupId,
          tags:       h.tags,
          notes:      '',
        })
        count++

        // Passwords go to the encrypted credential store — never into settings
        if (storePasswords && h.password) {
          try {
            const res = await window.api.credentials.save(`${conn.id}:password`, h.password)
            if (!res?.success) pwFailed++
          } catch {
            pwFailed++
          }
        }
      }
    } catch {
      // Stop here — report what was imported before the failure
      failed = true
    }
    setImporting(false)

    if (failed && count === 0) { onDone('Import failed — no hosts were imported'); return }
    let msg = `Imported ${count} host${count !== 1 ? 's' : ''} from CSV`
    if (failed) msg += ' (stopped early after an error)'
    if (pwFailed > 0) msg += ` (${pwFailed} password${pwFailed !== 1 ? 's' : ''} could not be saved)`
    onDone(msg)
  }

  const hasPreview = !loading && !error && hosts.length > 0
  const warnings = result?.warnings ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={importing ? undefined : onCancel}>
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Import from Termius / CSV</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {fileName
                ? <>Reading <code className="bg-secondary px-1 rounded text-[10px]">{fileName}</code></>
                : 'Hosts from a CSV file'}
            </p>
          </div>
          {(hasPreview || error) && (
            <button
              onClick={chooseFile}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Browse
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Reading CSV…</span>
            </div>
          )}

          {/* Intro / error — pick a file */}
          {!loading && !hasPreview && (
            <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
              {error
                ? <AlertCircle className="w-8 h-8 text-amber-400" />
                : <FileSpreadsheet className="w-8 h-8 text-muted-foreground/40" />}
              {error && <p className="text-sm text-muted-foreground">{error}</p>}
              <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-sm">
                From Termius: export your hosts to CSV (e.g. with a Termius exporter tool) or use the
                Termius CSV import template. Columns: Groups, Label, Tags, Hostname/IP, Protocol, Port,
                Username, Password.
              </p>
              <button
                onClick={chooseFile}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Choose CSV file…
              </button>
            </div>
          )}

          {hasPreview && (
            <div className="py-2">
              {/* Password notice */}
              {passwordCount > 0 && (
                <div className="mx-4 mb-2 px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-2">
                  <div className="flex items-start gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-foreground/80 leading-relaxed">
                      This file contains {passwordCount} plaintext password{passwordCount !== 1 ? 's' : ''}.
                      Delete the CSV after importing.
                    </p>
                  </div>
                  <button
                    onClick={() => setImportPasswords((v) => !v)}
                    disabled={!canSavePasswords}
                    className="flex items-center gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      storePasswords ? 'bg-primary border-primary' : 'border-border'
                    )}>
                      {storePasswords && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-[12px] text-foreground">
                      Import saved passwords
                      <span className="text-muted-foreground">
                        {canSavePasswords
                          ? ' — stored encrypted, like other connection passwords'
                          : ' — disabled: password saving is off in Settings'}
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-secondary/50">
                  <button
                    onClick={() => setShowWarnings((v) => !v)}
                    className="w-full flex items-center gap-2 text-left cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-[11px] text-muted-foreground flex-1">
                      {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[11px] text-primary">{showWarnings ? 'Hide' : 'Show'}</span>
                  </button>
                  {showWarnings && (
                    <ul className="mt-1.5 max-h-32 overflow-y-auto text-[11px] font-mono text-muted-foreground space-y-0.5">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}

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
                {duplicates.size > 0 && (
                  <span className="text-[11px] text-muted-foreground/70">
                    {duplicates.size} duplicate{duplicates.size !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{selected.size} / {hosts.length}</span>
              </button>

              <div className="h-px bg-border mx-4 my-1" />

              {/* Host rows */}
              {hosts.map((host: CsvHost) => {
                const isSelected = selected.has(host.row)
                const dupe       = duplicates.get(host.row)

                return (
                  <div key={host.row} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 transition-colors">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleHost(host.row)}
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
                    <div className={cn('flex-1 min-w-0', dupe && 'opacity-60')}>
                      <p className="text-[13px] font-medium text-foreground truncate">{host.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {host.protocol === 'telnet' ? 'telnet://' : ''}
                        {host.username ? `${host.username}@` : ''}{host.host}:{host.port}
                      </p>
                    </div>

                    {/* Group / duplicate badges */}
                    <div className="flex flex-col items-end gap-0.5 shrink-0 max-w-[40%]">
                      {host.group && (
                        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded truncate max-w-full">
                          {host.group}
                        </span>
                      )}
                      {dupe && (
                        <span className="text-[10px] text-amber-500">{dupe}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {hasPreview && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
            <p className="text-xs text-muted-foreground">
              {selected.size} host{selected.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onCancel} disabled={importing} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50">
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

        {/* Footer when no file is loaded yet */}
        {!hasPreview && !loading && (
          <div className="flex justify-end px-5 py-3 border-t border-border shrink-0">
            <button onClick={onCancel} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
