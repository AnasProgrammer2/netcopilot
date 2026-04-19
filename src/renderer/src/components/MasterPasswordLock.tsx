import { useState, useRef, useEffect } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'
import appIcon from '../assets/icon.png'

interface Props {
  onUnlocked: () => void
}

export function MasterPasswordLock({ onUnlocked }: Props): JSX.Element {
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

  return (
    <div className="fixed inset-0 z-[999] bg-background flex items-center justify-center">
      <div className={`flex flex-col items-center gap-6 w-80 ${shaking ? 'animate-shake' : ''}`}>
        {/* Logo */}
        <img src={appIcon} alt="NetCopilot" className="w-20 h-20" style={{ filter: 'drop-shadow(0 0 16px hsl(258 90% 66% / 0.4))' }} />

        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">NetCopilot</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Enter your master password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Master password"
              className="w-full px-4 py-3 pr-10 rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-destructive text-center">{error}</p>
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

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  )
}
