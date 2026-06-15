import { useState, type KeyboardEvent } from 'react'

interface Props {
  disabled: boolean
  onSend: (text: string) => void
}

export function InputBar({ disabled, onSend }: Props): JSX.Element {
  const [value, setValue] = useState('')

  const submit = (): void => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-white/5 bg-panel/80 px-3 py-2.5 flex items-end gap-2">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled}
        placeholder='Type here…  (type "done" to save the session)'
        className="flex-1 resize-none bg-bg/80 text-textMain placeholder-textMeta text-[13px] rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent/40 max-h-32"
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
