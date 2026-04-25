<p align="center">
  <img src="https://github.com/user-attachments/assets/1c8ef1f9-525b-489c-a8f3-9ce75d878abd" alt="NetCopilot" width="600" />
</p>



https://github.com/user-attachments/assets/1be0a1d5-f7a2-45c8-b667-1f49f356d0f3


<h1 align="center">NetCopilot</h1>

<p align="center">
  <strong>The first AI agent built for network engineers.</strong>
</p>

<p align="center">
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases/latest"><img src="https://img.shields.io/github/v/release/AnasProgrammer2/netcopilot?style=flat-square&color=8B5CF6&label=latest" alt="Latest Release" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases"><img src="https://img.shields.io/github/downloads/AnasProgrammer2/netcopilot/total?style=flat-square&color=22c55e&label=downloads" alt="Downloads" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot"><img src="https://img.shields.io/github/stars/AnasProgrammer2/netcopilot?style=flat-square&color=f59e0b" alt="Stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-BSL--1.1-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/AnasProgrammer2/netcopilot/actions"><img src="https://img.shields.io/github/actions/workflow/status/AnasProgrammer2/netcopilot/release.yml?style=flat-square&label=build" alt="Build" /></a>
</p>

<p align="center">
  <a href="#download">Download</a> · <a href="#aria--the-ai-agent">ARIA Agent</a> · <a href="#features">Features</a> · <a href="#security">Security</a> · <a href="#getting-started">Dev Setup</a>
</p>

---

NetCopilot is not just a terminal — it is an **AI agent** that connects to your network devices, understands your infrastructure, and acts autonomously to diagnose, troubleshoot, and fix problems.

At its core is **ARIA** (Autonomous Real-time Infrastructure Agent): a real agentic system that plans investigations, executes commands, reads output, and delivers structured recommendations — all without leaving your terminal. You describe the problem; ARIA handles the rest.

---

## Download

Pre-built binaries for all platforms — no build step required.

<p align="center">
  <a href="https://github.com/AnasProgrammer2/netcopilot/releases/latest">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-8B5CF6?style=for-the-badge&logo=github" alt="Download Latest Release" />
  </a>
</p>

| Platform | File | Architecture |
|:--------:|:----:|:------------:|
| macOS | `.dmg` | Apple Silicon (arm64) / Intel (x64) |
| Windows | `.exe` installer | x64 |
| Linux | `.AppImage` / `.deb` | x64 |

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

### Auto Watch

When enabled, ARIA silently monitors your terminal output in real time. If it detects errors, misconfigurations, or anomalies — it alerts you immediately without interrupting your work.

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

### Terminal

- In-terminal search with regex and case-sensitivity (`⌘F`)
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
- Tags filter from the HomeScreen pills bar
- **Quick Connect** (`⌘K`) — instant session from `user@host:port` without saving
- Startup commands that run automatically after connecting
- SSH key manager with reusable named keys
- Full import / export as JSON

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

- [ ] SFTP browser for visual file transfer
- [ ] Command snippets library
- [ ] Persistent ARIA memory across sessions
- [ ] Network topology map from ARIA discoveries
- [ ] Config diff (running vs startup / device vs device)
- [ ] Team collaboration — shared connection libraries

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

<p align="center">
  <sub>Built with purpose for the engineers who keep networks running.</sub>
</p>
