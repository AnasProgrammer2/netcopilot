---
description: 
alwaysApply: true
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start Electron + Vite dev server (HMR enabled)
npm run build            # typecheck → electron-vite build → out/
npm run typecheck        # tsc on both tsconfig.node.json and tsconfig.web.json
npm run lint             # ESLint across .js/.jsx/.ts/.tsx
npm run format           # Prettier all files

# Platform distributables (output → dist/)
npm run build:mac
npm run build:win
npm run build:linux
```

**IMPORTANT — native module rebuild**: `better-sqlite3` must be compiled for Electron's Node version. The `postinstall` script handles this automatically via `electron-rebuild -f -w better-sqlite3`. If you see `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION mismatch`, run:
```bash
npx @electron/rebuild -f -w better-sqlite3
```

There is **no test suite**. Verification is done via `typecheck` and `lint` only.

---

## Architecture: Three-Process Electron App

```
src/
├── main/           # Node.js (Electron Main process)
├── preload/        # Context bridge — IPC surface exposed to renderer
└── renderer/src/   # React 19 UI (Vite, Tailwind, Zustand)
```

Build tooling: **electron-vite** with separate tsconfigs:
- `tsconfig.node.json` → main + preload
- `tsconfig.web.json` → renderer

Output: `out/` (runtime JS), `dist/` (packaged distributable).

---

## Data Storage — SQLite (`better-sqlite3`)

All persistent data lives in a single SQLite database:
- **Mac**: `~/Library/Application Support/netcopilot/netcopilot.db`
- **Windows**: `%APPDATA%\netcopilot\netcopilot.db`

### Schema

| Table | Contents |
|---|---|
| `connections` | All connection profiles (full column-per-field schema) |
| `connection_groups` | Folder groups for organising connections |
| `ssh_keys` | Stored SSH public keys |
| `settings` | Key-value store for app settings AND encrypted credentials (prefix `cred:`) |

### Key files
- `src/main/db.ts` — opens/initialises the DB, defines the schema, row↔domain mappers (`rowToConnection`, `connToRow`, `rowToGroup`, `rowToSshKey`), and runs the **one-time JSON migration** on first launch
- `src/main/store.ts` — IPC handlers that query/mutate SQLite (replaces the old `electron-store` file)
- `src/main/credentials.ts` — encrypted credentials stored in the `settings` table under `cred:<key>`; uses `safeStorage.encryptString` (falls back to plain base64)

### Migration (automatic, runs once)
On first launch with the SQLite-based code, `db.ts` reads the old `config.json` and `credentials.json` files and inserts their data into SQLite, then sets `settings.migrated_v1 = 'true'` so it never repeats. Old JSON files are left in place but are no longer used.

### Row → Domain conversion notes
- `tags`, `startup_commands`, `serial_config` are stored as JSON text in SQLite
- `auto_reconnect` is stored as INTEGER 0/1 (SQLite has no BOOLEAN)
- `auth_type`, `group_id`, `ssh_key_id` use snake_case column names; camelCase in TypeScript
- `NULL` columns → `undefined` in domain objects (never empty string)

---

## IPC Layer (Preload Bridge)

`src/preload/index.ts` exposes `window.api` to the renderer via `contextBridge`. The renderer **never** uses Node APIs directly.

| Namespace | What it does |
|---|---|
| `window.api.ssh.*` | connect / send / resize / disconnect / onData / onClosed |
| `window.api.telnet.*` | connect / send / disconnect / onData / onClosed |
| `window.api.serial.*` | listPorts / connect / send / disconnect / onData / onClosed / onError |
| `window.api.store.*` | CRUD for connections, groups, SSH keys, and key-value settings |
| `window.api.credentials.*` | save / get / delete encrypted passwords |
| `window.api.file.*` | export (save dialog) / import (open dialog) |
| `window.api.appInfo` | versions + platform (read-only) |

`onData` / `onClosed` / `onError` return an **unsubscribe function** — always call it in a cleanup effect.

Main process IPC handlers live in:
- `src/main/ssh.ts` — ssh2 library, PTY shell, resize via `stream.setWindow()`
- `src/main/telnet.ts` — raw `net.Socket`, manual IAC/NAWS negotiation, strips telnet commands before forwarding
- `src/main/serial.ts` — serialport library, `autoOpen: false` pattern
- `src/main/store.ts` — SQLite-backed CRUD via `better-sqlite3`; handlers use prepared statements
- `src/main/credentials.ts` — values encrypted with `safeStorage.encryptString` → base64; stored in `settings` table under `cred:` prefix
- `src/main/fileDialog.ts` — `dialog.showSaveDialog` / `dialog.showOpenDialog`

Each protocol module keeps a `Map<sessionId, activeSession>` of live connections.

---

## Session Lifecycle

1. User double-clicks a connection (or uses Quick Connect) → `useAppStore.openSession(conn)` adds a `Session` (status: `connecting`) and sets it active
2. `TerminalTab` mounts → initialises xterm.js → calls `window.api.<proto>.connect()`
3. Main streams data back: `webContents.send('<proto>:data', sessionId, chunk)`
4. `TerminalHighlighter.process(chunk)` applies per-device ANSI color → written to xterm
5. On close/error: status → `disconnected` / `error`; if `autoReconnect` is set, a timer fires `doConnect(true)`
6. On tab close: `closeSession()` removes session from Zustand; `TerminalTab` unmount calls `window.api.<proto>.disconnect()`

All sessions stay mounted in the DOM (absolute-positioned, `hidden` when inactive) so xterm state is preserved when switching tabs.

---

## State Management (`src/renderer/src/store/index.ts`)

Single Zustand store (`useAppStore`):

| Slice | Persisted? | Notes |
|---|---|---|
| `connections`, `groups`, `sshKeys` | Yes (SQLite via IPC) | Loaded on boot in `App.tsx` |
| `sessions`, `activeSessionId` | No | Ephemeral tab state |
| `terminalSettings`, `connectionSettings` | Yes (per-key via `store:set-setting`) | Loaded by `loadSettings()` on boot |
| `sidebarWidth` | Yes | Saved as setting key `sidebarWidth` |
| Dialog open states | No | `quickConnectOpen`, `connectionDialogOpen`, `settingsOpen`, `editingConnection` |

**Settings change flow**: always call `applySettings(patch)` — it updates Zustand state AND immediately applies CSS variables / theme classes. Never call `set()` directly for settings keys.

### Critical: `saveConnection` / `saveGroup` / `saveSshKey` spread order
The generated `nanoid()` ID must come **after** the data spread so it is never overwritten by `undefined`:
```ts
// CORRECT
const conn = { ...connData, id: connData.id || nanoid(), createdAt: now, updatedAt: now }
// WRONG — id gets overwritten with undefined!
const conn = { id: connData.id || nanoid(), ...connData }
```

---

## UI Layout

```
App
├── TitleBar                  (macOS hiddenInset / custom Windows titlebar)
├── Sidebar                   (resizable, 200–420 px, drag handle on right edge)
│   ├── Groups (collapsible)
│   ├── ConnectionItem        (double-click to connect, right-click context menu)
│   └── Footer: SSH Keys, Export, Import
├── main
│   ├── WelcomeScreen         (shown when sessions.length === 0)
│   └── TerminalArea
│       ├── TabBar
│       └── TerminalTab × N   (all mounted, only active is visible)
├── ConnectionDialog          (add/edit — controlled by connectionDialogOpen + editingConnection)
├── QuickConnect              (⌘K / Ctrl+K palette)
└── SettingsDialog
```

`GroupDialog` is rendered inline inside `Sidebar` (not at the App level).

---

## Design System

All colors are **CSS custom properties as HSL values** (no `hsl()` wrapper in the variable). Tailwind consumes them via `hsl(var(--token))` in `tailwind.config.js`. Defined in `src/renderer/src/assets/globals.css`.

**Themes**: `:root` defines dark defaults. `html.light` class overrides them for light mode. Applied by `applyTheme()` in the store which toggles `.dark` / `.light` on `document.documentElement`.

**Accent color**: `applyAccentColor(hex)` converts hex → HSL and sets `--primary` and `--ring` (plus sidebar variants) as inline styles on `document.documentElement`, overriding the CSS defaults.

**Sidebar tokens**: separate `sidebar-*` CSS variable namespace (`--sidebar-background`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`) mapped to `bg-sidebar`, `text-sidebar-foreground`, etc. in Tailwind.

**Utility**: `src/renderer/src/lib/utils.ts` exports `cn(...classes)` = `twMerge(clsx(...))`. Use this for all conditional class merging.

**xterm.js overrides**: `.xterm`, `.xterm-viewport`, `.xterm-screen` rules in `globals.css`. Terminal background is hardcoded `#0d0f14` in `TerminalTab`.

**Titlebar drag**: `.drag-region` / `.no-drag` CSS classes use `-webkit-app-region`.

---

## Terminal Highlighting (`src/renderer/src/lib/highlighter.ts`)

`TerminalHighlighter` is a **streaming, line-level** highlighter — chunks without `\n` pass through untouched (interactive echo / prompts). Only complete lines (followed by `\n`) are processed by `highlightLine(line, deviceType)`.

Supported device types: `linux`, `windows`, `cisco-ios`, `cisco-iosxe`, `cisco-nxos`, `cisco-asa`, `junos`, `arista-eos`, `nokia-sros`, `huawei-vrp`, `mikrotik`, `fortios`, `hp-procurve`, `panos`, `f5-tmos`, `generic`.

To add a new `DeviceType`: write a `highlight<Vendor>(line)` function and add a case in the `highlightLine` switch. Shared helpers: `colorIPs(line)` for IP/IPv6/MAC addresses, `col(ansiCode, text)` for wrapping text.

---

## Types

Shared model types live in **two places** — keep them in sync:
- `src/types/shared.ts` — used by main process (`Connection`, `ConnectionGroup`, `SSHKey`, `SerialConfig`, `Protocol`, `AuthType`, `DeviceType`)
- `src/renderer/src/types/index.ts` — renderer superset: adds `Session`, `IpcSshConnectPayload`, `IpcTelnetConnectPayload`, `TerminalDimensions`

---

## Connection Import / Export Format

```json
{
  "version": 1,
  "exportedAt": "ISO string",
  "connections": [...],
  "groups": [...]
}
```

On import, group IDs are remapped with `nanoid()` to avoid collisions. Connection IDs are also replaced. Credentials are **not** exported (passwords stay in the OS keychain).

---

## Roadmap (planned features not yet built)

- AI Assistant (log analysis, command suggestions)
- SFTP Browser
- Port Forwarding (local / remote / dynamic)
- Snippets
- Jump Host / bastion support
