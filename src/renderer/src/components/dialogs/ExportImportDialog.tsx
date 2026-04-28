import { useState, useRef, useEffect } from 'react'
import { Lock, Eye, EyeOff, Download, Upload } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Props {
  mode: 'export' | 'import'
  hasEncryptedCredentials?: boolean
  onConfirm: (password: string | undefined) => void
  onCancel: () => void
}

export function ExportImportDialog({ mode, hasEncryptedCredentials, onConfirm, onCancel }: Props): JSX.Element {
  const [includeCredentials, setIncludeCredentials] = useState(mode === 'import' ? !!hasEncryptedCredentials : false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = () => {
    if (!includeCredentials) { onConfirm(undefined); return }
    if (!password) { setError('Enter a password.'); return }
    if (mode === 'export' && password !== confirm) { setError('Passwords do not match.'); return }
    onConfirm(password)
  }

  const Icon = mode === 'export' ? Download : Upload
  const isImport = mode === 'import'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {mode === 'export' ? 'Export Connections' : 'Import Connections'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === 'export'
                ? 'Optionally include encrypted credentials'
                : 'Provide the password if the file includes credentials'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Toggle */}
          {!isImport && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => { setIncludeCredentials(!includeCredentials); setError('') }}
                className={cn(
                  'w-9 h-5 rounded-full transition-colors relative',
                  includeCredentials ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  includeCredentials && 'translate-x-4'
                )} />
              </div>
              <span className="text-sm text-foreground/80">Include passwords (encrypted)</span>
            </label>
          )}

          {isImport && hasEncryptedCredentials && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              This file contains encrypted credentials. Enter the export password to restore them.
            </div>
          )}

          {/* Password fields */}
          {(includeCredentials || (isImport && hasEncryptedCredentials)) && (
            <div className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                  placeholder={isImport ? 'Export password' : 'Encryption password'}
                  className="w-full bg-secondary text-sm text-foreground rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {!isImport && (
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                  placeholder="Confirm password"
                  className="w-full bg-secondary text-sm text-foreground rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary transition"
                />
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors"
          >
            {mode === 'export' ? 'Export' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
