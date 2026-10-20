/**
 * Parses a host-list CSV (Termius CSV import template and similar exports)
 * into normalised host entries.
 *
 * Termius has no official export, but its CSV import template — which the
 * third-party Termius exporters also emit — uses the header:
 *   Groups,Label,Tags,Hostname/IP,Protocol,Port,Username,Password
 * Headers are matched case/space/punctuation-insensitively with common
 * aliases, so CSVs from other tools ("Name,Host,Port,User") work too.
 *
 * Pure module — shared by the renderer (parsing) and main (size limit).
 */

/** Reject files above this size (bytes) — enforced in main before reading. */
export const CSV_MAX_BYTES = 5 * 1024 * 1024
/** Maximum number of data rows parsed; extra rows are dropped with a warning. */
export const CSV_MAX_ROWS = 5000

export type CsvField = 'name' | 'host' | 'port' | 'username' | 'password' | 'group' | 'tags' | 'protocol'

/** Normalised header → field. Keys are lowercase alphanumerics only. */
const HEADER_ALIASES: Record<string, CsvField> = {
  label: 'name', name: 'name', alias: 'name', title: 'name',
  hostnameip: 'host', hostname: 'host', host: 'host', address: 'host', ip: 'host',
  ipaddress: 'host', server: 'host',
  port: 'port',
  username: 'username', user: 'username', login: 'username',
  password: 'password', pass: 'password',
  groups: 'group', group: 'group', folder: 'group', path: 'group',
  tags: 'tags', tag: 'tags', labels: 'tags',
  protocol: 'protocol', type: 'protocol', scheme: 'protocol',
}

export interface CsvHost {
  /** Spreadsheet row number (header = row 1) — stable key for the UI */
  row: number
  name: string
  host: string
  port: number
  protocol: 'ssh' | 'telnet'
  username: string
  /** Plaintext password from the file, if present (not trimmed) */
  password?: string
  /** Group path, nested levels flattened to "Parent / Child" */
  group?: string
  tags: string[]
}

export interface CsvParseResult {
  hosts: CsvHost[]
  warnings: string[]
  /** Fatal problem — no hosts can be imported */
  error?: string
  /** True when at least one host carries a password */
  hasPasswords: boolean
}

// ── Low-level CSV ─────────────────────────────────────────────────────────────

/** Picks `,` unless the header line clearly uses `;` or tab instead. */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  let best = ','
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d
  return best
}

/**
 * RFC 4180 parser: quoted fields, "" escapes, delimiters / newlines inside
 * quotes, CRLF or LF line endings. Stops after `maxRecords` records.
 */
export function parseCsvRecords(
  text: string,
  delimiter = ',',
  maxRecords = Infinity
): { records: string[][]; truncated: boolean; unterminatedQuote: boolean } {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endRecord = () => {
    record.push(field)
    records.push(record)
    record = []
    field = ''
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
      } else {
        field += ch
      }
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      record.push(field)
      field = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
      if (records.length >= maxRecords) {
        // Anything other than trailing whitespace means rows were dropped
        return { records, truncated: text.slice(i + 1).trim() !== '', unterminatedQuote: false }
      }
    } else {
      field += ch
    }
    i++
  }

  // Final record without trailing newline
  if (field !== '' || record.length > 0 || inQuotes) endRecord()
  return { records, truncated: false, unterminatedQuote: inQuotes }
}

// ── Header mapping ────────────────────────────────────────────────────────────

const normaliseHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Maps known columns to their index. The first column for a field wins. */
export function mapHeaders(header: string[]): Partial<Record<CsvField, number>> {
  const map: Partial<Record<CsvField, number>> = {}
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[normaliseHeader(h)]
    if (field && map[field] === undefined) map[field] = idx
  })
  return map
}

// ── Row normalisation ─────────────────────────────────────────────────────────

/** Splits a Termius-style group path ("A/B", "A > B") and flattens it. */
export function normaliseGroup(raw: string): string | undefined {
  const parts = raw.split(/[/>\\]/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts.join(' / ') : undefined
}

export function splitTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const t of raw.split(/[,;|]/)) {
    const tag = t.trim()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

/** Key used to detect duplicates against existing connections. */
export function hostKey(host: string, port: number, username: string): string {
  return `${host.trim().toLowerCase()}|${port}|${username.trim()}`
}

export function parseHostCsv(content: string, maxRows = CSV_MAX_ROWS): CsvParseResult {
  const result: CsvParseResult = { hosts: [], warnings: [], hasPasswords: false }

  if (content.length > CSV_MAX_BYTES) {
    result.error = `File is too large (limit ${CSV_MAX_BYTES / 1024 / 1024} MB)`
    return result
  }

  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  if (!text.trim()) {
    result.error = 'The file is empty'
    return result
  }

  const delimiter = detectDelimiter(text)
  // +1 for the header row
  const { records, truncated, unterminatedQuote } = parseCsvRecords(text, delimiter, maxRows + 1)
  const [header, ...rows] = records
  const cols = mapHeaders(header)

  if (cols.host === undefined) {
    result.error = 'No host column found — expected a header such as "Hostname/IP", "Hostname", "Host" or "Address"'
    return result
  }

  if (unterminatedQuote) result.warnings.push('The file ends inside a quoted field — the last row may be incomplete')
  if (truncated) result.warnings.push(`Only the first ${maxRows} rows were read`)

  const get = (cells: string[], f: CsvField): string => {
    const idx = cols[f]
    return idx === undefined ? '' : (cells[idx] ?? '')
  }

  rows.forEach((cells, i) => {
    const row = i + 2 // header is row 1
    if (cells.every((c) => !c.trim())) return // blank line

    const host = get(cells, 'host').trim()
    if (!host) {
      result.warnings.push(`Row ${row}: no hostname — skipped`)
      return
    }
    if (/\s/.test(host) || [...host].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
      result.warnings.push(`Row ${row}: invalid hostname "${host.slice(0, 64)}" — skipped`)
      return
    }

    const rawProto = get(cells, 'protocol').trim().toLowerCase()
    let protocol: CsvHost['protocol'] = 'ssh'
    if (rawProto === 'telnet') {
      protocol = 'telnet'
    } else if (rawProto === 'serial') {
      result.warnings.push(`Row ${row}: serial connections can't be imported from CSV — skipped`)
      return
    } else if (rawProto && rawProto !== 'ssh') {
      result.warnings.push(`Row ${row}: unsupported protocol "${rawProto.slice(0, 32)}" — imported as SSH`)
    }

    const rawPort = get(cells, 'port').trim()
    let port = protocol === 'telnet' ? 23 : 22
    if (rawPort) {
      const n = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        result.warnings.push(`Row ${row}: invalid port "${rawPort.slice(0, 16)}" — skipped`)
        return
      }
      port = n
    }

    const password = get(cells, 'password')
    const entry: CsvHost = {
      row,
      name:     get(cells, 'name').trim() || host,
      host,
      port,
      protocol,
      username: get(cells, 'username').trim(),
      group:    normaliseGroup(get(cells, 'group')),
      tags:     splitTags(get(cells, 'tags')),
    }
    // Passwords are kept verbatim — leading/trailing spaces may be significant
    if (password !== '') {
      entry.password = password
      result.hasPasswords = true
    }
    result.hosts.push(entry)
  })

  if (result.hosts.length === 0 && result.warnings.length === 0) {
    result.warnings.push('No host rows found below the header')
  }
  return result
}
