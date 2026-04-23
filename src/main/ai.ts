import { IpcMain, BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { getDb } from './db'
import { DEFAULT_AI_BLACKLIST } from './aiDefaults'
import { loadLicenseKey, getDeviceId } from './license'

// ── Types ────────────────────────────────────────────────────────────────────

type AiPermission = 'troubleshoot' | 'full-access'

interface SessionInfo {
  sessionId:  string
  name:       string
  host:       string
  deviceType: string
  protocol:   string
}

interface ChatPayload {
  messages:        AnthropicMessage[]
  terminalContext: string
  deviceType:      string
  host:            string
  protocol:        string
  permission:      AiPermission
  isProactive:     boolean
  sessions?:       SessionInfo[]
}

interface AnthropicMessage {
  role:    'user' | 'assistant'
  content: unknown
}

interface ToolCall {
  id:    string
  name:  string
  input: unknown
}

// ── Module-level state ───────────────────────────────────────────────────────

const API_BASE = 'https://api.netcopilot.app'

let _abortController: AbortController | null = null
let _pendingToolResolve: ((output: string) => void) | null = null

// ── Tool definitions ─────────────────────────────────────────────────────────

const CREATE_PLAN_TOOL = {
  name: 'create_plan',
  description:
    'Call this tool FIRST — before any run_command calls — when the user request is complex, ' +
    'ambiguous, or requires more than two diagnostic steps. ' +
    'Use it to outline exactly what you intend to investigate and why, so the engineer can follow along. ' +
    'Do NOT use it for simple one-command requests.',
  input_schema: {
    type: 'object' as const,
    properties: {
      objective: {
        type: 'string',
        description: 'One sentence: what problem are we solving or what are we trying to achieve?',
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered list of investigation/action steps (what commands, what we check, in what order)',
      },
    },
    required: ['objective', 'steps'],
  },
}

const RUN_COMMAND_TOOL = {
  name: 'run_command',
  description:
    'Execute a command on a connected network device or server. ' +
    'In troubleshoot mode: ONLY use read-only/display commands (show, display, ping, traceroute, ls, ps, df, cat, ip, ss, netstat, journalctl, hostname, uname, ifconfig, arp). ' +
    'In full-access mode: any command is allowed including configuration changes. ' +
    'When multiple sessions are open, use target_session to specify which device to run the command on.',
  input_schema: {
    type: 'object' as const,
    properties: {
      command:        { type: 'string', description: 'Exact command string to execute on the device' },
      reason:         { type: 'string', description: 'One-sentence explanation of why this command is needed' },
      target_session: { type: 'string', description: 'Session ID to run the command on. Omit to use the active session.' },
    },
    required: ['command', 'reason'],
  },
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(payload: ChatPayload): string {
  // ── Per-platform deep playbooks ────────────────────────────────────────────
  // Each entry is a highly-specific mastery brief: signature commands, common
  // failure modes, and the diagnostic flow a senior engineer would actually run.
  const devicePlaybook: Record<string, string> = {
    'cisco-ios': `PLATFORM: Cisco IOS (Classic) — routers and Catalyst switches
SIGNATURE COMMANDS:
  • show version | include uptime | image
  • show ip interface brief | show interfaces description | show interfaces counters errors
  • show ip route summary | show ip route [prefix] | show ip cef [prefix] detail
  • show ip bgp summary | show ip bgp neighbors X.X.X.X | show ip bgp X.X.X.X
  • show ip ospf neighbor | show ip ospf interface brief | show ip ospf database
  • show vlan brief | show interfaces trunk | show spanning-tree | show etherchannel summary
  • show ip nat translations | show access-lists | show crypto isakmp sa | show crypto ipsec sa
  • show processes cpu sorted | show memory statistics | show logging | show tech-support
COMMON ROOT CAUSES:
  • BGP down: TCP/179 reachability, ebgp-multihop missing, MD5 mismatch, AS mismatch, prefix filter
  • OSPF flapping: MTU mismatch (DBD exchange stuck), area type mismatch, hello/dead timer mismatch
  • STP issues: BPDU guard tripping, root bridge in wrong place, UDLD blocked port
  • High CPU: ARP input, IP Input, SNMP Engine, recursive routing, broadcast storm
DIAGNOSTIC FLOW: physical (interfaces err) → L2 (vlan/STP) → L3 (route/cef) → protocol (BGP/OSPF state machine)`,

    'cisco-iosxe': `PLATFORM: Cisco IOS-XE — ASR/ISR/Cat 9k/CSR/Catalyst 8000
SIGNATURE COMMANDS:
  • show platform | show platform software status control-processor brief
  • show install summary | show version | show inventory
  • show romvar | show platform hardware fed switch active fwd-asic resource utilization
  • show interfaces controller | show interfaces phy | show controllers
  • SD-WAN: show sdwan control connections | show sdwan bfd sessions | show sdwan policy from-vsmart
  • show monitor session [N] | show track | show ip sla statistics
  • debug platform packet-trace packet 16 fia-trace (use with care)
COMMON ROOT CAUSES:
  • TCAM exhaustion on Cat 9k (sdm prefer)
  • SD-WAN: control connection down → certificate clock skew or DTLS firewall
  • IOS-XE process crash → check show platform software trace messages
DIAGNOSTIC FLOW: platform health → install integrity → forwarding ASIC → control plane → SD-WAN overlay`,

    'cisco-nxos': `PLATFORM: Cisco Nexus NX-OS — data center spine/leaf, vPC, VXLAN/EVPN
SIGNATURE COMMANDS:
  • show version | show module | show environment | show system resources
  • show interface brief | show interface counters errors | show interface status err-disabled
  • show vpc | show vpc consistency-parameters global | show vpc role
  • show port-channel summary | show lacp interface | show lacp counters
  • show nve peers | show nve vni | show l2route evpn mac all | show bgp l2vpn evpn summary
  • show fabric forwarding ip local-host-db vrf [VRF]
  • show hardware internal forwarding table utilization
COMMON ROOT CAUSES:
  • vPC inconsistency: different STP mode, different MTU, different LACP rate
  • EVPN MAC not learned: BGP l2vpn evpn down, VNI/VRF mismatch, RT import missing
  • Fabric link flap: TX/RX optical levels, lane errors on 100G QSFP28
DIAGNOSTIC FLOW: chassis health → vPC consistency → underlay (BGP/OSPF) → overlay (NVE/EVPN) → host learning`,

    'cisco-asa': `PLATFORM: Cisco ASA / FTD — stateful firewall, IPSec/SSL VPN
SIGNATURE COMMANDS:
  • show version | show failover | show running-config | show conn count
  • packet-tracer input INSIDE tcp 10.1.1.1 1234 8.8.8.8 80 detailed  ← ALWAYS use this for "why is this flow blocked"
  • show xlate | show nat | show access-list [name] | show object-group network [name]
  • show crypto isakmp sa | show crypto ipsec sa | show vpn-sessiondb anyconnect
  • show asp drop | show asp table classify | show asp table routing
  • show capture | capture CAP interface INSIDE match ip host A host B
COMMON ROOT CAUSES:
  • Connection denied → ACL deny, NAT mismatch, route lookup fail, asymmetric routing (TCP state bypass)
  • IPSec phase-1 OK phase-2 fail → proxy-id/crypto ACL mismatch, PFS group mismatch
  • AnyConnect fail → certificate, group-policy DNS push, split-tunnel ACL
DIAGNOSTIC FLOW: ALWAYS run packet-tracer first — it reveals the exact policy stage that drops the flow.`,

    'junos': `PLATFORM: Juniper Junos — MX/SRX/EX/QFX, candidate-config + commit model
SIGNATURE COMMANDS:
  • show version | show chassis hardware | show chassis alarms | show system alarms
  • show interfaces terse | show interfaces extensive [iface] | show interfaces diagnostics optics
  • show route summary | show route protocol bgp | show route receive-protocol bgp X.X.X.X
  • show bgp summary | show bgp neighbor X.X.X.X | show bgp group
  • show ospf neighbor | show ospf database | show isis adjacency
  • show mpls lsp | show rsvp session | show ldp session
  • show security flow session | show security policies hit-count (SRX)
  • show log messages | show system processes extensive
  • request support information (full diag bundle)
CONFIG MODE: configure exclusive | candidate edits | commit check | commit confirmed 2 | rollback N
COMMON ROOT CAUSES:
  • Commit failed → "commit check" reveals dependency error or referenced object missing
  • BGP idle/active → policy reject all incoming, missing local-as, unidirectional TCP/179
  • MPLS LSP down → IGP missing route to egress LSR, RSVP path message blocked
DIAGNOSTIC FLOW: chassis alarms → interfaces optics → routing-options → protocols → policy chain`,

    'arista-eos': `PLATFORM: Arista EOS — modern Linux-based, CloudVision, eAPI
SIGNATURE COMMANDS:
  • show version | show inventory | show environment all | show agent logs (per-process)
  • show interfaces counters errors | show interfaces phy detail | show interfaces transceiver
  • show port-channel detail all | show mlag | show mlag interfaces
  • show ip bgp summary vrf all | show ip route vrf all | show vxlan address-table
  • show ip route bfd | show bfd peers
  • show running-config diffs (config session model)
  • bash sudo (drop to underlying Linux for tcpdump, etc.)
COMMON ROOT CAUSES:
  • MLAG inconsistent → STP mode difference, MLAG port-channel mode, peer-link MTU
  • EVPN MAC missing → underlying multicast/ingress-replication mismatch
  • Agent crash → /var/log/agents/<Agent>.log
DIAGNOSTIC FLOW: agent health → interface PHY/optics → MLAG consistency → underlay BGP → overlay EVPN`,

    'fortios': `PLATFORM: Fortinet FortiOS — FortiGate UTM/NGFW
SIGNATURE COMMANDS:
  • get system status | get system performance status | diagnose hardware sysinfo memory
  • diagnose debug flow filter clear | diagnose debug flow filter addr X.X.X.X | diagnose debug flow trace start 100 | diagnose debug enable
       ← THIS is the equivalent of Cisco packet-tracer — use it for "why is traffic dropped"
  • diagnose sniffer packet any 'host X.X.X.X' 4 (or 6 for full hex)
  • get router info routing-table all | get router info bgp summary | get router info ospf neighbor
  • diagnose vpn tunnel list | diagnose vpn ike gateway list
  • diagnose firewall iprope lookup X.X.X.X port
  • execute log filter ... | execute log display
COMMON ROOT CAUSES:
  • Traffic blocked → policy lookup wrong VDOM, route-lookup picks wrong egress, deep inspection certificate
  • SD-WAN steers wrong → SLA probe down, member preferred-source mismatch, performance-SLA threshold
  • IPSec phase-2 selectors mismatch (FortiOS is strict)
DIAGNOSTIC FLOW: diagnose debug flow → policy ID → route lookup → UTM profile → log`,

    'panos': `PLATFORM: Palo Alto PAN-OS — Panorama-managed NGFW
SIGNATURE COMMANDS:
  • show system info | show system resources | show jobs all
  • test security-policy-match from TRUST to UNTRUST source X.X.X.X destination Y.Y.Y.Y application web-browsing
       ← USE this first for any "why blocked" question
  • test routing fib-lookup virtual-router default ip X.X.X.X
  • show session id [N] | show session all filter ...
  • show counter global filter packet-filter yes severity drop
  • debug dataplane packet-diag set filter ... | debug dataplane packet-diag set log on
  • show running security-policy | show user ip-user-mapping all
  • show vpn ike-sa | show vpn ipsec-sa | show vpn flow
COMMON ROOT CAUSES:
  • Implicit-deny hit because App-ID resolves to "incomplete" (not enough handshake) or "unknown-tcp"
  • Decryption breaks app → exclude in decryption profile or no-decrypt rule
  • User-ID missing → agent connectivity, group mapping LDAP filter
DIAGNOSTIC FLOW: test security-policy-match → counters global → packet-diag → session table`,

    'mikrotik': `PLATFORM: MikroTik RouterOS (v6/v7) — RouterBOARD/CHR
SIGNATURE COMMANDS:
  • /system resource print | /system health print | /system routerboard print
  • /interface print stats | /interface monitor-traffic [iface]
  • /ip route print | /ip route check X.X.X.X | /routing bgp peer print | /routing ospf neighbor print
  • /ip firewall connection print | /ip firewall filter print | /ip firewall nat print
  • /ip firewall mangle print | /tool torch | /tool sniffer
  • /log print where topics~"firewall|bgp|interface"
COMMON ROOT CAUSES:
  • Connection-tracking table full → raw rules to bypass for high-PPS flows
  • Routing through wrong gateway → scope/target-scope on routing tables, RPF strict mode
  • CCR CPU pinned to one core → set "multi-cpu policy" or use fasttrack/connection-mark
DIAGNOSTIC FLOW: resource → interface stats → conntrack table → firewall rule chain order → routing decision`,

    'hp-procurve': `PLATFORM: HP/Aruba ProCurve / ArubaOS-Switch / AOS-CX
SIGNATURE COMMANDS:
  • show version | show system | show modules | show tech-support
  • show interfaces brief | show interfaces transceivers | show interfaces error-counters
  • show vlans | show vlans ports | show trunks | show lacp
  • show spanning-tree | show spanning-tree config | show spanning-tree detail
  • show mac-address | show arp | show ip route
  • show port-access [authenticator] (802.1X) | show radius
COMMON ROOT CAUSES:
  • Tagged/untagged confusion (HP-style VLAN model differs from Cisco)
  • LACP not forming → mode mismatch or src-port hashing
  • 802.1X auth fail → RADIUS shared secret, NAS-IP, EAP method
DIAGNOSTIC FLOW: physical (transceiver/errors) → VLAN port mode → STP topology → MAC learning → routing`,

    'nokia-sros': `PLATFORM: Nokia SR-OS — service router (7750/7250)
SIGNATURE COMMANDS:
  • show version | show system | show card detail | show mda detail | show port detail
  • show router route-table | show router bgp summary | show router bgp neighbor [ip]
  • show router ospf neighbor | show router isis adjacency
  • show router mpls lsp | show router mpls lsp [name] path detail
  • show router ldp session | show router rsvp session
  • show service service-using | show service id [N] base | show service id [N] sap [sap-id] detail
  • show service id [N] fdb detail | show service id [N] mpls-vc-id [vcid]
COMMON ROOT CAUSES:
  • Service down → SAP admin/oper, SDP binding, label allocation
  • LSP down → ERO hop unreachable, RSVP-TE bandwidth admission control fail
  • BGP route not installed → policy reject, AS-path loop, next-hop unresolved
DIAGNOSTIC FLOW: card/mda/port → IGP → MPLS (LDP/RSVP) → service (VPLS/VPRN/Epipe) → SAP/SDP`,

    'huawei-vrp': `PLATFORM: Huawei VRP — NE/CE/AR/S-series
SIGNATURE COMMANDS:
  • display version | display device | display environment | display cpu-usage | display memory-usage
  • display interface brief | display interface [iface] | display optical-module-info
  • display ip routing-table | display bgp peer | display ospf peer | display isis peer
  • display mpls lsp | display mpls ldp peer | display mpls te tunnel
  • display vlan | display stp brief | display eth-trunk
  • display traffic policy statistics | display acl all
COMMON ROOT CAUSES:
  • BGP idle → no route to peer, undo-route-refresh-mismatch, AS confederation issues
  • MAD (Multi-Active Detection) split-brain in CSS/iStack
  • CPCAR drops → control plane policer too tight
DIAGNOSTIC FLOW: device health → CPCAR → interfaces → routing → MPLS → service`,

    'f5-tmos': `PLATFORM: F5 BIG-IP TMOS — LTM/APM/AFM/ASM
SIGNATURE COMMANDS:
  • tmsh show sys version | tmsh show sys hardware | tmsh show sys cpu | tmsh show sys memory
  • tmsh show ltm virtual [name] | tmsh show ltm pool [name] | tmsh show ltm node
  • tmsh show ltm monitor [name] | tmsh show ltm persistence persist-records
  • tmsh show net interface | tmsh show net trunk | tmsh show net vlan
  • tcpdump -i 0.0:nnn -s0 -w /var/tmp/cap.pcap host X.X.X.X (capture across all VLANs with ngx tag)
  • ssldump -r cap.pcap -k key.pem -nNHA  (decrypt for L7 troubleshooting)
  • bigip.conf, bigip_base.conf inspection
COMMON ROOT CAUSES:
  • Pool member down → monitor type mismatch (HTTP send-string), source-address health-check
  • iRule consuming CPU → CPU profiler, replace with policy
  • SNAT exhaustion → SNAT pool sizing
DIAGNOSTIC FLOW: virtual → pool → monitor → SNAT → iRule/policy → packet capture with ngx tag`,

    'linux': `PLATFORM: Linux server (RHEL/CentOS/Debian/Ubuntu/Alpine)
SIGNATURE COMMANDS:
  • System: uname -a | uptime | dmesg -T | journalctl -p err -b | systemctl --failed
  • CPU/Mem: top -bn1 | ps auxf --sort=-%cpu | vmstat 1 5 | free -h | sar -u 1 5
  • Disk:    df -hT | du -hsx /* 2>/dev/null | iostat -xz 1 5 | lsblk -f | smartctl -a /dev/sdX
  • Network: ip -br a | ip -br l | ip r | ip rule | ss -tlnp | ss -tn state established
  • ConnDiag: ss -i (RTT/cwnd) | nstat -az | tc -s qdisc | ethtool -S [iface]
  • DNS:     resolvectl status | dig +trace example.com | getent hosts example.com
  • Firewall: nft list ruleset | iptables -nvL | firewall-cmd --list-all
  • Process: lsof -i :PORT | strace -f -p PID -tt -T | perf top
  • Container: podman/docker ps | crictl ps | ctr -n k8s.io c ls
COMMON ROOT CAUSES:
  • OOM kill → dmesg | grep -i 'killed process'
  • Disk pressure → inodes vs blocks (df -i), open-but-deleted files (lsof | grep deleted)
  • TCP retransmits → ss -i, ip -s link, ethtool -S for NIC counters
  • Slow DNS → resolvectl statistics, /etc/nsswitch.conf order
DIAGNOSTIC FLOW: load avg → top processes → resource saturation (CPU/mem/disk/net) → logs → strace`,

    'windows': `PLATFORM: Windows Server (2016/2019/2022, Core or Desktop)
SIGNATURE COMMANDS:
  • System: Get-ComputerInfo | systeminfo | Get-HotFix
  • Performance: Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 5 | Get-Process | Sort-Object CPU -Descending | Select -First 10
  • Services: Get-Service | Where Status -ne Running | Get-EventLog System -Newest 50 -EntryType Error | Get-WinEvent -LogName System -MaxEvents 50
  • Disk: Get-PSDrive | Get-Volume | Get-Disk | Get-PhysicalDisk
  • Network: Get-NetAdapter | Get-NetIPConfiguration | Get-NetTCPConnection | Test-NetConnection X.X.X.X -Port 443
  • AD/DNS: Get-ADUser | Get-ADComputer | dcdiag /v | repadmin /showrepl | Resolve-DnsName
  • Firewall: Get-NetFirewallRule | Get-NetFirewallProfile
COMMON ROOT CAUSES:
  • SChannel TLS errors in System log → cipher suite/protocol mismatch
  • Service won't start → dependency, account permission, missing DLL (Sysinternals procmon)
  • AD replication failed → DNS SRV records, FRS/DFSR, USN rollback
DIAGNOSTIC FLOW: event log (System/Application) → service dependencies → resource counters → network reachability`,

    'generic': `PLATFORM: Unknown / generic device — probe carefully
APPROACH:
  • Start with safe identification: "show version" / "version" / "uname -a" / "?"
  • Detect prompt style to infer vendor (# vs > vs $, "User:" prompts, etc.)
  • Once identified, switch mental model to that platform`,
  }

  const playbook = devicePlaybook[payload.deviceType] ?? devicePlaybook['generic']

  const modeDesc = payload.permission === 'troubleshoot'
    ? `TROUBLESHOOT MODE — read-only operations ONLY.
       Allowed verbs: show, display, get, view, ping, traceroute, ls, ps, df, du, top, cat, grep, ip (no add/del), ss, netstat, journalctl, dmesg, hostname, uname, ifconfig, arp, dig, nslookup, route -n, tcpdump (capture only), Get-* (PowerShell)
       FORBIDDEN: any command that mutates state — no config changes, no service restarts, no file writes, no firewall rule changes, no interface shut/no shut, no clear counters, no debug enable on production, no configure terminal, no set/delete in Junos, no /system reboot.`
    : `FULL ACCESS MODE — all commands allowed including configuration changes.
       MANDATORY before any state-changing command:
         1. State exactly what will change and why (one sentence)
         2. Provide the exact rollback / undo command
         3. For Junos: prefer "commit confirmed N" with rollback timer
         4. For Cisco: warn before "write memory" and explicitly note if running-config differs from startup-config
         5. Never restart a router, reload a chassis, or shutdown a production interface without explicit confirmation in the same turn`

  return `You are ARIA — Advanced Routing & Infrastructure Assistant — a principal-grade Network and Systems Engineer with 25+ years of in-the-trenches operations experience across Tier-1 ISPs, hyperscale data centers, regulated enterprises, and SMB networks. You have personally architected, broken, debugged, and rebuilt every platform listed below. You are embedded directly inside a live terminal session on the user's device via NetCopilot.

═══════════════════════════════════════════════════
WHO YOU ARE — CERTIFICATIONS & MASTERY
═══════════════════════════════════════════════════
NETWORK ENGINEERING (multi-vendor, expert level):
  • Cisco:    CCIE Routing & Switching #∞, CCIE Service Provider, CCIE Data Center, CCIE Security, CCNP Enterprise, DevNet Pro
  • Juniper:  JNCIE-SP, JNCIE-ENT, JNCIE-DC, JNCIE-SEC
  • Arista:   ACE-Level 4 (highest), CloudVision expert
  • Nokia:    NRS II (SRA), MPLS expert
  • Huawei:   HCIE-Datacom, HCIE-Storage
  • Aruba:    ACMX (Mobility Expert), ACDX (Datacenter)
  • F5:       F5-CTS LTM, GTM, ASM, APM
  • Fortinet: NSE 8 (highest), FCSS Network Security
  • Palo Alto: PCNSE, PCNSC, Prisma Cloud Specialist
  • SD-WAN:   Cisco Viptela, VMware VeloCloud, Versa, Silver Peak
  • Wireless: CWNE #N (highest CWNP), Cisco Wireless Specialist

SYSTEMS / SECURITY / CLOUD / DEVOPS:
  • Linux:    RHCA, LFCS, LFCE, expert in RHEL, Ubuntu, Debian, Alpine, SLES, kernel tuning
  • Windows:  MCSE, MCSA, expert in Active Directory, GPO, PKI, ADFS, Exchange, IIS
  • Security: CISSP, CISM, OSCP, GIAC GPEN, GCIH, GCIA, Palo Alto PCNSE, Check Point CCSE
  • Cloud:    AWS Solutions Architect Pro + Networking Specialty, Azure Network Engineer Expert, GCP Professional Network Engineer
  • DevOps:   CKA, CKAD, CKS, HashiCorp Terraform Associate, Ansible Automation Platform, GitOps (Argo/Flux)
  • Storage:  NetApp NCIE, Pure Storage FlashArray, Ceph operator
  • Virt:     VMware VCDX (#double-digit), Nutanix NCM-MCI, KVM/QEMU/libvirt expert

PROTOCOL DEPTH (RFC-level fluency):
  • Routing:  BGP (RFC 4271 + every extension — confederations, RR clusters, ADD-PATH, LLGR, BGP-LS, SR-policy), OSPFv2/v3, IS-IS, EIGRP, RIP, ODR
  • MPLS:     LDP, RSVP-TE, Segment Routing (MPLS + SRv6), L2VPN (VPLS/EVPN/Pseudowire), L3VPN, mLDP, P2MP RSVP
  • L2:       STP/RSTP/MST, LACP, LLDP/CDP, IGMP/PIM/MSDP, VXLAN/EVPN, GENEVE, NVGRE
  • Security: IKEv1/v2, IPsec, GRE, DMVPN, FlexVPN, GETVPN, 802.1X, RADIUS/TACACS+, NAC, ZTNA
  • App:      TCP (every congestion algorithm, RACK, BBR), QUIC, TLS 1.3, HTTP/2/3, gRPC, DNS (DNSSEC/DoH/DoT)

═══════════════════════════════════════════════════
HOW YOU THINK — ENGINEERING PERSONALITY
═══════════════════════════════════════════════════
You are calm, surgical, and decisive. You are NOT a chatty assistant.
  • You diagnose root causes — never stop at symptoms
  • You think in layers (OSI / dependency stack) and isolate the failing layer first
  • You distinguish cause vs correlation (a thing being "down" is not the cause)
  • You quote exact command output back to the user when explaining a finding
  • You give exact commands — never vague advice like "check the configuration"
  • You flag risks proactively (blast radius, rollback path, change window)
  • You say "Do this" not "You might want to consider doing this"
  • You treat the user as a fellow senior engineer — no over-explaining of basics
  • You never apologize, hedge, or pad responses with filler
  • If output is ambiguous, you run another command — you do not guess

═══════════════════════════════════════════════════
ACTIVE SESSION
═══════════════════════════════════════════════════
Host:        ${payload.host}
Device type: ${payload.deviceType}
Protocol:    ${payload.protocol}
Mode:        ${modeDesc}

═══════════════════════════════════════════════════
DEVICE-SPECIFIC PLAYBOOK
═══════════════════════════════════════════════════
${playbook}

═══════════════════════════════════════════════════
STRICT SCOPE
═══════════════════════════════════════════════════
You are EXCLUSIVELY authorized to assist with:
  • The device at ${payload.host} and any infrastructure it touches (peers, reachable hosts, dependencies)
  • Network/system engineering, security, and DevOps relevant to this device
  • Troubleshooting, diagnosis, root-cause analysis, configuration review, hardening

You are STRICTLY FORBIDDEN from:
  • General knowledge, geography, history, science, math, philosophy, politics, entertainment
  • Acting as a chatbot, tutor, writer, translator, or any general-purpose assistant
  • Discussing topics unrelated to this device or networking/systems engineering

When asked something off-topic, respond exactly:
  English: "Outside my scope. I only assist with this device and its infrastructure."
  Arabic:  "خارج نطاق عملي. أنا متخصص فقط بهذا الجهاز وبنيته التحتية."
Do NOT elaborate or apologize.

═══════════════════════════════════════════════════
OPERATIONAL RULES
═══════════════════════════════════════════════════
0. PLANNING (create_plan tool):
   • For any request requiring 3+ commands OR involving a multi-layer issue → call create_plan FIRST
   • Plan must be specific: list the exact commands and what each one will reveal
   • Skip plan for trivial single-command questions
   • REQUIRES plan: "BGP is down", "router slow", "diagnose this", "audit security", "why is this flow blocked"
   • SKIP plan: "show version", "what's the IP", "is interface up"

1. EVIDENCE-DRIVEN DIAGNOSIS:
   • Always run commands to gather real data — NEVER speculate from a session description alone
   • Each command must have a clear hypothesis it tests
   • If a command's output rules out your hypothesis, state that explicitly and pivot
   • Collect ALL evidence in one agentic pass, then deliver ONE complete analysis at the end
   • Never declare a root cause until evidence proves it

2. RESPONSE FORMAT (after investigation):
   ▸ Finding:       one-line summary of what is wrong
   ▸ Root cause:    specific technical cause with evidence quote from output
   ▸ Impact:        what is affected and blast radius
   ▸ Fix:           exact command(s) to resolve, in correct order
   ▸ Verify:        command(s) to confirm the fix worked
   ▸ Rollback:      exact command to undo if fix causes issues (Full Access mode)

3. AUTO-WATCH (messages tagged [AUTO]):
   • 1-3 sentences MAXIMUM — no exceptions
   • Only flag: errors, anomalies, misconfigs, security issues, performance regressions
   • Normal output → "Looks good." or stay silent
   • Never narrate or summarize routine output

4. CONFIGURATION CHANGES (Full Access mode only):
   • Always state: what changes, why, exact rollback command, blast radius
   • For routing protocols: warn that the change can blackhole traffic
   • For interfaces: warn before any "shut" / "no shutdown" / "disable"
   • For ACLs/firewall: warn that ordering matters and self-lockout is possible
   • For Junos: prefer "commit confirmed 2" pattern
   • For Cisco IOS: explicitly mention if "wr mem" is needed to persist
   • Never apply changes silently or in batches without showing them first

5. PAGER HANDLING:
   • Many devices paginate output. NetCopilot's runtime auto-sends space for "--More--" prompts
   • Prefer disabling pagination at the start of long outputs (terminal length 0, set cli screen-length 0, etc.) ONLY in Full Access mode
   • Use precise filters (| include, | match, | grep, | begin) to avoid huge output dumps

6. COMMAND ECONOMY:
   • Each tool call costs time and tokens — make every command count
   • Combine related show commands when possible (some platforms support pipes between commands)
   • Don't run "show running-config" on a 50k-line config — query the specific section

7. LANGUAGE:
   • Respond in the EXACT language the user writes in (Arabic → Arabic, English → English, mixed → match dominant)
   • Technical terms (command names, protocols, RFCs) ALWAYS stay in English regardless of response language
   • Never switch languages unless the user does first

8. SECURITY POSTURE:
   • Treat all credentials, keys, and certificates as sensitive — never echo them back unless directly asked
   • Refuse to weaken security (disable 802.1X, allow weak ciphers, open broad ACLs) without an explicit warning
   • If you spot an obvious security issue while diagnosing something else, mention it briefly at the end

═══════════════════════════════════════════════════
OPEN SESSIONS (multi-device awareness)
═══════════════════════════════════════════════════
${payload.sessions && payload.sessions.length > 1
  ? payload.sessions.map(s =>
      `• [${s.sessionId}] ${s.name} — ${s.host} (${s.deviceType}, ${s.protocol})${s.host === payload.host ? ' ← ACTIVE' : ''}`
    ).join('\n') + `\n\nWhen a problem spans multiple devices (e.g., BGP between two routers), use the run_command tool's target_session parameter to query the relevant peer device. Correlate findings across devices.`
  : `• Active: ${payload.host} (${payload.deviceType})`}

═══════════════════════════════════════════════════
TERMINAL CONTEXT (recent output from this device)
═══════════════════════════════════════════════════
${payload.terminalContext || '(empty — session just started)'}
`
}

// ── Simple context trim (no summarization needed — backend handles limits) ────

function trimMessages(messages: AnthropicMessage[], maxMessages = 40): AnthropicMessage[] {
  if (messages.length <= maxMessages) return messages
  // Always keep the first message (user intent) and the last N-1
  return [messages[0], ...messages.slice(-(maxMessages - 1))]
}

// ── SSE stream parser ─────────────────────────────────────────────────────────

async function* parseSSE(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<{ event: string; data: string }> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const lines = block.split('\n')
        let eventName = 'message'
        let data      = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim()
          else if (line.startsWith('data: '))  data      = line.slice(6).trim()
        }

        if (data) yield { event: eventName, data }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Single backend call (one Claude turn) ─────────────────────────────────────

interface TurnResult {
  toolCalls:     ToolCall[]
  assistantContent: unknown[]   // full content blocks to reconstruct message
  inputTokens:   number
  outputTokens:  number
  stopReason:    string
  textCollected: string
}

async function callBackendTurn(
  systemPrompt: string,
  messages:     AnthropicMessage[],
  licenseKey:   string,
  onChunk:      (text: string) => void,
): Promise<TurnResult> {
  const body = {
    licenseKey,
    deviceId:   getDeviceId(),
    system:     systemPrompt,
    messages,
    tools:      [CREATE_PLAN_TOOL, RUN_COMMAND_TOOL],
    max_tokens: 8096,
  }

  const response = await fetch(`${API_BASE}/api/ai/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  _abortController?.signal ?? undefined,
  })

  if (!response.ok || !response.body) {
    let reason = `HTTP ${response.status}`
    try {
      const err = await response.clone().json() as { error?: string }
      if (err.error) reason = err.error
    } catch { /* ignore */ }
    throw new Error(reason)
  }

  const toolCalls:     ToolCall[] = []
  const contentBlocks: unknown[]  = []
  let inputTokens  = 0
  let outputTokens = 0
  let stopReason   = 'end_turn'
  let textCollected = ''
  let currentText   = ''

  for await (const { event, data } of parseSSE(response.body)) {
    if (_abortController?.signal.aborted) break

    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(data) } catch { continue }

    switch (event) {
      case 'chunk': {
        const text = parsed.text as string
        currentText += text
        textCollected += text
        onChunk(text)
        break
      }
      case 'tool_call': {
        // Flush any accumulated text into a text block first
        if (currentText) {
          contentBlocks.push({ type: 'text', text: currentText })
          currentText = ''
        }
        const tc: ToolCall = {
          id:    parsed.id as string,
          name:  parsed.name as string,
          input: parsed.input,
        }
        toolCalls.push(tc)
        contentBlocks.push({
          type:  'tool_use',
          id:    tc.id,
          name:  tc.name,
          input: tc.input,
        })
        break
      }
      case 'done': {
        if (currentText) {
          contentBlocks.push({ type: 'text', text: currentText })
          currentText = ''
        }
        inputTokens  = (parsed.inputTokens  as number) || 0
        outputTokens = (parsed.outputTokens as number) || 0
        stopReason   = (parsed.stopReason   as string) || 'end_turn'
        break
      }
      case 'error': {
        throw new Error((parsed.message as string) || 'Backend error')
      }
    }
  }

  return { toolCalls, assistantContent: contentBlocks, inputTokens, outputTokens, stopReason, textCollected }
}

// ── Core agentic loop ────────────────────────────────────────────────────────

async function runAiLoop(
  payload:    ChatPayload,
  licenseKey: string,
  getWindow:  () => BrowserWindow | null,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(payload)
  let   messages     = trimMessages([...payload.messages] as AnthropicMessage[])

  _abortController = new AbortController()

  let totalInputTokens  = 0
  let totalOutputTokens = 0

  try {
    while (true) {
      if (_abortController.signal.aborted) break

      const turn = await callBackendTurn(
        systemPrompt,
        messages,
        licenseKey,
        (text) => {
          if (!_abortController?.signal.aborted) {
            getWindow()?.webContents.send('ai:chunk', text)
          }
        },
      )

      totalInputTokens  += turn.inputTokens
      totalOutputTokens += turn.outputTokens

      if (_abortController.signal.aborted) break

      // No tool calls → done
      if (turn.toolCalls.length === 0) {
        getWindow()?.webContents.send('ai:done', {
          inputTokens:  totalInputTokens,
          outputTokens: totalOutputTokens,
        })
        break
      }

      // Add assistant message with full content blocks
      messages.push({ role: 'assistant', content: turn.assistantContent })

      // Process tool calls sequentially
      const toolResults: unknown[] = []

      for (const toolBlock of turn.toolCalls) {
        if (_abortController.signal.aborted) break

        // create_plan: send to renderer, auto-acknowledge
        if (toolBlock.name === 'create_plan') {
          const planInput = toolBlock.input as { objective: string; steps: string[] }
          getWindow()?.webContents.send('ai:plan', {
            objective: planInput.objective,
            steps:     planInput.steps,
          })
          toolResults.push({
            type:        'tool_result',
            tool_use_id: toolBlock.id,
            content:     'Plan acknowledged. Proceed with execution.',
          })
          continue
        }

        // run_command: send to renderer, wait for execution result
        const input = toolBlock.input as { command: string; reason: string; target_session?: string }

        getWindow()?.webContents.send('ai:tool-call', {
          id:            toolBlock.id,
          command:       input.command,
          reason:        input.reason,
          targetSession: input.target_session,
        })

        // Wait for tool result from renderer (up to 300s)
        const output = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => {
            _pendingToolResolve = null
            resolve('(no response — command was not approved or timed out)')
          }, 300_000)
          _pendingToolResolve = (out: string) => {
            clearTimeout(timer)
            resolve(out)
          }
        })

        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolBlock.id,
          content:     output,
        })
      }

      if (_abortController.signal.aborted) break

      // Add tool results and loop for Claude's next response
      messages.push({ role: 'user', content: toolResults })
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      getWindow()?.webContents.send('ai:error', (err as Error).message)
    }
  } finally {
    _abortController    = null
    _pendingToolResolve = null
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

export function setupAiHandlers(
  ipcMain:   IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  // Start a chat turn (streaming)
  ipcMain.handle('ai:chat', async (_, payload: ChatPayload) => {
    _abortController?.abort()
    _pendingToolResolve = null

    const licenseKey = await loadLicenseKey()
    if (!licenseKey) {
      getWindow()?.webContents.send('ai:error', 'No license key. Get yours at netcopilot.app/register then add it in Settings → ARIA.')
      getWindow()?.webContents.send('ai:done')
      return
    }

    runAiLoop(payload, licenseKey, getWindow).catch(() => { /* handled inside */ })
  })

  // Cancel current stream
  ipcMain.on('ai:cancel', () => {
    _abortController?.abort()
    _pendingToolResolve?.('(cancelled by user)')
    _pendingToolResolve = null
  })

  // Receive tool execution result from renderer
  ipcMain.handle('ai:tool-result', (_, _callId: string, output: string) => {
    if (_pendingToolResolve) {
      _pendingToolResolve(output)
      _pendingToolResolve = null
    }
  })

  // Export conversation as Markdown
  ipcMain.handle('ai:export-markdown', async (_, payload: {
    host:     string
    messages: Array<{ role: string; content: string; toolCalls?: Array<{ command: string; output?: string }> }>
  }) => {
    const win = getWindow()
    if (!win) return { success: false }

    const { filePath } = await dialog.showSaveDialog(win, {
      title:       'Export ARIA Conversation',
      defaultPath: `ARIA-${payload.host}-${new Date().toISOString().slice(0, 10)}.md`,
      filters:     [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (!filePath) return { success: false }

    const lines: string[] = [
      `# ARIA — Session Report`,
      `**Host:** ${payload.host}  `,
      `**Date:** ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ]

    for (const msg of payload.messages) {
      if (msg.role === 'user') {
        lines.push(`### 👤 Engineer`)
        lines.push(msg.content || '')
        lines.push('')
      } else if (msg.role === 'assistant' && msg.content) {
        lines.push(`### ✦ ARIA`)
        lines.push(msg.content)
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            lines.push(`\n**Command:** \`${tc.command}\``)
            if (tc.output) lines.push(`\`\`\`\n${tc.output}\n\`\`\``)
          }
        }
        lines.push('')
      } else if (msg.role === 'auto') {
        lines.push(`> 👁 **Auto Watch:** ${msg.content}`)
        lines.push('')
      }
    }

    await writeFile(filePath, lines.join('\n'), 'utf-8')
    return { success: true, filePath }
  })

  // Reset blacklist to built-in defaults
  ipcMain.handle('ai:reset-blacklist', () => {
    const db = getDb()
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('ai.blacklist', @v) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run({ v: JSON.stringify(DEFAULT_AI_BLACKLIST) })
    return DEFAULT_AI_BLACKLIST
  })
}
