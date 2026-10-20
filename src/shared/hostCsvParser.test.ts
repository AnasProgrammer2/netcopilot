import { describe, expect, it } from 'vitest'
import {
  CSV_MAX_BYTES,
  detectDelimiter,
  hostKey,
  mapHeaders,
  normaliseGroup,
  parseCsvRecords,
  parseHostCsv,
  splitTags,
} from './hostCsvParser'

const TERMIUS_HEADER = 'Groups,Label,Tags,Hostname/IP,Protocol,Port,Username,Password'

describe('parseCsvRecords', () => {
  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    const { records } = parseCsvRecords('a,"b,c","say ""hi""","line1\nline2"\n1,2,3,4\n')
    expect(records).toEqual([
      ['a', 'b,c', 'say "hi"', 'line1\nline2'],
      ['1', '2', '3', '4'],
    ])
  })

  it('handles CRLF line endings and a last line without newline', () => {
    expect(parseCsvRecords('a,b\r\nc,d').records).toEqual([['a', 'b'], ['c', 'd']])
  })

  it('keeps empty fields', () => {
    expect(parseCsvRecords(',x,\n').records).toEqual([['', 'x', '']])
  })

  it('stops at maxRecords and reports truncation', () => {
    const res = parseCsvRecords('h\n1\n2\n3\n', ',', 2)
    expect(res.records).toEqual([['h'], ['1']])
    expect(res.truncated).toBe(true)
  })

  it('reports an unterminated quote', () => {
    expect(parseCsvRecords('a,"b\n').unterminatedQuote).toBe(true)
  })
})

describe('detectDelimiter', () => {
  it('defaults to comma', () => {
    expect(detectDelimiter('Host,Port\n1;2;3;4')).toBe(',')
  })
  it('detects semicolon and tab headers', () => {
    expect(detectDelimiter('Host;Port;User\n')).toBe(';')
    expect(detectDelimiter('Host\tPort\tUser\n')).toBe('\t')
  })
  it('ignores delimiters inside quoted header cells', () => {
    expect(detectDelimiter('"a;b;c",Host\n')).toBe(',')
  })
})

describe('mapHeaders', () => {
  it('maps the Termius header', () => {
    expect(mapHeaders(TERMIUS_HEADER.split(','))).toEqual({
      group: 0, name: 1, tags: 2, host: 3, protocol: 4, port: 5, username: 6, password: 7,
    })
  })
  it('is case/space/punctuation-insensitive and ignores unknown columns', () => {
    expect(mapHeaders([' HOST NAME ', 'ip-address', 'Notes', 'User'])).toEqual({ host: 0, username: 3 })
  })
})

describe('helpers', () => {
  it('flattens nested group paths', () => {
    expect(normaliseGroup('Prod/Web')).toBe('Prod / Web')
    expect(normaliseGroup(' Prod > DC1 > Core ')).toBe('Prod / DC1 / Core')
    expect(normaliseGroup(' / ')).toBeUndefined()
  })
  it('splits and dedupes tags', () => {
    expect(splitTags('a, b;c | a,,')).toEqual(['a', 'b', 'c'])
  })
  it('builds a case-insensitive host key', () => {
    expect(hostKey(' Web.Example.com ', 22, 'root')).toBe(hostKey('web.example.com', 22, 'root'))
  })
})

describe('parseHostCsv', () => {
  it('parses the exact Termius template', () => {
    const csv = [
      TERMIUS_HEADER,
      'Production,web-1,"linux,web",10.0.0.1,ssh,2222,root,s3cret',
      ',db,,db.example.com,,,admin,',
    ].join('\n')
    const res = parseHostCsv(csv)
    expect(res.error).toBeUndefined()
    expect(res.warnings).toEqual([])
    expect(res.hasPasswords).toBe(true)
    expect(res.hosts).toEqual([
      {
        row: 2, name: 'web-1', host: '10.0.0.1', port: 2222, protocol: 'ssh',
        username: 'root', password: 's3cret', group: 'Production', tags: ['linux', 'web'],
      },
      {
        row: 3, name: 'db', host: 'db.example.com', port: 22, protocol: 'ssh',
        username: 'admin', group: undefined, tags: [],
      },
    ])
  })

  it('handles quoted fields with commas, quotes and newlines', () => {
    const csv = `${TERMIUS_HEADER}\n,"Web, ""main""",,h1,ssh,22,u,"pa,ss""word\nline2"\n`
    const [h] = parseHostCsv(csv).hosts
    expect(h.name).toBe('Web, "main"')
    expect(h.password).toBe('pa,ss"word\nline2')
  })

  it('strips a UTF-8 BOM and handles CRLF', () => {
    const csv = `﻿${TERMIUS_HEADER}\r\n,a,,1.2.3.4,ssh,22,root,\r\n\r\n`
    const res = parseHostCsv(csv)
    expect(res.error).toBeUndefined()
    expect(res.hosts).toHaveLength(1)
    expect(res.hosts[0]).toMatchObject({ name: 'a', host: '1.2.3.4', username: 'root' })
  })

  it('accepts alias headers from other tools', () => {
    const res = parseHostCsv('Name,Host,Port,User\nrouter,192.168.1.1,8022,admin\n')
    expect(res.hosts[0]).toMatchObject({ name: 'router', host: '192.168.1.1', port: 8022, username: 'admin', protocol: 'ssh' })
    expect(res.hasPasswords).toBe(false)
  })

  it('accepts semicolon-delimited files', () => {
    const res = parseHostCsv('Label;Address;Login\nsw1;10.1.1.1;ops\n')
    expect(res.hosts[0]).toMatchObject({ name: 'sw1', host: '10.1.1.1', username: 'ops' })
  })

  it('errors when no host column exists', () => {
    const res = parseHostCsv('Name,Port,User\na,22,root\n')
    expect(res.error).toMatch(/No host column/)
    expect(res.hosts).toEqual([])
  })

  it('errors on an empty or oversized file', () => {
    expect(parseHostCsv('﻿  \n').error).toMatch(/empty/)
    expect(parseHostCsv('x'.repeat(CSV_MAX_BYTES + 1)).error).toMatch(/too large/)
  })

  it('skips rows with an invalid port', () => {
    const res = parseHostCsv('Host,Port\na,0\nb,70000\nc,22x\nd,443\n')
    expect(res.hosts.map((h) => h.host)).toEqual(['d'])
    expect(res.warnings).toEqual([
      'Row 2: invalid port "0" — skipped',
      'Row 3: invalid port "70000" — skipped',
      'Row 4: invalid port "22x" — skipped',
    ])
  })

  it('defaults telnet to port 23 and maps other protocols', () => {
    const res = parseHostCsv('Host,Protocol,Port\nt1,Telnet,\nm1,mosh,\ns1,serial,\nt2,telnet,2323\n')
    expect(res.hosts.map((h) => [h.host, h.protocol, h.port])).toEqual([
      ['t1', 'telnet', 23],
      ['m1', 'ssh', 22],
      ['t2', 'telnet', 2323],
    ])
    expect(res.warnings).toEqual([
      'Row 3: unsupported protocol "mosh" — imported as SSH',
      'Row 4: serial connections can\'t be imported from CSV — skipped',
    ])
  })

  it('skips blank rows silently and rows without host with a warning', () => {
    const res = parseHostCsv('Name,Host\n\n,,\nnohost,\nok,1.1.1.1\n\n\n')
    expect(res.hosts.map((h) => h.name)).toEqual(['ok'])
    expect(res.warnings).toEqual(['Row 4: no hostname — skipped'])
  })

  it('rejects hostnames containing whitespace', () => {
    const res = parseHostCsv('Host\nbad host\n')
    expect(res.hosts).toEqual([])
    expect(res.warnings[0]).toMatch(/Row 2: invalid hostname/)
  })

  it('defaults the name to the host', () => {
    expect(parseHostCsv('Label,Hostname\n,example.org\n').hosts[0].name).toBe('example.org')
  })

  it('flattens nested Termius groups', () => {
    const res = parseHostCsv(`${TERMIUS_HEADER}\nDC1/Core > Spine,s1,,10.0.0.9,,,,\n`)
    expect(res.hosts[0].group).toBe('DC1 / Core / Spine')
  })

  it('keeps passwords verbatim and only when present', () => {
    const res = parseHostCsv('Host,Password\na, spaced \nb,\n')
    expect(res.hosts[0].password).toBe(' spaced ')
    expect(res.hosts[1]).not.toHaveProperty('password')
    expect(res.hasPasswords).toBe(true)
  })

  it('caps the number of rows', () => {
    const rows = Array.from({ length: 12 }, (_, i) => `h${i}`).join('\n')
    const res = parseHostCsv(`Host\n${rows}\n`, 10)
    expect(res.hosts).toHaveLength(10)
    expect(res.warnings).toContain('Only the first 10 rows were read')
  })
})
