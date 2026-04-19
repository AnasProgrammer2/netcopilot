import Database from 'better-sqlite3-multiple-ciphers'
import { app } from 'electron'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { Connection, ConnectionGroup, SSHKey } from '../types/shared'
import { getDbKey } from './dbKey'

function safeJsonParse<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T } catch { return fallback }
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
      plainDb.pragma(`rekey = '${key}'`)
      plainDb.close()
    }

    _db = new Database(dbPath)
    _db.pragma(`key = '${getDbKey()}'`)
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
  `)
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
         enable_password, serial_config, auto_reconnect, reconnect_delay,
         created_at, updated_at, last_connected_at)
        VALUES
        (@id, @name, @host, @port, @protocol, @username, @auth_type, @ssh_key_id, @group_id,
         @tags, @notes, @device_type, @color, @jump_host_id, @startup_commands,
         @enable_password, @serial_config, @auto_reconnect, @reconnect_delay,
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

      // Migrate credentials.json — same folder as the config.json we found
      const credPath = path.join(path.dirname(jsonPath), 'credentials.json')
      if (existsSync(credPath)) {
        try {
          const credRaw = readFileSync(credPath, 'utf-8')
          const credData = JSON.parse(credRaw) as { credentials?: Record<string, string> }
          const insertCred = db.prepare(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (@key, @value)"
          )
          for (const [k, v] of Object.entries(credData.credentials ?? {})) {
            insertCred.run({ key: `cred:${k}`, value: JSON.stringify(v) })
          }
        } catch {/* ignore */}
      }

      console.log('[db] Migrated data from config.json to SQLite')
    } catch (e) {
      console.error('[db] Migration from JSON failed:', e)
    }
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_v1', 'true')").run()
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
    enablePassword:   (row.enable_password as string) || undefined,
    serialConfig:     row.serial_config ? safeJsonParse(row.serial_config as string, undefined) : undefined,
    autoReconnect:    Boolean(row.auto_reconnect),
    reconnectDelay:   row.reconnect_delay as number,
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
    enable_password:  c.enablePassword  ?? null,
    serial_config:    c.serialConfig    ? JSON.stringify(c.serialConfig) : null,
    auto_reconnect:   c.autoReconnect   ? 1 : 0,
    reconnect_delay:  c.reconnectDelay  ?? 10,
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
