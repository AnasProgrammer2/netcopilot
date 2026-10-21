import { useEffect } from 'react'
import { create } from 'zustand'
import { notesToShow, versionFromPath, type ReleaseNote } from '../../../shared/releaseNotes'

// "What's new": the release notes in docs/releases/ are bundled at build time
// (the renderer fetches nothing remote), and the first launch after an update
// shows the notes for every version since the one last seen.

const files = import.meta.glob<string>('../../../../docs/releases/v*.md', { query: '?raw', import: 'default', eager: true })

export const RELEASE_NOTES: ReleaseNote[] = Object.entries(files)
  .map(([path, markdown]) => ({ version: versionFromPath(path), markdown }))
  .filter((n): n is ReleaseNote => n.version !== null)

const LAST_SEEN_KEY = 'lastSeenVersion'

interface WhatsNewState {
  notes: ReleaseNote[]
  open:  (notes: ReleaseNote[]) => void
  close: () => void
}

export const useWhatsNew = create<WhatsNewState>((set) => ({
  notes: [],
  open:  (notes) => set({ notes }),
  close: () => set({ notes: [] }),
}))

/** Opens the notes for one version (Help menu, Settings → About). */
export function showNotesFor(version: string): boolean {
  const note = RELEASE_NOTES.find((n) => n.version === version)
  if (note) useWhatsNew.getState().open([note])
  return !!note
}

/** After unlock, show what changed since the last version the user saw — once. */
export function useWhatsNewOnUpdate(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      const current  = await window.api.appInfo.getVersion()
      const lastSeen = ((await window.api.store.getSetting(LAST_SEEN_KEY)) as string | undefined) ?? null
      const hasData  = lastSeen === null ? (await window.api.store.getConnections()).length > 0 : true
      if (cancelled) return
      const notes = notesToShow(RELEASE_NOTES, current, lastSeen, hasData)
      // Record it before showing, so a crash or a quick quit never repeats it.
      if (lastSeen !== current) await window.api.store.setSetting(LAST_SEEN_KEY, current)
      if (notes.length && !cancelled) useWhatsNew.getState().open(notes)
    })().catch(() => { /* non-critical */ })
    return () => { cancelled = true }
  }, [ready])
}
