# NetTerm

> A professional SSH, Telnet & Serial terminal client for network engineers — built with Electron

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Tech](https://img.shields.io/badge/Electron-React%2019-61DAFB)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is NetTerm?

NetTerm is an open-source desktop terminal application designed for network engineers and DevOps teams. It provides a fast, modern interface to connect to routers, switches, servers, and serial devices over **SSH**, **Telnet**, and **Serial** — all from one place.

Inspired by Termius, but open-source and built to be extended with AI capabilities.

---

## Features

| Feature | Description |
|---|---|
| **SSH** | Secure connections with password, SSH key, and key+passphrase auth |
| **Telnet** | Full Telnet with proper NAWS/ECHO negotiation and live window resize |
| **Serial Console** | Connect via serial port (RS-232, USB-to-Serial) with configurable baud rate, parity, flow control |
| **Multi-Tab** | Open multiple sessions simultaneously, each in its own tab |
| **Quick Connect** | Press ⌘K and type `user@host:port` to connect instantly |
| **Connection Manager** | Save connections with groups, colors, tags, notes, and per-connection settings |
| **Startup Commands** | Auto-run commands after connecting (one per line) |
| **Enable Password** | Cisco devices auto-enter privileged mode using the stored enable password |
| **Duplicate Connection** | Right-click any connection to duplicate it instantly |
| **Device Highlighting** | Syntax-colored output for Cisco IOS/IOS-XE/NX-OS/ASA, Juniper JunOS, Arista EOS, Palo Alto PAN-OS, FortiOS, Nokia SR-OS, Huawei VRP, MikroTik, F5 BIG-IP, HP ProCurve, Linux, Windows |
| **SSH Key Management** | Store and manage SSH public keys; use them in connections |
| **Session Logging** | Log terminal output to file — manual or auto-log on connect |
| **Terminal Search** | In-terminal search with regex and case-sensitivity (Ctrl+F / ⌘F) |
| **Settings** | Customize font, size, cursor, scrollback, theme, accent color, timeouts, default ports |
| **Hot-Reload Settings** | Terminal appearance changes apply instantly to open sessions |
| **Auto-Reconnect** | Reconnects automatically on disconnect with configurable delay |
| **Auto-Lock** | Lock the session after a configurable idle period |
| **Import / Export** | Backup and restore connections as JSON (credentials excluded) |
| **Secure Storage** | Passwords encrypted via OS keychain (`safeStorage`); SQLite database for all other data |
| **Resizable Sidebar** | Drag to resize the connection list |
| **macOS Native** | Full `hiddenInset` titlebar with native traffic light buttons |

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org) v18 or later
- npm v9 or later

### Installation

```bash
git clone https://github.com/AnasProgrammer2/netterm.git
cd netterm
npm install
```

> **Note — native module:** `better-sqlite3` must be compiled for Electron's Node version. The `postinstall` script handles this automatically. If you see `ERR_DLOPEN_FAILED`, run:
> ```bash
> npx @electron/rebuild -f -w better-sqlite3
> ```

### Run (Development Mode)

```bash
npm run dev
```

---

## Building

```bash
# macOS → DMG
npm run build:mac

# Windows → EXE installer
npm run build:win

# Linux → AppImage
npm run build:linux
```

Output files are placed in the `dist/` folder.

---

## Project Structure

```
src/
├── main/                   # Electron Main Process (Node.js)
│   ├── index.ts            # Window creation and IPC registration
│   ├── ssh.ts              # SSH engine (ssh2)
│   ├── telnet.ts           # Telnet engine (raw TCP + IAC negotiation)
│   ├── serial.ts           # Serial engine (serialport library)
│   ├── db.ts               # SQLite schema, migrations, row↔domain mappers
│   ├── store.ts            # IPC handlers for CRUD (better-sqlite3)
│   ├── credentials.ts      # Encrypted credential storage (safeStorage)
│   ├── fileDialog.ts       # Import / Export file dialogs
│   └── logger.ts           # Session file logging
│
├── preload/
│   └── index.ts            # Secure IPC bridge (contextBridge)
│
└── renderer/               # UI (React 19 + TypeScript + Tailwind)
    └── src/
        ├── App.tsx          # Root component, keyboard shortcuts, idle lock
        ├── store/           # Zustand state (connections, sessions, settings)
        ├── lib/
        │   ├── highlighter.ts   # Per-device ANSI syntax highlighter
        │   └── utils.ts         # cn() class merging utility
        ├── components/
        │   ├── TitleBar.tsx
        │   ├── WelcomeScreen.tsx
        │   ├── sidebar/
        │   │   ├── Sidebar.tsx
        │   │   ├── ConnectionContextMenu.tsx
        │   │   └── GroupDialog.tsx
        │   ├── terminal/
        │   │   ├── TerminalArea.tsx
        │   │   ├── TabBar.tsx
        │   │   └── TerminalTab.tsx     # xterm.js, connect/reconnect, logging
        │   └── dialogs/
        │       ├── ConnectionDialog.tsx  # Add / Edit connection (4 tabs)
        │       ├── QuickConnect.tsx      # ⌘K palette
        │       ├── SettingsDialog.tsx    # App settings
        │       ├── SSHKeyDialog.tsx      # SSH key management
        │       └── PasswordPrompt.tsx    # Runtime credential prompt
        └── types/
```

---

## How to Use

### Add a New Connection

1. Click **+** in the sidebar (or press ⌘K for a quick session)
2. Fill in **General**: name, host, port, protocol, device type, color, tags
3. Go to **Authentication**: username, password / SSH key / passphrase
4. Go to **Advanced**: startup commands, Cisco enable password, auto-reconnect settings
5. Save — the connection appears in the sidebar

### Quick Connect

Press **⌘K** (or **Ctrl+K** on Windows) and type:

```
admin@192.168.1.1:22
```

Or search for a saved connection by name, host, or tag.

### Startup Commands

In the **Advanced** tab of any connection, add commands to run automatically after connecting — one per line. Useful for entering `terminal length 0` or `set cli screen-length 0` right after login.

### Enable Password (Cisco)

Set the **Enable Password** in the **Advanced** tab. After login, NetTerm detects the user-mode prompt (`>`) and automatically sends `enable` followed by the password to enter privileged mode.

### Session Logging

Click the **Log** button in the terminal toolbar to start recording terminal output to a file. You can also enable **Auto-Log** in Settings to start logging automatically on every new connection.

### Multiple Sessions

Every connection opens a new **Tab** in the same window. All tabs stay mounted so switching between them is instant.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [Electron](https://www.electronjs.org) | Desktop framework (macOS, Windows, Linux) |
| [React 19](https://react.dev) + TypeScript | UI layer |
| [electron-vite](https://electron-vite.org) | Build tooling and HMR |
| [xterm.js](https://xtermjs.org) | Terminal emulator |
| [ssh2](https://github.com/mscdex/ssh2) | SSH library |
| [serialport](https://serialport.io) | Serial port access |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Local database |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [Zustand](https://zustand-demo.pmnd.rs) | State management |
| [Lucide React](https://lucide.dev) | Icons |

---

## Roadmap

- [ ] **AI Assistant** — log analysis, command suggestions, network troubleshooting
- [ ] **SFTP Browser** — browse and transfer files visually
- [ ] **Port Forwarding** — local, remote, and dynamic tunneling
- [ ] **Snippets** — save frequently used commands and run them with one click
- [ ] **Jump Host** — connect through a bastion/jump server

---

## License

MIT © 2026 NetTerm
