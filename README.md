# NetTerm

> SSH & Telnet client for routers, switches, and servers — built with Electron

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
![Tech](https://img.shields.io/badge/Electron-React-61DAFB)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is NetTerm?

NetTerm is an open-source desktop application designed for network engineers and DevOps teams. It provides a fast, modern interface to connect to routers, switches, and servers over **SSH** and **Telnet** — all from one place.

Inspired by Termius, but open-source and built to be extended with AI capabilities.

---

## Features

| Feature | Description |
|---|---|
| **SSH** | Secure connections via ssh2, supports password and SSH key auth |
| **Telnet** | Full Telnet support with proper negotiation (ECHO, NAWS) |
| **Multi-Tab** | Open multiple sessions simultaneously, each in its own tab |
| **Quick Connect** | Press ⌘K and type `user@host:port` to connect instantly |
| **Connection Manager** | Save connections with groups, colors, notes, and tags |
| **Device Types** | Built-in support for Cisco IOS/IOS-XE/NX-OS, Juniper, Arista, PAN-OS, Linux |
| **Secure Storage** | Passwords encrypted via OS keychain (Electron safeStorage) |
| **Terminal** | xterm.js with JetBrains Mono, 256 colors, 5000-line scrollback |
| **Resizable Sidebar** | Drag to resize the connection list sidebar |
| **macOS Native** | Full support for native titlebar and traffic lights on macOS |

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

### Run (Development Mode)

```bash
npm run dev
```

---

## Building

```bash
# macOS → produces a DMG
npm run build:mac

# Windows → produces an EXE installer
npm run build:win

# Linux → produces an AppImage
npm run build:linux
```

Output files are placed in the `dist/` folder.

---

## Project Structure

```
src/
├── main/                   # Electron Main Process (Node.js)
│   ├── index.ts            # Window creation and app setup
│   ├── ssh.ts              # SSH engine (ssh2 library)
│   ├── telnet.ts           # Telnet engine (raw TCP sockets)
│   ├── store.ts            # Connection database (electron-store)
│   └── credentials.ts      # Password encryption (safeStorage)
│
├── preload/
│   └── index.ts            # Secure IPC bridge between Main and UI
│
└── renderer/               # User Interface (React + TypeScript)
    └── src/
        ├── App.tsx
        ├── store/          # State management (Zustand)
        ├── components/
        │   ├── TitleBar.tsx
        │   ├── WelcomeScreen.tsx
        │   ├── sidebar/
        │   │   ├── Sidebar.tsx
        │   │   └── ConnectionContextMenu.tsx
        │   ├── terminal/
        │   │   ├── TerminalArea.tsx
        │   │   ├── TabBar.tsx
        │   │   └── TerminalTab.tsx     # xterm.js integration
        │   └── dialogs/
        │       ├── ConnectionDialog.tsx  # Add / Edit connection
        │       └── QuickConnect.tsx      # ⌘K palette
        └── types/
```

---

## How to Use

### Add a New Connection

1. Click **+** in the sidebar
2. Enter the name, host, protocol (SSH/Telnet), and username
3. Choose the device type (Cisco, Juniper, Linux, etc.)
4. Save — the connection appears in the list

### Quick Connect

Press **⌘K** (or **Ctrl+K** on Windows) and type something like:

```
admin@192.168.1.1:22
```

Or search for a saved connection by name or IP address.

### Multiple Sessions

Every time you connect, a new **Tab** opens in the same window — keeping all your sessions organized in one place.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [Electron](https://www.electronjs.org) | Desktop framework (macOS + Windows) |
| [React](https://react.dev) + TypeScript | UI layer |
| [electron-vite](https://electron-vite.org) | Build tooling and HMR |
| [xterm.js](https://xtermjs.org) | Terminal emulator |
| [ssh2](https://github.com/mscdex/ssh2) | SSH library |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [Zustand](https://zustand-demo.pmnd.rs) | State management |
| [electron-store](https://github.com/sindresorhus/electron-store) | Persistent connection storage |

---

## Roadmap

- [ ] **AI Assistant** — log analysis, command suggestions, network troubleshooting
- [ ] **SFTP Browser** — browse and transfer files visually
- [ ] **Port Forwarding** — local, remote, and dynamic tunneling
- [ ] **Snippets** — save frequently used commands and run them with one click
- [ ] **Serial Console** — connect via serial port
- [ ] **Jump Host** — connect through a bastion/jump server

---

## License

MIT © 2026 NetTerm
