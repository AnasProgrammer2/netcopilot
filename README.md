# NetCopilot

> **Your AI-Native Network Copilot**

---

## What is NetCopilot?

NetCopilot is a professional desktop terminal application built for network engineers and infrastructure teams. It combines a powerful multi-protocol terminal client with ARIA — a real embedded AI agent — all in one fast, secure, and modern interface.

Engineers spend most of their time in SSH or Telnet sessions, running commands and analyzing output. NetCopilot makes that window **intelligent**. ARIA understands your device, reads terminal output, executes commands in sequence, and delivers complete diagnoses — without you ever leaving your workspace.

---

## Core Capabilities

### Multi-Protocol Connectivity

NetCopilot supports the three essential protocols in a network engineer's daily work:

- **SSH** — Full support for password, SSH key, key+passphrase, and Cisco Enable Password authentication
- **Telnet** — Complete NAWS negotiation and automatic terminal resize
- **Serial Console** — Direct device access via RS-232 or USB-to-Serial with full port configuration (baud rate, parity, data bits, stop bits, flow control)

Multiple sessions run simultaneously, each in its own tab. A **Split View** mode displays two sessions side by side with independent terminals.

---

### Connection Management

- Organized connection library with **groups**, colors, tags, and notes
- **Quick Connect** (⌘K) — type `user@host:port` for an instant session without saving
- Startup commands that run automatically after connecting (e.g. `terminal length 0` on Cisco devices)
- Configurable auto-reconnect on session drop — globally or per connection
- Full import/export of connections as JSON for backup or team sharing
- SSH key manager — store and reuse named keys across connections

---

### Home Screen — Connection Dashboard

A Termius-style dashboard as your home screen:

- Visual grid of all saved connections with device-type colored icons
- Group cards with connection count and live session indicator
- Real-time "live sessions" pill showing how many devices are currently connected
- Device type color system: Cisco → blue, Linux → green, Firewall → orange, Junos/Arista → purple, Serial → amber
- One-click connect, double-click to reconnect

---

### Terminal Experience

- **Automatic syntax support** for 15+ device types: Cisco IOS / IOS-XE / NX-OS / ASA, Juniper JunOS, Arista EOS, Palo Alto PAN-OS, FortiOS, Huawei VRP, MikroTik RouterOS, Nokia SR-OS, F5 BIG-IP, HP ProCurve, Linux, Windows Server
- In-terminal **search** with regex and case-sensitivity support (⌘F)
- **Session logging** to file — manual start or auto-log on every connection
- Log options: strip ANSI codes, add timestamps, configurable log directory
- Customizable **font family, font size, line height, cursor style, scrollback buffer**
- **Session reconnect button** — appears automatically when connection drops

---

### Session Summary

When you close a tab, ARIA automatically delivers a **session summary** — a brief recap of what commands were executed during the session, giving you a quick audit trail of AI activity.

---

## ARIA — The AI Agent

### A Real Agent, Not a Chatbot

ARIA (the AI in NetCopilot) operates as a **true agentic loop**, not a simple Q&A assistant:

1. You describe a problem or assign a task
2. ARIA generates an **investigation plan** before taking any action
3. It executes the required commands in sequence, one after another
4. It analyzes all output collectively and delivers a complete, structured diagnosis
5. Every step is visible — you can follow exactly what ARIA is doing and why

**Example:** You say *"There's a BGP flapping issue"* — ARIA creates a plan, runs `show ip bgp summary` → `show ip bgp neighbors` → `show ip route bgp` → `show logging`, then gives you a precise diagnosis with recommendations.

---

### L4 Planning Mode

For complex problems, ARIA first generates a visual **investigation plan card** showing:

- The objective of the investigation
- Each diagnostic step with status (pending / active / completed)
- Live progress tracking as commands execute

This gives you full transparency into the agent's reasoning process before any command runs.

---

### Multi-Session Intelligence

ARIA is aware of **all open sessions simultaneously**:

- In split view, ARIA knows which device is which — name, IP, device type
- Uses `target_session` routing to send commands to the correct device automatically
- Can compare two devices, identify config differences, and run commands on each in sequence
- Command blocks display a device badge (→ SW1-Core) so you always know where each command ran
- Context from both sessions is included in ARIA's analysis

---

### Context-Aware from the Start

Every conversation includes full context: device type, hostname/IP, protocol, current permission mode, and all open sessions. ARIA's commands and recommendations are device-specific from the first message.

---

### Permission Modes

| Mode | What ARIA can do |
|---|---|
| **Troubleshoot (Scan)** | Read-only — diagnostic commands only (`show`, `display`, `ping`, `traceroute`, `ls`, `df`, etc.). No configuration changes |
| **Full Access** | Full permissions including configuration changes, with warnings before destructive operations |

Mode is configurable globally in Settings, and can be overridden **per conversation** directly in the chat toolbar.

---

### Command Execution Control

| Option | Behavior |
|---|---|
| **Ask** | ARIA shows every command and waits for your approval before running |
| **Auto** | ARIA executes all commands immediately without interruption |
| **Block (Blacklist)** | Auto-approves everything except commands matching your blocked patterns |

Command approval is configurable globally and overridable per conversation.

---

### Auto Watch

When enabled, ARIA silently monitors your terminal output in the background. If it detects errors, anomalies, warnings, or misconfigurations, it alerts you proactively — without interrupting your workflow. Configurable per conversation with smart deduplication to avoid repeated alerts.

---

### Quick Suggestions

A dynamic suggestions bar above the input area shows **context-aware command suggestions** based on your device type and session state. Suggestions change as the conversation progresses — showing the most relevant diagnostic starting points for your current device.

---

### Built-in Safety

NetCopilot ships with a default blacklist of dangerous network commands including `reload`, `shutdown`, `rm -rf`, `format`, `write erase`, `delete flash`, and others. The blacklist is:

- Stored persistently in the encrypted database
- Customizable per conversation from the chat toolbar
- Resettable to defaults with one click
- Always enforced regardless of permission mode or approval setting

---

### ARIA UI Features

- **Markdown rendering** — ARIA responses display formatted text, tables, and code blocks properly
- **Syntax highlighting** — Config and code blocks use VS Code Dark+ theme coloring
- **Thinking indicator** — Animated pulse shows when ARIA is processing
- **Sticky command bar** — Pending approval prompts stay pinned at the bottom of the chat
- **Token counter** — Shows total input/output tokens used in the current conversation
- **RTL/LTR detection** — Chat messages automatically adapt text direction based on language
- **Export conversation** — Download the full ARIA conversation as a Markdown file
- **Connection health indicator** — Colored dot in ARIA header shows live connection status
- **Session isolation** — Each connection tab has its own independent ARIA conversation

---

### ARIA Persona

ARIA is not a generic AI. It is built as a **specialized network infrastructure expert** with:

- Deep knowledge of Cisco, Juniper, Arista, Palo Alto, FortiGate, MikroTik, Huawei, and more
- Virtual expertise equivalent to CCNA, CCNP, CCIE, JNCIE, and DevOps certifications
- Strict operational scope — ARIA answers only network/infrastructure questions; it will not answer off-topic queries
- Responds in the same language the engineer writes in (Arabic, English, or other)

---

## Security

NetCopilot is built on a three-layer security model:

| Layer | What it protects | Technology |
|---|---|---|
| **Encrypted Database** | All connections, settings, and configuration data | SQLCipher (AES-256) |
| **OS Keychain** | Passwords, SSH keys, API keys, and the database encryption key | Electron safeStorage |
| **Master Password** | App-level lock on startup | scrypt + timing-safe comparison |

Credentials are never stored in plaintext. The database key is generated on first launch, encrypted via the OS keychain, and stored separately. Even if someone obtains the database file, it cannot be decrypted without access to the original machine's keychain.

The AI API key (Anthropic) is stored in the OS keychain — never in the database or any config file.

---

## Who Is It For?

NetCopilot is built for:

- **Network engineers** working daily with Cisco, Juniper, Arista, Palo Alto, and similar devices
- **DevOps and server teams** managing Linux and Windows infrastructure remotely
- **NOC teams** that need fast, reliable diagnostics and a clean, modern interface
- **Security teams** performing network audits and configuration reviews
- Anyone who spends significant time in SSH sessions and wants an intelligent assistant in the same window

---

## Supported Device Types

| Category | Devices |
|---|---|
| Cisco | IOS, IOS-XE, NX-OS, ASA |
| Routing & Switching | Juniper JunOS, Arista EOS, Nokia SR-OS, Huawei VRP, MikroTik RouterOS, HP/Aruba ProCurve |
| Firewalls | Palo Alto PAN-OS, Fortinet FortiOS |
| Load Balancers | F5 BIG-IP TMOS |
| Servers | Linux/Unix, Windows Server |
| Console | Serial (RS-232, USB-to-Serial) |

---

## Vision

NetCopilot's goal is to be the unified workstation for network engineers: professional connectivity, specialized AI, and strong security — all in one clean, fast application.

**On the roadmap:**
- SFTP browser for visual file transfer
- Port forwarding — local, remote, and dynamic tunneling
- Command snippets library for frequently used operations
- Jump Host / Bastion Server support
- Persistent ARIA memory across sessions
- Team collaboration — shared connection libraries

---

*NetCopilot — Where engineering meets intelligence.*
