<div align="center">

<img src="assets/clawd-active.svg" width="120" height="120" alt="Clawd, the pocket-claude mascot" />

# pocket-claude

**A pocket-sized Claude that lives in your macOS menubar.**

A floating pixel-art mascot. Time-aware check-ins. Daily todos with a live progress ring. Sessions saved as structured markdown.

[![Electron 32](https://img.shields.io/badge/electron-32-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React 18](https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript strict](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind 3](https://img.shields.io/badge/tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Anthropic SDK](https://img.shields.io/badge/anthropic--sdk-0.30-D97757)](https://github.com/anthropics/anthropic-sdk-typescript)
[![macOS](https://img.shields.io/badge/macOS-13%2B-000000?logo=apple)](https://www.apple.com/macos/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

---

## Meet Clawd

Clawd is the pixel-art mascot at the heart of pocket-claude. It lives in the corner of your screen, breathes gently, and shifts mood through the day.

<table align="center">
  <tr>
    <td align="center" width="180"><img src="assets/clawd-idle.svg" width="96" /></td>
    <td align="center" width="180"><img src="assets/clawd-active.svg" width="96" /></td>
    <td align="center" width="180"><img src="assets/clawd-idle-alert.svg" width="96" /></td>
    <td align="center" width="180"><img src="assets/clawd-happy.svg" width="96" /></td>
  </tr>
  <tr>
    <td align="center"><b>idle</b><br/><sub>calm · 4s breathing pulse</sub></td>
    <td align="center"><b>active</b><br/><sub>chat open · arms up · ! badge</sub></td>
    <td align="center"><b>idle-alert</b><br/><sub>30 min idle · ascending zzz</sub></td>
    <td align="center"><b>happy</b><br/><sub>all todos done · star burst</sub></td>
  </tr>
</table>

Pure pixel art — every shape is an axis-aligned rect on a 4 px grid. The four states are switched by a small state machine in the main process and animated in the renderer with Framer Motion. Right-click for the context menu, scroll to resize, drag to reposition with edge-snapping.

---

## Why

LLM chat windows are great when you remember to open them, and forgotten the rest of the day. pocket-claude flips that: the assistant lives next to your work, asks you one focused question at the hour that matters, and quietly saves a structured record of what you said.

| Hour | Slot | Default opener |
|---:|---|---|
| 04:00 | Brahma Muhurta | sadhana / morning intention |
| 06:30 | Morning | priorities for the day |
| 09:00 | Work | current task, blockers, progress |
| 18:00 | Evening | wind-down / reflection |
| 21:00 | Night | what was accomplished, what carries forward |

The persona Claude adopts is yours to shape — fully editable in Settings.

---

## What you get

- **Floating Clawd avatar** — bottom-right corner by default. Always-on-top across spaces and fullscreen apps. Drag to reposition (snaps to any screen edge). Scroll to resize (40–120 px). Position and size persist across launches.
- **Streaming chat panel** — springs open from the avatar's corner with a 380 × 520 frameless window. Streaming responses via the official Anthropic SDK. Type `done` to end the session and save it.
- **Time-aware system prompt** — built per-request from the current time slot, your editable persona, and a snapshot of today's todos.
- **Daily todo list** — separate floating panel. Live progress ring around the avatar updates on every check / uncheck. When you complete the last todo, the avatar bursts into the **happy** state.
- **Whisper engine** — randomized 8–12 minute lightweight Claude calls (`max_tokens: 30`) generate context-aware nudges that fade in as a tooltip over the avatar. Cached for 24 hours so you don't see the same whisper twice.
- **Idle alert** — `powerMonitor.getSystemIdleTime()` is polled every 30 s; after the configured threshold the avatar shifts to `idle-alert` and (if enabled) surfaces an immediate whisper.
- **Session output** — every session saves to `~/Documents/claude-sessions/YYYY-MM-DD_HH-MM.spec.md` with YAML frontmatter, a Claude-generated summary, key points, next actions, and the full transcript.
- **Daily todo archive** — at midnight, completed todos archive as JSON + markdown summary; incomplete todos surface as a "carry over from yesterday?" prompt at the start of the next day's first chat session.
- **Macros for the menubar** — global hotkey (default `⌘⇧C`), tray icon, "View last session" → opens the most recent `.spec.md` in your default editor.

---

## Quick start

> **Requires:** macOS 13+, Node.js 20+, an Anthropic API key.

```bash
git clone https://github.com/rahulkarda/pocket-claude.git
cd pocket-claude
npm install
npm run build:icons    # rasterizes the tray template SVG to PNG (needs sharp)
npm run dev
```

On first launch the Settings window opens automatically. Paste your Anthropic API key (it's stored in macOS Keychain — never in plaintext on disk), pick a model, and close the window. The tray icon and floating Clawd appear immediately.

### Optional: skip the Settings UI on first launch

If you'd rather seed credentials from environment variables before the first `npm run dev`:

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/seed-credentials.cjs
```

This writes the key to Keychain and marks `onboarded: true` in the settings file.

### Optional: route through a custom proxy

If your org routes Anthropic API calls through an internal gateway, paste the gateway URL in **Settings → API Base URL**. The SDK appends `/v1/...` to whatever you set. Empty means use `api.anthropic.com` directly.

---

## Architecture

```text
Main process (Electron + Node)                Renderer processes (React + Tailwind)
┌─────────────────────────────┐              ┌──────────────────────────────────┐
│  Tray ─────────────────┐    │              │  Avatar window (always-on-top)   │
│  Avatar window (panel) │    │   IPC        │   - Clawd state machine          │
│  Chat window (panel)   │ ◄──┼──preload────►│   - Progress ring                │
│  Todo window (panel)   │    │              │   - Whisper tooltip              │
│  Settings window       │    │              ├──────────────────────────────────┤
│                        │    │              │  Chat window                     │
│  Anthropic SDK ────────┤    │              │   - Streaming UI                 │
│   - streaming chat     │    │              │   - Carry-forward prompt         │
│   - one-shot whisper   │    │              ├──────────────────────────────────┤
│                        │    │              │  Todo window  ·  Settings window │
│  Keychain (keytar)     │    │              └──────────────────────────────────┘
│  electron-store        │
│   - settings           │
│   - todos              │
│   - whisper cache      │
│  idleTracker           │
│  whisperEngine         │
│  specWriter            │
└─────────────────────────────┘
```

### File layout

```text
src/
├── main/                       Electron main process
│   ├── index.ts                Entry · bootstrap · single-instance lock
│   ├── tray.ts                 Menubar tray + right-click menu
│   ├── avatarWindow.ts         Floating panel · drag-to-snap
│   ├── chatWindow.ts           Frameless chat panel
│   ├── secondaryWindows.ts     Todo + Settings windows
│   ├── avatarMenu.ts           Avatar right-click menu
│   ├── hotkey.ts               Global shortcut registration
│   ├── idleTracker.ts          powerMonitor poll → 'idle-alert' / 'active'
│   ├── todoStore.ts            Daily todos · midnight rollover · archive
│   ├── specWriter.ts           Extract <SPEC_READY> · write .spec.md
│   ├── whisperEngine.ts        Background ambient nudges · 24h dedup cache
│   ├── anthropicClient.ts      SDK streaming · system prompt builder
│   ├── keychain.ts             keytar wrapper
│   ├── settings.ts             electron-store
│   ├── ipcHandlers.ts          Centralized IPC + input sanitization
│   └── logger.ts
├── preload/
│   ├── index.ts                Typed contextBridge → window.api
│   └── global.d.ts
├── renderer/
│   ├── *.html / *.tsx          Four entries: avatar · chat · todo · settings
│   ├── apps/                   One App component per window
│   ├── components/             Clawd · ProgressRing · Header · Message · …
│   ├── lib/                    Renderer helpers (stripSpec, etc.)
│   └── global.d.ts             Renderer-side window.api type augmentation
└── shared/
    ├── types.ts                Cross-process types
    ├── ipc.ts                  Channel name constants
    └── time.ts                 Time-slot mapper · date keys

assets/
├── clawd-idle.svg              neutral · breathing
├── clawd-active.svg            chat open · arms up · ! badge
├── clawd-idle-alert.svg        squinted · drooped arms · zzz
├── clawd-happy.svg             todos done · star burst
└── tray-iconTemplate.svg       Menubar template (auto-rasterized)
```

### How chat works

1. The user sends a message; the renderer pushes the full `ChatMessage[]` history over IPC to the main process.
2. `anthropicClient.ts` builds a fresh system prompt at request time from: current time + slot label, the editable persona from settings, a snapshot of today's todos, and instructions to end the session by emitting `<SPEC_READY>...</SPEC_READY>` when the user types `done`.
3. The main process opens an SDK stream and forwards each text delta back to the chat renderer over IPC for token-by-token display.
4. When the stream completes, main scans the accumulated text for `<SPEC_READY>...</SPEC_READY>`. If present, the block is written to `~/Documents/claude-sessions/<date>_<time>.spec.md` together with the formatted transcript.

> **Note on stop sequences:** Anthropic's `stop_sequences` parameter would terminate generation right at the opening tag, so the body would never be returned. Instead, pocket-claude lets the response complete naturally and parses the closing tag once the stream ends. This keeps streaming UX intact.

---

## Defaults

| Setting | Default | Editable |
|---|---|---|
| Hotkey | `⌘⇧C` | yes |
| Model | `claude-sonnet-4-6` | yes (Opus 4.8 / Haiku 4.5 also available) |
| Output dir | `~/Documents/claude-sessions/` | yes |
| Avatar size | 64 px | yes (40–120, slider + scroll-resize) |
| Avatar position | bottom-right | drag anywhere; persists |
| Whisper interval | 8–12 minutes (randomized) | yes |
| Idle alert | after 30 minutes | yes (15 / 30 / 45 / 60 / 90 / 120) |
| Whisper on idle alert | on | toggle |
| Show on all spaces | on | toggle (incl. fullscreen) |
| Persona | generic placeholder | edit in Settings to personalize |

---

## Security & data

- **API key storage:** macOS Keychain via `keytar`. Never on disk in plaintext.
- **Renderer surface:** preload exposes `setApiKey`, `clearApiKey`, `apiKeyPresent` (boolean) — there is **no IPC channel that returns the key value to a renderer**.
- **Renderer hardening:** every window has `contextIsolation: true`, `nodeIntegration: false`. CSPs limit `connect-src` so renderers can't make their own outbound HTTP. The SDK is called from main, not the renderer.
- **Input sanitization:** all settings updates are length-clamped and numerically validated server-side in the main process to prevent NaN propagation, oversized fields, etc.
- **Session output:** transcripts and todo archives stay on your disk — nothing is uploaded anywhere except the Anthropic API call itself.

---

## Build

```bash
npm run typecheck     # tsc --noEmit on both node + web tsconfigs
npm run build         # bundle main + preload + renderer
npm run package       # mac dmg, unsigned   (output in dist/)
npm run dist          # full electron-builder dist
```

Unsigned builds open with a Gatekeeper warning on first launch (`right-click → Open` once to bypass). Adding a Developer ID for code signing is on the roadmap.

---

## Roadmap

- [ ] Code signing (Apple Developer ID) and notarization
- [ ] Light theme toggle
- [ ] Resume an interrupted session
- [ ] Custom mascot upload
- [ ] Windows + Linux ports
- [ ] Optional voice input via the OS speech framework

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<sub>Built on top of <a href="https://github.com/anthropics/anthropic-sdk-typescript">@anthropic-ai/sdk</a>, <a href="https://www.electronjs.org/">Electron</a>, and a lot of pixel art.</sub>
</div>
