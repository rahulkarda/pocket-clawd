<div align="center">

# pocket-clawd

**A pocket-sized Clawd that lives in your macOS menubar.**
Pixel-art mascot. Time-aware chat. Persistent memory. Tool use that runs your day.

[![version](https://img.shields.io/badge/version-0.4.0-D4622A?style=flat-square)](https://github.com/rahulkarda/pocket-clawd)
[![platform](https://img.shields.io/badge/platform-macOS%2013%2B-1a1208?style=flat-square)](https://github.com/rahulkarda/pocket-clawd)
[![license](https://img.shields.io/badge/license-MIT-E87030?style=flat-square)](LICENSE)
[![sdk](https://img.shields.io/badge/anthropic--sdk-0.104.1-F5C542?style=flat-square)](https://github.com/anthropics/anthropic-sdk-typescript)

</div>

---

Clawd lives on top of every space and every fullscreen app. He pulses gently while you work. He checks in at the right moments — not the wrong ones. Click him, a chat panel springs from his corner and Anthropic's SDK starts streaming. He remembers things across sessions, searches the web when needed, and manages your daily todos directly from the conversation. Finish them all and he bursts into a little pixel-art happy dance.

Type `done` and the conversation lands on disk as a structured markdown spec. Open the app tomorrow and Clawd already knows your name, the project you were stuck on, and which todos you carried over.

---

## Meet Clawd

Four states, all hand-placed `<rect>` elements on a 4px grid. No raster, no sprite sheet, no `transform: scale()` cheating — pure pixel art that scales crisply from 40px to 120px.

<table>
<thead>
<tr>
<th align="center" width="25%">idle</th>
<th align="center" width="25%">active</th>
<th align="center" width="25%">idle-alert</th>
<th align="center" width="25%">happy</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><img src="assets/clawd-idle.svg" width="120" alt="Clawd idle"/></td>
<td align="center"><img src="assets/clawd-active.svg" width="120" alt="Clawd active"/></td>
<td align="center"><img src="assets/clawd-idle-alert.svg" width="120" alt="Clawd idle-alert"/></td>
<td align="center"><img src="assets/clawd-happy.svg" width="120" alt="Clawd happy"/></td>
</tr>
<tr>
<td align="center"><sub><b>at rest</b></sub></td>
<td align="center"><sub><b>listening</b></sub></td>
<td align="center"><sub><b>dozing</b></sub></td>
<td align="center"><sub><b>celebrating</b></sub></td>
</tr>
<tr>
<td><sub>Neutral eyes, three stubby legs, slow 4-second breathing pulse. Calm and present without asking for attention.</sub></td>
<td><sub>Chat is open. Arms raised, an alert badge above the head, eye-shine pixels. Engaged and ready.</sub></td>
<td><sub>You've been away 30 minutes. Half-lid eyes, drooped arms, ascending zzz, faster 1.5s pulse, slightly desaturated. Sleepy, not sad.</sub></td>
<td><sub>Today's todos are done. Arc-smile, blush cheeks, asymmetric mid-skip legs, scattered yellow stars, spring-bounce.</sub></td>
</tr>
</tbody>
</table>

#### Palette

| token | hex | role |
|---|---|---|
| `clawd-idle` | `#D4622A` | default body |
| `clawd-active` | `#E06820` | engaged body |
| `clawd-alert` | `#C45A25` | desaturated, dozing |
| `clawd-happy` | `#E87030` | celebratory body |
| `accent-yellow` | `#F5C542` | badge, stars |
| `eye` | `#1a1208` | pupil, lineart |
| `cheek` | `#F0956A` | blush |

Source SVGs live in `assets/clawd-{idle,active,idle-alert,happy}.svg` and import as inline React components, so they animate from CSS and Framer Motion variants.

---

## Quick start

```bash
git clone https://github.com/rahulkarda/pocket-clawd.git
cd pocket-clawd
npm install
npm run build:icons
npm run dev
```

First launch will ask for your Anthropic API key. It goes into the macOS Keychain.

Optional — pre-seed the keychain so the first launch is silent:

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/seed-credentials.cjs
```

Build a distributable `.app`:

```bash
npm run package
# → dist/mac-arm64/Pocket Clawd.app
```

> macOS 13+. Code signing is roadmap, so first launch needs the right-click → Open dance.

---

## Architecture

Electron 32, electron-vite, React 18, TypeScript strict, Tailwind 3, Framer Motion 11. Four renderer processes (avatar, chat, todo, settings) talk to a single main process through a typed `contextBridge`. The Anthropic SDK lives only in main — renderers never see the key, never see the wire.

```
┌──────────────────────────────────────────────────────────────────────┐
│                            MAIN PROCESS                              │
│                                                                      │
│  ┌─────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │  Tray   │  │  IPC handlers │  │  Keychain    │  │ electron-   │   │
│  │  Menu   │  │  (typed)      │  │  (keytar)    │  │  store      │   │
│  └─────────┘  └───────┬───────┘  └──────────────┘  └─────────────┘   │
│                       │                                              │
│            ┌──────────▼──────────┐                                   │
│            │  anthropicClient.ts │  ◄── system prompt rebuilt every  │
│            │   (agentic loop)    │      request: time + persona +    │
│            └──────────┬──────────┘      todos + memory protocol      │
│                       │                                              │
│       while !end_turn (max 10 turns):                                │
│         stream → forward text deltas to chat renderer                │
│         if stop_reason === 'tool_use':                               │
│            ├── name === 'memory'  ──►  runMemory()  ──► memory.ts    │
│            └── otherwise           ──►  runTool()    ──► tools.ts    │
│         push tool_result as next user message                        │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ idleTracker │  │whisperEngine│  │  todoStore  │  │ specWriter  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                                      │
│   memory backend ──► ~/Documents/clawd-memory/  (path-guarded fs)    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │  contextBridge → window.api (typed) │
            │  contextIsolation · CSP · no node   │
            │  integration · no raw ipcRenderer   │
            └──────────────────┼──────────────────┘
                               │
   ┌───────────────┬───────────┼────────────┬─────────────────┐
   │               │           │            │                 │
┌──▼───────┐  ┌────▼─────┐  ┌──▼──────┐  ┌──▼──────────┐
│ AVATAR   │  │  CHAT    │  │  TODO   │  │  SETTINGS   │
│ panel    │  │ 380x520  │  │  panel  │  │  panel      │
│ drag/    │  │ frameless│  │ ring +  │  │ key, model, │
│ snap/    │  │ stream   │  │ rollover│  │ persona,    │
│ resize   │  │ (deltas) │  │         │  │ memory,     │
│          │  │          │  │         │  │ login item  │
└──────────┘  └──────────┘  └─────────┘  └─────────────┘
```

The agentic loop is the spine: stream tokens out, dispatch tool calls, feed results back, repeat until `end_turn` or the 10-turn ceiling. Memory and custom tool calls share the loop but split at dispatch — memory has its own backend with stricter validation.

The shape, abbreviated (see `src/main/anthropicClient.ts` for the real thing):

```typescript
let messages: Anthropic.MessageParam[] = [{ role: "user", content: userInput }];

for (let turn = 0; turn < 10; turn++) {
  const stream = client.messages.stream({
    model: settings.model,        // claude-sonnet-4-6 default
    max_tokens: 4096,
    system: buildSystemPrompt(),  // rebuilt every request
    tools: allTools,
    messages,
  });

  stream.on("text", (delta) => chatWindow.webContents.send("chat:delta", delta));
  const response = await stream.finalMessage();
  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason === "end_turn") break;

  if (response.stop_reason === "tool_use") {
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of response.content.filter(b => b.type === "tool_use")) {
      const out = tu.name === "memory"
        ? await runMemory(tu.input)        // memory.ts — fs ops + guard
        : await runTool(tu.name, tu.input); // tools.ts — todo CRUD + grep
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
    continue;
  }

  break; // pause_turn, refusal, max_tokens, etc.
}
```

Text deltas forward to the renderer in real time; tool calls and their results don't, so the panel feels like a chat instead of a debugger.

---

## Tools

Seven capabilities at the table — five local, one Anthropic-hosted, one local-backed memory tool dispatched through Anthropic's `memory_20250818`.

| tool | kind | what it does |
|---|---|---|
| `add_todo(text)` | local | Adds a todo. Length-capped at 500 chars. |
| `complete_todo(id_or_text)` | local | Fuzzy substring match — say it like a human, get it checked off. |
| `delete_todo(id_or_text)` | local | Same fuzzy resolver, removes the entry. |
| `list_todos()` | local | Returns `id` / `text` / `done` JSON for the agent to reason over. |
| `search_past_sessions(query, limit?)` | local | Greps `*.spec.md` in the sessions dir, up to 20 hits with date / time / snippet. |
| `web_search_20260209` | server (Anthropic) | Current events and post-cutoff facts. Capped at 5 uses per turn. |
| `memory_20250818` | server-typed, local-backed | Persistent file-backed memory. Six commands. See below. |

Tools are always-on. You never leave the chat panel to manage your day — tell Clawd "knock out the design review todo and add one for the regression sweep" and the panel stays a conversation.

> `web_fetch` is referenced in the system prompt but is **not** registered as a tool today. Honest disclosure rather than aspirational marketing.

---

## Memory

Clawd uses Anthropic's `memory_20250818` tool, backed by `~/Documents/clawd-memory/`. The power lives in the file system; the design choice lives in the *protocol*.

#### Layout

Clawd self-organizes the store. The conventional shape:

```
~/Documents/clawd-memory/memories/
├── about_user.md          # durable facts: name, role, projects
├── recent_topics.md       # last 2-3 weeks of recurring threads
└── notes/
    ├── auth-flow.md       # deeper per-topic notes
    └── design-system.md
```

Six commands available to the model: `view` · `create` · `str_replace` · `insert` · `delete` · `rename`.

#### Protocol (baked into the system prompt)

- **First turn of a session:** view `/memories`, read `about_user.md` if present.
- **During the conversation:** write durable facts inline — preferences, corrections, recurring practices, project names.
- **Never store:** secrets, "forget this" content, ephemeral state (mood, lunch, what time the meeting was).
- **Don't paste memory back verbatim.** Weave it naturally — the user shouldn't feel surveilled. If yesterday you said you were stuck on the auth flow, today's greeting is "morning — still on auth, or moving on?" not "I remember you said yesterday at 3:42pm…"
- **On `done`:** write any new durable facts before emitting `<SPEC_READY>`.

#### Guard rails

- Paths must start with `/memories`. No `..`, no absolute paths, no symlink escapes — rejected with an explicit error.
- Per-file cap: **100 KB**. Per-store cap: **10 MB**.
- All writes go through validation in `memory.ts` before they touch the disk.

#### Inspect or clear

- **Settings → Open memory folder** opens Finder at the directory. The folder is plain markdown — read it, edit it, version it.
- **Settings → Clear memory** wipes the store with a confirmation dialog.

---

## Features

#### Floating avatar

A `BrowserWindow` of `type: 'panel'` with `transparent: true`, `backgroundColor: '#00000000'`, `hasShadow: false`, `alwaysOnTop: true`. Floats over fullscreen apps and across spaces.

- **Drag anywhere** — JS-driven `mousedown`/`move`/`up` with a 5px click-vs-drag threshold. Under 5px = click → opens chat; over 5px = drag → moves the window. The previous `-webkit-app-region: drag` approach couldn't do arbitrary-position drags on macOS panels. This one can.
- **Edge snap** — within 20px of any work-area edge, snaps with a 16px margin.
- **Scroll to resize** — 40-120px, persisted across launches.
- **Position persists.** Right-click for the context menu.
- **Cannot be closed via ⌘W** — that would orphan the app. Only **Quit Clawd** (tray menu / ⌘Q) actually exits.

#### Streaming chat

380×520 frameless panel, springs from the avatar's nearest corner via Framer Motion. Streams tokens as they arrive from `@anthropic-ai/sdk`. The system prompt is rebuilt every request from current time slot, persona, todos snapshot, memory protocol, and `<SPEC_READY>` emission rules.

Type `done` to wrap up — Clawd writes a `<SPEC_READY>` block, the main process parses it out, and a structured `.spec.md` lands on disk. Default model: `claude-sonnet-4-6`. Switchable to `claude-opus-4-8` or `claude-haiku-4-5` from settings.

#### Daily todos with progress ring

A separate floating panel — add, check, delete. The avatar's surrounding ring tracks completion. At 100% the ring turns green and Clawd bursts into the **happy** state with the spring-bounce. At midnight, completed todos archive to JSON+md and incomplete ones become a `carry over from yesterday?` prompt at the start of the next chat.

#### Whisper engine

Every 8-12 minutes (randomized) Clawd makes a lightweight call (`max_tokens: 30`) and produces a context-aware nudge as a fading tooltip over the avatar. A 24-hour dedup cache keeps the same whisper from repeating. Time-aware, persona-aware, and gated on the idle-alert state if you opt in.

#### Idle alert

`powerMonitor.getSystemIdleTime()` polled every 30 seconds. After threshold (default 30 min, configurable 15/30/45/60/90/120) the avatar swaps to **idle-alert** and optionally fires a whisper.

#### Sessions as structured markdown

On `done`:

```yaml
---
date: 2026-06-15
time: 14:32
slot: afternoon
duration_min: 47
topics: [auth-flow, design-system]
mood: focused
energy: medium
---
```

…followed by a 150-word Claude-generated summary, **Key Points**, **Next Actions**, and the raw transcript. Saved to `~/Documents/claude-sessions/<date>_<time>.spec.md`. **View last session** in the tray menu opens the latest file.

#### Auto-launch at login

Settings → `Open at login` calls `app.setLoginItemSettings()`. macOS rejects this for unsigned apps, so the toggle shows an honest *"macOS needs your help"* banner with a one-click deep-link to **System Settings → Login Items**. No silent failure. Once code signing lands, the dance goes away.

---

## Defaults

| setting | default |
|---|---|
| hotkey | ⌘⇧C |
| model | `claude-sonnet-4-6` (switchable to `opus-4-8` / `haiku-4-5`) |
| sessions dir | `~/Documents/claude-sessions/` |
| memory dir | `~/Documents/clawd-memory/` |
| avatar size | 64px (40-120 via scroll/slider) |
| avatar position | bottom-right, drag anywhere |
| whisper interval | 8-12 min, randomized |
| idle alert | 30 min (15 / 30 / 45 / 60 / 90 / 120) |
| web search | on (Anthropic-hosted, billed per use) |
| memory | on |
| open at login | off |

---

## Stack

| layer | choice |
|---|---|
| shell | Electron 32 + electron-vite |
| ui | React 18 + TypeScript strict |
| style | Tailwind 3 |
| motion | Framer Motion 11 |
| llm | `@anthropic-ai/sdk` 0.104.1 |
| keychain | `keytar` 7.9 |
| storage | `electron-store` 8.2 |
| ids | `nanoid` 3.3 (CJS-compatible) |

---

## Security

- **API key in macOS Keychain only**, via `keytar`. Verified with the `security` CLI and a leak scan over the dist bundle. The renderer surface exposes `setApiKey`, `clearApiKey`, and `apiKeyPresent` — no `getApiKey`. The SDK is instantiated in main; the key never crosses the IPC boundary.
- **All IPC inputs sanitized.** Strings length-clamped, numbers `NaN`-guarded, booleans coerced.
- **Memory tool guard rails.** Path-traversal blocked, per-file 100KB and per-store 10MB caps, no symlink escape, explicit errors on any escape attempt.
- **CSP on every renderer.** `contextIsolation: true`, `nodeIntegration: false`, no inline scripts, no `eval`, no remote loads.
- **Avatar window uncloseable via ⌘W** — only **Quit Clawd** ends the app. Avoids the "I closed the window and now the app is a ghost in the tray" failure mode.

---

## Roadmap

Honest accounting of what is **not** in 0.4.0:

- [ ] Code signing + notarization (so "open at login" works without the System Settings dance)
- [ ] Light theme
- [ ] Resume an interrupted session
- [ ] Custom mascot upload
- [ ] Windows + Linux ports
- [ ] Voice input
- [ ] Image input

Open an issue if you want any of these.

---

## Changelog

<details>
<summary><b>0.4.0</b> — current</summary>

- Renamed `pocket-claude` → `pocket-clawd`
- Anthropic SDK upgraded `0.30` → `0.104.1`
- Agentic loop with tool use (max 10 turns, streaming preserved)
- Five custom tools: todo CRUD + past-session search
- `web_search` server tool registered (Anthropic-hosted)
- Persistent memory (`memory_20250818`) with local fs backend, guard rails, size caps
- Memory protocol baked into the system prompt
- Avatar drag-anywhere via JS (the old `-webkit-app-region: drag` couldn't do arbitrary positions on macOS panels)
- Avatar fully transparent — no white square behind the SVG
- Avatar uncloseable except via explicit Quit
- "Open at login" toggle with honest unsigned-app banner
- UI rename Claude → Clawd in tray, chat header, and context menus

</details>

---

## License

MIT © [rahulkarda](https://github.com/rahulkarda). See [LICENSE](LICENSE).

<div align="center"><sub>drawn on a 4px grid</sub></div>
