/** SVG progress ring drawn around the outside of the avatar. */
interface Props {
  ratio: number // 0–1
  size: number // outer canvas px
  color: string
}

export function ProgressRing({ ratio, size, color }: Props): JSX.Element {
  const stroke = Math.max(3, Math.floor(size * 0.06))
  const radius = size / 2 - stroke
  const c = 2 * Math.PI * radius
  const offset = c * (1 - ratio)
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#2A2A2A"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
      />
    </svg>
  )
}
