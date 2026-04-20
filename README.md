# NetCopilot
<img width="600" alt="NetCopilot — AI-Native Network Terminal" src="https://github.com/user-attachments/assets/1c8ef1f9-525b-489c-a8f3-9ce75d878abd" />



**Your AI-Native Network Copilot**

NetCopilot is a professional desktop terminal built for network engineers. It combines SSH, Telnet, and Serial console access with **ARIA** — an embedded AI agent that understands your infrastructure, executes commands autonomously, and delivers real diagnostic intelligence without ever leaving your terminal.

---

## Download

Pre-built binaries for macOS, Windows, and Linux are available on the [Releases](https://github.com/AnasProgrammer2/netcopilot/releases) page — no build step required.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `.dmg` (arm64) |
| macOS (Intel) | `.dmg` (x64) |
| Windows | `.exe` installer |
| Linux | `.AppImage` or `.deb` |

---

## Getting Started (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- npm v9 or later
- Git

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/AnasProgrammer2/netcopilot.git
cd netcopilot

# 2. Install dependencies
npm install

# 3. Start in development mode
npm run dev
```

The app will launch immediately. Hot-reload is enabled for renderer changes.

### Building a Release

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Output files will be in the `dist/` folder.

> **Note:** macOS builds are unsigned by default. If you see a security warning, right-click the `.dmg` and choose Open.

### ARIA Setup (Required for AI features)

ARIA requires an [Anthropic API key](https://console.anthropic.com/):

1. Open the app → Settings → ARIA
2. Paste your API key
3. Click **Test Connection** to verify
4. Choose your preferred model (Sonnet, Opus, or Haiku)

Your API key is stored in the **OS keychain** — never on disk or in any file.

---

## ARIA — The AI Agent

ARIA is the core of NetCopilot. It is not a chatbot. It is a **real agentic system** built specifically for network and infrastructure engineers.

### How ARIA Works

When you describe a problem, ARIA does not just answer — it acts:

1. **Plans** — generates a structured investigation plan before touching anything
2. **Executes** — runs the commands it needs, one after another, automatically
3. **Analyzes** — reads all output collectively, not per-command
4. **Delivers** — gives you a complete, structured diagnosis with actionable recommendations

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

### L4 Planning Mode

For complex problems, ARIA generates a **visual investigation plan card** showing:

- The objective of the investigation
- Each diagnostic step with live status — pending / active / completed
- Real-time progress as commands execute

You see exactly what ARIA is doing and why, before any command runs.

### Multi-Session Intelligence

ARIA is aware of **all open terminal sessions simultaneously**:

- In split view, ARIA knows which device is which — name, IP, device type, protocol
- Routes commands to the correct device automatically using `target_session`
- Can compare two devices, identify config differences, and run commands on each in sequence
- Command blocks display a device badge so you always know where each command ran (→ SW1-Core)
- Terminal context from both sessions is included in every analysis

### Context-Aware from the Start

Every ARIA conversation includes full session context: device type, hostname, IP, protocol, and all open sessions. ARIA's commands and recommendations are device-specific from the first message — no configuration needed.

### Permission Modes

| Mode | What ARIA Can Do |
|---|---|
| **Troubleshoot** | Read-only diagnostics only — `show`, `display`, `ping`, `traceroute`, `ls`, `df`, etc. No config changes |
| **Full Access** | Any command including configuration and remediation actions |

Mode is set globally in Settings and can be overridden **per conversation** from the chat toolbar.

### Command Execution Control

| Option | Behavior |
|---|---|
| **Ask** | ARIA shows every command and waits for your approval before running |
| **Auto** | ARIA executes all commands immediately and uninterrupted |
| **Block** | Auto-approves everything except patterns on your custom blacklist |

### Auto Watch

When enabled, ARIA silently monitors your terminal output in real time. If it detects errors, misconfigurations, anomalies, or warnings, it alerts you immediately — without interrupting your work. Smart deduplication prevents repeated alerts for the same output.

### Built-in Safety

NetCopilot ships with a default blacklist of dangerous commands: `reload`, `shutdown`, `rm -rf`, `format`, `write erase`, `delete flash`, and others. The blacklist is:

- Stored persistently in the encrypted database
- Customizable per conversation from the chat toolbar
- Resettable to defaults in one click
- Always enforced — regardless of permission mode or approval setting

### ARIA Interface

| Feature | Description |
|---|---|
| **Markdown rendering** | Responses display formatted text, tables, and code blocks |
| **Syntax highlighting** | Config and code blocks use VS Code Dark+ theme |
| **Thinking indicator** | Animated pulse while ARIA is processing |
| **Sticky command bar** | Pending approval prompts stay pinned at the bottom |
| **Token counter** | Shows total tokens used in the current conversation |
| **RTL / LTR detection** | Messages adapt text direction based on language automatically |
| **Export conversation** | Download full ARIA session as a Markdown file |
| **Connection health** | Live colored indicator in ARIA header shows session status |
| **Session isolation** | Each tab has its own independent ARIA conversation |
| **Session summary** | When closing a tab, ARIA delivers a recap of all commands it ran |
| **Quick suggestions** | Device-aware command suggestions update dynamically as context changes |

### ARIA Persona

ARIA is built as a **specialized infrastructure expert**, not a general-purpose AI:

- Deep expertise in Cisco, Juniper, Arista, Palo Alto, FortiGate, MikroTik, Huawei, and more
- Strict operational scope — ARIA only handles network and infrastructure topics
- Responds in the same language the engineer writes in (English, Arabic, or other)
- API key stored in the OS keychain — never on disk or in any config file

### Certifications ARIA Masters

Working with ARIA is like having a senior engineer with all of these certifications on your team:

| Vendor | Certifications |
|--------|---------------|
| **Cisco** | CCNA · CCNP (Enterprise, Security, Data Center, Service Provider) · CCIE (Enterprise Infrastructure, Security, Data Center, Service Provider, Wireless) |
| **Juniper** | JNCIA · JNCIS · JNCIP · JNCIE (ENT, SP, SEC, DC) |
| **Nokia** | NRS I · NRS II · SRA · SRX (Service Routing Expert) |
| **Arista** | ACE-A · ACE-L2 · ACE-L3 · ACE-O |
| **Palo Alto** | PCNSA · PCNSE |
| **Fortinet** | NSE 4 · NSE 5 · NSE 6 · NSE 7 · NSE 8 |
| **F5** | 101 · 201 · 301A · 301B (BIG-IP Administrator & Developer) |
| **Linux / Cloud** | RHCE · LFCS · LFCE · AWS Solutions Architect · GCP Network Engineer · Azure Network Engineer |
| **General** | CompTIA Network+ · Security+ · CASP+ · Wireshark WCNA |

> ARIA combines the knowledge of all these certifications into one assistant — available instantly, in any language, at any hour.

---

## Terminal & Connectivity

### Supported Protocols

| Protocol | Details |
|---|---|
| **SSH** | Password, SSH key, key+passphrase, Cisco Enable Password |
| **Telnet** | Full NAWS negotiation, automatic terminal resize |
| **Serial Console** | RS-232 / USB-to-Serial, configurable baud rate, parity, data bits, stop bits, flow control |

### Supported Device Types

| Category | Devices |
|---|---|
| Cisco | IOS, IOS-XE, NX-OS, ASA |
| Routing & Switching | Juniper JunOS, Arista EOS, Nokia SR-OS, Huawei VRP, MikroTik RouterOS, HP/Aruba ProCurve |
| Firewalls | Palo Alto PAN-OS, Fortinet FortiOS |
| Load Balancers | F5 BIG-IP TMOS |
| Servers | Linux / Unix, Windows Server |
| Generic | Any SSH/Telnet/Serial device |

### Terminal Features

- In-terminal search with regex and case-sensitivity (⌘F)
- Configurable font family, size, line height, cursor style, and scrollback buffer
- Session logging — manual or auto-log on connect, with ANSI stripping and optional timestamps
- Split view — two sessions side by side with independent terminals
- Auto-reconnect on session drop — global default or per-connection override
- Session reconnect button appears automatically when a connection drops

### Connection Management

- Organized library with groups, colors, tags, and notes
- **Quick Connect** (⌘K) — type `user@host:port` for an instant session without saving
- Startup commands that run automatically after connecting
- SSH key manager — store and reuse named keys across connections
- Full import / export of connections as JSON

### Home Screen Dashboard

- Visual grid of saved connections with device-type color coding
- Group cards with connection count and live session indicator
- Real-time live sessions pill showing active device count
- Device color system: Cisco → blue, Linux → green, Firewalls → orange, Junos/Arista → purple, Serial → amber

---

## Security

| Layer | Protects | Technology |
|---|---|---|
| **Encrypted Database** | All connections, settings, and configuration | SQLCipher (AES-256) |
| **OS Keychain** | Passwords, SSH keys, API keys, and the DB encryption key | Electron safeStorage |
| **Master Password** | App-level lock on startup | scrypt + timing-safe comparison |

Credentials are never stored in plaintext. The database encryption key is generated on first launch, stored in the OS keychain, and never written to disk directly.

---

## Who Is It For?

- **Network engineers** working daily with Cisco, Juniper, Arista, Palo Alto, and similar platforms
- **DevOps and infrastructure teams** managing Linux and Windows servers remotely
- **NOC teams** that need fast diagnostics and a clean, modern interface
- **Security teams** performing network audits and configuration reviews
- Anyone who spends serious time in SSH sessions and wants real AI assistance in the same window

---

## Roadmap

- SFTP browser for visual file transfer
- Port forwarding — local, remote, and dynamic tunneling
- Command snippets library for frequently used operations
- Jump Host / Bastion Server support
- Persistent ARIA memory across sessions
- Team collaboration — shared connection libraries

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

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- ✅ Free to use, modify, and distribute
- ✅ Commercial use allowed
- ⚠️ Any modification or service built on top of this code **must also be open-sourced** under AGPL-3.0
- ⚠️ Network use counts as distribution — SaaS products built on this must share their source

The author retains the right to offer commercial licenses for organizations that cannot comply with AGPL terms.

See the [LICENSE](./LICENSE) file for full details.

---

*AI Network — Where engineering meets intelligence.*
