import { useState } from 'react'
import { X, Plus, Trash2, Play, ChevronDown, ChevronRight, FolderPlus, Pencil, Code2, Search } from 'lucide-react'
import { useAppStore } from '../../store'
import { Snippet } from '../../types'
import { cn } from '../../lib/utils'
import { terminalRegistry } from '../../lib/terminalRegistry'
import { toast } from 'sonner'

export function SnippetPanel(): JSX.Element {
  const {
    snippets, snippetFolders, activeSessionId, sessions,
    saveSnippet, deleteSnippet,
    saveSnippetFolder, deleteSnippetFolder,
    setSnippetPanelOpen,
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', command: '', description: '', folderId: '' })
  const [addingFolder, setAddingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())

  const session = sessions.find(s => s.id === activeSessionId)
  const canSend = session?.status === 'connected'

  const q = search.toLowerCase()
  const filtered = snippets.filter(s =>
    !q || s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
  )

  const ungrouped = filtered.filter(s => !s.folderId || !snippetFolders.find(f => f.id === s.folderId))
  const getFolder = (id: string) => filtered.filter(s => s.folderId === id)

  const toggleFolder = (id: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const sendCommand = (command: string) => {
    if (!activeSessionId || !canSend) {
      toast.error('No active session')
      return
    }
    const handle = terminalRegistry.get(activeSessionId)
    if (handle) {
      handle.sendData(command + '\r')
      toast.success('Command sent')
    }
  }

  const startEdit = (s: Snippet) => {
    setEditingId(s.id)
    setForm({ name: s.name, command: s.command, description: s.description ?? '', folderId: s.folderId ?? '' })
    setAdding(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.command.trim()) return
    await saveSnippet({
      ...(editingId ? { id: editingId } : {}),
      name: form.name.trim(),
      command: form.command.trim(),
      description: form.description.trim() || undefined,
      folderId: form.folderId || undefined,
    })
    setAdding(false)
    setEditingId(null)
    setForm({ name: '', command: '', description: '', folderId: '' })
  }

  const handleSaveFolder = async () => {
    if (!folderName.trim()) return
    await saveSnippetFolder({ name: folderName.trim() })
    setAddingFolder(false)
    setFolderName('')
  }

  const renderSnippet = (s: Snippet) => (
    <div
      key={s.id}
      className="group flex items-start gap-2 px-3 py-2 rounded-xl hover:bg-accent/50 transition-colors"
    >
      <Code2 className="w-3.5 h-3.5 mt-1 shrink-0 text-primary/60" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground truncate">{s.name}</p>
        <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{s.command}</p>
        {s.description && (
          <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{s.description}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => sendCommand(s.command)}
          disabled={!canSend}
          className={cn(
            'p-1 rounded-lg transition-colors',
            canSend ? 'text-emerald-400 hover:bg-emerald-500/10 cursor-pointer' : 'text-muted-foreground/30 cursor-not-allowed'
          )}
          title="Send to terminal"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => startEdit(s)}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
          title="Edit"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => deleteSnippet(s.id)}
          className="p-1 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Code2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground flex-1">Snippets</span>
        <button
          onClick={() => { setAdding(true); setEditingId(null); setForm({ name: '', command: '', description: '', folderId: '' }) }}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="New snippet"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setAddingFolder(true)}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="New folder"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setSnippetPanelOpen(false)}
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search snippets..."
            className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-muted/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {/* Add/Edit form */}
        {adding && (
          <div className="mx-2 mb-2 p-3 border border-primary/30 bg-primary/5 rounded-xl space-y-2">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
              {editingId ? 'Edit Snippet' : 'New Snippet'}
            </p>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="w-full px-2.5 py-1.5 text-[12px] bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              autoFocus
            />
            <textarea
              value={form.command}
              onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
              placeholder="Command (e.g. show ip interface brief)"
              rows={3}
              className="w-full px-2.5 py-1.5 text-[12px] font-mono bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            />
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              className="w-full px-2.5 py-1.5 text-[12px] bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            {snippetFolders.length > 0 && (
              <select
                value={form.folderId}
                onChange={e => setForm(f => ({ ...f, folderId: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-[12px] bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">No folder</option>
                {snippetFolders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.command.trim()}
                className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
              >
                {editingId ? 'Save' : 'Add'}
              </button>
              <button
                onClick={() => { setAdding(false); setEditingId(null) }}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add folder form */}
        {addingFolder && (
          <div className="mx-2 mb-2 p-3 border border-border bg-muted/30 rounded-xl space-y-2">
            <input
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-2.5 py-1.5 text-[12px] bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveFolder() }}
            />
            <div className="flex gap-1.5">
              <button onClick={handleSaveFolder} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold hover:opacity-90 cursor-pointer">Create</button>
              <button onClick={() => setAddingFolder(false)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {snippets.length === 0 && !adding && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
            <Code2 className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">No snippets yet</p>
            <p className="text-xs text-muted-foreground/30">Save your frequently used commands for quick access</p>
            <button
              onClick={() => { setAdding(true); setEditingId(null) }}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add First Snippet
            </button>
          </div>
        )}

        {/* Folders */}
        {snippetFolders.map(folder => {
          const items = getFolder(folder.id)
          if (items.length === 0 && q) return null
          const isCollapsed = collapsedFolders.has(folder.id)
          return (
            <div key={folder.id} className="mb-1">
              <div className="flex items-center gap-1 px-2 py-1.5 group">
                <button onClick={() => toggleFolder(folder.id)} className="p-0.5 cursor-pointer">
                  {isCollapsed ? <ChevronRight className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
                </button>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex-1">{folder.name}</span>
                <span className="text-[10px] text-muted-foreground/40">{items.length}</span>
                <button
                  onClick={() => deleteSnippetFolder(folder.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
              {!isCollapsed && items.map(renderSnippet)}
            </div>
          )
        })}

        {/* Ungrouped */}
        {ungrouped.map(renderSnippet)}
      </div>

      {/* Footer hint */}
      {canSend && snippets.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/40 text-center">
            Click <Play className="w-2.5 h-2.5 inline" /> to send to {session?.connection.name}
          </p>
        </div>
      )}
    </div>
  )
}
