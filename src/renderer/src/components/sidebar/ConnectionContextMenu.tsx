import { useEffect, useRef, useState } from 'react'
import { Play, Pencil, Trash2, Copy, FolderOpen, Wifi } from 'lucide-react'

interface Props {
  position: { x: number; y: number }
  onClose: () => void
  onConnect: () => void
  onOpenSftp: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  host: string
  port: number
}

export function ConnectionContextMenu({ position, onClose, onConnect, onOpenSftp, onEdit, onDelete, onDuplicate, host, port }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pingState, setPingState] = useState<'idle' | 'checking' | { alive: boolean; latency?: number }>('idle')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  const style = {
    top: Math.min(position.y, window.innerHeight - 220),
    left: Math.min(position.x, window.innerWidth - 180)
  }

  const handlePing = async () => {
    setPingState('checking')
    const result = await window.api.connection.ping(host, port)
    setPingState(result)
  }

  const Item = ({ icon: Icon, label, onClick, danger = false, suffix, keepOpen = false }: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick: () => void
    danger?: boolean
    suffix?: React.ReactNode
    keepOpen?: boolean
  }) => (
    <button
      onClick={() => { onClick(); if (!keepOpen) onClose() }}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors cursor-pointer ${danger ? 'text-destructive hover:text-destructive' : 'text-foreground'}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {suffix}
    </button>
  )

  const pingBadge = () => {
    if (pingState === 'idle')     return null
    if (pingState === 'checking') return <span className="text-[10px] text-muted-foreground animate-pulse">...</span>
    if (!pingState.alive)         return <span className="text-[10px] text-red-400 font-semibold">Timeout</span>
    return <span className="text-[10px] text-emerald-400 font-semibold">{pingState.latency}ms</span>
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[168px] bg-popover border border-border rounded-lg shadow-xl py-1 overflow-hidden"
      style={style}
    >
      <Item icon={Play} label="Connect" onClick={onConnect} />
      <Item icon={FolderOpen} label="Open SFTP Browser" onClick={onOpenSftp} />
      <Item icon={Copy} label="Duplicate" onClick={onDuplicate} />
      <Item
        icon={Wifi}
        label="Ping"
        onClick={handlePing}
        suffix={pingBadge()}
        keepOpen
      />
      <div className="my-1 border-t border-border" />
      <Item icon={Pencil} label="Edit" onClick={onEdit} />
      <Item icon={Trash2} label="Delete" onClick={onDelete} danger />
    </div>
  )
}
