import { IpcMain } from 'electron'
import * as net from 'net'
import { Connection, ConnectionGroup, SSHKey, Snippet, SnippetFolder } from '../types/shared'
import { getDb, rowToConnection, connToRow, rowToGroup, rowToSshKey, rowToSnippet, rowToSnippetFolder } from './db'

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
          last_connected_at = @last_connected_at,
          -- SSH Advanced
          agent_forwarding = @agent_forwarding, keepalive_interval = @keepalive_interval,
          keepalive_count_max = @keepalive_count_max, ready_timeout = @ready_timeout,
          proxy_jump_chain = @proxy_jump_chain,
          -- Anti-idle
          anti_idle = @anti_idle, anti_idle_interval = @anti_idle_interval,
          anti_idle_string = @anti_idle_string,
          -- Zmodem
          zmodem_enabled = @zmodem_enabled,
          -- Terminal display
          true_color_enabled = @true_color_enabled, sixel_enabled = @sixel_enabled
        WHERE id = @id
      `).run(row)
    } else {
      db.prepare(`
        INSERT INTO connections
        (id, name, host, port, protocol, username, auth_type, ssh_key_id, group_id,
         tags, notes, device_type, color, jump_host_id, startup_commands,
         enable_password, serial_config, auto_reconnect, reconnect_delay,
         created_at, updated_at, last_connected_at,
         agent_forwarding, keepalive_interval, keepalive_count_max, ready_timeout,
         proxy_jump_chain, anti_idle, anti_idle_interval, anti_idle_string,
         zmodem_enabled, true_color_enabled, sixel_enabled)
        VALUES
        (@id, @name, @host, @port, @protocol, @username, @auth_type, @ssh_key_id, @group_id,
         @tags, @notes, @device_type, @color, @jump_host_id, @startup_commands,
         @enable_password, @serial_config, @auto_reconnect, @reconnect_delay,
         @created_at, @updated_at, @last_connected_at,
         @agent_forwarding, @keepalive_interval, @keepalive_count_max, @ready_timeout,
         @proxy_jump_chain, @anti_idle, @anti_idle_interval, @anti_idle_string,
         @zmodem_enabled, @true_color_enabled, @sixel_enabled)
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

  // ── Snippets ────────────────────────────────────────────────────────────────

  ipcMain.handle('store:get-snippets', () => {
    const rows = getDb().prepare('SELECT * FROM snippets ORDER BY name ASC').all() as Row[]
    return rows.map(rowToSnippet)
  })

  ipcMain.handle('store:save-snippet', (_, s: Snippet) => {
    getDb().prepare(`
      INSERT INTO snippets (id, name, command, description, folder_id, created_at, updated_at)
      VALUES (@id, @name, @command, @description, @folder_id, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        command = excluded.command,
        description = excluded.description,
        folder_id = excluded.folder_id,
        updated_at = excluded.updated_at
    `).run({
      id:          s.id,
      name:        s.name,
      command:     s.command,
      description: s.description ?? null,
      folder_id:   s.folderId ?? null,
      created_at:  s.createdAt,
      updated_at:  s.updatedAt,
    })
    return s
  })

  ipcMain.handle('store:delete-snippet', (_, id: string) => {
    getDb().prepare('DELETE FROM snippets WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('store:get-snippet-folders', () => {
    const rows = getDb().prepare('SELECT * FROM snippet_folders ORDER BY name ASC').all() as Row[]
    return rows.map(rowToSnippetFolder)
  })

  ipcMain.handle('store:save-snippet-folder', (_, f: SnippetFolder) => {
    getDb().prepare(`
      INSERT INTO snippet_folders (id, name) VALUES (@id, @name)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name
    `).run({ id: f.id, name: f.name })
    return f
  })

  ipcMain.handle('store:delete-snippet-folder', (_, id: string) => {
    getDb().prepare('DELETE FROM snippet_folders WHERE id = ?').run(id)
    getDb().prepare('UPDATE snippets SET folder_id = NULL WHERE folder_id = ?').run(id)
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
    const cmd = command.trim()
    // Reject natural-language sentences: more than 6 words or contains a question mark
    const wordCount = cmd.split(/\s+/).length
    if (wordCount > 6 || cmd.includes('?') || cmd.length > 120) return false
    getDb().prepare(`
      INSERT INTO command_history (device_type, command, count, last_used)
      VALUES (@device_type, @command, 1, @now)
      ON CONFLICT(device_type, command)
      DO UPDATE SET count = count + 1, last_used = @now
    `).run({ device_type: deviceType, command: cmd, now: Date.now() })
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

  // ── TCP Ping ─────────────────────────────────────────────────────────────────
  ipcMain.handle('connection:ping', (_event, host: string, port: number) => {
    return new Promise<{ alive: boolean; latency?: number }>((resolve) => {
      const start  = Date.now()
      const socket = new net.Socket()
      socket.setTimeout(3000)
      socket.connect(port, host, () => {
        socket.destroy()
        resolve({ alive: true, latency: Date.now() - start })
      })
      socket.on('error',   () => { socket.destroy(); resolve({ alive: false }) })
      socket.on('timeout', () => { socket.destroy(); resolve({ alive: false }) })
    })
  })
}
