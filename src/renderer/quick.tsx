import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

/**
 * Quick capture — single-input pop-in. Cmd+Shift+T summons it. Type a
 * todo, Enter adds + closes. Esc closes without saving. Auto-closes
 * on blur so it never lingers.
 */
function QuickCapture(): JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = async (): Promise<void> => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await window.api.todos.add(t)
    } catch {
      // ignore — main may reject; close anyway
    }
    await window.api.quickCaptureWindow.close()
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void window.api.quickCaptureWindow.close()
    }
  }

  return (
    <div className="w-screen h-screen flex items-center bg-bg/95 px-3 gap-2 border border-white/10 rounded-2xl">
      <span className="text-textMeta text-base">＋</span>
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={busy}
        placeholder="Add a todo… (Enter to save, Esc to cancel)"
        className="flex-1 bg-transparent text-textMain text-sm outline-none placeholder-textMeta"
      />
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QuickCapture />
  </React.StrictMode>
)
