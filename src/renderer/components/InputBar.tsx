import { useState, type KeyboardEvent } from 'react'

interface Props {
  disabled: boolean
  onSend: (text: string) => void
}

/**
 * Chat input bar.
 *
 * Sending:
 *   - plain Enter sends
 *   - Shift+Enter inserts a newline (textarea default)
 *   - typing a line that ENDS with `\` and pressing Enter ALSO inserts a
 *     newline (drops the trailing backslash). This matches the user's
 *     request for "press \ + Enter for newline" without breaking the
 *     more familiar Shift+Enter shortcut.
 *
 * Layout:
 *   - textarea auto-grows up to 6 lines, then scrolls (max-h-32 cap).
 */
export function InputBar({ disabled, onSend }: Props): JSX.Element {
  const [value, setValue] = useState('')

  const submit = (): void => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return // textarea inserts the newline itself
    // Backslash-newline shortcut: line ends with `\` → drop the slash and
    // insert a real newline instead of submitting.
    const ta = e.currentTarget
    const before = value.slice(0, ta.selectionStart)
    if (before.endsWith('\\')) {
      e.preventDefault()
      const after = value.slice(ta.selectionEnd)
      const next = before.slice(0, -1) + '\n' + after
      const caret = before.length // position right after the new \n minus the \
      setValue(next)
      // Move caret after the newline on the next tick.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = caret
      })
      return
    }
    e.preventDefault()
    submit()
  }

  return (
    <div className="border-t border-white/5 bg-panel/80 px-3 py-2.5 flex items-end gap-2">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled}
        placeholder='Type here… ("done" saves · Shift-Enter or \-Enter for newline)'
        className="flex-1 resize-none bg-bg/80 text-textMain placeholder-textMeta text-[13px] rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40 max-h-32 overflow-y-auto"
        style={{
          // Auto-grow up to 6 rows (≈128px) by stretching to content;
          // overflow scrolls past that.
          minHeight: 38,
          height: 'auto'
        }}
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
      >
        Send ↵
      </button>
    </div>
  )
}
