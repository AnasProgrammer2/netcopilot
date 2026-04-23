# NetCopilot — AI Network Agent

<center><img width="600" alt="NetCopilot — AI Network Agent" src="https://github.com/user-attachments/assets/1c8ef1f9-525b-489c-a8f3-9ce75d878abd" /></center>

**The first AI agent built for network engineers.**

NetCopilot is not just a terminal — it is an **AI agent** that connects to your network devices, understands your infrastructure, and acts autonomously to diagnose, troubleshoot, and fix problems.

At its core is **ARIA**: a real agentic system that plans investigations, executes commands, reads output, and delivers structured recommendations — all without leaving your terminal. You describe the problem; ARIA handles the rest.

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

ARIA is **free during the beta period** — no payment required. Just register for a license key:

1. Go to [netcopilot.app/register](https://netcopilot.app/register) and get your free key
2. Open the app → Settings → ARIA
3. Paste your license key
4. ARIA is ready — all AI requests are routed through the NetCopilot API

Your license key is stored in the **OS keychain** — never on disk or in any file.

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

### Per-Platform Mastery

ARIA carries deep, vendor-specific knowledge for every supported platform — not generic advice. Each device type has a dedicated playbook with:

- **Signature commands** — the exact commands a senior engineer would run first
- **Common root causes** — the failure modes that actually happen in production
- **Diagnostic flow** — the correct order to isolate the failing layer

For example: on a Cisco ASA, ARIA starts with `packet-tracer` (the fastest way to identify why traffic is blocked). On FortiGate, it uses `diagnose debug flow`. On Palo Alto, `test security-policy-match`. These are not generic — they are the expert moves.

### Batch Command Execution

ARIA can execute 2-5 independent commands in a single round-trip using the `run_commands` tool. Instead of sending `show ip bgp summary`, waiting, then `show ip route`, waiting, then `show interfaces brief`, ARIA batches them all together — faster diagnosis, fewer round-trips.

### Structured Terminal Context

Every message to ARIA includes parsed terminal context — not raw text dumps:

- **Detected hostname** from the terminal prompt
- **Current prompt line** (Router#, user@host:~$, etc.)
- **Last 5 commands and their outputs** — structured and labeled

This means ARIA always knows exactly what you just ran and what the device responded.

### Auto Device Detection

When a connection is set to **Auto-detect**, ARIA analyzes the live terminal output to identify the device type before responding. This ensures the correct playbook is used from the very first message — no manual selection needed.

### Smart Retry

When a command returns empty or minimal output, ARIA automatically receives a hint about possible causes (wrong syntax for this device type, pager ate the output, etc.) and can retry with a vendor-appropriate variant.

### Conversation Compression

Long conversations are compressed intelligently — older messages are summarized into a compact block while preserving the original intent and recent context. This replaces naive message trimming and keeps ARIA's memory coherent across extended troubleshooting sessions.

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

### Permission Modes

| Mode | What ARIA Can Do |
|---|---|
| **Troubleshoot** | Read-only diagnostics only — `show`, `display`, `ping`, `traceroute`, `ls`, `df`, etc. No config changes. ARIA decides which commands are safe based on its knowledge of each platform. |
| **Full Access** | Any command including configuration and remediation. ARIA warns before destructive operations and always provides the exact rollback command. |

Mode is set globally in Settings and can be overridden **per conversation** from the chat toolbar.

### Command Execution Control

| Option | Behavior |
|---|---|
| **Ask** | ARIA shows every command and waits for your approval before running |
| **Auto** | ARIA executes all commands immediately and uninterrupted |

### Blocked Command Patterns (Always-On Safety)

NetCopilot ships with a default blacklist of dangerous commands: `reload`, `shutdown`, `rm -rf`, `format`, `write erase`, `delete flash`, and others. The blacklist is:

- **Always enforced** — regardless of permission mode or approval setting
- Stored persistently in the encrypted database
- Customizable from the chat toolbar "Patterns" button
- Resettable to defaults in one click

When ARIA attempts a blocked command, the code **prevents execution entirely** and informs ARIA the command was blocked. This is a hard safety layer independent of AI judgment.

### Auto Watch

When enabled, ARIA silently monitors your terminal output in real time. If it detects errors, misconfigurations, anomalies, or warnings, it alerts you immediately — without interrupting your work. Smart deduplication prevents repeated alerts for the same output.

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
| **Quick suggestions** | Device-aware command suggestions, blended with your personal command history |
| **Smart History** | ARIA learns which commands you use most per device type and surfaces them first — highlighted in amber |
| **Sequential execution** | Auto mode runs multiple commands one by one — no race conditions |

### ARIA Persona

ARIA is built as a **principal-grade infrastructure expert**, not a general-purpose AI:

- 25+ years of multi-vendor operations experience across Tier-1 ISPs, hyperscale data centers, and enterprise networks
- Deep expertise in Cisco, Juniper, Arista, Palo Alto, FortiGate, MikroTik, Nokia, Huawei, F5, and more
- RFC-level protocol fluency (BGP extensions, MPLS/SRv6, EVPN, IKEv2, QUIC, TLS 1.3)
- Strict operational scope — ARIA only handles network and infrastructure topics
- Responds in the same language the engineer writes in (English, Arabic, or other)

### Certifications ARIA Masters

Working with ARIA is like having a principal engineer with all of these certifications on your team:

| Vendor | Certifications |
|--------|---------------|
| **Cisco** | CCIE (Routing & Switching, Service Provider, Data Center, Security) · CCNP Enterprise · DevNet Pro |
| **Juniper** | JNCIE-SP · JNCIE-ENT · JNCIE-DC · JNCIE-SEC |
| **Nokia** | NRS II (SRA) · MPLS Expert |
| **Arista** | ACE-Level 4 (highest) · CloudVision Expert |
| **Palo Alto** | PCNSE · PCNSC · Prisma Cloud Specialist |
| **Fortinet** | NSE 8 (highest) · FCSS Network Security |
| **F5** | F5-CTS LTM · GTM · ASM · APM |
| **Linux / Cloud** | RHCA · LFCE · AWS Solutions Architect Pro + Networking Specialty · Azure Network Engineer Expert · GCP Professional Network Engineer |
| **Security** | CISSP · OSCP · GIAC GPEN · GCIH |
| **DevOps** | CKA · CKAD · CKS · HashiCorp Terraform · Ansible Automation Platform |

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
| **Auto-detect** | Automatically identifies device type on first login — no manual selection needed |
| Cisco | IOS, IOS-XE, NX-OS, ASA |
| Routing & Switching | Juniper JunOS, Arista EOS, Nokia SR-OS, Huawei VRP, MikroTik RouterOS, HP/Aruba ProCurve |
| Firewalls | Palo Alto PAN-OS, Fortinet FortiOS |
| Load Balancers | F5 BIG-IP TMOS |
| Servers | Linux / Unix, Windows Server |
| Generic | Any SSH/Telnet/Serial device |

### Auto Device-Type Detection

New connections default to **Auto-detect** mode. After logging in, NetCopilot automatically identifies the device by analysing the login banner and prompt — no manual selection required:

1. **Banner analysis** — matches vendor signatures (NX-OS, IOS-XE, JUNOS, EOS, FortiOS, TiMOS, RouterOS, and more) within 2.5 seconds of connecting
2. **Probe fallback** — if the banner is ambiguous, sends `show version` and analyses the response
3. **Auto-save** — updates the connection's device type permanently in the local database
4. **Instant adaptation** — ARIA suggestions, syntax highlighting, and paging-disable commands all adjust automatically
5. **ARIA integration** — when device type is "auto", ARIA also detects from live terminal output to select the correct platform playbook

> Toast notification confirms detection: **"Device detected: Cisco IOS XE — 10.0.0.1"**

### Smart History

ARIA learns from your sessions:

- Every command you send is saved locally, keyed by device type
- Quick Suggestions are ranked by your personal usage frequency — most-used commands appear first
- History-based suggestions are highlighted in **amber** with a clock icon to distinguish them from defaults
- All history is stored in the encrypted local database — never sent anywhere

### Terminal Features

- In-terminal search with regex and case-sensitivity (⌘F)
- Right-click context menu (Copy, Paste, Search, Clear)
- Configurable font family, size, line height, cursor style, and scrollback buffer
- Session logging — manual or auto-log on connect, with ANSI stripping and optional timestamps
- Split view — two sessions side by side with independent terminals
- Auto-reconnect on session drop — global default or per-connection override
- **Connection overlays** — visual spinner while connecting, disconnect overlay with reconnect button, error overlay with retry
- Draggable sidebar with visual resize handle

### Port Forwarding (SSH Tunnels)

Create local port forwarding rules per connection — forward any local port to a remote service through the SSH tunnel:

- Add, edit, and delete rules per connection
- Start / stop each tunnel independently while connected
- Live status badge in the tab bar shows number of active tunnels
- Example: `localhost:5432 → db.internal:5432` through your SSH server

### SOCKS Proxy (Dynamic Port Forwarding)

Route traffic through your SSH connection as a SOCKS4/SOCKS5 proxy — useful for accessing internal networks, web interfaces, and services behind firewalls.

### Jump Host / Bastion Server

Connect to devices that are not directly reachable from your machine:

- Select any saved SSH connection as a jump host in the connection's Advanced tab
- The app automatically establishes a tunnel through the bastion to the target device
- Credentials for both the jump host and the target are resolved independently from the keychain
- Fully transparent — ARIA and terminal work exactly the same as a direct connection

### Connection Management

- Organized library with groups, colors, tags, and notes
- **Tags filter** — filter connections by tag from the HomeScreen pills bar
- **Quick Connect** (⌘K) — type `user@host:port` for an instant session without saving
- Startup commands that run automatically after connecting
- SSH key manager — store and reuse named keys across connections
- Full import / export of connections as JSON

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Quick Connect |
| `⌘T` / `Ctrl+T` | New tab |
| `⌘W` / `Ctrl+W` | Close active tab |
| `⌘,` | Settings |
| `⌘D` / `Ctrl+D` | Toggle Split View |
| `⌘⇧A` | Toggle ARIA panel |
| `⌘1–9` | Switch to tab N |
| `⌘F` | Search in terminal |
| `?` | Help & Keyboard Shortcuts |

### Home Screen Dashboard

- Visual grid of saved connections with device-type color coding and accent bars
- Group cards with connection count and live session indicator
- Real-time live sessions pill showing active device count
- **Tags filter pills** — click any tag to filter, click again to clear
- Device color system: Cisco → blue, Linux → green, Firewalls → orange, Junos/Arista → purple, Serial → amber

---

## Security

| Layer | Protects | Technology |
|---|---|---|
| **Encrypted Database** | All connections, settings, and configuration | SQLCipher (AES-256) |
| **OS Keychain** | Passwords, SSH keys, license keys, and the DB encryption key | Electron safeStorage |
| **Master Password** | App-level lock on startup | scrypt + timing-safe comparison |
| **Command Blacklist** | Prevents dangerous commands from executing | Code-level enforcement, always-on |

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
- Command snippets library for frequently used operations
- Persistent ARIA memory across sessions
- Network topology map generated from ARIA's discoveries
- Config diff — ARIA compares running vs startup or two devices side-by-side
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

This project is licensed under the **Business Source License 1.1 (BSL-1.1)**.

| | |
|---|---|
| **View & learn** | Anyone can read the source code |
| **Personal use** | Free — unlimited |
| **Academic / research** | Free |
| **Internal evaluation** | Free |
| **Commercial use** | Requires a commercial license — contact support@netcopilot.app |
| **Change Date** | January 1, 2029 — converts to Apache 2.0 |

**Why BSL?** The source code is fully visible so you can verify NetCopilot never exfiltrates your credentials, passwords, or SSH keys. BSL ensures no one can take this codebase and launch a competing commercial product without a license.

For commercial licensing inquiries: [support@netcopilot.app](mailto:support@netcopilot.app)

See the [LICENSE](./LICENSE) file for full details.

---

*AI Network — Where engineering meets intelligence.*
