import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

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
        </Section>

        <Section
          title="Tools & memory"
          hint="Clawd uses tools to manage todos, search past sessions, browse the web, and remember things between sessions."
        >
          <Toggle
            label="Web search (Anthropic-hosted, billed per use)"
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
