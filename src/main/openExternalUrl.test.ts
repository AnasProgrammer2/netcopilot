import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}))

import { shell } from 'electron'
import { openExternalUrl } from '../main/openExternalUrl'

describe('openExternalUrl', () => {
  it('opens http and https URLs', () => {
    expect(openExternalUrl('https://netcopilot.app')).toBe(true)
    expect(openExternalUrl('http://example.com')).toBe(true)
    expect(shell.openExternal).toHaveBeenCalledWith('https://netcopilot.app')
  })

  it('blocks javascript and file URLs', () => {
    expect(openExternalUrl('javascript:alert(1)')).toBe(false)
    expect(openExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(openExternalUrl('not a url')).toBe(false)
  })
})
