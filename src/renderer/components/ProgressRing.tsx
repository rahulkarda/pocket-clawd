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
  // Backplate: a soft, translucent white disc behind the ring + avatar.
  // - On light backgrounds: nearly invisible, layout untouched
  // - On dark backgrounds: gives the ring something to contrast against
  //   so the progress arc is legible against a dark menu bar / wallpaper
  const plateRadius = radius + stroke / 2
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Backplate (visible on dark, washed out on light) */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={plateRadius}
        fill="rgba(245,245,245,0.16)"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(180,180,180,0.55)"
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
