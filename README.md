<h1 align="center">NetCopilot</h1>

<p align="center">
  <strong>The first AI agent built for network engineers.</strong>
</p>

<!-- Status -->
<p align="center">
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases/latest"><img src="https://img.shields.io/github/v/release/AnasProgrammer2/netcopilot?style=for-the-badge&color=8B5CF6&label=Latest&labelColor=1a1625" alt="Latest Release" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases"><img src="https://img.shields.io/github/downloads/AnasProgrammer2/netcopilot/total?style=for-the-badge&color=22c55e&label=Downloads&labelColor=1a1625" alt="Downloads" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/actions"><img src="https://img.shields.io/github/actions/workflow/status/AnasProgrammer2/netcopilot/release.yml?style=for-the-badge&label=Build&labelColor=1a1625" alt="Build" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-BSL--1.1-3b82f6?style=for-the-badge&labelColor=1a1625" alt="License" /></a>
</p>

<!-- Community -->
<p align="center">
  <a href="https://github.com/AnasProgrammer2/netcopilot/stargazers"><img src="https://img.shields.io/github/stars/AnasProgrammer2/netcopilot?style=flat-square&color=f59e0b&logo=github&logoColor=white&labelColor=1a1625" alt="Stars" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/network/members"><img src="https://img.shields.io/github/forks/AnasProgrammer2/netcopilot?style=flat-square&color=06b6d4&logo=git&logoColor=white&labelColor=1a1625" alt="Forks" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/graphs/contributors"><img src="https://img.shields.io/github/contributors/AnasProgrammer2/netcopilot?style=flat-square&color=8B5CF6&labelColor=1a1625" alt="Contributors" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/issues"><img src="https://img.shields.io/github/issues/AnasProgrammer2/netcopilot?style=flat-square&color=ef4444&labelColor=1a1625" alt="Open Issues" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/commits/main"><img src="https://img.shields.io/github/last-commit/AnasProgrammer2/netcopilot?style=flat-square&color=22c55e&logo=git&logoColor=white&labelColor=1a1625" alt="Last Commit" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot"><img src="https://hits.sh/github.com/AnasProgrammer2/netcopilot.svg?style=flat-square&label=visits&color=8B5CF6&labelColor=1a1625" alt="Visits" /></a>
</p>

<!-- Platforms & Stack -->
<p align="center">
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%26%20Intel-000000?style=flat-square&logo=apple&logoColor=white&labelColor=1a1625" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?style=flat-square&logo=windows&logoColor=white&labelColor=1a1625" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-AppImage-FCC624?style=flat-square&logo=linux&logoColor=black&labelColor=1a1625" alt="Linux" />
  <img src="https://img.shields.io/badge/Electron-32-47848F?style=flat-square&logo=electron&logoColor=white&labelColor=1a1625" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black&labelColor=1a1625" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=1a1625" alt="TypeScript" />
</p>

<p align="center">
  <a href="#download">Download</a> · <a href="#aria--the-ai-agent">ARIA Agent</a> · <a href="#features">Features</a> · <a href="#security">Security</a> · <a href="#getting-started">Dev Setup</a>
</p>

---

NetCopilot is not just a terminal — it is an **AI agent** that connects to your network devices, understands your infrastructure, and acts autonomously to diagnose, troubleshoot, and fix problems.

At its core is **ARIA** (Autonomous Real-time Infrastructure Agent): a real agentic system that plans investigations, executes commands, reads output, and delivers structured recommendations — all without leaving your terminal. You describe the problem; ARIA handles the rest.

### See It in Action

https://github.com/user-attachments/assets/1be0a1d5-f7a2-45c8-b667-1f49f356d0f3

---

## Download

Pre-built binaries for all platforms — no build step required.

<p align="center">
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-8B5CF6?style=for-the-badge&logo=github" alt="Download Latest Release" />
  </a>
</p>

| Platform | File | Architecture | Code Signing |
|:--------:|:----:|:------------:|:------------:|
| macOS | `.dmg` | Apple Silicon (arm64) / Intel (x64) | ✅ Signed & Notarized by Apple |
| Windows | `.exe` installer | x64 | ⏳ Pending (see note below) |
| Linux | `.AppImage` / `.deb` | x64 | — (not required) |

> **Windows users:** the current Windows build is unsigned, so SmartScreen may display a "Windows protected your PC" warning. Click **More info → Run anyway** to continue. Free Windows code signing for NetCopilot has been requested from the [SignPath Foundation](https://signpath.org/) — once approved, all future Windows releases will be signed by [SignPath.io](https://signpath.io/) with a certificate issued by the SignPath Foundation.

---

## ARIA — The AI Agent

ARIA is the core of NetCopilot. It is not a chatbot — it is a **real agentic system** built specifically for network and infrastructure engineers.

### How It Works

When you describe a problem, ARIA doesn't just answer — it **acts**:

```
You: "There's a BGP flapping issue on this router"

ARIA:
  Plan → [Check BGP summary] [Check neighbor state] [Check route table] [Check logs]
  ↓ show ip bgp summary          ✓
  ↓ show ip bgp neighbors        ✓
  ↓ show ip route bgp            ✓
  ↓ show logging | include BGP   ✓

  Analysis: Neighbor 10.0.0.1 is flapping due to hold-timer expiry.
  MTU mismatch detected on Gi0/0/1. Recommended fix: ...
```

1. **Plans** — generates a structured investigation plan before touching anything
2. **Executes** — runs commands automatically, one after another
3. **Analyzes** — reads all output collectively, not per-command
4. **Delivers** — complete, structured diagnosis with actionable recommendations

### Per-Platform Mastery

ARIA carries deep, vendor-specific knowledge for every supported platform — not generic advice. Each device type has a dedicated playbook:

- **Signature commands** — the exact commands a senior engineer would run first
- **Common root causes** — the failure modes that actually happen in production
- **Diagnostic flow** — the correct order to isolate the failing layer

> On Cisco ASA → `packet-tracer`. On FortiGate → `diagnose debug flow`. On Palo Alto → `test security-policy-match`. These are the expert moves.

### Key Capabilities

| Capability | Description |
|:---|:---|
| **Batch Execution** | 2–5 independent commands in a single round-trip |
| **Structured Context** | Every message includes parsed hostname, prompt, last 5 commands + outputs |
| **Auto Device Detection** | Identifies device type from live terminal output before responding |
| **Smart Retry** | Auto-retries with vendor-appropriate syntax when output is empty |
| **Conversation Compression** | Summarizes older messages intelligently while preserving intent |
| **L4 Planning Mode** | Visual investigation plan card with live step-by-step progress |
| **Multi-Session Intelligence** | Aware of all open sessions; routes commands to correct device |
| **Session Summary** | Delivers a recap of all commands when closing a tab |

### Permission & Safety

| Mode | Description |
|:---|:---|
| **Troubleshoot** | Read-only diagnostics (`show`, `display`, `ping`, `traceroute`) — no config changes |
| **Full Access** | Any command including configuration — ARIA warns before destructive operations |

| Control | Behavior |
|:---|:---|
| **Ask** | Shows every command and waits for approval |
| **Auto** | Executes all commands immediately |
| **Blocked Patterns** | `reload`, `rm -rf`, `write erase`, etc. — always enforced regardless of mode |

### Auto Watch & Error Alert Badge

When enabled, ARIA silently monitors your terminal output in real time. If it detects errors, misconfigurations, or anomalies — it alerts you immediately without interrupting your work.

Even when the AI panel is **closed**, a pulsing red badge appears on the ARIA button the moment an error pattern is detected (`%Error`, `command not found`, `connection refused`, etc.). Click it to open ARIA and analyze the issue instantly.

### ARIA Setup

ARIA is **free during the beta period** — no payment required:

1. Go to [netcopilot.app/register](https://netcopilot.app/register) and get your free key
2. Open the app → **Settings → ARIA**
3. Paste your license key — done

Your license key is stored in the **OS keychain** — never on disk or in any file.

---

## Features

### Supported Protocols

| Protocol | Details |
|:---|:---|
| **SSH** | Password, SSH key, key+passphrase, Cisco Enable Password |
| **Telnet** | Full NAWS negotiation, automatic terminal resize |
| **Serial** | RS-232 / USB-to-Serial, configurable baud/parity/data bits/stop bits/flow control |

### Supported Devices

| Category | Platforms |
|:---|:---|
| **Auto-detect** | Automatically identifies device type on first login |
| Cisco | IOS, IOS-XE, NX-OS, ASA |
| Routing & Switching | Juniper JunOS, Arista EOS, Nokia SR-OS, Huawei VRP, MikroTik RouterOS, HP/Aruba ProCurve |
| Firewalls | Palo Alto PAN-OS, Fortinet FortiOS |
| Load Balancers | F5 BIG-IP TMOS |
| Servers | Linux / Unix, Windows Server |
| Generic | Any SSH/Telnet/Serial device |

### SFTP Browser

- Visual file manager that opens as a dedicated tab alongside your terminal sessions
- Browse remote directories, upload, download, rename, delete files and folders
- Create new directories with a single click
- Access via right-click context menu or the 3-dot (⋯) hover menu on any SSH connection
- Progress indicator for file transfers

### Connection Health Monitor

- Ping dashboard on the home screen — check latency for all connections at a glance
- Color-coded latency badges: green (fast) → yellow → orange (slow) → red (offline)
- Refresh button to re-scan all connections on demand
- Non-blocking — runs in the background while you work

### Terminal

- In-terminal search with regex and case-sensitivity (`⌘F`)
- Result counter shows `n / total` matches as you type; red indicator when nothing is found
- Right-click context menu (Copy, Paste, Search, Clear)
- Configurable font family, size, line height, cursor style, and scrollback
- Session logging with ANSI stripping and optional timestamps
- Split view — two sessions side by side
- Auto-reconnect on session drop
- Connection overlays (spinner, disconnect, error states)

### Networking

- **Port Forwarding** — local port forwarding rules per connection with live status
- **SOCKS Proxy** — dynamic port forwarding (SOCKS4/SOCKS5) through SSH
- **Jump Host / Bastion** — connect through intermediate servers transparently

### Connection Management

- Organized library with groups, colors, tags, and notes
- **Smart sidebar sorting** — active sessions always float to the top; default sort by last connected so your most-used hosts are always first
- Tags filter from the HomeScreen pills bar
- **Quick Connect** (`⌘K`) — instant session from `user@host:port` without saving
- Startup commands that run automatically after connecting
- SSH key manager with reusable named keys
- Full import / export as JSON
- Import directly from `~/.ssh/config`

### Keyboard Shortcuts

| Shortcut | Action |
|:--------:|:------:|
| `⌘K` / `Ctrl+K` | Quick Connect |
| `⌘T` / `Ctrl+T` | New tab |
| `⌘W` / `Ctrl+W` | Close active tab |
| `⌘,` | Settings |
| `⌘D` / `Ctrl+D` | Toggle Split View |
| `⌘⇧A` | Toggle ARIA panel |
| `⌘1–9` | Switch to tab N |
| `⌘F` | Search in terminal |

---

## Security

| Layer | Protects | Technology |
|:---|:---|:---|
| **Encrypted Database** | All connections, settings, configuration | SQLCipher (AES-256) |
| **OS Keychain** | Passwords, SSH keys, license keys, DB encryption key | Electron safeStorage |
| **Master Password** | App-level lock on startup | scrypt + timing-safe comparison |
| **Command Blacklist** | Dangerous command execution | Code-level enforcement, always-on |

Credentials are **never stored in plaintext**. The database encryption key is generated on first launch, stored in the OS keychain, and never written to disk directly.

---

## Who Is It For?

- **Network engineers** working daily with Cisco, Juniper, Arista, Palo Alto, and similar platforms
- **DevOps and infrastructure teams** managing Linux and Windows servers remotely
- **NOC teams** that need fast diagnostics and a clean, modern interface
- **Security teams** performing network audits and configuration reviews
- Anyone who spends serious time in SSH sessions and wants real AI assistance

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- npm v9+
- Git

### Setup

```bash
git clone https://github.com/AnasProgrammer2/netcopilot.git
cd netcopilot
npm install
npm run dev
```

The app launches immediately with hot-reload enabled.

### Build

```bash
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

Output files in `dist/`.

---

## Tech Stack

| Layer | Technology |
|:---|:---|
| Framework | Electron 31 + electron-vite |
| Frontend | React 19, Tailwind CSS, Zustand |
| Terminal | xterm.js 6 |
| Database | SQLite (SQLCipher AES-256) via better-sqlite3 |
| AI Backend | NetCopilot API |
| Protocols | ssh2, serialport, raw TCP (Telnet) |

---

## Roadmap

### Released
- [x] **SFTP Browser** — visual file transfer (browse, upload, download, rename, delete, mkdir) via right-click or sidebar context menu
- [x] **ARIA Error Alert Badge** — pulsing red badge on the ARIA button when an error is detected in the terminal, even while the AI panel is closed
- [x] **Session Summary Dialog** — closing a tab with AI activity shows a full summary of commands run, stats, and ARIA's last response
- [x] **Thinking… / Running… indicators** — live feedback while ARIA is waiting for the first token or executing between tool calls
- [x] **Port Forwarding** — local, remote, and dynamic (SOCKS) tunnels per connection with live status
- [x] **Connection Health Monitor** — ping dashboard with live latency badges directly on the home screen
- [x] **Smart sidebar sorting** — open sessions always on top, sorted by last connected
- [x] **Terminal search counter** — live `n / total` result count with no-match indicator
---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the **Business Source License 1.1 (BSL-1.1)**.

| | |
|:---|:---|
| **View & learn** | Anyone can read the source code |
| **Personal use** | Free — unlimited |
| **Academic / research** | Free |
| **Internal evaluation** | Free |
| **Commercial use** | Requires a license — [support@netcopilot.app](mailto:support@netcopilot.app) |
| **Change Date** | January 1, 2029 → Apache 2.0 |

> **Why BSL?** The source code is fully visible so you can verify NetCopilot never exfiltrates your credentials, passwords, or SSH keys. BSL ensures no one can take this codebase and launch a competing commercial product without a license.

See the [LICENSE](./LICENSE) file for full details.

---

## Acknowledgments

- **macOS code signing & notarization** — courtesy of the [Apple Developer Program](https://developer.apple.com).
- **Windows code signing** — pending free OSS code signing from the [SignPath Foundation](https://signpath.org/), with signing services provided by [SignPath.io](https://signpath.io/).
- Built on the shoulders of giants: [Electron](https://www.electronjs.org/), [React](https://react.dev/), [xterm.js](https://xtermjs.org/), [ssh2](https://github.com/mscdex/ssh2), [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers), and the [Anthropic Claude](https://www.anthropic.com/) API.

---

<p align="center">
  <sub>Built with purpose for the engineers who keep networks running.</sub>
</p>
