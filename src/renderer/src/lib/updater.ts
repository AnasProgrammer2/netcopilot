import { useEffect } from 'react'
import { create } from 'zustand'
import { getInstallerUrl } from './utils'

// One update state for the whole app: the corner banner and Settings → About
// read the same store, fed by the main-process updater events.

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdaterState {
  status:     UpdateStatus
  version:    string | null
  percent:    number
  /** False for builds that can't replace themselves (e.g. Windows portable). */
  canInstall: boolean
  error:      string | null
  /** Banner hidden by the user until the next state change. */
  dismissed:  boolean
  check:            () => Promise<void>
  download:         () => Promise<void>
  install:          () => Promise<void>
  openDownloadPage: () => void
  dismiss:          () => void
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  status:     'idle',
  version:    null,
  percent:    0,
  canInstall: true,
  error:      null,
  dismissed:  false,

  check: async () => {
    const before = get().status
    if (before === 'downloading' || before === 'downloaded') return
    set({ status: 'checking', error: null })
    try {
      const res = await window.api.updater.check()
      if (!res.success) {
        set({ status: 'error', error: res.error ?? 'Update check failed' })
      } else if (res.updateAvailable && res.updateInfo) {
        set((s) => ({
          version:    res.updateInfo!.version,
          canInstall: res.canInstall ?? true,
          // The download may already be running from the automatic check.
          status:     res.downloaded ? 'downloaded' : s.status === 'downloading' ? 'downloading' : 'available',
        }))
      } else {
        set({ status: 'up-to-date' })
      }
    } catch (err) {
      set({ status: 'error', error: String(err) })
    }
  },

  download: async () => {
    set({ status: 'downloading', percent: 0, error: null, dismissed: false })
    const res = await window.api.updater.download()
    if (!res.success) set({ status: 'error', error: res.error ?? 'Download failed' })
  },

  install: async () => {
    const res = await window.api.updater.install()
    if (!res.success) set({ status: 'error', error: res.error ?? 'Install failed', dismissed: false })
  },

  openDownloadPage: () => {
    const v = get().version
    if (v) window.api.updater.openRelease(getInstallerUrl(v))
  },

  dismiss: () => set({ dismissed: true }),
}))

/** Subscribe to main-process updater events. Mount once, in App. */
export function useUpdaterEvents(): void {
  useEffect(() => {
    const offAvailable = window.api.updater.onUpdateAvailable((info) => {
      useUpdater.setState((s) => ({
        version:    info.version,
        canInstall: info.canInstall,
        status:     s.status === 'downloading' || s.status === 'downloaded' ? s.status : 'available',
        dismissed:  false,
      }))
    })
    const offProgress = window.api.updater.onDownloadProgress((p) => {
      useUpdater.setState({ status: 'downloading', percent: Math.round(p.percent) })
    })
    const offDownloaded = window.api.updater.onUpdateDownloaded((info) => {
      useUpdater.setState({ status: 'downloaded', version: info.version, percent: 100, dismissed: false })
    })
    const offError = window.api.updater.onError((message) => {
      // A failed background check stays quiet; a failed download is shown.
      if (useUpdater.getState().status === 'downloading') {
        useUpdater.setState({ status: 'error', error: message, dismissed: false })
      }
    })
    return () => { offAvailable(); offProgress(); offDownloaded(); offError() }
  }, [])
}
