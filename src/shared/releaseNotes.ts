// Picks which release notes to show after an update ("What's new").

export interface ReleaseNote {
  version:  string
  markdown: string
}

/** Compares x.y.z versions; a leading "v" and any pre-release suffix are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** Version from a notes file path such as ".../docs/releases/v0.19.0.md". */
export function versionFromPath(path: string): string | null {
  return path.match(/v(\d+\.\d+\.\d+)\.md$/)?.[1] ?? null
}

/**
 * Notes to show on this launch, newest first.
 *
 * - `lastSeen` is the version whose notes were last shown (null if never).
 * - With no `lastSeen`, a user with saved data upgraded from a version that
 *   predates this feature, so they get the current notes; a fresh install
 *   gets nothing — they haven't missed anything.
 */
export function notesToShow(
  notes:    ReleaseNote[],
  current:  string,
  lastSeen: string | null,
  hasData:  boolean,
): ReleaseNote[] {
  if (lastSeen === null) {
    if (!hasData) return []
    return notes.filter((n) => compareVersions(n.version, current) === 0)
  }
  if (compareVersions(lastSeen, current) >= 0) return []
  return notes
    .filter((n) => compareVersions(n.version, lastSeen) > 0 && compareVersions(n.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}

/** Drops the "## NetCopilot x.y.z" heading — the dialog shows the version itself. */
export function stripTitle(markdown: string): string {
  return markdown.replace(/^\s*#{1,2}\s*NetCopilot\s+v?\d+\.\d+\.\d+\s*\n+/, '')
}
