# NetCopilot — Launch Plan & Ready-to-Post Templates

This file holds copy-paste-ready announcement posts for the public launch.
**Internal document** — not part of the product. Tweak voice/details before posting.

---

## Pre-launch checklist (do these BEFORE posting anywhere)

- [ ] GitHub repo Topics added: `ssh, ssh-client, terminal, ai, ai-agent, network-engineering, cisco, juniper, arista, electron, cross-platform, devops, sre, network-automation, claude, anthropic, sysadmin`
- [ ] Short repo description set (under repo header): `AI-powered SSH client for network engineers. ARIA agent diagnoses BGP/OSPF/firewall issues in real-time. Mac/Win/Linux.`
- [ ] Website link added in repo header (`https://netcopilot.app`)
- [ ] Repo pinned on your GitHub profile
- [ ] Social Preview image uploaded (1280×640) — Settings → Social preview
- [ ] At least 3 high-quality GIFs in README (ARIA diagnosing a real issue is gold)
- [ ] Latest release has clean release notes
- [ ] Macs / Win / Linux binaries verified to download and launch
- [ ] License flow tested end-to-end
- [ ] Demo video recorded (60–90 seconds) — uploaded to YouTube unlisted as a backup

---

## Optimal launch window

| Day | Channel | Best time (UTC) |
|---|---|---|
| **Tue** | Hacker News (Show HN) | 13:00–15:00 UTC (8–10 AM EST) |
| **Tue or Wed** | Product Hunt | 00:01 PST (08:01 UTC) — launches reset at midnight Pacific |
| **Wed** | Reddit (r/networking, r/sysadmin) | 14:00 UTC |
| **Wed** | Twitter / LinkedIn thread | 15:00 UTC |
| **Thu** | Dev.to / Hashnode technical post | 12:00 UTC |
| **Throughout week** | Discord / Slack communities | Whenever active |

---

## 1. Hacker News (Show HN)

**Title (80 chars max):**
> Show HN: NetCopilot – AI agent for network engineers (Cisco/Juniper/Arista)

**URL field:** `https://github.com/AnasProgrammer2/netcopilot`

**Post body (Show HN allows text):**

```
Hi HN — I've been building NetCopilot, an open-source SSH/Telnet/Serial client
with an AI agent (ARIA) that actually understands network gear.

Most "AI in the terminal" tools assume you're on a Linux box. NetCopilot is
the opposite: ARIA knows BGP, OSPF, MPLS, vPC, EVPN, packet-tracer, FortiOS
debug-flow, Junos commit-confirmed, and the diagnostic order a senior network
engineer would actually run.

A few things that make it different:

• Vendor-aware playbooks for 16 platforms (Cisco IOS/IOS-XE/NX-OS/ASA, Junos,
  Arista, Nokia SR-OS, Huawei VRP, MikroTik, ProCurve, Fortinet, PAN-OS, F5,
  Linux, Windows). ARIA picks the right show commands and reads outputs the
  way a CCIE would.

• Read-only "Troubleshoot Mode" enforced server-side — the model literally
  cannot send anything that mutates state. A blacklist gate adds a second
  layer, also enforced in the main process (not the renderer).

• Plan → execute → verify loop. For multi-step diagnoses, the model first
  emits a plan card, then runs commands sequentially with adaptive debounce,
  pager auto-advance, and per-session abort.

• Per-session ARIA: open multiple SSH sessions and chat with ARIA on each
  independently. The agent state map is keyed by sessionId; no cross-talk.

• Encrypted SQLCipher database (AES-256), credentials encrypted via Electron
  safeStorage → OS keychain, master-password gate with timing-safe compare.

Stack: Electron 32, React 19, TypeScript, Zustand, xterm.js, ssh2,
better-sqlite3-multiple-ciphers, Claude Sonnet via a backend proxy.
License: BSL-1.1 (free for personal use, source available).

Downloads (Mac/Win/Linux): https://github.com/AnasProgrammer2/netcopilot/releases

Happy to answer anything about the agentic loop design, the SQLCipher
migration, vendor playbook structure, or the IPC architecture. Feedback —
especially from network engineers — is the whole reason I'm posting.
```

**First comment (post 5 min after submission):**
```
Author here — quick technical notes for anyone curious:

The trickiest part wasn't the AI integration, it was the policy enforcement.
First version checked the blacklist only in the renderer. Realised that's an
XSS / IPC tampering vector, so now both the main process AND the renderer
gate every command, and troubleshoot mode validates the first verb against a
read-only whitelist *before* anything reaches the terminal.

Per-session ARIA state was the second rewrite — originally a single global
AbortController + pendingTools map. That worked until you opened two
sessions and started two chats at once. Now it's `Map<sessionId, RunState>`,
each session has its own abort signal, and IPC events carry the sessionId so
the renderer routes to the right panel.

For the curious: the agent loop is hard-capped at 25 turns, and the
conversation auto-recompresses every 5 turns to keep token usage bounded.
```

---

## 2. Reddit

### r/networking (650k members) — primary target

**Title:**
> I built a free, open-source AI terminal for network engineers — looking for honest feedback

**Body:**
```
Hey r/networking,

I'm a network engineer turned full-stack dev, and I've spent the last few
months building something I always wanted: a terminal client where the AI
*actually understands networking*. Not "here's a generic GPT bolted onto a
terminal" — but one that knows the difference between IOS-XE and IOS, knows
when to run packet-tracer on an ASA, knows that BGP idle usually means TCP
reachability before it means MD5.

It's called **NetCopilot**. The AI agent inside is called **ARIA**.

**What it does well right now:**
- SSH / Telnet / Serial in one client (Mac / Win / Linux)
- Vendor-aware syntax highlighting (Cisco/Juniper/Arista/Fortinet/PAN/F5/etc.)
- ARIA runs commands on your behalf, with three modes: Read-Only (show
  commands only — enforced server-side), Fix Mode (asks before changing),
  Auto Pilot (use with caution)
- Multi-session chat — open 5 routers, ARIA can correlate findings between them
- Auto-Watch: detects errors in terminal output and pulses a red badge even
  when the AI panel is closed
- Encrypted database (SQLCipher AES-256) + master password
- Free, source-available (BSL-1.1)

**What it does NOT do (yet):**
- SFTP browser (next on roadmap)
- Port forwarding UI (you can do it via SSH config for now)
- Jump host wizard (also roadmap)

I'd genuinely love brutal feedback. Especially:
- Vendors I'm missing — what do *you* use?
- ARIA modes / safety — does the read-only gate feel safe enough?
- Anything that feels wrong from a real network-engineer POV

Repo: https://github.com/AnasProgrammer2/netcopilot
Releases: https://github.com/AnasProgrammer2/netcopilot/releases/latest

Not selling anything. License key is just for ARIA backend rate-limiting.
The app and source are free.
```

### r/sysadmin (970k) — same body, slightly different intro

**Title:**
> Free SSH client with AI built in — diagnoses BGP, ASA, FortiOS, Linux, Windows

### r/devops, r/selfhosted, r/opensource — link + 2-paragraph teaser

---

## 3. Product Hunt

**Tagline (60 chars):**
> AI agent that debugs Cisco, Juniper & Linux from your terminal

**Description:**
```
NetCopilot is an open-source SSH/Telnet/Serial client with a built-in AI
agent (ARIA) that actually understands network gear.

ARIA reads your terminal context, runs show commands across vendors,
correlates findings, and explains root causes in plain English — or
Arabic. It refuses to run state-changing commands in Troubleshoot Mode
(enforced server-side, not just in the UI), and a customisable blacklist
blocks "reload", "rm -rf", "shutdown" and similar across every platform.

✦ Cisco IOS / IOS-XE / NX-OS / ASA
✦ Juniper / Arista / Nokia SR-OS / Huawei VRP
✦ MikroTik / HP-ProCurve / Fortinet / Palo Alto / F5
✦ Linux & Windows servers

Mac (Intel + Apple Silicon), Windows 10/11, Linux AppImage.
Free, source-available (BSL-1.1).
```

**Maker comment (post immediately):**
```
Hi PH 👋 Maker here.

I built NetCopilot because I was tired of switching between Termius (paid),
ChatGPT (had to copy-paste outputs manually), and PuTTY (no AI at all). The
two things I'm most proud of:

1. ARIA's vendor playbooks. The system prompt is ~12k tokens of
   senior-engineer knowledge per platform — signature commands, common
   root causes, diagnostic order. So when you ask "why is BGP idle"
   ARIA already knows to check TCP/179 first, not just run a generic
   `show bgp summary`.

2. The safety model. Two-layer enforcement: the renderer checks the
   blacklist before showing approve buttons, AND the main process
   re-validates before the command leaves Electron. Troubleshoot Mode
   means the model gets a "rejected: read-only mode" tool result and
   self-corrects — your devices are safe even if someone tampers with
   the renderer.

Happy to answer anything. Roadmap is on GitHub — SFTP browser and port
forwarding UI are next.
```

---

## 4. Twitter / X — Launch Thread

```
🧵 Today I'm open-sourcing NetCopilot — an SSH client with an AI agent
that actually understands network gear.

Not "ChatGPT in a terminal." An agent that knows BGP, OSPF, MPLS, vPC,
packet-tracer, FortiOS debug-flow, and the order a CCIE would run them.

→ https://github.com/AnasProgrammer2/netcopilot

[GIF: ARIA diagnosing a BGP issue]
```

```
2/ The AI (ARIA) supports 16 vendor playbooks:
Cisco IOS / IOS-XE / NX-OS / ASA, Juniper, Arista, Nokia SR-OS, Huawei,
MikroTik, ProCurve, Fortinet, Palo Alto, F5, Linux, Windows.

Each playbook = 200+ lines of senior-engineer mental model baked into
the system prompt.
```

```
3/ Three safety modes:

🟢 Read Only — show/display only. Enforced SERVER-SIDE, not just UI.
🟡 Fix Mode — can change config, but asks first.
🔴 Auto Pilot — runs everything. Use with caution.

The model literally gets "rejected: read-only mode" back as a tool result
if it tries to mutate state in Troubleshoot Mode.
```

```
4/ Built on:
• Electron 32 + React 19 + TypeScript
• xterm.js + ssh2 + serialport
• SQLCipher AES-256 encrypted DB
• Credentials via Electron safeStorage → OS keychain
• Claude Sonnet (via backend proxy for rate limiting)

Free. Source-available (BSL-1.1).
```

```
5/ Downloads for Mac (Intel + Apple Silicon), Windows 10/11, Linux:
→ https://github.com/AnasProgrammer2/netcopilot/releases/latest

If you're a network engineer and try it, I'd love brutal feedback.
What vendor is missing? What feels wrong?

Star ⭐ helps a lot 🙏
```

---

## 5. LinkedIn

```
I've spent the last few months building something for myself, and today
I'm open-sourcing it.

NetCopilot is an SSH client with an AI agent (ARIA) that understands
network gear at the level a senior engineer does. It knows the difference
between IOS-XE and NX-OS. It knows that BGP idle usually means TCP
reachability before MD5. It knows when to run packet-tracer on an ASA
instead of guessing from logs.

Why I built it:
The "AI in terminal" wave has been disappointing for network engineers.
Generic ChatGPT integrations don't know vendor syntax. Paid solutions
hide behind enterprise sales. And nothing was open-source.

What it has today:
• Cisco / Juniper / Arista / Nokia / Huawei / MikroTik / Fortinet /
  Palo Alto / F5 / Linux / Windows playbooks
• Three safety modes (read-only enforced server-side)
• Multi-session correlation
• Encrypted local database (SQLCipher AES-256)
• Free, source-available

If you're a network engineer, DevOps, or SRE — I'd love your feedback.

GitHub: https://github.com/AnasProgrammer2/netcopilot
Website: https://netcopilot.app

#NetworkEngineering #DevOps #OpenSource #SSH #Cisco #AI
```

---

## 6. Discord / Slack communities (drip over weeks)

Communities to engage in (help first, mention NetCopilot only when relevant):

- Packet Pushers community Slack
- NetworkChuck Discord (100k+)
- r/networking Discord
- NRE Labs Slack (Network Reliability Engineering)
- Cisco DevNet community
- Awesome Network Automation Slack

**Engagement template (NOT a spam drop):**
> "Has anyone tried any AI tools that actually understand network CLI?
> I've been working on an open-source one called NetCopilot — it has
> vendor-specific playbooks for Cisco/Juniper/etc. Curious what others
> are using for this. [link only if asked]"

---

## 7. Long-tail SEO blog posts (write over weeks)

| Title | Target keyword | Platform |
|---|---|---|
| "Best SSH clients for Mac in 2026" | `best ssh client mac` | Dev.to + your blog |
| "Free Termius alternative — open-source SSH with AI" | `termius alternative free` | Hashnode |
| "How to debug Cisco BGP issues with AI" | `debug cisco bgp` | Dev.to |
| "AI tools every network engineer should try" | `ai network engineering` | LinkedIn article |
| "Building an agentic AI for network automation (architecture deep-dive)" | `agentic ai architecture` | Hashnode |

Each post should mention NetCopilot naturally, with a link in the bio + one in-body link.

---

## 8. Distribution channels (set up in parallel)

- [ ] **Homebrew Cask** → `brew install --cask netcopilot` (1 PR to homebrew/homebrew-cask)
- [ ] **winget** → `winget install NetCopilot` (1 PR to microsoft/winget-pkgs)
- [ ] **AlternativeTo.net** → list as alternative to Termius / SecureCRT / mRemoteNG
- [ ] **awesome-electron** → PR to add
- [ ] **awesome-network-automation** → PR to add
- [ ] **awesome-ai-tools** → PR to add

Each of these takes < 1 hour and unlocks a permanent discovery channel.

---

## Metrics to track

Set up a simple dashboard (Plausible / Umami / GA4) on netcopilot.app and check weekly:

- GitHub stars / day
- Release downloads / day, broken down by platform
- Top traffic sources (referrer)
- License signups / day
- Reddit / HN / PH score and comment volume on launch day
- Discord / community mentions

Goal benchmarks for first month after launch:
- 500+ stars
- 1,000+ downloads
- 50+ license signups
- 5+ contributors (issues + PRs combined)
