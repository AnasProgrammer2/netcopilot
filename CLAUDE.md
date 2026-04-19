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

**IMPORTANT — native module rebuild**: `better-sqlite3-multiple-ciphers` must be compiled for Electron's Node version. The `postinstall` script handles this automatically via `electron-rebuild -f -w better-sqlite3-multiple-ciphers`. If you see `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION mismatch`, run:
```bash
npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers
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

## Data Storage — Encrypted SQLite (`better-sqlite3-multiple-ciphers`)

All persistent data lives in a single **SQLCipher-encrypted** SQLite database:
- **Mac**: `~/Library/Application Support/netcopilot/netcopilot.db`
- **Windows**: `%APPDATA%\netcopilot\netcopilot.db`

The database is encrypted with AES-256 (SQLCipher). The encryption key is:
1. Generated randomly (32 bytes) on first run by `src/main/dbKey.ts`
2. Encrypted with `safeStorage` (OS keychain) and saved to `netcopilot.key` in userData
3. Loaded and applied via `PRAGMA key = '...'` when the DB is opened

**First-run migration**: If an unencrypted DB already exists, `db.ts` opens it without a key then calls `PRAGMA rekey = '...'` to encrypt it in-place before saving the key file.

### Schema

| Table | Contents |
|---|---|
| `connections` | All connection profiles (full column-per-field schema) |
| `connection_groups` | Folder groups for organising connections |
| `ssh_keys` | Stored SSH public keys |
| `settings` | Key-value store for app settings AND encrypted credentials (prefix `cred:`) AND master password hash (key `masterPasswordHash`) |

### Key files
- `src/main/db.ts` — opens/initialises the DB, applies SQLCipher key, defines schema, row↔domain mappers, one-time JSON migration
- `src/main/dbKey.ts` — generates, saves, and loads the AES-256 SQLCipher key via safeStorage
- `src/main/store.ts` — IPC handlers that query/mutate SQLite
- `src/main/credentials.ts` — encrypted credentials in `settings` table under `cred:<key>`; uses `safeStorage.encryptString`
- `src/main/masterPassword.ts` — master password set/verify/clear handlers; hash stored encrypted under `masterPasswordHash`

### Migration (automatic, runs once)
On first launch, `db.ts` looks for old `config.json` in:
1. Current userData (`netcopilot/`)
2. `NetTerm/` (old app name)
3. `netterm/` (old app name lowercase)

Sets `settings.migrated_v1 = 'true'` so it never repeats.

### Row → Domain conversion notes
- `tags`, `startup_commands`, `serial_config` are stored as JSON text — use `safeJsonParse()` helper (never raw `JSON.parse`)
- `auto_reconnect` is stored as INTEGER 0/1 (SQLite has no BOOLEAN)
- `auth_type`, `group_id`, `ssh_key_id` use snake_case column names; camelCase in TypeScript
- `NULL` columns → `undefined` in domain objects (never empty string)

---

## Security Model

Three layers of security:

| Layer | File | Technology |
|---|---|---|
| DB encryption | `src/main/dbKey.ts` + `db.ts` | SQLCipher AES-256 via `better-sqlite3-multiple-ciphers` |
| Credential encryption | `src/main/credentials.ts` | Electron `safeStorage` → OS Keychain |
| Master password | `src/main/masterPassword.ts` | SHA-256 hash, timing-safe compare, stored encrypted |

**DevTools** are blocked in production:
- `devtools-opened` event closes them immediately
- `F12` and `CommandOrControl+Shift+I` global shortcuts are disabled

---

## IPC Layer (Preload Bridge)

`src/preload/index.ts` exposes `window.api` to the renderer via `contextBridge`. The renderer **never** uses Node APIs directly.

| Namespace | What it does |
|---|---|
| `window.api.ssh.*` | connect / send / resize / disconnect / onData / onClosed |
| `window.api.telnet.*` | connect / send / resize / disconnect / onData / onClosed |
| `window.api.serial.*` | listPorts / connect / send / disconnect / onData / onClosed / onError |
| `window.api.store.*` | CRUD for connections, groups, SSH keys, and key-value settings |
| `window.api.credentials.*` | save / get / delete encrypted passwords |
| `window.api.file.*` | export (save dialog) / import (open dialog) / selectFolder / getDefaultLogDir |
| `window.api.log.*` | start / startAt / append / stop session logs |
| `window.api.auth.*` | hasMasterPassword / setMasterPassword / verifyMasterPassword / clearMasterPassword |
| `window.api.appInfo` | versions + platform (read-only) |

`onData` / `onClosed` / `onError` return an **unsubscribe function** — always call it in a cleanup effect.

Main process IPC handlers live in:
- `src/main/ssh.ts` — ssh2 library, PTY shell, session batching (4ms flush), teardown via `teardownSession()`
- `src/main/telnet.ts` — raw `net.Socket`, manual IAC/NAWS negotiation, strips telnet commands before forwarding
- `src/main/serial.ts` — serialport library, `autoOpen: false` pattern
- `src/main/store.ts` — SQLite-backed CRUD via prepared statements
- `src/main/credentials.ts` — values encrypted with `safeStorage.encryptString` → base64
- `src/main/masterPassword.ts` — master password hashing and verification
- `src/main/fileDialog.ts` — `dialog.showSaveDialog` / `dialog.showOpenDialog` with null-safe window ref
- `src/main/logger.ts` — session logging with duplicate-path stream protection

Each protocol module keeps a `Map<sessionId, activeSession>` of live connections.

---

## Session Lifecycle

1. User double-clicks a connection (or uses Quick Connect) → `useAppStore.openSession(conn)` adds a `Session` (status: `connecting`) and sets it active
2. `TerminalTab` mounts → initialises xterm.js → calls `window.api.<proto>.connect()`
3. Main streams data back via batched IPC: `webContents.send('<proto>:data', sessionId, chunk)` (SSH batches at 4ms; renderer uses `requestAnimationFrame` flush)
4. `TerminalHighlighter.process(chunk)` applies per-device ANSI color → written to xterm
5. On close/error: status → `disconnected` / `error`; if `autoReconnect` is set, a timer fires `doConnect(true)`
6. On tab close: `closeSession()` removes session from Zustand; `TerminalTab` unmount calls `window.api.<proto>.disconnect()`

All sessions stay mounted in the DOM (absolute-positioned, `hidden` when inactive) so xterm state is preserved when switching tabs.

---

## App Startup Flow

```
App mounts
  → check auth:hasMasterPassword
      → true:  show <MasterPasswordLock> until verified
      → false: proceed
  → loadConnections / loadGroups / loadSshKeys / loadSettings
  → render main UI
```

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

### Critical: `saveConnection` preserves `createdAt`
When editing an existing connection, look up the existing record to preserve its `createdAt`:
```ts
const existing = connData.id ? get().connections.find((c) => c.id === connData.id) : undefined
const conn = { ...connData, id: connData.id || nanoid(), createdAt: existing?.createdAt ?? now, updatedAt: now }
```

### Critical: `saveConnection` / `saveGroup` / `saveSshKey` spread order
The generated `nanoid()` ID must come **after** the data spread so it is never overwritten by `undefined`:
```ts
// CORRECT
const conn = { ...connData, id: connData.id || nanoid(), createdAt: ..., updatedAt: now }
// WRONG — id gets overwritten with undefined!
const conn = { id: connData.id || nanoid(), ...connData }
```

### Group deletion
`deleteGroup` also ungrouped any connections belonging to the deleted group (sets `groupId = undefined` in both DB and Zustand). The Sidebar additionally uses a safety-net filter for orphaned connections.

---

## UI Layout

```
App
├── MasterPasswordLock        (shown on startup if master password is set)
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
└── SettingsDialog            (Appearance / Terminal / Connection / Logging / Security / About)
```

`GroupDialog` is rendered inline inside `Sidebar` (not at the App level).

---

## Design System

All colors are **CSS custom properties as HSL values** (no `hsl()` wrapper in the variable). Tailwind consumes them via `hsl(var(--token))` in `tailwind.config.js`. Defined in `src/renderer/src/assets/globals.css`.

**Color palette**: Near-black neutral dark backgrounds (80%), violet accent `#8B5CF6` (15%), glow effects (5%). Primary button color is violet; sidebar is slightly darker than the main background.

**Themes**: `:root` defines dark defaults. `html.light` class overrides them for light mode. Applied by `applyTheme()` in the store.

**Accent color**: `applyAccentColor(hex)` converts hex → HSL and sets `--primary` and `--ring` (plus sidebar variants) as inline styles on `document.documentElement`. Default accent is `#8b5cf6` (violet).

**Utility**: `src/renderer/src/lib/utils.ts` exports `cn(...classes)` = `twMerge(clsx(...))`.

**xterm.js**: terminal background `#0B0718`; selection highlight `#8b5cf640`. Toolbar uses `bg-background`.

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

Image imports (PNG/JPG/SVG) are declared in `src/renderer/src/types/images.d.ts`.

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
