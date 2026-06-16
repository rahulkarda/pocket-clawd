import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import type { ChatRole } from '@shared/types'

interface Props {
  role: ChatRole
  streaming?: boolean
  children: ReactNode
}

/**
 * A single chat bubble. The text inside is `selectable`, so users can drag-
 * select and Cmd-C copy. A small Copy button appears on hover for a
 * one-click copy of the full message.
 */
export function Message({ role, streaming, children }: Props): JSX.Element {
  const isClaude = role === 'assistant'
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    // children is a ReactNode but in practice the chat renders a string here;
    // grab the rendered text from the DOM as a fallback if children isn't one.
    const fallback = typeof children === 'string' ? children : String(children ?? '')
    try {
      await navigator.clipboard.writeText(fallback)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={isClaude ? 'group flex justify-start' : 'group flex justify-end'}
    >
      <div className="relative max-w-[85%]">
        <div
          className={[
            'px-3 py-2 rounded-2xl text-[13px] leading-relaxed selectable',
            isClaude
              ? 'bg-bubble-claude text-textMain border-l-2 border-accentSoft rounded-tl-sm'
              : 'bg-bubble-user text-textMain rounded-tr-sm'
          ].join(' ')}
        >
          <span className="whitespace-pre-wrap">{children}</span>
          {streaming && <span className="inline-block w-1 h-4 ml-0.5 bg-accent animate-pulse align-middle" />}
        </div>
        {!streaming && (
          <button
            type="button"
            onClick={copy}
            title={copied ? 'Copied' : 'Copy'}
            className={[
              'absolute -top-1 transition-opacity opacity-0 group-hover:opacity-100',
              isClaude ? '-right-7' : '-left-7',
              'w-6 h-6 rounded-full bg-bg/80 border border-white/10 text-[10px] text-textMeta hover:text-textMain hover:bg-bg flex items-center justify-center'
            ].join(' ')}
          >
            {copied ? '✓' : '⎘'}
          </button>
        )}
      </div>
    </motion.div>
  )
}
