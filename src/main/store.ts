import { IpcMain } from 'electron'
import { Connection, ConnectionGroup, SSHKey } from '../types/shared'
import { getDb, rowToConnection, connToRow, rowToGroup, rowToSshKey } from './db'

type Row = Record<string, unknown>

export function setupStoreHandlers(ipcMain: IpcMain): void {
  // ── Connections ─────────────────────────────────────────────────────────────

  ipcMain.handle('store:get-connections', () => {
    const rows = getDb().prepare('SELECT * FROM connections ORDER BY name ASC').all() as Row[]
    return rows.map(rowToConnection)
  })

  ipcMain.handle('store:save-connection', (_, connection: Connection) => {
    const db = getDb()
    const exists = db
      .prepare('SELECT id FROM connections WHERE id = ?')
      .get(connection.id) as { id: string } | undefined

    if (exists) {
      const row = connToRow(connection)
      db.prepare(`
        UPDATE connections SET
          name = @name, host = @host, port = @port, protocol = @protocol,
          username = @username, auth_type = @auth_type, ssh_key_id = @ssh_key_id,
          group_id = @group_id, tags = @tags, notes = @notes,
          device_type = @device_type, color = @color, jump_host_id = @jump_host_id,
          startup_commands = @startup_commands, enable_password = @enable_password,
          serial_config = @serial_config, auto_reconnect = @auto_reconnect,
          reconnect_delay = @reconnect_delay, updated_at = @updated_at,
          last_connected_at = @last_connected_at
        WHERE id = @id
      `).run(row)
    } else {
      db.prepare(`
        INSERT INTO connections
        (id, name, host, port, protocol, username, auth_type, ssh_key_id, group_id,
         tags, notes, device_type, color, jump_host_id, startup_commands,
         enable_password, serial_config, auto_reconnect, reconnect_delay,
         created_at, updated_at, last_connected_at)
        VALUES
        (@id, @name, @host, @port, @protocol, @username, @auth_type, @ssh_key_id, @group_id,
         @tags, @notes, @device_type, @color, @jump_host_id, @startup_commands,
         @enable_password, @serial_config, @auto_reconnect, @reconnect_delay,
         @created_at, @updated_at, @last_connected_at)
      `).run(connToRow(connection))
    }
    return connection
  })

  ipcMain.handle('store:delete-connection', (_, id: string) => {
    getDb().prepare('DELETE FROM connections WHERE id = ?').run(id)
    return true
  })

  // ── Groups ──────────────────────────────────────────────────────────────────

  ipcMain.handle('store:get-groups', () => {
    const rows = getDb().prepare('SELECT * FROM connection_groups ORDER BY name ASC').all() as Row[]
    return rows.map(rowToGroup)
  })

  ipcMain.handle('store:save-group', (_, group: ConnectionGroup) => {
    const db = getDb()
    db.prepare(`
      INSERT INTO connection_groups (id, name, color, parent_id)
      VALUES (@id, @name, @color, @parent_id)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        parent_id = excluded.parent_id
    `).run({
      id:        group.id,
      name:      group.name,
      color:     group.color    ?? null,
      parent_id: group.parentId ?? null,
    })
    return group
  })

  ipcMain.handle('store:delete-group', (_, id: string) => {
    const db = getDb()
    // Ungroup connections that belonged to this group
    db.prepare('UPDATE connections SET group_id = NULL WHERE group_id = ?').run(id)
    db.prepare('DELETE FROM connection_groups WHERE id = ?').run(id)
    return true
  })

  // ── SSH Keys ────────────────────────────────────────────────────────────────

  ipcMain.handle('store:get-ssh-keys', () => {
    const rows = getDb().prepare('SELECT * FROM ssh_keys ORDER BY name ASC').all() as Row[]
    return rows.map(rowToSshKey)
  })

  ipcMain.handle('store:save-ssh-key', (_, key: SSHKey) => {
    getDb().prepare(`
      INSERT INTO ssh_keys (id, name, public_key, created_at)
      VALUES (@id, @name, @public_key, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        public_key = excluded.public_key
    `).run({
      id:         key.id,
      name:       key.name,
      public_key: key.publicKey,
      created_at: key.createdAt,
    })
    return key
  })

  ipcMain.handle('store:delete-ssh-key', (_, id: string) => {
    getDb().prepare('DELETE FROM ssh_keys WHERE id = ?').run(id)
    return true
  })

  // ── Settings ────────────────────────────────────────────────────────────────

  ipcMain.handle('store:get-setting', (_, key: string) => {
    const forbidden = ['license.key', 'masterPasswordHash', 'dbKey']
    if (forbidden.includes(key) || key.startsWith('cred:')) return undefined
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    if (!row) return undefined
    try { return JSON.parse(row.value) } catch { return row.value }
  })

  ipcMain.handle('store:set-setting', (_, key: string, value: unknown) => {
    const reserved = ['license.key', 'masterPasswordHash', 'dbKey', 'migrated_v1']
    if (reserved.some(r => key === r || key.startsWith('cred:'))) {
      return false
    }
    getDb().prepare(`
      INSERT INTO settings (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run({ key, value: JSON.stringify(value) })
    return true
  })

  // ── Command History ──────────────────────────────────────────────────────────

  ipcMain.handle('history:record', (_, deviceType: string, command: string) => {
    getDb().prepare(`
      INSERT INTO command_history (device_type, command, count, last_used)
      VALUES (@device_type, @command, 1, @now)
      ON CONFLICT(device_type, command)
      DO UPDATE SET count = count + 1, last_used = @now
    `).run({ device_type: deviceType, command, now: Date.now() })
    return true
  })

  ipcMain.handle('history:get', (_, deviceType: string, limit = 8) => {
    const rows = getDb().prepare(`
      SELECT command, count, last_used
      FROM command_history
      WHERE device_type = ?
      ORDER BY count DESC, last_used DESC
      LIMIT ?
    `).all(deviceType, limit) as { command: string; count: number; last_used: number }[]
    return rows
  })

  ipcMain.handle('history:clear', (_, deviceType?: string) => {
    if (deviceType) {
      getDb().prepare('DELETE FROM command_history WHERE device_type = ?').run(deviceType)
    } else {
      getDb().prepare('DELETE FROM command_history').run()
    }
    return true
  })
}
