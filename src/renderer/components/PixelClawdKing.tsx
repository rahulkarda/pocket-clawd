/**
 * Pixel-Clawd chess piece sprite — tiny SVG used in place of the king
 * Unicode glyph when the user enables it. Same orange-bodied silhouette
 * as the main mascot but stripped down so it reads at 40px.
 *
 * Intentionally NO state variants — chess pieces don't need to
 * snack/blush/sleep, and a moving sprite would be visually busy on the
 * board. Just one icon, two color variants (white / black).
 */
import type { ComponentType, SVGProps } from 'react'

interface PixelClawdProps extends SVGProps<SVGSVGElement> {
  variant?: 'white' | 'black'
}

export const PixelClawdKing: ComponentType<PixelClawdProps> = ({ variant = 'white', ...props }) => {
  // White king = orange Clawd on light square; Black king = same silhouette
  // recolored to a deep navy so it reads against the light/dark squares.
  const body = variant === 'white' ? '#D4622A' : '#1f2540'
  const shadow = variant === 'white' ? '#A84B1F' : '#0d1126'
  const eye = variant === 'white' ? '#1a1208' : '#0a0c1a'
  const crown = variant === 'white' ? '#F5C542' : '#5b6db5'
  const cross = variant === 'white' ? '#F5C542' : '#5b6db5'

  return (
    <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
      {/* Tiny crown above clawd's head */}
      <rect x="28" y="0" width="8" height="2" fill={cross} />
      <rect x="30" y="0" width="4" height="6" fill={cross} />
      <rect x="20" y="4" width="4" height="6" rx="1" fill={crown} />
      <rect x="40" y="4" width="4" height="6" rx="1" fill={crown} />
      <rect x="30" y="4" width="4" height="6" rx="1" fill={crown} />
      <rect x="18" y="9" width="28" height="3" fill={crown} />

      {/* Body */}
      <rect x="8" y="14" width="48" height="30" rx="4" fill={body} />
      <rect x="8" y="40" width="48" height="4" fill={shadow} />

      {/* Eyes */}
      <rect x="18" y="20" width="8" height="10" rx="2" fill={eye} />
      <rect x="38" y="20" width="8" height="10" rx="2" fill={eye} />
      <rect x="22" y="22" width="2" height="2" fill="#ffffff" opacity="0.6" />
      <rect x="42" y="22" width="2" height="2" fill="#ffffff" opacity="0.6" />

      {/* Legs */}
      <rect x="14" y="44" width="8" height="14" rx="2" fill={body} />
      <rect x="28" y="44" width="8" height="14" rx="2" fill={body} />
      <rect x="42" y="44" width="8" height="14" rx="2" fill={body} />
      <rect x="14" y="56" width="8" height="2" fill={shadow} />
      <rect x="28" y="56" width="8" height="2" fill={shadow} />
      <rect x="42" y="56" width="8" height="2" fill={shadow} />
    </svg>
  )
}
