# NetTerm

> SSH & Telnet client for routers, switches, and servers — built with Electron

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)
![Tech](https://img.shields.io/badge/Electron-React-61DAFB)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ما هو NetTerm؟

NetTerm هو تطبيق سطح مكتب مفتوح المصدر مخصص لمهندسي الشبكات والـ DevOps، يتيح الاتصال بالراوترات والسويتشات والسيرفرات عبر **SSH** و**Telnet** من واجهة واحدة أنيقة وسريعة.

مستوحى من Termius، لكن مفتوح المصدر وقابل للتوسع.

---

## المميزات

| الميزة | الوصف |
|---|---|
| **SSH** | اتصال آمن عبر ssh2، يدعم كلمة السر وSSH Keys |
| **Telnet** | اتصال Telnet مع دعم كامل لـ negotiation (ECHO, NAWS) |
| **Multi-Tab** | افتح اتصالات متعددة في نفس الوقت كل واحدة في Tab |
| **Quick Connect** | اضغط ⌘K واكتب `user@host:port` للاتصال فوراً |
| **Connection Manager** | احفظ اتصالاتك مع Groups وColors وNotes وTags |
| **Device Types** | دعم خاص لـ Cisco IOS/IOS-XE/NX-OS، Juniper، Arista، PAN-OS، Linux |
| **Secure Storage** | كلمات السر مشفرة عبر OS keychain (Electron safeStorage) |
| **Terminal** | xterm.js مع JetBrains Mono، 256 colors، scrollback 5000 سطر |
| **Resizable Sidebar** | قائمة الاتصالات قابلة للتمديد بالسحب |
| **macOS Native** | دعم كامل لـ titlebar وtraffic lights على macOS |

---

## تثبيت وتشغيل

### المتطلبات

- [Node.js](https://nodejs.org) v18 أو أحدث
- npm v9 أو أحدث

### التثبيت

```bash
git clone https://github.com/AnasProgrammer2/netterm.git
cd netterm
npm install
```

### التشغيل (وضع التطوير)

```bash
npm run dev
```

---

## بناء التطبيق

```bash
# macOS → ينتج DMG
npm run build:mac

# Windows → ينتج EXE installer
npm run build:win

# Linux → ينتج AppImage
npm run build:linux
```

الملفات الناتجة تجدها في مجلد `dist/`.

---

## بنية المشروع

```
src/
├── main/                   # Electron Main Process (Node.js)
│   ├── index.ts            # إنشاء النافذة وإعدادات التطبيق
│   ├── ssh.ts              # محرك SSH (مكتبة ssh2)
│   ├── telnet.ts           # محرك Telnet (raw TCP sockets)
│   ├── store.ts            # قاعدة بيانات الاتصالات (electron-store)
│   └── credentials.ts      # تشفير كلمات السر (safeStorage)
│
├── preload/
│   └── index.ts            # جسر IPC آمن بين Main والـ UI
│
└── renderer/               # واجهة المستخدم (React + TypeScript)
    └── src/
        ├── App.tsx
        ├── store/          # State management (Zustand)
        ├── components/
        │   ├── TitleBar.tsx
        │   ├── WelcomeScreen.tsx
        │   ├── sidebar/
        │   │   ├── Sidebar.tsx
        │   │   └── ConnectionContextMenu.tsx
        │   ├── terminal/
        │   │   ├── TerminalArea.tsx
        │   │   ├── TabBar.tsx
        │   │   └── TerminalTab.tsx     # xterm.js
        │   └── dialogs/
        │       ├── ConnectionDialog.tsx  # إضافة/تعديل اتصال
        │       └── QuickConnect.tsx      # ⌘K palette
        └── types/
```

---

## كيف تستخدمه

### إضافة اتصال جديد

1. اضغط **+** في الشريط الجانبي
2. أدخل الاسم، الـ Host، البروتوكول (SSH/Telnet)، واسم المستخدم
3. اختر نوع الجهاز (Cisco، Juniper، Linux، إلخ)
4. احفظ — الاتصال يظهر في القائمة

### Quick Connect

اضغط **⌘K** (أو **Ctrl+K** على Windows) واكتب مثلاً:

```
admin@192.168.1.1:22
```

أو ابحث عن اتصال محفوظ بالاسم أو الـ IP.

### فتح اتصالات متعددة

كل مرة تضغط على اتصال أو تتصل عبر Quick Connect، يُفتح **Tab** جديد في نفس النافذة.

---

## التقنيات المستخدمة

| التقنية | الاستخدام |
|---|---|
| [Electron](https://www.electronjs.org) | إطار التطبيق (macOS + Windows) |
| [React](https://react.dev) + TypeScript | واجهة المستخدم |
| [electron-vite](https://electron-vite.org) | Build tool وHMR |
| [xterm.js](https://xtermjs.org) | محاكي الـ Terminal |
| [ssh2](https://github.com/mscdex/ssh2) | مكتبة SSH |
| [Tailwind CSS](https://tailwindcss.com) | التصميم |
| [Zustand](https://zustand-demo.pmnd.rs) | إدارة الحالة |
| [electron-store](https://github.com/sindresorhus/electron-store) | تخزين الاتصالات |

---

## الخارطة المستقبلية

- [ ] **AI Assistant** — تحليل الـ logs، اقتراح أوامر، استكشاف أخطاء الشبكة
- [ ] **SFTP Browser** — تصفح ونقل الملفات
- [ ] **Port Forwarding** — Local/Remote/Dynamic tunneling
- [ ] **Snippets** — حفظ أوامر متكررة وتشغيلها بضغطة زر
- [ ] **Serial Console** — الاتصال عبر الـ Serial Port
- [ ] **Jump Host** — الاتصال عبر Bastion/Jump server

---

## الترخيص

MIT © 2026 NetTerm
