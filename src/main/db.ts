import Database from 'better-sqlite3-multiple-ciphers'
import { app, safeStorage } from 'electron'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { Connection, ConnectionGroup, SSHKey, Snippet, SnippetFolder } from '../types/shared'
import { getDbKey } from './dbKey'
import { DEFAULT_AI_BLACKLIST } from './aiDefaults'

function safeJsonParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T } catch { return fallback }
}

/** Encrypt a sensitive field value with OS keychain via safeStorage. */
function encryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  try { return safeStorage.encryptString(value).toString('base64') } catch { return value }
}

/** Decrypt a field encrypted by encryptField; falls back to plaintext for legacy rows. */
function decryptField(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return value
  try { return safeStorage.decryptString(Buffer.from(value, 'base64')) } catch { return value }
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = path.join(app.getPath('userData'), 'netcopilot.db')
    const keyFile = path.join(app.getPath('userData'), 'netcopilot.key')
    const isFirstEncrypt = !existsSync(keyFile)

    if (isFirstEncrypt && existsSync(dbPath)) {
      // Existing plain DB — open without key, then rekey to encrypt in-place
      const plainDb = new Database(dbPath)
      const key = getDbKey() // generates + saves key file
      if (!/^[0-9a-f]+$/i.test(key)) throw new Error('DB key contains invalid characters')
      plainDb.pragma(`rekey = '${key}'`)
      plainDb.close()
    }

    _db = new Database(dbPath)
    const dbKey = getDbKey()
    if (!/^[0-9a-f]+$/i.test(dbKey)) throw new Error('DB key contains invalid characters')
    _db.pragma(`key = '${dbKey}'`)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
    migrateFromJson(_db)
  }
  return _db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id              TEXT    PRIMARY KEY,
      name            TEXT    NOT NULL,
      host            TEXT    NOT NULL DEFAULT '',
      port            INTEGER NOT NULL DEFAULT 22,
      protocol        TEXT    NOT NULL DEFAULT 'ssh',
      username        TEXT    NOT NULL DEFAULT '',
      auth_type       TEXT    NOT NULL DEFAULT 'password',
      ssh_key_id      TEXT,
      group_id        TEXT,
      tags            TEXT    NOT NULL DEFAULT '[]',
      notes           TEXT    NOT NULL DEFAULT '',
      device_type     TEXT    NOT NULL DEFAULT 'generic',
      color           TEXT,
      jump_host_id    TEXT,
      startup_commands TEXT,
      enable_password TEXT,
      serial_config   TEXT,
      auto_reconnect  INTEGER NOT NULL DEFAULT 1,
      reconnect_delay INTEGER NOT NULL DEFAULT 10,
      proxy_config    TEXT,
      agent_forwarding INTEGER DEFAULT 0,
      keepalive_interval INTEGER DEFAULT 30,
      keepalive_count_max INTEGER DEFAULT 3,
      ready_timeout   INTEGER DEFAULT 30,
      proxy_jump_chain TEXT,
      anti_idle       INTEGER DEFAULT 0,
      anti_idle_interval INTEGER DEFAULT 60,
      anti_idle_string TEXT,
      zmodem_enabled  INTEGER DEFAULT 0,
      true_color_enabled INTEGER DEFAULT 0,
      sixel_enabled   INTEGER DEFAULT 0,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      last_connected_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS connection_groups (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      color     TEXT,
      parent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS ssh_keys (
      id         TEXT    PRIMARY KEY,
      name       TEXT    NOT NULL,
      public_key TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_history (
      device_type TEXT    NOT NULL,
      command     TEXT    NOT NULL,
      count       INTEGER NOT NULL DEFAULT 1,
      last_used   INTEGER NOT NULL,
      PRIMARY KEY (device_type, command)
    );

    CREATE TABLE IF NOT EXISTS snippets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      command     TEXT NOT NULL,
      description TEXT,
      folder_id   TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snippet_folders (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `)

  // ── Schema migrations (add columns if missing) ──
  const cols = db.prepare("PRAGMA table_info(connections)").all() as { name: string }[]
  const colNames = new Set(cols.map(c => c.name))
  if (!colNames.has('proxy_config')) {
    db.exec("ALTER TABLE connections ADD COLUMN proxy_config TEXT")
  }

  // Migration for new SSH Advanced Settings columns
  const newColumns = [
    { name: 'agent_forwarding', type: 'INTEGER DEFAULT 0' },
    { name: 'keepalive_interval', type: 'INTEGER DEFAULT 30' },
    { name: 'keepalive_count_max', type: 'INTEGER DEFAULT 3' },
    { name: 'ready_timeout', type: 'INTEGER DEFAULT 30' },
    { name: 'proxy_jump_chain', type: 'TEXT' },
    { name: 'anti_idle', type: 'INTEGER DEFAULT 0' },
    { name: 'anti_idle_interval', type: 'INTEGER DEFAULT 60' },
    { name: 'anti_idle_string', type: 'TEXT' },
    { name: 'zmodem_enabled', type: 'INTEGER DEFAULT 0' },
    { name: 'true_color_enabled', type: 'INTEGER DEFAULT 0' },
    { name: 'sixel_enabled', type: 'INTEGER DEFAULT 0' },
  ]

  for (const col of newColumns) {
    if (!colNames.has(col.name)) {
      try {
        db.exec(`ALTER TABLE connections ADD COLUMN ${col.name} ${col.type}`)
      } catch (e) {
        console.warn(`[db] Failed to add column ${col.name}:`, e)
      }
    }
  }

  const blRow = db
    .prepare("SELECT value FROM settings WHERE key = 'ai.blacklist'")
    .get() as { value: string } | undefined
  const blValue: unknown = blRow ? (() => { try { return JSON.parse(blRow.value) } catch { return null } })() : null
  const isEmpty = !blValue || (Array.isArray(blValue) && (blValue as string[]).length === 0)
  if (isEmpty) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('ai.blacklist', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(DEFAULT_AI_BLACKLIST))
  }
}

// ── JSON → SQLite migration (runs only once) ─────────────────────────────────

function migrateFromJson(db: Database.Database): void {
  const already = db
    .prepare("SELECT value FROM settings WHERE key = 'migrated_v1'")
    .get() as { value: string } | undefined
  if (already) return

  // Look in current userData first, then fall back to old app folders
  const candidates = [
    path.join(app.getPath('userData'), 'config.json'),
    path.join(path.dirname(app.getPath('userData')), 'NetTerm', 'config.json'),
    path.join(path.dirname(app.getPath('userData')), 'netterm', 'config.json'),
  ]
  const jsonPath = candidates.find((p) => existsSync(p)) ?? candidates[0]
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8')
      const data = JSON.parse(raw) as {
        connections?: Connection[]
        groups?: ConnectionGroup[]
        sshKeys?: SSHKey[]
        settings?: Record<string, unknown>
      }

      // Pre-read credentials.json before transaction block to avoid synchronous FS I/O inside SQLite transaction
      let parsedCredentials: Record<string, string> | undefined = undefined
      const credPath = path.join(path.dirname(jsonPath), 'credentials.json')
      if (existsSync(credPath)) {
        try {
          const credRaw = readFileSync(credPath, 'utf-8')
          const credData = JSON.parse(credRaw) as { credentials?: Record<string, string> }
          parsedCredentials = credData.credentials
        } catch (e) {
          console.error('[db] Failed to read credentials.json during migration prep:', e)
        }
      }

      // Wrap all inserts and the completion marker in a single transaction so a crash mid-migration
      // rolls back everything and migrated_v1 stays unset → retry on next launch
      const migrate = db.transaction(() => {
        const insertGroup = db.prepare(`
          INSERT OR IGNORE INTO connection_groups (id, name, color, parent_id)
          VALUES (@id, @name, @color, @parent_id)
        `)
        for (const g of data.groups ?? []) {
          if (!g.id) continue
          insertGroup.run({ id: g.id, name: g.name, color: g.color ?? null, parent_id: g.parentId ?? null })
        }

        const insertConn = db.prepare(`
          INSERT OR IGNORE INTO connections
          (id, name, host, port, protocol, username, auth_type, ssh_key_id, group_id,
           tags, notes, device_type, color, jump_host_id, startup_commands,
           enable_password, serial_config, auto_reconnect, reconnect_delay, proxy_config,
           created_at, updated_at, last_connected_at)
          VALUES
          (@id, @name, @host, @port, @protocol, @username, @auth_type, @ssh_key_id, @group_id,
           @tags, @notes, @device_type, @color, @jump_host_id, @startup_commands,
           @enable_password, @serial_config, @auto_reconnect, @reconnect_delay, @proxy_config,
           @created_at, @updated_at, @last_connected_at)
        `)
        for (const c of data.connections ?? []) {
          if (!c.id) continue
          insertConn.run(connToRow(c))
        }

        const insertKey = db.prepare(`
          INSERT OR IGNORE INTO ssh_keys (id, name, public_key, created_at)
          VALUES (@id, @name, @public_key, @created_at)
        `)
        for (const k of data.sshKeys ?? []) {
          if (!k.id) continue
          insertKey.run({ id: k.id, name: k.name, public_key: k.publicKey, created_at: k.createdAt })
        }

        const insertSetting = db.prepare(`
          INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)
        `)
        for (const [key, value] of Object.entries(data.settings ?? {})) {
          insertSetting.run({ key, value: JSON.stringify(value) })
        }

        // Migrate parsed credentials inside the transaction
        if (parsedCredentials) {
          const insertCred = db.prepare(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)"
          )
          for (const [k, v] of Object.entries(parsedCredentials)) {
            if (safeStorage.isEncryptionAvailable()) {
              const encrypted = safeStorage.encryptString(v)
              insertCred.run({ key: `cred:${k}`, value: JSON.stringify(encrypted.toString('base64')) })
            } else {
              insertCred.run({ key: `cred:${k}`, value: JSON.stringify(v) })
            }
          }
        }

        // Include the completion marker inside the transaction for absolute atomicity
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_v1', 'true')").run()
      })

      migrate()
      console.log('[db] Migrated data from config.json to SQLite')
    } catch (e) {
      console.error('[db] Migration from JSON failed:', e)
      // Do NOT set migrated_v1 on failure — allow retry on next launch
      return
    }
  } else {
    // Mark migration complete if no config.json exists to migrate
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_v1', 'true')").run()
  }
}

// ── Row ↔ Domain object helpers ───────────────────────────────────────────────

type Row = Record<string, unknown>

export function rowToConnection(row: Row): Connection {
  return {
    id:               row.id as string,
    name:             row.name as string,
    host:             row.host as string,
    port:             row.port as number,
    protocol:         row.protocol as Connection['protocol'],
    username:         row.username as string,
    authType:         row.auth_type as Connection['authType'],
    sshKeyId:         (row.ssh_key_id as string) || undefined,
    groupId:          (row.group_id  as string) || undefined,
    tags:             safeJsonParse((row.tags as string) || '[]', []),
    notes:            (row.notes as string) ?? '',
    deviceType:       row.device_type as Connection['deviceType'],
    color:            (row.color as string) || undefined,
    jumpHostId:       (row.jump_host_id as string) || undefined,
    startupCommands:  row.startup_commands ? safeJsonParse(row.startup_commands as string, undefined) : undefined,
    enablePassword:   row.enable_password ? decryptField(row.enable_password as string) : undefined,
    serialConfig:     row.serial_config ? safeJsonParse(row.serial_config as string, undefined) : undefined,
    autoReconnect:    Boolean(row.auto_reconnect),
    reconnectDelay:   row.reconnect_delay as number,
    proxyConfig:      row.proxy_config ? safeJsonParse(row.proxy_config as string, undefined) : undefined,
    // SSH Advanced Settings
    agentForwarding:  Boolean(row.agent_forwarding),
    keepAliveInterval: (row.keepalive_interval as number) ?? 30,
    keepAliveCountMax: (row.keepalive_count_max as number) ?? 3,
    readyTimeout:     (row.ready_timeout as number) ?? 30,
    proxyJumpChain:   row.proxy_jump_chain ? safeJsonParse(row.proxy_jump_chain as string, undefined) : undefined,
    // Anti-idle
    antiIdle:         Boolean(row.anti_idle),
    antiIdleInterval: (row.anti_idle_interval as number) ?? 60,
    antiIdleString:   (row.anti_idle_string as string) || undefined,
    // Zmodem
    zmodemEnabled:    Boolean(row.zmodem_enabled),
    // Terminal display
    trueColorEnabled: Boolean(row.true_color_enabled),
    sixelEnabled:     Boolean(row.sixel_enabled),
    createdAt:        row.created_at as number,
    updatedAt:        row.updated_at as number,
    lastConnectedAt:  (row.last_connected_at as number) || undefined,
  }
}

export function connToRow(c: Connection): Row {
  return {
    id:               c.id,
    name:             c.name,
    host:             c.host,
    port:             c.port,
    protocol:         c.protocol,
    username:         c.username,
    auth_type:        c.authType,
    ssh_key_id:       c.sshKeyId   ?? null,
    group_id:         c.groupId    ?? null,
    tags:             JSON.stringify(c.tags ?? []),
    notes:            c.notes ?? '',
    device_type:      c.deviceType,
    color:            c.color       ?? null,
    jump_host_id:     c.jumpHostId  ?? null,
    startup_commands: c.startupCommands ? JSON.stringify(c.startupCommands) : null,
    enable_password:  c.enablePassword  ? encryptField(c.enablePassword) : null,
    serial_config:    c.serialConfig    ? JSON.stringify(c.serialConfig) : null,
    auto_reconnect:   c.autoReconnect   ? 1 : 0,
    reconnect_delay:  c.reconnectDelay  ?? 10,
    proxy_config:     c.proxyConfig     ? JSON.stringify(c.proxyConfig) : null,
    // SSH Advanced Settings
    agent_forwarding:    c.agentForwarding ? 1 : 0,
    keepalive_interval:  c.keepAliveInterval ?? 30,
    keepalive_count_max: c.keepAliveCountMax ?? 3,
    ready_timeout:       c.readyTimeout ?? 30,
    proxy_jump_chain:    c.proxyJumpChain ? JSON.stringify(c.proxyJumpChain) : null,
    // Anti-idle
    anti_idle:           c.antiIdle ? 1 : 0,
    anti_idle_interval:  c.antiIdleInterval ?? 60,
    anti_idle_string:    c.antiIdleString ?? null,
    // Zmodem
    zmodem_enabled:      c.zmodemEnabled ? 1 : 0,
    // Terminal display
    true_color_enabled:  c.trueColorEnabled ? 1 : 0,
    sixel_enabled:       c.sixelEnabled ? 1 : 0,
    created_at:       c.createdAt,
    updated_at:       c.updatedAt,
    last_connected_at: c.lastConnectedAt ?? null,
  }
}

export function rowToGroup(row: Row): ConnectionGroup {
  return {
    id:       row.id as string,
    name:     row.name as string,
    color:    (row.color as string) || undefined,
    parentId: (row.parent_id as string) || undefined,
  }
}

export function rowToSshKey(row: Row): SSHKey {
  return {
    id:        row.id as string,
    name:      row.name as string,
    publicKey: row.public_key as string,
    createdAt: row.created_at as number,
  }
}

export function rowToSnippet(row: Row): Snippet {
  return {
    id:          row.id as string,
    name:        row.name as string,
    command:     row.command as string,
    description: (row.description as string) || undefined,
    folderId:    (row.folder_id as string) || undefined,
    createdAt:   row.created_at as number,
    updatedAt:   row.updated_at as number,
  }
}

export function rowToSnippetFolder(row: Row): SnippetFolder {
  return {
    id:   row.id as string,
    name: row.name as string,
  }
}
