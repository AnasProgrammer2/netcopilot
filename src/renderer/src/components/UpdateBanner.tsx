import { ArrowUpCircle, Download, RotateCw, X } from 'lucide-react'
import { useAppStore } from '../store'
import { useUpdater } from '../lib/updater'
import { cn } from '../lib/utils'

/** Corner card for app updates: available → downloading → restart to finish. */
export function UpdateBanner(): JSX.Element | null {
  const { status, version, percent, canInstall, dismissed, download, install, openDownloadPage, dismiss } = useUpdater()
  const openSessions = useAppStore((s) => s.sessions.length)

  const visible = !!version && !dismissed && ['available', 'downloading', 'downloaded', 'error'].includes(status)
  if (!visible) return null

  let title: string
  let body: string
  let primary: { label: string; icon: typeof Download; run: () => void } | null = null
  let secondary = 'Later'

  if (status === 'downloading') {
    title = `Downloading v${version}`
    body = 'You can keep working — NetCopilot will tell you when it is ready.'
    secondary = 'Hide'
  } else if (status === 'downloaded') {
    title = `v${version} is ready`
    body = openSessions > 0
      ? `Restart to finish updating. Your ${openSessions} open session${openSessions === 1 ? '' : 's'} will be closed. If you choose Later, it installs when you quit.`
      : 'Restart to finish updating. If you choose Later, it installs when you quit.'
    primary = { label: 'Restart now', icon: RotateCw, run: () => void install() }
  } else if (status === 'error') {
    title = 'Update didn’t finish'
    body = 'You can download the installer instead.'
    primary = { label: 'Download installer', icon: Download, run: () => { openDownloadPage(); dismiss() } }
  } else if (canInstall) {
    title = 'Update available'
    body = `v${version} is ready to download.`
    primary = { label: 'Update', icon: ArrowUpCircle, run: () => void download() }
  } else {
    title = 'Update available'
    body = `v${version} is available. This build can’t update itself — download the installer.`
    primary = { label: 'Download', icon: Download, run: () => { openDownloadPage(); dismiss() } }
  }

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-5 right-5 z-[150] w-80 rounded-xl border border-primary/30',
        'bg-background/95 backdrop-blur-sm shadow-2xl shadow-black/40',
        'flex flex-col gap-3 p-4',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground leading-snug">{body}</p>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Close"
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {status === 'downloading' && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{percent}%</span>
        </div>
      )}

      <div className="flex gap-2">
        {primary && (
          <button
            onClick={primary.run}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <primary.icon className="w-3.5 h-3.5" />
            {primary.label}
          </button>
        )}
        <button
          onClick={dismiss}
          className="flex-1 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors cursor-pointer"
        >
          {secondary}
        </button>
      </div>
    </div>
  )
}
