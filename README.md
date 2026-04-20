# NetCopilot

> **Your AI-Native Network Copilot**

---

## What is NetCopilot?

NetCopilot is a professional desktop terminal application built for network engineers and infrastructure teams. It combines a powerful multi-protocol terminal client with a real, embedded AI agent — all in one fast, secure, and modern interface.

The idea is simple: engineers spend most of their time in SSH or Telnet sessions, running commands and analyzing output. NetCopilot makes that window **intelligent**. You get an AI assistant that understands the device you're connected to, reads the terminal output, executes the commands it needs, and helps you diagnose or resolve issues — without ever leaving your workspace.

---

## Core Capabilities

### Connectivity

NetCopilot supports the three essential protocols in a network engineer's daily work:

- **SSH** — Full support for password, SSH key, and key+passphrase authentication
- **Telnet** — Complete NAWS negotiation and automatic terminal resize
- **Serial Console** — Direct device access via RS-232 or USB-to-Serial with full port configuration (baud rate, parity, flow control, etc.)

Multiple sessions can be open simultaneously, each in its own tab, with a split-view option to display two sessions side by side.

### Connection Management

- Organized connection library with groups, colors, tags, and notes
- **Quick Connect** — press ⌘K and type `user@host:port` for an instant session
- Startup commands that run automatically after connecting (e.g. `terminal length 0` on Cisco devices)
- Cisco Enable Password stored securely and entered automatically upon connection
- Configurable auto-reconnect on session drop

### Terminal Experience

- Automatic syntax highlighting for output from Cisco IOS/IOS-XE/NX-OS/ASA, Juniper JunOS, Arista EOS, Palo Alto PAN-OS, FortiOS, Huawei VRP, MikroTik, Nokia SR-OS, F5 BIG-IP, HP ProCurve, Linux, and Windows
- In-terminal search with regex and case-sensitivity support (⌘F)
- Session logging to file — manual or auto-log on connect
- Customizable font size, colors, and terminal appearance

---

## AI Copilot — The Core Differentiator

### A Real Agent, Not a Chatbot

The AI in NetCopilot is not a simple question-and-answer assistant. It operates as a **real agentic loop**:

1. You describe a problem or give it a task
2. It decides which commands are needed and executes them in sequence
3. It analyzes the output of each command and determines the next step
4. After gathering everything it needs, it delivers a complete analysis with actionable recommendations

**Example:** You say *"There's a BGP issue on this router"* — it runs `show ip bgp summary`, then `show ip bgp neighbors`, then `show ip route bgp`, and so on, before giving you a precise, structured diagnosis. No manual command-by-command work required.

### Context-Aware from the Start

Before every conversation, the AI is given full context: device type (Cisco IOS, Juniper JunOS, Linux...), IP address, protocol, and its current permission level. This means its commands and recommendations are accurate and device-specific from the first message.

### Permission Modes

| Mode | What the AI can do |
|---|---|
| **Troubleshoot** | Read-only — diagnostic commands only (`show`, `display`, `ping`, `traceroute`, `ls`, `df`, etc.). No configuration changes |
| **Full Access** | Full permissions including configuration and changes, with warnings before destructive operations |

### Command Execution Control

| Option | Behavior |
|---|---|
| **Ask** | Displays every command before execution and waits for your approval |
| **Auto** | Executes all commands automatically without interruption |
| **Blacklist** | Auto-approves everything except commands matching your blocked patterns |

### Auto Watch

When enabled, the AI silently monitors your terminal output in the background. If it detects errors, anomalies, warnings, or misconfigurations, it alerts you immediately — without interrupting your workflow.

### Built-in Safety

NetCopilot ships with a default blacklist of dangerous network commands including `reload`, `shutdown`, `rm -rf`, `format`, `write erase`, and others. This blacklist is customizable per conversation, giving you full control over what the AI is allowed to execute.

---

## Security

NetCopilot is built on a three-layer security model:

| Layer | What it protects | Technology |
|---|---|---|
| **Encrypted Database** | All connection data, settings, and credentials | SQLCipher (AES-256) |
| **OS Keychain** | Passwords, API keys, and the database encryption key | Electron safeStorage |
| **Master Password** | App-level lock on startup | scrypt + timing-safe comparison |

Passwords and credentials are never stored in plaintext on disk. The database encryption key is randomly generated on first launch, encrypted via the OS keychain, and stored separately. Even if someone obtains the database file, it cannot be decrypted without access to the original machine's keychain.

---

## Who Is It For?

NetCopilot is built for:

- **Network engineers** working daily with Cisco, Juniper, Arista, Palo Alto, and similar devices
- **DevOps and server teams** managing Linux and Windows infrastructure remotely
- **NOC teams** that need fast, reliable diagnostics and a clean interface
- Anyone who spends significant time in SSH sessions and wants an intelligent assistant in the same window

---

## Vision

NetCopilot's goal is to be the unified workstation for network engineers: professional connectivity, specialized AI, and strong security — all in one clean, fast application.

**On the roadmap:**
- SFTP browser for visual file transfer
- Port forwarding — local, remote, and dynamic tunneling
- Command snippets library for frequently used operations
- Jump Host / Bastion Server support
- Persistent AI memory across sessions

---

*NetCopilot — Where engineering meets intelligence.*
