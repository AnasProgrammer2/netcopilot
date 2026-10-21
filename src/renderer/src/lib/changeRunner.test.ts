import { describe, expect, it } from 'vitest'
import { isAtPrompt } from './changeRunner'

describe('isAtPrompt', () => {
  it('recognises vendor prompts after the command ran', () => {
    expect(isAtPrompt('R1(config)#interface Gi0/1\r\nR1(config-if)#', 'interface Gi0/1')).toBe(true)
    expect(isAtPrompt('user@r1# commit confirmed 5\r\ncommit complete\r\n\r\n[edit]\r\nuser@r1# ', 'commit confirmed 5')).toBe(true)
    expect(isAtPrompt('[admin@MikroTik] > \r\n[Safe Mode taken]\r\n[admin@MikroTik] <SAFE>', '')).toBe(true)
    expect(isAtPrompt('<HUAWEI>', 'x')).toBe(true)
    expect(isAtPrompt('[~HUAWEI-GigabitEthernet0/0/1]', 'x')).toBe(true)
    expect(isAtPrompt('admin@host:~$ ', 'x')).toBe(true)
  })

  it('waits while the device is still working', () => {
    // Only the echo so far — the prompt it ends with belongs to the line typed.
    expect(isAtPrompt('user@r1# commit confirmed 5 comment "NetCopilot"', 'commit confirmed 5 comment "NetCopilot"')).toBe(false)
    expect(isAtPrompt('user@r1# commit confirmed 5\r\ncommit confirmed will be automatically rolled back in 5 minutes unless confirmed', 'commit confirmed 5')).toBe(false)
    expect(isAtPrompt('Building configuration...', 'write memory')).toBe(false)
    expect(isAtPrompt('', 'show version')).toBe(false)
  })
})
