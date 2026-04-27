import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Folder, File, ArrowLeft, RefreshCw, Upload, Download,
  FolderPlus, Trash2, Pencil, Home, ChevronRight, Loader2,
  AlertCircle, HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'
import { Session, SftpFileEntry } from '../../types'
import { useAppStore } from '../../store'
import { cn } from '../../lib/utils'

interface TransferItem {
  filePath: string
  transferred: number
  total: number
  direction: 'up' | 'down'
}

interface Props {
  session: Session
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function parsePath(p: string): string[] {
  return p.split('/').filter(Boolean)
}

export function SftpBrowser({ session }: Props): JSX.Element {
  const { setSessionStatus } = useAppStore()

  const [status, setStatus]       = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg]   = useState<string>('')
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries]     = useState<SftpFileEntry[]>([])
  const [loading, setLoading]     = useState(false)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [renaming, setRenaming]   = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [transfers, setTransfers] = useState<Map<string, TransferItem>>(new Map())
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName]   = useState('')

  const renameInputRef    = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  const sessionId         = session.id

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true)
    setSelected(new Set())
    const result = await window.api.sftp.list(sessionId, dirPath)
    setLoading(false)
    if (result.success && result.entries) {
      setEntries(result.entries)
      setCurrentPath(dirPath)
    } else {
      toast.error('Cannot open folder', { description: result.error })
    }
  }, [sessionId])

  // Connect on mount
  useEffect(() => {
    let cancelled = false

    const connect = async () => {
      const conn = session.connection
      let password: string | undefined
      let privateKey: string | undefined
      const passphrase: string | undefined = undefined

      // Resolve credentials — same keys as TerminalTab
      let username = conn.username
      if (!username) {
        username = (await window.api.credentials.get(`${conn.id}:username`)) ?? ''
      }

      if (conn.authType === 'password' || conn.authType === 'key+password') {
        password = (await window.api.credentials.get(`${conn.id}:password`)) ?? undefined
      }
      if (conn.authType === 'key' || conn.authType === 'key+password') {
        if (conn.sshKeyId) {
          privateKey = (await window.api.credentials.get(`${conn.sshKeyId}:privateKey`)) ?? undefined
        }
      }

      const result = await window.api.sftp.connect({
        sessionId,
        host: conn.host,
        port: conn.port,
        username,
        password,
        privateKey,
        passphrase,
      })

      if (cancelled) return

      if (!result.success) {
        setStatus('error')
        setErrorMsg(result.error ?? 'Connection failed')
        setSessionStatus(sessionId, 'error', result.error)
        return
      }

      setStatus('connected')
      setSessionStatus(sessionId, 'connected')

      // Navigate to home directory
      const homeResult = await window.api.sftp.home(sessionId)
      const startPath = homeResult.success && homeResult.path ? homeResult.path : '/'
      loadDirectory(startPath)
    }

    connect()

    // Subscribe to progress events
    const unsubProgress = window.api.sftp.onProgress((sid, filePath, transferred, total) => {
      if (sid !== sessionId) return
      setTransfers((prev) => {
        const next = new Map(prev)
        next.set(filePath, { filePath, transferred, total, direction: 'down' })
        if (transferred >= total) {
          setTimeout(() => {
            setTransfers((p) => { const m = new Map(p); m.delete(filePath); return m })
          }, 800)
        }
        return next
      })
    })

    const unsubClosed = window.api.sftp.onClosed((sid) => {
      if (sid !== sessionId) return
      setStatus('error')
      setErrorMsg('Connection closed')
      setSessionStatus(sessionId, 'disconnected')
    })

    return () => {
      cancelled = true
      unsubProgress()
      unsubClosed()
      window.api.sftp.disconnect(sessionId)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  // Focus new folder input
  useEffect(() => {
    if (creatingFolder) newFolderInputRef.current?.focus()
  }, [creatingFolder])

  const navigate = (entry: SftpFileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path)
    }
  }

  const goUp = () => {
    const parts = parsePath(currentPath)
    if (parts.length === 0) return
    const parent = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/')
    loadDirectory(parent)
  }

  const goHome = async () => {
    const result = await window.api.sftp.home(sessionId)
    loadDirectory(result.success && result.path ? result.path : '/')
  }

  const toggleSelect = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      if (e.shiftKey) {
        // range selection
        const paths = entries.map((en) => en.path)
        const lastIdx = paths.findIndex((p) => [...prev].at(-1) === p)
        const currIdx = paths.indexOf(path)
        if (lastIdx !== -1 && currIdx !== -1) {
          const [lo, hi] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx]
          for (let i = lo; i <= hi; i++) next.add(paths[i])
          return next
        }
      }
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleDownload = async () => {
    const paths = selected.size > 0
      ? [...selected].filter((p) => !entries.find((e) => e.path === p)?.isDirectory)
      : []
    if (!paths.length) {
      toast.error('Select files to download (folders not supported yet)')
      return
    }
    const result = await window.api.sftp.download(sessionId, paths)
    if (result.canceled) return
    if (result.success) toast.success(`Downloaded to ${result.localDir}`)
    else toast.error('Download failed', { description: result.error })
  }

  const handleUpload = async () => {
    const result = await window.api.sftp.upload(sessionId, currentPath)
    if (result.canceled) return
    if (result.success) {
      toast.success('Upload complete')
      loadDirectory(currentPath)
    } else {
      toast.error('Upload failed', { description: result.error })
    }
  }

  const handleDelete = async () => {
    if (!selected.size) return
    const names = [...selected].map((p) => entries.find((e) => e.path === p)?.name ?? p).join(', ')
    if (!confirm(`Delete ${names}?`)) return

    for (const path of selected) {
      const entry = entries.find((e) => e.path === path)
      if (!entry) continue
      const result = await window.api.sftp.delete(sessionId, path, entry.isDirectory)
      if (!result.success) {
        toast.error(`Cannot delete ${entry.name}`, { description: result.error })
        return
      }
    }
    toast.success(`Deleted ${selected.size} item${selected.size > 1 ? 's' : ''}`)
    loadDirectory(currentPath)
  }

  const startRename = (entry: SftpFileEntry) => {
    setRenaming(entry.path)
    setRenameValue(entry.name)
  }

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return }
    const entry = entries.find((e) => e.path === renaming)
    if (!entry || renameValue === entry.name) { setRenaming(null); return }
    const dir = currentPath === '/' ? '' : currentPath
    const newPath = `${dir}/${renameValue.trim()}`
    const result = await window.api.sftp.rename(sessionId, renaming, newPath)
    setRenaming(null)
    if (result.success) loadDirectory(currentPath)
    else toast.error('Rename failed', { description: result.error })
  }

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) { setCreatingFolder(false); return }
    const dir = currentPath === '/' ? '' : currentPath
    const newPath = `${dir}/${newFolderName.trim()}`
    const result = await window.api.sftp.mkdir(sessionId, newPath)
    setCreatingFolder(false)
    setNewFolderName('')
    if (result.success) loadDirectory(currentPath)
    else toast.error('Cannot create folder', { description: result.error })
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const breadcrumbs = [{ label: '/', path: '/' }, ...parsePath(currentPath).map((seg, i, arr) => ({
    label: seg,
    path: '/' + arr.slice(0, i + 1).join('/'),
  }))]

  // ── Render states ────────────────────────────────────────────────────────────

  if (status === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm">Connecting SFTP to {session.connection.host}…</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <span className="text-sm font-medium text-foreground">Connection failed</span>
        <span className="text-xs text-center max-w-xs">{errorMsg}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden select-none">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0 bg-sidebar">
        {/* Navigation */}
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          title="Go up"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={goHome}
          title="Home directory"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => loadDirectory(currentPath)}
          title="Refresh"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 flex-1 mx-2 overflow-x-auto scrollbar-none">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
              <button
                onClick={() => loadDirectory(crumb.path)}
                className={cn(
                  'text-xs px-1 py-0.5 rounded transition-colors',
                  i === breadcrumbs.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                {i === 0 ? <HardDrive className="w-3 h-3" /> : crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleUpload}
            title="Upload files"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={selected.size === 0}
            title="Download selected"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={() => setCreatingFolder(true)}
            title="New folder"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New folder</span>
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleDelete}
              title="Delete selected"
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Column Headers ── */}
      <div className="grid grid-cols-[auto_1fr_100px_120px_80px] gap-0 px-4 py-1.5 border-b border-border/50 bg-sidebar/50 shrink-0">
        <div className="w-5" />
        <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Name</span>
        <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-right">Size</span>
        <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-right">Modified</span>
        <div />
      </div>

      {/* ── File List ── */}
      <div
        className="flex-1 overflow-y-auto"
        onClick={() => setSelected(new Set())}
      >
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Folder className="w-8 h-8 opacity-30" />
            <span className="text-sm">Empty folder</span>
          </div>
        )}

        {/* New folder input row */}
        {creatingFolder && (
          <div className="grid grid-cols-[auto_1fr_100px_120px_80px] gap-0 px-4 py-1 items-center border-b border-border/30 bg-primary/5">
            <Folder className="w-4 h-4 text-amber-400 mr-3" />
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewFolder()
                if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') }
              }}
              onBlur={handleNewFolder}
              placeholder="New folder name"
              className="bg-transparent border-b border-primary text-sm text-foreground outline-none w-full"
            />
          </div>
        )}

        {!loading && entries.map((entry) => {
          const isSelected = selected.has(entry.path)
          const isRenaming = renaming === entry.path
          const transfer   = [...transfers.values()].find((t) => t.filePath.includes(entry.name))

          return (
            <div
              key={entry.path}
              onClick={(e) => toggleSelect(entry.path, e)}
              onDoubleClick={() => navigate(entry)}
              className={cn(
                'grid grid-cols-[auto_1fr_100px_120px_80px] gap-0 px-4 py-1.5 items-center cursor-pointer group border-b border-transparent hover:bg-accent/50 transition-colors',
                isSelected && 'bg-primary/10 border-primary/20 hover:bg-primary/15'
              )}
            >
              {/* Icon */}
              {entry.isDirectory
                ? <Folder className="w-4 h-4 text-amber-400 mr-3 shrink-0" />
                : <File   className="w-4 h-4 text-muted-foreground/60 mr-3 shrink-0" />
              }

              {/* Name */}
              <div className="min-w-0 flex items-center gap-2">
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-background border border-primary rounded px-1 py-0.5 text-sm text-foreground outline-none w-full"
                  />
                ) : (
                  <span className="text-sm truncate">{entry.name}</span>
                )}

                {/* Transfer progress */}
                {transfer && (
                  <span className="text-[10px] text-primary shrink-0">
                    {Math.round((transfer.transferred / transfer.total) * 100)}%
                  </span>
                )}
              </div>

              {/* Size */}
              <span className="text-xs text-muted-foreground text-right tabular-nums">
                {entry.isDirectory ? '—' : formatSize(entry.size)}
              </span>

              {/* Date */}
              <span className="text-xs text-muted-foreground text-right tabular-nums">
                {formatDate(entry.modifyTime)}
              </span>

              {/* Rename button */}
              <div className="flex justify-end pr-1">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(entry) }}
                  title="Rename"
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-border bg-sidebar shrink-0">
        <span className="text-[11px] text-muted-foreground">
          {entries.length} item{entries.length !== 1 ? 's' : ''}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        {transfers.size > 0 && (
          <span className="text-[11px] text-primary ml-auto flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {transfers.size} transfer{transfers.size > 1 ? 's' : ''} in progress
          </span>
        )}
      </div>
    </div>
  )
}
