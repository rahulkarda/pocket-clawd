import { useState } from 'react'
import { ClawdVariants } from './Clawd'

interface Props {
  onClose: () => void
  /** Returns the current chat transcript as plain text for clipboard copy. */
  onCopyAll?: () => string
}

export function Header({ onClose, onCopyAll }: Props): JSX.Element {
  const { Active } = ClawdVariants
  const [copied, setCopied] = useState(false)

  const copyAll = async (): Promise<void> => {
    if (!onCopyAll) return
    try {
      await navigator.clipboard.writeText(onCopyAll())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="drag flex items-center justify-between px-4 py-3 border-b border-white/5 bg-panel/80">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 pixel">
          <Active width="100%" height="100%" />
        </div>
        <span className="text-sm font-medium text-textMain">Clawd</span>
      </div>
      <div className="flex items-center gap-1">
        {onCopyAll && (
          <button
            className="no-drag h-6 px-2 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-[10px] leading-none flex items-center"
            onClick={copyAll}
            title="Copy entire conversation"
            aria-label="Copy entire conversation"
          >
            {copied ? '✓ Copied' : 'Copy all'}
          </button>
        )}
        <button
          className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none flex items-center justify-center"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
