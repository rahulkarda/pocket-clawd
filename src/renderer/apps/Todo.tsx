import { useEffect, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import type { DailyTodoStore, Todo } from '@shared/types'

export function TodoApp(): JSX.Element {
  const [data, setData] = useState<DailyTodoStore | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    void window.api.todos.list().then(setData)
    return window.api.todos.onChanged(setData)
  }, [])

  const todos = data?.todos ?? []
  const sorted = [...todos].sort((a, b) => Number(a.done) - Number(b.done))
  const done = todos.filter((t) => t.done).length
  const total = todos.length
  const ratio = total === 0 ? 0 : done / total

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') void add()
  }
  const add = async (): Promise<void> => {
    const v = text.trim()
    if (!v) return
    await window.api.todos.add(v)
    setText('')
  }

  return (
    <motion.div
      className="w-screen h-screen flex flex-col bg-bg/95 backdrop-blur-md text-textMain rounded-2xl overflow-hidden border border-white/5 shadow-2xl"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
    >
      <div className="drag flex items-center justify-between px-4 py-3 border-b border-white/5 bg-panel/80">
        <span className="text-sm font-medium">Today's Todos</span>
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none"
          onClick={() => window.api.todoWindow.close()}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar px-4 py-3 space-y-1">
        {sorted.length === 0 && (
          <div className="text-textMeta text-xs text-center py-8">
            No todos yet. Add one below.
          </div>
        )}
        {sorted.map((t) => (
          <TodoRow key={t.id} todo={t} />
        ))}
      </div>

      <div className="px-3 py-2.5 border-t border-white/5 bg-panel/80">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onAddKey}
            placeholder="+ Add a todo…"
            className="flex-1 bg-bg/80 text-textMain text-[13px] rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-accent/40 placeholder-textMeta"
          />
          <button
            onClick={add}
            disabled={!text.trim()}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs disabled:opacity-30 hover:bg-accent/90"
          >
            Add
          </button>
        </div>
        {total > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-textMeta">
            <span>
              {done} / {total} done
            </span>
            <div className="flex-1 h-1.5 bg-bubble-user rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <span>{Math.round(ratio * 100)}%</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function TodoRow({ todo }: { todo: Todo }): JSX.Element {
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => window.api.todos.toggle(todo.id)}
        className="accent-accent"
      />
      <span
        className={`flex-1 text-[13px] ${todo.done ? 'line-through text-textMeta' : 'text-textMain'}`}
      >
        {todo.text}
      </span>
      <button
        onClick={() => window.api.todos.remove(todo.id)}
        className="opacity-0 group-hover:opacity-100 text-textMeta hover:text-red-400 text-xs px-1"
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  )
}
