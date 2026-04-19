import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Key, Eye, EyeOff, Check } from 'lucide-react'
import { useAppStore } from '../../store'
import { SSHKey } from '../../types'
import { cn } from '../../lib/utils'
import { nanoid } from 'nanoid'

interface Props {
  onClose: () => void
}

export function SSHKeyDialog({ onClose }: Props): JSX.Element {
  const { sshKeys, loadSshKeys, saveSshKey, deleteSshKey } = useAppStore()
  const [view, setView] = useState<'list' | 'add'>('list')
  const [saving, setSaving] = useState(false)

  // Add-key form
  const [name, setName]           = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [showPrivate, setShowPrivate] = useState(false)

  useEffect(() => { loadSshKeys() }, [])

  const resetForm = () => { setName(''); setPublicKey(''); setPrivateKey(''); setView('list') }

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const id = nanoid()
      const key: SSHKey = {
        id,
        name: name.trim(),
        publicKey: publicKey.trim(),
        createdAt: Date.now()
      }
      await saveSshKey(key)
      if (privateKey.trim()) {
        await window.api.credentials.save(`${id}:privateKey`, privateKey.trim())
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key: SSHKey) => {
    if (!confirm(`Delete SSH key "${key.name}"?`)) return
    await deleteSshKey(key.id)
    await window.api.credentials.delete(`${key.id}:privateKey`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">SSH Keys</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {view === 'list' ? (
            <div className="p-4 space-y-2">
              {sshKeys.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <Key className="w-10 h-10 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No SSH keys stored yet</p>
                  <p className="text-xs text-muted-foreground/60">Add a key to use key-based authentication</p>
                </div>
              ) : (
                sshKeys.map((key) => (
                  <KeyRow key={key.id} sshKey={key} onDelete={() => handleDelete(key)} />
                ))
              )}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Key Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Work Laptop, Personal"
                  className={inputCls}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Public Key</label>
                <textarea
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="ssh-rsa AAAA... or ssh-ed25519 AAAA..."
                  rows={3}
                  className={cn(inputCls, 'resize-none font-mono text-xs')}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Private Key</label>
                  <button
                    onClick={() => setShowPrivate(v => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPrivate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPrivate ? 'Hide' : 'Show'}
                  </button>
                </div>
                <textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  rows={5}
                  className={cn(inputCls, 'resize-none font-mono text-xs', !showPrivate && privateKey && 'blur-[2px] focus:blur-0')}
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Stored encrypted using your OS secure storage
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          {view === 'list' ? (
            <>
              <span className="text-xs text-muted-foreground">
                {sshKeys.length} {sshKeys.length === 1 ? 'key' : 'keys'}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  Close
                </button>
                <button
                  onClick={() => setView('add')}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Key
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={resetForm} className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : (<><Check className="w-3.5 h-3.5" /> Save Key</>)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KeyRow({ sshKey, onDelete }: { sshKey: SSHKey; onDelete: () => void }) {
  const date = new Date(sshKey.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const fingerprint = sshKey.publicKey
    ? sshKey.publicKey.split(' ')[1]?.slice(0, 16) + '...'
    : '—'

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:border-border/80 transition-colors group">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Key className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{sshKey.name}</p>
        <p className="text-[11px] text-muted-foreground font-mono truncate">
          {sshKey.publicKey ? fingerprint : 'Private key only'}
        </p>
      </div>
      <p className="text-xs text-muted-foreground shrink-0">{date}</p>
      <button
        onClick={onDelete}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        title="Delete key"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors'
