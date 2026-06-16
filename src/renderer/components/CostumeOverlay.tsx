/**
 * Pixel-art costume overlay rendered above Clawd's head. Positioned and
 * sized relative to the same 64×64 viewBox as the Clawd variants, so the
 * Avatar component can apply the costume on the same percentage geometry
 * regardless of avatar size.
 */
import type { SVGProps } from 'react'
import type { AppSettings } from '@shared/types'

type Costume = AppSettings['costume']

interface Props extends SVGProps<SVGSVGElement> {
  costume: Costume
}

/**
 * Render the chosen costume overlay. The SVG uses the same 64×64 viewBox
 * as Clawd so it can be stacked at the same size with `position: absolute;
 * inset: 0`.
 */
export function CostumeOverlay({ costume, ...rest }: Props): JSX.Element | null {
  if (costume === 'none') return null
  return (
    <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...rest}>
      {costume === 'santa' && <SantaHat />}
      {costume === 'shades' && <Shades />}
      {costume === 'party' && <PartyHat />}
      {costume === 'witch' && <WitchHat />}
    </svg>
  )
}

const SantaHat = (): JSX.Element => (
  <g>
    {/* hat body, red */}
    <rect x="14" y="2" width="28" height="6" fill="#E03A3A" />
    <rect x="18" y="-2" width="20" height="6" fill="#E03A3A" />
    <rect x="22" y="-6" width="12" height="6" fill="#E03A3A" />
    {/* white pompom */}
    <rect x="32" y="-8" width="6" height="6" rx="3" fill="#FFFFFF" />
    {/* white fur trim */}
    <rect x="10" y="8" width="36" height="4" fill="#FFFFFF" />
  </g>
)

const Shades = (): JSX.Element => (
  <g>
    {/* lens left */}
    <rect x="16" y="20" width="12" height="8" rx="1" fill="#000000" />
    {/* lens right */}
    <rect x="36" y="20" width="12" height="8" rx="1" fill="#000000" />
    {/* bridge */}
    <rect x="28" y="22" width="8" height="2" fill="#000000" />
  </g>
)

const PartyHat = (): JSX.Element => (
  <g>
    {/* triangle (drawn as rects for pixel feel) */}
    <rect x="28" y="0" width="8" height="2" fill="#7C6FF7" />
    <rect x="26" y="2" width="12" height="2" fill="#7C6FF7" />
    <rect x="24" y="4" width="16" height="2" fill="#F5C542" />
    <rect x="22" y="6" width="20" height="2" fill="#7C6FF7" />
    <rect x="20" y="8" width="24" height="2" fill="#F5C542" />
    {/* pompom */}
    <rect x="30" y="-2" width="4" height="2" fill="#FFFFFF" />
  </g>
)

const WitchHat = (): JSX.Element => (
  <g>
    {/* tall pointy hat */}
    <rect x="30" y="-4" width="4" height="4" fill="#1A1A2E" />
    <rect x="28" y="0" width="8" height="2" fill="#1A1A2E" />
    <rect x="26" y="2" width="12" height="2" fill="#1A1A2E" />
    <rect x="24" y="4" width="16" height="2" fill="#1A1A2E" />
    <rect x="22" y="6" width="20" height="2" fill="#1A1A2E" />
    {/* brim (wide) */}
    <rect x="14" y="8" width="36" height="3" fill="#1A1A2E" />
    {/* purple band */}
    <rect x="22" y="6" width="20" height="2" fill="#7C6FF7" />
  </g>
)
