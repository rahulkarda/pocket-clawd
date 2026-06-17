import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type AppSettings, type UpdaterStatus } from '@shared/types'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)' }
]

export function SettingsApp(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [apiKey, setApiKey] = useState('')
  const [keyPresent, setKeyPresent] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [loginItemMismatch, setLoginItemMismatch] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus>({ state: 'idle' })
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // Subscribe to updater status broadcasts and prime with last-known.
  useEffect(() => {
    void window.api.updater.getLast().then(setUpdaterStatus)
    return window.api.updater.onStatus(setUpdaterStatus)
  }, [])

  const checkForUpdates = async (): Promise<void> => {
    setCheckingUpdate(true)
    try {
      const status = await window.api.updater.checkNow()
      setUpdaterStatus(status)
    } finally {
      setCheckingUpdate(false)
    }
  }

  // Compare what the user wants (settings.openAtLogin) with what macOS
  // actually has registered. Unsigned apps fail setLoginItemSettings
  // silently — this surfaces the gap so the user knows to register
  // manually via System Settings.
  const refreshLoginItem = async (): Promise<void> => {
    try {
      const status = await window.api.settings.loginItemStatus()
      setLoginItemMismatch(status.mismatch)
    } catch {
      setLoginItemMismatch(false)
    }
  }

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    void window.api.settings.apiKeyPresent().then(setKeyPresent)
    void refreshLoginItem()
  }, [])

  const flash = (msg: string): void => {
    setSavedFlash(msg)
    window.setTimeout(() => setSavedFlash(null), 1500)
  }

  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.settings.update(patch)
    setSettings(next)
    if (patch.openAtLogin !== undefined) {
      // Re-check after a short delay — macOS sometimes takes a moment to register
      window.setTimeout(() => void refreshLoginItem(), 250)
    }
    flash('Saved')
  }

  const saveKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setSavingKey(true)
    try {
      await window.api.settings.setApiKey(apiKey.trim())
      setKeyPresent(true)
      setApiKey('')
      flash('API key stored in Keychain')
    } finally {
      setSavingKey(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    if (!confirm('Remove the stored API key?')) return
    await window.api.settings.clearApiKey()
    setKeyPresent(false)
    flash('API key cleared')
  }

  const clearMemoryAction = async (): Promise<void> => {
    if (!confirm("Wipe all of Clawd's persistent memory? This can't be undone.")) return
    setClearingMemory(true)
    try {
      await window.api.settings.clearMemory()
      flash('Memory cleared')
    } catch (err) {
      alert(`Failed to clear memory: ${(err as Error).message}`)
    } finally {
      setClearingMemory(false)
    }
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.settings.pickOutputDir()
    if (dir) setSettings((s) => ({ ...s, outputDir: dir }))
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-bg text-textMain">
      <div className="drag flex items-center justify-between px-5 py-3 border-b border-white/5 bg-panel">
        <span className="text-sm font-medium">Settings</span>
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none"
          onClick={() => window.api.settingsWindow.close()}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar px-5 py-4 space-y-5">
        <Section title="Anthropic API Key" hint="Stored in macOS Keychain.">
          {keyPresent ? (
            <div className="flex items-center gap-2">
              <span className="text-success text-xs">✓ Stored in Keychain</span>
              <button onClick={clearKey} className="ml-auto text-xs text-textMeta hover:text-red-400">
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-…"
                className="flex-1 bg-bg/80 border border-white/10 text-textMain text-xs font-mono rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40"
              />
              <button
                onClick={saveKey}
                disabled={!apiKey.trim() || savingKey}
                className="px-3 py-2 rounded-lg bg-accent text-white text-xs disabled:opacity-30"
              >
                Save
              </button>
            </div>
          )}
        </Section>

        <Section title="Model">
          <select
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            className="w-full bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-3 py-2 outline-none"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Section>

        <Section
          title="API Base URL"
          hint="Empty = api.anthropic.com. Set a custom proxy URL only if you route Anthropic API calls through one (e.g. an enterprise gateway)."
        >
          <input
            value={settings.baseURL}
            onChange={(e) => setSettings((s) => ({ ...s, baseURL: e.target.value }))}
            onBlur={() => update({ baseURL: settings.baseURL.trim() })}
            placeholder="https://your-proxy.example.com"
            className="w-full bg-bg/80 border border-white/10 text-textMain text-xs font-mono rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40"
          />
        </Section>

        <Section title="Global Hotkey" hint="Format: CommandOrControl+Shift+C">
          <input
            value={settings.hotkey}
            onChange={(e) => setSettings((s) => ({ ...s, hotkey: e.target.value }))}
            onBlur={() => update({ hotkey: settings.hotkey })}
            className="w-full bg-bg/80 border border-white/10 text-textMain text-xs font-mono rounded-lg px-3 py-2 outline-none"
          />
        </Section>

        <Section title="Output Directory" hint="Where session .spec.md files are saved.">
          <div className="flex gap-2">
            <input
              value={settings.outputDir}
              readOnly
              className="flex-1 bg-bg/80 border border-white/10 text-textMain text-xs font-mono rounded-lg px-3 py-2 outline-none"
            />
            <button
              onClick={pickDir}
              className="px-3 py-2 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
            >
              Browse…
            </button>
          </div>
        </Section>

        <Section title="Avatar Size">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={40}
              max={120}
              step={4}
              value={settings.avatarSize}
              onChange={(e) =>
                setSettings((s) => ({ ...s, avatarSize: Number(e.target.value) }))
              }
              onMouseUp={() => update({ avatarSize: settings.avatarSize })}
              className="flex-1 accent-accent"
            />
            <span className="text-xs text-textMeta w-12 text-right">{settings.avatarSize}px</span>
          </div>
        </Section>

        <Section title="Whisper Interval (minutes, randomized)">
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              max={60}
              value={settings.whisperIntervalMin}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                update({ whisperIntervalMin: Math.max(1, Math.min(60, n)) })
              }}
              className="w-20 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
            />
            <span className="text-textMeta text-xs">to</span>
            <input
              type="number"
              min={1}
              max={60}
              value={settings.whisperIntervalMax}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                update({
                  whisperIntervalMax: Math.max(
                    settings.whisperIntervalMin,
                    Math.min(60, n)
                  )
                })
              }}
              className="w-20 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
            />
          </div>
        </Section>

        <Section title="Idle alert after (minutes)">
          <select
            value={settings.idleAlertMinutes}
            onChange={(e) => update({ idleAlertMinutes: Number(e.target.value) })}
            className="w-full bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-3 py-2 outline-none"
          >
            {[15, 30, 45, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Section>

        <Section title="Behavior">
          <Toggle
            label="Open at login"
            value={settings.openAtLogin}
            onChange={(v) => update({ openAtLogin: v })}
          />
          {loginItemMismatch && settings.openAtLogin && (
            <div className="mt-1 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed">
              <span className="font-medium">macOS needs your help.</span>{' '}
              Unsigned apps can't add themselves to Login Items, so the toggle
              above is informational only. Add Pocket Claude manually:
              <button
                onClick={() => void window.api.settings.openLoginItemsPane()}
                className="ml-1 underline decoration-dotted hover:text-amber-100"
              >
                open System Settings → Login Items
              </button>{' '}
              then click <span className="font-mono">+</span> and choose{' '}
              <span className="font-mono">/Applications/Pocket&nbsp;Claude.app</span>.
            </div>
          )}
          <Toggle
            label="Surface a whisper when going idle"
            value={settings.whisperOnIdleAlert}
            onChange={(v) => update({ whisperOnIdleAlert: v })}
          />
          <Toggle
            label="Show on all spaces (incl. fullscreen)"
            value={settings.showOnAllSpaces}
            onChange={(v) => update({ showOnAllSpaces: v })}
          />
          <Toggle
            label="Greet me when my Mac wakes up"
            value={settings.wakeGreetings}
            onChange={(v) => update({ wakeGreetings: v })}
          />
        </Section>

        <Section
          title="Tools & memory"
          hint="Clawd uses tools to manage todos, search past sessions, browse the web, and remember things between sessions."
        >
          <Toggle
            label="Web search (DuckDuckGo, free, may rate-limit)"
            value={settings.enableWebSearch}
            onChange={(v) => update({ enableWebSearch: v })}
          />
          <Toggle
            label="Persistent memory across sessions"
            value={settings.enableMemory}
            onChange={(v) => update({ enableMemory: v })}
          />
          {settings.enableMemory && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void window.api.settings.openMemoryDir()}
                className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80"
              >
                Open memory folder
              </button>
              <button
                onClick={clearMemoryAction}
                disabled={clearingMemory}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs hover:bg-red-500/30 disabled:opacity-50"
              >
                {clearingMemory ? 'Clearing…' : 'Clear memory'}
              </button>
            </div>
          )}
        </Section>

        <Section
          title="Sounds"
          hint="Synthesized cues for petting, snacks, pomodoro transitions, and more."
        >
          <Toggle
            label="Mute all sounds"
            value={settings.mute}
            onChange={(v) => update({ mute: v })}
          />
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[11px] text-textMeta w-14">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) =>
                setSettings((s) => ({ ...s, volume: Number(e.target.value) }))
              }
              onMouseUp={() => update({ volume: settings.volume })}
              disabled={settings.mute}
              className="flex-1 accent-accent"
            />
            <span className="text-xs text-textMeta w-10 text-right">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
        </Section>

        <Section
          title="Mascot variant"
          hint="Color the avatar via a CSS hue shift. Costumes / costume hats stack on top."
        >
          <div className="flex gap-2">
            {(['clawd', 'mocha', 'mint', 'plum'] as const).map((v) => (
              <button
                key={v}
                onClick={() => update({ mascotVariant: v })}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  settings.mascotVariant === v
                    ? 'bg-accent text-white border-accent'
                    : 'bg-bg/60 text-textMain border-white/10 hover:bg-bg/80'
                ].join(' ')}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Schedules"
          hint={`Daily summary whisper, hour bell, and clipboard URL suggestions. All times are local (${Intl.DateTimeFormat().resolvedOptions().timeZone || 'system'}).`}
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <span className="text-[11px] text-textMeta w-44">Daily summary at hour (-1 to disable)</span>
              <input
                type="number"
                min={-1}
                max={23}
                value={settings.summaryHour}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, summaryHour: Number(e.target.value) }))
                }
                onBlur={() => update({ summaryHour: settings.summaryHour })}
                className="w-20 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
              />
            </label>
            <Toggle
              label="Hour bell during work hours"
              value={settings.hourBellEnabled}
              onChange={(v) => update({ hourBellEnabled: v })}
            />
            {settings.hourBellEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-textMeta w-12">From</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={settings.hourBellStart}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, hourBellStart: Number(e.target.value) }))
                  }
                  onBlur={() => update({ hourBellStart: settings.hourBellStart })}
                  className="w-16 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
                />
                <span className="text-[11px] text-textMeta">to</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={settings.hourBellEnd}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, hourBellEnd: Number(e.target.value) }))
                  }
                  onBlur={() => update({ hourBellEnd: settings.hourBellEnd })}
                  className="w-16 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
                />
              </div>
            )}
            <Toggle
              label="Suggest summarizing copied URLs"
              value={settings.clipboardSuggestions}
              onChange={(v) => update({ clipboardSuggestions: v })}
            />
          </div>
        </Section>

        <Section
          title="Pomodoro"
          hint="Classic 25/5/15. Right-click Clawd → Pomodoro to open the timer."
        >
          <div className="space-y-2">
            <PomodoroDurations settings={settings} update={update} />
            <Toggle
              label="Auto-start the next phase"
              value={settings.pomodoroAutoStartNext}
              onChange={(v) => update({ pomodoroAutoStartNext: v })}
            />
            <Toggle
              label="Notify on phase transitions"
              value={settings.pomodoroNotify}
              onChange={(v) => update({ pomodoroNotify: v })}
            />
            <Toggle
              label="Suggest a focus block on the first todo of the day"
              value={settings.pomodoroSuggestOnFirstTodo}
              onChange={(v) => update({ pomodoroSuggestOnFirstTodo: v })}
            />
          </div>
        </Section>

        <Section
          title="Birthday"
          hint="Optional. On your birthday Clawd wears a party hat and wishes you happy birthday on launch."
        >
          <BirthdayInput settings={settings} update={update} />
        </Section>

        <Section title="Updates" hint="Check GitHub Releases for newer builds.">
          <UpdaterPanel
            status={updaterStatus}
            checking={checkingUpdate}
            onCheck={checkForUpdates}
            onInstall={() => void window.api.updater.quitAndInstall()}
          />
        </Section>

        <Section title="Persona / system context" hint="Injected into the chat system prompt.">
          <textarea
            rows={5}
            value={settings.userContext}
            onChange={(e) => setSettings((s) => ({ ...s, userContext: e.target.value }))}
            onBlur={() => update({ userContext: settings.userContext })}
            className="w-full bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40 resize-none"
          />
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

function Toggle({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="text-xs text-textMain">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-bubble-user'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${
            value ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  )
}

/**
 * Updater status display + manual check button + restart-to-install button.
 * The status state machine maps directly to electron-updater's events:
 * idle → checking → (available → downloading → downloaded) | not-available | error
 */
function UpdaterPanel({
  status,
  checking,
  onCheck,
  onInstall
}: {
  status: UpdaterStatus
  checking: boolean
  onCheck: () => void
  onInstall: () => void
}): JSX.Element {
  let line = 'Up to date.'
  let tone = 'text-textMeta'
  switch (status.state) {
    case 'idle':
      line = 'No checks yet — click below to check now.'
      break
    case 'checking':
      line = 'Checking for updates…'
      break
    case 'not-available':
      line = `You're up to date${status.version ? ` (v${status.version})` : ''}.`
      tone = 'text-success'
      break
    case 'available':
      line = `Update available: v${status.version} — preparing download…`
      tone = 'text-accent'
      break
    case 'downloading':
      line = `Downloading… ${status.progress ?? 0}%`
      tone = 'text-accent'
      break
    case 'downloaded':
      line = `v${status.version} ready — restart to install.`
      tone = 'text-success'
      break
    case 'error':
      line = `Update check failed: ${status.message ?? 'unknown error'}`
      tone = 'text-red-400'
      break
  }
  return (
    <div className="space-y-2">
      <div className={`text-[11px] ${tone}`}>{line}</div>
      <div className="flex gap-2">
        <button
          onClick={onCheck}
          disabled={checking || status.state === 'downloading'}
          className="px-3 py-1.5 rounded-lg bg-bubble-user text-textMain text-xs hover:bg-bubble-user/80 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {status.state === 'downloaded' && (
          <button
            onClick={onInstall}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent/90"
          >
            Restart and install
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Three-up duration pickers for the Pomodoro work / short / long blocks +
 * cycles-before-long-break stepper. Numbers persist on blur, not on every
 * keystroke, so partial input doesn't flood updates.
 */
function PomodoroDurations({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      <DurationInput
        label="Focus (min)"
        value={settings.pomodoroWorkMin}
        min={1}
        max={180}
        onCommit={(n) => update({ pomodoroWorkMin: n })}
      />
      <DurationInput
        label="Short break (min)"
        value={settings.pomodoroShortBreakMin}
        min={1}
        max={60}
        onCommit={(n) => update({ pomodoroShortBreakMin: n })}
      />
      <DurationInput
        label="Long break (min)"
        value={settings.pomodoroLongBreakMin}
        min={1}
        max={120}
        onCommit={(n) => update({ pomodoroLongBreakMin: n })}
      />
      <DurationInput
        label="Cycles before long"
        value={settings.pomodoroCyclesBeforeLongBreak}
        min={1}
        max={12}
        onCommit={(n) => update({ pomodoroCyclesBeforeLongBreak: n })}
      />
    </div>
  )
}

function DurationInput({
  label,
  value,
  min,
  max,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  // Reflect external changes (e.g. settings reload) into the draft.
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  const commit = (): void => {
    const n = Number(draft)
    if (!Number.isFinite(n)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.max(min, Math.min(max, Math.round(n)))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-textMeta">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-accent/40"
      />
    </label>
  )
}

/**
 * Birthday picker — two number inputs for month + day, plus a "clear"
 * button. Persists null when empty so the engine treats it as opt-out.
 */
function BirthdayInput({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}): JSX.Element {
  const [month, setMonth] = useState<string>(
    settings.birthday ? String(settings.birthday.month) : ''
  )
  const [day, setDay] = useState<string>(
    settings.birthday ? String(settings.birthday.day) : ''
  )
  useEffect(() => {
    setMonth(settings.birthday ? String(settings.birthday.month) : '')
    setDay(settings.birthday ? String(settings.birthday.day) : '')
  }, [settings.birthday])

  const commit = (): void => {
    const m = Number(month)
    const d = Number(day)
    if (!Number.isFinite(m) || !Number.isFinite(d) || month === '' || day === '') {
      void update({ birthday: null })
      return
    }
    void update({
      birthday: { month: Math.max(1, Math.min(12, Math.round(m))), day: Math.max(1, Math.min(31, Math.round(d))) }
    })
  }

  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-textMeta">Month</span>
        <input
          type="number"
          min={1}
          max={12}
          value={month}
          placeholder="MM"
          onChange={(e) => setMonth(e.target.value)}
          onBlur={commit}
          className="w-20 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-textMeta">Day</span>
        <input
          type="number"
          min={1}
          max={31}
          value={day}
          placeholder="DD"
          onChange={(e) => setDay(e.target.value)}
          onBlur={commit}
          className="w-20 bg-bg/80 border border-white/10 text-textMain text-xs rounded-lg px-2 py-1.5 outline-none"
        />
      </label>
      {settings.birthday && (
        <button
          type="button"
          onClick={() => {
            setMonth('')
            setDay('')
            void update({ birthday: null })
          }}
          className="px-2 py-1.5 rounded-lg bg-bg/60 border border-white/10 text-textMeta text-[10px] hover:text-textMain"
        >
          Clear
        </button>
      )}
    </div>
  )
}
