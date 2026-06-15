import { ClawdVariants } from './Clawd'

interface Props {
  onClose: () => void
}

export function Header({ onClose }: Props): JSX.Element {
  const { Active } = ClawdVariants
  return (
    <div className="drag flex items-center justify-between px-4 py-3 border-b border-white/5 bg-panel/80">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 pixel">
          <Active width="100%" height="100%" />
        </div>
        <span className="text-sm font-medium text-textMain">Clawd</span>
      </div>
      <button
        className="no-drag w-6 h-6 rounded hover:bg-white/10 text-textMeta hover:text-textMain text-sm leading-none"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  )
}
