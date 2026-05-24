# Security Policy

NetCopilot handles credentials, SSH keys, and live network sessions — so we take security seriously. Thank you for helping keep the project and its users safe.

## Supported versions

Only the **latest released version** receives security updates. Please upgrade before reporting an issue.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately via one of these channels:

1. **GitHub Security Advisories** (preferred):
   [Open a private advisory](https://github.com/AnasProgrammer2/netcopilot/security/advisories/new)
2. **Email**: `security@netcopilot.app`

Please include:

- A clear description of the issue and its impact
- Step-by-step reproduction (or proof-of-concept code)
- The version of NetCopilot you tested on
- Your OS and any other relevant context
- Whether you intend to publicly disclose, and on what timeline

## What to expect

- **Acknowledgement** within 48 hours
- **Initial assessment** within 7 days
- **Fix or mitigation** in the next release (timing depends on severity)
- **Credit** in the release notes and security advisory (unless you prefer to remain anonymous)

## Scope

Security issues we care about (non-exhaustive):

- Credential or master-password exposure (memory, logs, exports, IPC)
- SQLCipher encryption bypass
- Remote code execution via SSH/Telnet/Serial input or AI tool calls
- Privilege escalation via the Electron main process
- Insecure update channel (binary tampering)
- XSS / DOM injection in the renderer (Markdown, terminal, AI responses)
- Bypass of the AI blacklist / troubleshoot-mode policy gate

Out of scope:

- Vulnerabilities in third-party services we link to (e.g. `api.netcopilot.app` is reported separately)
- Issues requiring physical access to an already-unlocked machine
- Social engineering of users
- Self-XSS

## Security architecture summary

For context on what's protected and how:

| Layer | Mechanism |
|---|---|
| Database at rest | SQLCipher AES-256 via `better-sqlite3-multiple-ciphers` |
| Encryption key storage | Electron `safeStorage` → OS keychain |
| Credential storage | `safeStorage.encryptString` per-credential |
| Master password | SHA-256 hash, timing-safe compare, encrypted in DB |
| DevTools | Disabled in production (also blocks F12 / Cmd+Opt+I) |
| AI command execution | Two-layer policy gate (main + renderer): blacklist + read-only mode enforcement |

Full details are in [CLAUDE.md → Security Model](./CLAUDE.md#security-model).

## Hall of fame

Researchers who responsibly disclosed issues are credited here once their fixes ship.

_— still waiting for our first hero 🛡️_
