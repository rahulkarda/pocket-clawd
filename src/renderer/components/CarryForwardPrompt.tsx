import { useState } from 'react'
import type { Todo } from '@shared/types'

interface Props {
  todos: Todo[]
  onResolve: (keepIds: string[]) => void
}

/**
 * Shown at the start of the first chat session of a new day, only when the
 * previous day had incomplete todos. User picks which to carry forward.
 */
export function CarryForwardPrompt({ todos, onResolve }: Props): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set(todos.map((t) => t.id)))

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar px-4 py-3">
      <div className="text-sm text-textMain mb-1">Carry over from yesterday?</div>
      <div className="text-xs text-textMeta mb-3">
        Pick which incomplete items to bring forward to today. Unchecked ones drop.
      </div>
      <div className="space-y-2">
        {todos.map((t) => {
          const on = selected.has(t.id)
          return (
            <label
              key={t.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bubble-user cursor-pointer hover:bg-bubble-user/80"
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(t.id)}
                className="accent-accent"
              />
              <span className="text-[13px]">{t.text}</span>
            </label>
          )
        })}
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onResolve([...selected])}
          className="flex-1 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90"
        >
          Continue
        </button>
        <button
          onClick={() => onResolve([])}
          className="px-3 py-2 rounded-lg bg-bubble-user text-textMeta text-xs hover:text-textMain"
        >
          Skip all
        </button>
      </div>
    </div>
  )
}
