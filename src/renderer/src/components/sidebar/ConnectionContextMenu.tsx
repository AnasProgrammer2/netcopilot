import { useEffect, useRef } from 'react'
import { Play, Pencil, Trash2, Copy, FolderOpen } from 'lucide-react'

interface Props {
  position: { x: number; y: number }
  onClose: () => void
  onConnect: () => void
  onOpenSftp: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}

export function ConnectionContextMenu({ position, onClose, onConnect, onOpenSftp, onEdit, onDelete, onDuplicate }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

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
    top: Math.min(position.y, window.innerHeight - 200),
    left: Math.min(position.x, window.innerWidth - 180)
  }

  const Item = ({ icon: Icon, label, onClick, danger = false }: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    onClick: () => void
    danger?: boolean
  }) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors ${danger ? 'text-destructive hover:text-destructive' : 'text-foreground'}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-lg shadow-xl py-1 overflow-hidden"
      style={style}
    >
      <Item icon={Play} label="Connect" onClick={onConnect} />
      <Item icon={FolderOpen} label="Open SFTP Browser" onClick={onOpenSftp} />
      <Item icon={Copy} label="Duplicate" onClick={onDuplicate} />
      <div className="my-1 border-t border-border" />
      <Item icon={Pencil} label="Edit" onClick={onEdit} />
      <Item icon={Trash2} label="Delete" onClick={onDelete} danger />
    </div>
  )
}
