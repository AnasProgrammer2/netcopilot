# NetCopilot

> **Your AI-Native Network Copilot** — An AI-powered SSH, Telnet & Serial terminal client for network engineers, built with Electron

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Tech](https://img.shields.io/badge/Electron-React%2019-61DAFB)
![AI](https://img.shields.io/badge/AI-Claude%20Sonnet%204.5-8B5CF6)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is NetCopilot?

NetCopilot is an open-source desktop terminal application designed for network engineers and DevOps teams. It provides a fast, modern interface to connect to routers, switches, servers, and serial devices over **SSH**, **Telnet**, and **Serial** — with a **real AI agent** built in that understands your device, analyzes output in real time, executes diagnostic commands, and helps you troubleshoot issues without leaving the terminal.

Inspired by Termius, but open-source, AI-native, and fully encrypted.

---

## Features

### Terminal & Connectivity

| Feature | Description |
|---|---|
| **SSH** | Secure connections with password, SSH key, and key+passphrase auth |
| **Telnet** | Full Telnet with proper NAWS/ECHO negotiation and live window resize |
| **Serial Console** | Connect via serial port (RS-232, USB-to-Serial) with configurable baud rate, parity, flow control |
| **Multi-Tab** | Open multiple sessions simultaneously, each in its own tab |
| **Quick Connect** | Press ⌘K / Ctrl+K and type `user@host:port` to connect instantly |
| **Connection Manager** | Save connections with groups, colors, tags, notes, and per-connection settings |
| **Startup Commands** | Auto-run commands after connecting (one per line) |
| **Enable Password** | Cisco devices auto-enter privileged mode using the stored enable password |
| **Duplicate Connection** | Right-click any connection to duplicate it instantly |
| **Device Highlighting** | Syntax-colored output for Cisco IOS/IOS-XE/NX-OS/ASA, Juniper JunOS, Arista EOS, Palo Alto PAN-OS, FortiOS, Nokia SR-OS, Huawei VRP, MikroTik, F5 BIG-IP, HP ProCurve, Linux, Windows |
| **SSH Key Management** | Store and manage SSH public keys; use them in connections |
| **Session Logging** | Log terminal output to file — manual or auto-log on connect |
| **Terminal Search** | In-terminal search with regex and case-sensitivity (Ctrl+F / ⌘F) |
| **Auto-Reconnect** | Reconnects automatically on disconnect with configurable delay |

### AI Copilot

| Feature | Description |
|---|---|
| **AI Agent** | Powered by Claude Sonnet 4.5 — a real agentic loop that runs multiple commands in sequence to diagnose issues |
| **Device Awareness** | AI knows your device type (Cisco, Juniper, Linux, etc.), host, protocol, and permission mode before every conversation |
| **Troubleshoot Mode** | Read-only mode — AI can only run display/diagnostic commands (`show`, `ping`, `traceroute`, `ls`, etc.) |
| **Full Access Mode** | AI can run any command including configuration changes, with warnings before destructive operations |
| **Auto Watch** | Proactively analyzes terminal output in real time and alerts you to errors, anomalies, or misconfigurations |
| **Command Approval** | Choose: ask before each command, auto-approve all, or use a blacklist to block specific patterns |
| **Per-Session Blacklist** | Maintain a per-conversation blocked command list with a default safe set (e.g. `reload`, `rm -rf`, `shutdown`) |
| **Markdown Rendering** | AI responses render with full Markdown — code blocks, tables, lists, and inline highlighting |
| **Resizable Panel** | Drag to resize the AI panel; close and reopen without losing context |

### Security & Settings

| Feature | Description |
|---|---|
| **Encrypted Database** | Full SQLite encryption via SQLCipher (AES-256) — key stored in OS keychain |
| **Secure Credentials** | Passwords encrypted via OS keychain (`safeStorage`) |
| **Master Password** | Optional startup password — required every time the app opens |
| **Auto-Lock** | Lock the session after a configurable idle period |
| **Import / Export** | Backup and restore connections as JSON (credentials excluded) |
| **Hot-Reload Settings** | Terminal appearance changes apply instantly to open sessions |
| **Resizable Sidebar** | Drag to resize the connection list |
| **macOS Native** | Full `hiddenInset` titlebar with native traffic light buttons |

---

## AI Copilot — How It Works

NetCopilot's AI is a **real agentic loop**, not a simple chatbot:

```
You: "There's a BGP issue on this router"

AI thinks → runs: show ip bgp summary
AI analyzes → runs: show ip route bgp
AI analyzes → runs: ping 8.8.8.8 source lo0
AI analyzes → gives you a complete diagnosis with fix recommendations
```

### Permission Modes

| Mode | What AI can do |
|---|---|
| **Troubleshoot** | Read-only — `show`, `display`, `ping`, `traceroute`, `ls`, `ps`, `df`, etc. No config changes |
| **Full Access** | Any command including configuration changes. AI warns before destructive operations |

### Command Execution Approval

| Option | Behavior |
|---|---|
| **Ask** | Shows each command with a Run / Skip button before execution |
| **Auto** | Executes all commands automatically without prompting |
| **Blacklist** | Auto-approves everything except commands matching blocked patterns |

### Auto Watch

When enabled, AI silently monitors your terminal output. If it detects errors, warnings, anomalies, or misconfigurations, it briefly notifies you — without interrupting your workflow. Toggle it per conversation with the 👁 button in the input toolbar.

---

## Security

NetCopilot uses a three-layer security model:

| Layer | What it protects | Technology |
|---|---|---|
| **SQLCipher (AES-256)** | Entire database (IPs, usernames, settings) | `better-sqlite3-multiple-ciphers` |
| **OS Keychain** | Passwords, API keys, and DB encryption key | Electron `safeStorage` |
| **Master Password** | App access (startup lock) | scrypt hash + timing-safe compare |

The database key is randomly generated on first run, encrypted with the OS keychain, and stored in `netcopilot.key`. Even if someone copies both the `.db` and `.key` files, they cannot decrypt without access to the original OS keychain.

The AI API key is stored using the same OS keychain encryption — it never touches disk in plaintext.

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org) v18 or later
- npm v9 or later
- An [Anthropic API key](https://console.anthropic.com) (for AI Copilot)

### Installation

```bash
git clone https://github.com/AnasProgrammer2/netcopilot.git
cd netcopilot
npm install
```

> **Note — native module rebuild**: `better-sqlite3-multiple-ciphers` must be compiled for Electron's Node version. The `postinstall` script handles this automatically. If you see `ERR_DLOPEN_FAILED`, run:
> ```bash
> npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers
> ```

### Run (Development Mode)

```bash
npm run dev
```

### Configure AI Copilot

1. Open **Settings → AI**
2. Paste your [Anthropic API key](https://console.anthropic.com)
3. Click **Test** to verify the key works
4. Set your default Agent Mode (Troubleshoot / Full Access)
5. Click the **AI** button in the tab bar to open the Copilot panel

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
│   ├── index.ts            # Window creation, IPC registration, DevTools lock
│   ├── ai.ts               # AI agent loop (Anthropic streaming, tool execution)
│   ├── aiDefaults.ts       # Default command blacklist for network devices
│   ├── ssh.ts              # SSH engine (ssh2) — session batching, teardown
│   ├── telnet.ts           # Telnet engine (raw TCP + IAC/NAWS negotiation)
│   ├── serial.ts           # Serial engine (serialport library)
│   ├── db.ts               # SQLite schema, migrations, row↔domain mappers
│   ├── dbKey.ts            # SQLCipher key generation + OS keychain storage
│   ├── store.ts            # IPC handlers for CRUD (better-sqlite3-multiple-ciphers)
│   ├── credentials.ts      # Encrypted credential storage (safeStorage)
│   ├── masterPassword.ts   # Master password set/verify/clear handlers
│   ├── fileDialog.ts       # Import / Export file dialogs
│   └── logger.ts           # Session file logging
│
├── preload/
│   └── index.ts            # Secure IPC bridge (contextBridge) — includes AI API
│
└── renderer/               # UI (React 19 + TypeScript + Tailwind)
    └── src/
        ├── App.tsx              # Root — master password check, auto-lock, shortcuts
        ├── store/               # Zustand state (connections, sessions, AI, settings)
        ├── lib/
        │   ├── highlighter.ts   # Per-device ANSI syntax highlighter
        │   ├── terminalRegistry.ts  # Global xterm.js instance registry for AI access
        │   └── utils.ts         # cn() class merging utility
        ├── components/
        │   ├── ai/
        │   │   ├── AiPanel.tsx        # AI Copilot panel (chat, toolbar, approval)
        │   │   ├── AiMessage.tsx      # Message renderer with Markdown support
        │   │   └── AiCommandBlock.tsx # Command execution UI with Run/Skip buttons
        │   ├── terminal/
        │   │   ├── TerminalArea.tsx   # Layout: terminal + resizable AI panel
        │   │   ├── TabBar.tsx         # Tab bar with AI Copilot toggle button
        │   │   └── TerminalTab.tsx    # xterm.js, connect/reconnect, auto-watch watcher
        │   ├── sidebar/
        │   └── dialogs/
        │       ├── SettingsDialog.tsx  # App settings + AI configuration panel
        │       └── ...
        └── types/
```

---

## How to Use

### Add a Connection

1. Click **+** in the sidebar (or press ⌘K for a quick session)
2. Fill in **General**: name, host, port, protocol, device type, color, tags
3. Go to **Authentication**: username, password / SSH key / passphrase
4. Go to **Advanced**: startup commands, Cisco enable password, auto-reconnect settings
5. Save — the connection appears in the sidebar; double-click to connect

### Use AI Copilot

1. Connect to any device
2. Click the **AI** button in the top-right of the tab bar
3. The AI Copilot panel opens on the right — it already knows your device type and connection details
4. Ask anything: `"Why is BGP down?"`, `"Check disk usage"`, `"Show me what's using port 443"`
5. The AI will run the needed commands and give you a diagnosis

**Toolbar controls (inside the input box):**
- **Troubleshoot / Full Access** — switch permission mode per conversation
- **Ask / Auto / Blacklist** — control command execution approval
- **Block (N)** — view and edit the per-session command blacklist
- **👁** — toggle Auto Watch on/off

### Quick Connect

Press **⌘K** (or **Ctrl+K** on Windows) and type:

```
admin@192.168.1.1:22
```

Or search for a saved connection by name, host, or tag.

### Startup Commands

In the **Advanced** tab of any connection, add commands to run automatically after connecting — one per line. Useful for `terminal length 0` or `set cli screen-length 0`.

### Session Logging

Click the **Log** button in the terminal toolbar to start recording output to a file. Enable **Auto-Log** in Settings to log all sessions automatically.

### Master Password

Go to **Settings → Security → Master Password** and click **Set Password**. From the next launch, NetCopilot will show a lock screen before loading any data.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [Electron](https://www.electronjs.org) | Desktop framework (macOS, Windows, Linux) |
| [React 19](https://react.dev) + TypeScript | UI layer |
| [electron-vite](https://electron-vite.org) | Build tooling and HMR |
| [xterm.js](https://xtermjs.org) | Terminal emulator |
| [Anthropic Claude Sonnet 4.5](https://anthropic.com) | AI agent — real-time network analysis and command execution |
| [ssh2](https://github.com/mscdex/ssh2) | SSH library |
| [serialport](https://serialport.io) | Serial port access |
| [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers) | Encrypted SQLite (SQLCipher AES-256) |
| [Tailwind CSS](https://tailwindcss.com) | Styling |
| [Zustand](https://zustand-demo.pmnd.rs) | State management |
| [react-markdown](https://github.com/remarkjs/react-markdown) | Markdown rendering for AI responses |
| [Lucide React](https://lucide.dev) | Icons |

---

## Roadmap

- [x] **AI Copilot** — agentic loop, command execution, auto-watch, per-session blacklist
- [ ] **SFTP Browser** — browse and transfer files visually
- [ ] **Port Forwarding** — local, remote, and dynamic tunneling
- [ ] **Snippets** — save frequently used commands and run them with one click
- [ ] **Jump Host** — connect through a bastion/jump server

---

## License

MIT © 2026 NetCopilot
