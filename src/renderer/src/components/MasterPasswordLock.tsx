import { useState, useRef, useEffect } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'
import appIcon from '../assets/icon.png'
import { cn } from '../lib/utils'

interface Props {
  onUnlocked: () => void
  variant?: 'startup' | 'idle'
}

export function MasterPasswordLock({ onUnlocked, variant = 'startup' }: Props): JSX.Element {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [shaking, setShaking] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')
    const ok = await window.api.auth.verifyMasterPassword(password)
    setLoading(false)
    if (ok) {
      onUnlocked()
    } else {
      setPassword('')
      setError('Incorrect password')
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      inputRef.current?.focus()
    }
  }

  const isIdle = variant === 'idle'

  return (
    <div className={cn(
      'fixed inset-0 flex items-center justify-center',
      isIdle ? 'z-[200] bg-black/85 backdrop-blur-md' : 'z-[999] bg-background'
    )}>
      <div className={`flex flex-col items-center gap-6 w-80 ${shaking ? 'animate-shake' : ''}`}>
        {!isIdle && (
          <img src={appIcon} alt="NetCopilot" className="w-20 h-20" style={{ filter: 'drop-shadow(0 0 16px hsl(258 90% 66% / 0.4))' }} />
        )}

        <div className="text-center">
          {!isIdle && <h1 className="text-xl font-semibold text-foreground">NetCopilot</h1>}
          {isIdle && (
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mx-auto mb-4">
              <Lock className="w-8 h-8 text-white/70" />
            </div>
          )}
          <p className={cn(
            'text-sm mt-1 flex items-center justify-center gap-1.5',
            isIdle ? 'text-white/70 font-semibold text-lg' : 'text-muted-foreground'
          )}>
            {!isIdle && <Lock className="w-3.5 h-3.5" />}
            {isIdle ? 'Session Locked' : 'Enter your master password'}
          </p>
          {isIdle && (
            <p className="text-sm text-white/40 mt-1.5">Enter your master password to continue</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Master password"
              className={cn(
                'w-full px-4 py-3 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary',
                isIdle
                  ? 'bg-white/10 border-white/20 text-white placeholder:text-white/40'
                  : 'bg-card border-border text-foreground placeholder:text-muted-foreground'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2',
                isIdle ? 'text-white/50 hover:text-white/80' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className={cn('text-xs text-center', isIdle ? 'text-red-300' : 'text-destructive')}>{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? 'Verifying…' : 'Unlock'}
          </button>
        </form>
      </div>

    </div>
  )
}
