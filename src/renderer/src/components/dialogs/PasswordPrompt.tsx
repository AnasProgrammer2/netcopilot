import { useState, useEffect, useRef } from 'react'
import { Lock, Eye, EyeOff, Save, User } from 'lucide-react'

interface Props {
  host: string
  username?: string
  onSubmit: (credentials: { username: string; password: string; save: boolean }) => void
  onCancel: () => void
}

export function PasswordPrompt({ host, username: initialUsername, onSubmit, onCancel }: Props): JSX.Element {
  const [username, setUsername] = useState(initialUsername || '')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [save, setSave] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const needsUsername = !initialUsername

  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [])

  const canSubmit = password && (needsUsername ? username : true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ username: username || initialUsername || '', password, save })
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0f14]/90 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Authentication Required</p>
            <p className="text-xs text-muted-foreground truncate">
              {needsUsername ? host : `${initialUsername}@${host}`}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Username — only if not already set */}
          {needsUsername && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={firstInputRef}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoComplete="username"
                  autoCapitalize="none"
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <div className="relative">
              <input
                ref={needsUsername ? undefined : firstInputRef}
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full px-3 py-2 pr-9 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember */}
          <label
            className="flex items-center gap-2 cursor-pointer group select-none"
            onClick={() => setSave(v => !v)}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
              save ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/50'
            }`}>
              {save && <Save className="w-2.5 h-2.5 text-white" />}
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-foreground">
              Remember credentials for this connection
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Connect
          </button>
        </div>
      </form>
    </div>
  )
}
