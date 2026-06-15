import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ChatRole } from '@shared/types'

interface Props {
  role: ChatRole
  streaming?: boolean
  children: ReactNode
}

export function Message({ role, streaming, children }: Props): JSX.Element {
  const isClaude = role === 'assistant'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={isClaude ? 'flex justify-start' : 'flex justify-end'}
    >
      <div
        className={[
          'max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed',
          isClaude
            ? 'bg-bubble-claude text-textMain border-l-2 border-accentSoft rounded-tl-sm'
            : 'bg-bubble-user text-textMain rounded-tr-sm'
        ].join(' ')}
      >
        <span className="whitespace-pre-wrap">{children}</span>
        {streaming && <span className="inline-block w-1 h-4 ml-0.5 bg-accent animate-pulse align-middle" />}
      </div>
    </motion.div>
  )
}
