import { describe, expect, it } from 'vitest'
import { compareVersions, notesToShow, stripTitle, versionFromPath, type ReleaseNote } from './releaseNotes'

const NOTES: ReleaseNote[] = ['0.17.2', '0.18.0', '0.19.0', '0.19.1'].map((version) => ({ version, markdown: `## NetCopilot ${version}\n\nbody ${version}` }))
const versions = (n: ReleaseNote[]) => n.map((x) => x.version)

describe('compareVersions', () => {
  it('orders by major, minor, patch numerically', () => {
    expect(compareVersions('0.18.0', '0.17.9')).toBe(1)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1)
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0)
  })
})

describe('versionFromPath', () => {
  it('reads the version from a notes file name', () => {
    expect(versionFromPath('../../docs/releases/v0.19.0.md')).toBe('0.19.0')
    expect(versionFromPath('../../docs/releases/README.md')).toBeNull()
  })
})

describe('notesToShow', () => {
  it('shows nothing on a fresh install', () => {
    expect(notesToShow(NOTES, '0.19.0', null, false)).toEqual([])
  })

  it('shows the current notes to someone upgrading from before this feature', () => {
    expect(versions(notesToShow(NOTES, '0.19.0', null, true))).toEqual(['0.19.0'])
  })

  it('shows every version since the last one seen, newest first', () => {
    expect(versions(notesToShow(NOTES, '0.19.1', '0.18.0', true))).toEqual(['0.19.1', '0.19.0'])
  })

  it('shows nothing once the current version was seen, or after a downgrade', () => {
    expect(notesToShow(NOTES, '0.19.0', '0.19.0', true)).toEqual([])
    expect(notesToShow(NOTES, '0.18.0', '0.19.0', true)).toEqual([])
  })

  it('shows nothing when the new version has no notes', () => {
    expect(notesToShow(NOTES, '0.20.0', '0.19.1', true)).toEqual([])
  })
})

describe('stripTitle', () => {
  it('drops the leading version heading only', () => {
    expect(stripTitle('## NetCopilot 0.19.0\n\nNetCopilot now updates itself.')).toBe('NetCopilot now updates itself.')
    expect(stripTitle('### In-app updates\n- item')).toBe('### In-app updates\n- item')
  })
})
