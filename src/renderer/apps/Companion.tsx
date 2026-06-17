/**
 * Companion — read-only "What Clawd can do" panel.
 *
 * Lists every tool Clawd can invoke, every piece of context Clawd receives
 * each turn, persistent-memory location and size, the available windows,
 * the current app version, and global keyboard shortcuts. Nothing here
 * mutates state except the memory wipe + folder-open buttons, which
 * route through the existing settings IPC channels (so behavior is
 * exactly the same as the Settings window's controls).
 */
import { useEffect, useState } from 'react'
import type {
  Achievement,
  AchievementsState,
  AppSettings,
  CollectionState,
  MemoryInfo,
  PetStats,
  ToolCategory,
  ToolDescriptor
} from '@shared/types'

const CATEGORY_STYLE: Record<ToolCategory, string> = {
  todo: 'bg-accent/15 text-accent border-accent/40',
  memory: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  web: 'bg-amber-500/15 text-amber-200 border-amber-500/40'
}

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  todo: 'todo',
  memory: 'memory',
  web: 'web'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Compact "5m ago" / "2h ago" / "3d ago" string. */
function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

export function CompanionApp(): JSX.Element {
  const [tools, setTools] = useState<ToolDescriptor[]>([])
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [version, setVersion] = useState<string>('')
  const [clearingMemory, setClearingMemory] = useState(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [petStats, setPetStats] = useState<PetStats | null>(null)
  const [collection, setCollection] = useState<CollectionState | null>(null)
  const [achievementCatalog, setAchievementCatalog] = useState<Achievement[]>([])
  const [achievementsEarned, setAchievementsEarned] = useState<AchievementsState | null>(null)

  useEffect(() => {
    void window.api.companion.getToolset().then(setTools)
    void window.api.companion.getMemoryInfo().then(setMemory)
    void window.api.companion.getAppVersion().then(setVersion)
    void window.api.petting.getStats().then(setPetStats)
    void window.api.settings.get().then(setSettings)
    void window.api.collection.get().then(setCollection)
    void window.api.achievements.getCatalog().then(setAchievementCatalog)
    void window.api.achievements.getEarned().then(setAchievementsEarned)
    // Live-refresh on each pet so the count updates while Companion is open.
    const offPet = window.api.petting.onEvent(() => {
      void window.api.petting.getStats().then(setPetStats)
    })
    const offCollection = window.api.collection.onEvent(setCollection)
    const offAchievements = window.api.achievements.onEvent(setAchievementsEarned)
    return () => {
      offPet()
      offCollection()
      offAchievements()
    }
  }, [])

  const flash = (msg: string): void => {
    setSavedFlash(msg)
    window.setTimeout(() => setSavedFlash(null), 1500)
  }

  const refreshMemory = async (): Promise<void> => {
    const info = await window.api.companion.getMemoryInfo()
    setMemory(info)
  }

  const clearMemoryAction = async (): Promise<void> => {
    if (!confirm("Wipe all of Clawd's persistent memory? This can't be undone.")) return
    setClearingMemory(true)
    try {
      await window.api.settings.clearMemory()
      await refreshMemory()
      flash('Memory cleared')
    } catch (err) {
      alert(`Failed to clear memory: ${(err as Error).message}`)
    } finally {
      setClearingMemory(false)
    }
  }

  const webEnabled = settings?.enableWebSearch === true
  const memoryEnabled = settings?.enableMemory === true

  return (
    <div className="w-screen h-screen flex flex-col bg-bg text-textMain">
      <div className="drag flex items-center justify-between px-5 py-3 border-b border-white/5 bg-panel">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Companion</span>
          <span className="text-[10px] text-textMeta">What Clawd can do · v{version || '—'}</span>
        </div>
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none"
          onClick={() => window.api.companionWindow.close()}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar px-5 py-4 space-y-6">
        <Section
          title="Tools"
          hint="Tools Clawd can invoke during a chat. Always-on tools are registered every turn; opt-in tools depend on a setting."
        >
          <div className="space-y-1.5">
            {tools.map((t) => {
              const enabled = t.alwaysOn || (t.category === 'web' ? webEnabled : true)
              return (
                <div
                  key={t.name}
                  className="px-3 py-2 rounded-lg bg-bg/60 border border-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-textMain">{t.name}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${CATEGORY_STYLE[t.category]}`}
                    >
                      {CATEGORY_LABEL[t.category]}
                    </span>
                    <span
                      className={`ml-auto text-[10px] ${enabled ? 'text-success' : 'text-textMeta'}`}
                    >
                      {enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-textMeta leading-snug">
                    {firstSentence(t.description)}
                  </div>
                </div>
              )
            })}
            {tools.length === 0 && (
              <div className="text-[11px] text-textMeta">Loading…</div>
            )}
          </div>
        </Section>

        <Section
          title="Anthropic memory"
          hint="A protected folder Clawd reads and writes via the memory tool. Works across sessions."
        >
          <div className="px-3 py-2.5 rounded-lg bg-bg/60 border border-white/5 text-[11px] text-textMeta space-y-2">
            <Kv label="Folder" value={<span className="font-mono text-[10px] break-all">{memory?.root ?? '—'}</span>} />
            <Kv
              label="Size"
              value={memory ? `${formatBytes(memory.totalBytes)} across ${memory.fileCount} file${memory.fileCount === 1 ? '' : 's'}` : '—'}
            />
            <Kv label="Status" value={memoryEnabled ? <span className="text-success">enabled</span> : <span className="text-textMeta">disabled in Settings</span>} />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void window.api.settings.openMemoryDir()}
                className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
              >
                Open folder
              </button>
              <button
                onClick={clearMemoryAction}
                disabled={clearingMemory}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs hover:bg-red-500/30 disabled:opacity-50"
              >
                {clearingMemory ? 'Clearing…' : 'Clear memory'}
              </button>
            </div>
          </div>
        </Section>

        <Section
          title="Context Clawd gets each turn"
          hint="Everything below is built by main and injected into the system prompt before every reply."
        >
          <ul className="text-[11px] text-textMeta leading-relaxed list-disc pl-5 space-y-0.5">
            <li>The current local time and a coarse time-slot label (e.g. early morning, work hours).</li>
            <li>Your persona — the free-form text in Settings → Persona / system context.</li>
            <li>Today's open and completed todos, formatted compactly.</li>
            {memoryEnabled && <li>A pointer to the memory folder; Clawd is asked to view it on the first turn of each session.</li>}
            <li>The available tools (the same list as above) along with their descriptions.</li>
          </ul>
          {settings && (
            <details className="mt-2">
              <summary className="text-[11px] text-textMain cursor-pointer">Show your current persona text</summary>
              <pre className="mt-1.5 px-3 py-2 rounded-lg bg-bg/60 border border-white/5 text-[10px] text-textMeta whitespace-pre-wrap leading-snug max-h-40 overflow-y-auto scrollbar">
                {settings.userContext || '(empty — set one in Settings)'}
              </pre>
            </details>
          )}
        </Section>

        <Section title="Windows" hint="Each window is a separate, frameless React app.">
          <ul className="space-y-1.5 text-[11px]">
            <WindowItem name="Avatar" desc="Floating Clawd mascot, drag to move, scroll to resize, hover for a contextual nudge." />
            <WindowItem name="Chat" desc="Streaming conversation with Clawd; tool calls run inline. Cmd-C in any bubble copies; Copy all in header copies the whole transcript." />
            <WindowItem name="Todos" desc="Today's tasks with carry-forward from yesterday." />
            <WindowItem name="Pomodoro" desc="25/5/15 focus timer with phase-aware whispers and macOS notifications." />
            <WindowItem name="Settings" desc="API key, persona, model, hotkey, tool toggles, updates, pomodoro durations." />
            <WindowItem name="Companion" desc="This window. Read-only overview." />
          </ul>
        </Section>

        <Section
          title="Petting"
          hint="Right-click → Pet Clawd, or stroke back-and-forth on the avatar."
        >
          <div className="px-3 py-2.5 rounded-lg bg-bg/60 border border-white/5 text-[11px] text-textMeta space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-textMain font-mono text-2xl tabular-nums">
                {petStats?.count ?? 0}
              </span>
              <span>{petStats?.count === 1 ? 'pet' : 'pets'} given</span>
            </div>
            {petStats && petStats.lastPettedAt > 0 && (
              <div>Last petted {timeAgo(petStats.lastPettedAt)}.</div>
            )}
            <div className="pt-1 flex items-center gap-2">
              <button
                onClick={() => void window.api.petting.register()}
                className="px-3 py-1.5 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 text-xs hover:bg-pink-500/30"
              >
                Pet Clawd
              </button>
              <span className="text-[10px] text-textMeta">
                Milestones at 10, 50, 100, 500, 1000.
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Achievements"
          hint="Local milestones — earned across your time with Clawd."
        >
          <div className="grid grid-cols-3 gap-2">
            {achievementCatalog.map((a) => {
              const earnedRec = achievementsEarned?.earned.find((e) => e.id === a.id)
              const earned = !!earnedRec
              return (
                <div
                  key={a.id}
                  className={[
                    'px-2 py-2 rounded-lg border text-[10px] flex flex-col items-center gap-1 text-center',
                    earned
                      ? 'bg-accent/15 border-accent/40 text-textMain'
                      : 'bg-bg/40 border-white/5 text-textMeta opacity-60 grayscale'
                  ].join(' ')}
                  title={a.description}
                >
                  <span className="text-xl leading-none">{a.emoji}</span>
                  <span className="font-medium leading-tight">{a.label}</span>
                  <span className="text-[9px] leading-tight">
                    {earned ? `earned ${timeAgo(earnedRec.earnedAt)}` : a.description}
                  </span>
                </div>
              )
            })}
          </div>
        </Section>

        <Section
          title="Collection"
          hint="Earned every 4 completed pomodoros. Cap of 8 — older items rotate out."
        >
          {collection && collection.items.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 py-2.5 rounded-lg bg-bg/60 border border-white/5">
              {collection.items.map((it) => (
                <div
                  key={it.id}
                  title={`${it.label} · earned ${timeAgo(it.earnedAt)}`}
                  className="text-2xl leading-none"
                >
                  {it.emoji}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-textMeta italic">
              No keepsakes yet — complete a few pomodoros and Clawd will start collecting things.
            </div>
          )}
        </Section>

        <Section
          title="Modes & extras"
          hint="Things Clawd can do beyond chat and todos."
        >
          <ul className="space-y-1.5 text-[11px] text-textMeta leading-relaxed">
            <li>
              <span className="text-textMain font-medium">Petting</span> — right-click → Pet Clawd, or stroke (drag right then left) on the avatar. Lifetime counter + milestones at 10/50/100/500/1000.
            </li>
            <li>
              <span className="text-textMain font-medium">Sound effects</span> — synthesized cues for petting, snacks, pomodoro transitions, achievements, fun-mode wall bounces, and the Konami unlock. Mute via tray menu or Settings → Sounds.
            </li>
            <li>
              <span className="text-textMain font-medium">Wave / Tickle / High-five / Throw food / Sleep mode</span> — figure-8 cursor over Clawd waves; right-click → Tickle for a giggle; Space while pointer is over Clawd is a high-five; drag-drop a 🥬🥕🥦🍓🥝🍎🥥 (loved) or 🍕🍔🍟🌭🥩🍗 (rejected) onto Clawd; after 15 min idle Clawd curls up.
            </li>
            <li>
              <span className="text-textMain font-medium">Slash commands</span> — /todo /tools /pomodoro /pet /snack /tickle /fetch /fun /costume /me /8ball /dance /mute /settings /quit /help.
            </li>
            <li>
              <span className="text-textMain font-medium">Quick capture (⌘⇧T)</span> — tiny floating input. Type a todo, hit Enter, done.
            </li>
            <li>
              <span className="text-textMain font-medium">Schedules</span> — daily summary whisper at a configured hour, hour-bell during work hours, clipboard URL summarize-suggestions. All in Settings → Schedules.
            </li>
            <li>
              <span className="text-textMain font-medium">Mascot variants</span> — Mocha / Mint / Plum recolors via Settings → Mascot variant.
            </li>
            <li>
              <span className="text-textMain font-medium">Multi-line chat</span> — Shift-Enter or backslash-then-Enter inserts a newline; plain Enter sends.
            </li>
            <li>
              <span className="text-textMain font-medium">Snack</span> — right-click → Give Clawd a snack 🥬. Cooldown 4 s; Clawd does a chomp animation and says "nom nom nom".
            </li>
            <li>
              <span className="text-textMain font-medium">Fun mode</span> — Clawd runs, jumps, rolls, spins, and tumbles across the screen, bouncing off edges. Right-click → <span className="font-mono">Fun mode</span>. Click Clawd to stop.
            </li>
            <li>
              <span className="text-textMain font-medium">Play fetch (60 s)</span> — same physics as fun mode, time-bounded, with a 🎾 ball next to Clawd.
            </li>
            <li>
              <span className="text-textMain font-medium">Pomodoro</span> — focus blocks with breaks. Right-click → <span className="font-mono">Pomodoro…</span>. macOS notifications at phase transitions; Clawd whispers context-aware nudges.
            </li>
            <li>
              <span className="text-textMain font-medium">Pomodoro streak</span> — 🔥 N badge appears on Clawd while you have consecutive days with at least one completed focus block.
            </li>
            <li>
              <span className="text-textMain font-medium">Mood ring</span> — the status ring color reflects current state: pink right after a pet, blue/green during a pomodoro, amber if any todo is overdue, green when all done, default purple.
            </li>
            <li>
              <span className="text-textMain font-medium">Costumes</span> — right-click → Costume → choose santa, shades, party, or witch. Hat overlay rendered on top of Clawd.
            </li>
            <li>
              <span className="text-textMain font-medium">Birthday</span> — set a date in Settings; on that day Clawd wears the party hat and wishes you happy birthday on launch.
            </li>
            <li>
              <span className="text-textMain font-medium">Konami code</span> — press ↑ ↑ ↓ ↓ ← → ← → B A in any window to unlock a 30 s rave mode (rainbow ring).
            </li>
            <li>
              <span className="text-textMain font-medium">Collection</span> — every 4 completed pomodoros, Clawd earns a small keepsake (🪨, 🌸, ☕, 🍪, 🦋…) shown next to the avatar.
            </li>
            <li>
              <span className="text-textMain font-medium">Co-pilot gaze</span> — when chat opens, Clawd leans toward the chat window.
            </li>
            <li>
              <span className="text-textMain font-medium">Hover suggestions</span> — rest the cursor over Clawd for ~700 ms to get a contextual one-liner. Rate-limited to once a minute.
            </li>
            <li>
              <span className="text-textMain font-medium">Periodic whispers</span> — short, time-aware nudges based on your todos and the time of day.
            </li>
            <li>
              <span className="text-textMain font-medium">Idle alert</span> — after the configured idle window, Clawd's ring turns amber.
            </li>
            <li>
              <span className="text-textMain font-medium">Wake greeting</span> — when your Mac wakes from sleep, Clawd whispers a short hello.
            </li>
            <li>
              <span className="text-textMain font-medium">Emote reactions</span> — Clawd shows a 😅 emote when system load is high.
            </li>
            <li>
              <span className="text-textMain font-medium">Achievements</span> — earn badges for petting, snacking, pomodoros, daily todos. See them above this section.
            </li>
            <li>
              <span className="text-textMain font-medium">Auto-update</span> — checks GitHub Releases on launch and every 4 hours; downloads in the background and prompts to restart when ready.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void window.api.pomodoroWindow.open()}
              className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
            >
              Open Pomodoro
            </button>
            <button
              onClick={() => void window.api.avatar.funToggle()}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs hover:bg-amber-500/30"
            >
              Toggle fun mode
            </button>
            <button
              onClick={() => void window.api.avatar.funFetch()}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs hover:bg-emerald-500/30"
            >
              Play fetch (60 s)
            </button>
            <button
              onClick={() => void window.api.snack.give()}
              className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
            >
              Give snack 🥬
            </button>
          </div>
        </Section>

        <Section
          title="Slash commands"
          hint="Type these in chat to trigger an action without spending tokens."
        >
          <ul className="space-y-1 text-[11px] text-textMeta">
            <li><Kbd>/todo</Kbd> — open todo list</li>
            <li><Kbd>/tools</Kbd> or <Kbd>/companion</Kbd> — open this window</li>
            <li><Kbd>/pomodoro</Kbd> — open the focus timer</li>
            <li><Kbd>/pet</Kbd> — pet Clawd</li>
            <li><Kbd>/snack</Kbd> — give Clawd a snack</li>
            <li><Kbd>/fetch</Kbd> — play fetch (60 s)</li>
            <li><Kbd>/fun</Kbd> — toggle fun mode</li>
            <li><Kbd>/costume X</Kbd> — change costume (none, santa, shades, party, witch)</li>
            <li><Kbd>/settings</Kbd> — open Settings</li>
            <li><Kbd>/help</Kbd> — show this list inside chat</li>
            <li><Kbd>/quit</Kbd> — quit the app</li>
          </ul>
        </Section>

        <Section title="Keyboard & input">
          <ul className="space-y-1 text-[11px] text-textMeta leading-relaxed">
            <li><Kbd>{settings?.hotkey ?? 'CommandOrControl+Shift+C'}</Kbd> — global hotkey to open chat from anywhere.</li>
            <li><Kbd>Drag</Kbd> the avatar — moves it; snaps to screen edges within 20 px.</li>
            <li><Kbd>Scroll</Kbd> over the avatar — resizes between 40 and 120 px.</li>
            <li><Kbd>Right-click</Kbd> the avatar — opens the tray-style menu.</li>
            <li><Kbd>Hover</Kbd> for ~700 ms — shows a contextual one-liner (rate-limited to once a minute).</li>
            <li><Kbd>Stroke</Kbd> Clawd (drag right then left in the avatar slot) — pets Clawd.</li>
            <li><Kbd>↑↑↓↓←→←→BA</Kbd> — Konami code for 30 s rave mode.</li>
          </ul>
        </Section>

        <Section title="More">
          <div className="flex gap-2">
            <button
              onClick={() => void window.api.settingsWindow.open()}
              className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
            >
              Open Settings
            </button>
            <button
              onClick={() => void window.api.chat.open()}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent/90"
            >
              Open Chat
            </button>
          </div>
        </Section>
      </div>

      {savedFlash && (
        <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-accent text-white text-xs shadow-lg">
          {savedFlash}
        </div>
      )}
    </div>
  )
}

function firstSentence(text: string): string {
  // Trim Clawd-facing instruction text down to the first sentence/clause for the UI.
  const t = text.trim()
  const m = t.match(/^([^.!?]{0,180}[.!?])/)
  return (m ? m[1] : t).trim()
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-textMain">{title}</div>
      {hint && <div className="text-[11px] text-textMeta">{hint}</div>}
      <div>{children}</div>
    </div>
  )
}

function Kv({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-2">
      <span className="text-textMeta w-14 shrink-0">{label}</span>
      <span className="text-textMain min-w-0 break-all">{value}</span>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-bubble-user border border-white/10 text-textMain">
      {children}
    </span>
  )
}

function WindowItem({ name, desc }: { name: string; desc: string }): JSX.Element {
  return (
    <li className="flex gap-2">
      <span className="text-textMain w-16 shrink-0">{name}</span>
      <span className="text-textMeta">{desc}</span>
    </li>
  )
}
