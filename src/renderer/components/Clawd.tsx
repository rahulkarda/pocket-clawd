/**
 * Inlined Clawd pixel-art mascot variants. Inlining keeps assets bundled
 * with the renderer (no asset-path resolution between dev and prod).
 *
 * All 4 variants share viewBox=0 0 64 64, transparent bg, axis-aligned
 * rects only — pure pixel art with rx≤4 corners.
 */
import type { ComponentType, SVGProps } from 'react'
import type { AvatarAnimState } from '@shared/types'

const Idle: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="4" y="18" width="4" height="8" rx="2" fill="#D4622A" />
    <rect x="56" y="18" width="4" height="8" rx="2" fill="#D4622A" />
    <rect x="8" y="12" width="48" height="32" rx="4" fill="#D4622A" />
    <rect x="8" y="40" width="48" height="4" fill="#A84B1F" />
    <rect x="18" y="20" width="8" height="10" rx="2" fill="#1a1208" />
    <rect x="38" y="20" width="8" height="10" rx="2" fill="#1a1208" />
    <rect x="14" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="28" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="42" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="14" y="54" width="8" height="2" fill="#A84B1F" />
    <rect x="28" y="54" width="8" height="2" fill="#A84B1F" />
    <rect x="42" y="54" width="8" height="2" fill="#A84B1F" />
  </svg>
)

const Active: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* ! badge */}
    <rect x="30" y="0" width="4" height="6" rx="1" fill="#F5C542" />
    <rect x="30" y="8" width="4" height="2" rx="1" fill="#F5C542" />
    {/* arms raised */}
    <rect x="2" y="14" width="6" height="4" rx="1" fill="#E06820" />
    <rect x="2" y="14" width="4" height="10" rx="1" fill="#E06820" />
    <rect x="56" y="14" width="6" height="4" rx="1" fill="#E06820" />
    <rect x="60" y="14" width="4" height="10" rx="1" fill="#E06820" />
    {/* body */}
    <rect x="8" y="14" width="48" height="32" rx="4" fill="#E06820" />
    <rect x="8" y="42" width="48" height="4" fill="#B85218" />
    {/* eyes wider with shine */}
    <rect x="16" y="20" width="10" height="12" rx="2" fill="#1a1208" />
    <rect x="38" y="20" width="10" height="12" rx="2" fill="#1a1208" />
    <rect x="22" y="22" width="2" height="2" fill="#ffffff" opacity="0.7" />
    <rect x="44" y="22" width="2" height="2" fill="#ffffff" opacity="0.7" />
    {/* legs */}
    <rect x="14" y="46" width="8" height="12" rx="2" fill="#E06820" />
    <rect x="28" y="46" width="8" height="12" rx="2" fill="#E06820" />
    <rect x="42" y="46" width="8" height="12" rx="2" fill="#E06820" />
    <rect x="14" y="56" width="8" height="2" fill="#B85218" />
    <rect x="28" y="56" width="8" height="2" fill="#B85218" />
    <rect x="42" y="56" width="8" height="2" fill="#B85218" />
  </svg>
)

const IdleAlert: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* ascending Z-Z-Z */}
    <rect x="36" y="2" width="6" height="2" fill="#F5C542" />
    <rect x="40" y="4" width="2" height="2" fill="#F5C542" />
    <rect x="36" y="6" width="6" height="2" fill="#F5C542" />
    <rect x="30" y="8" width="4" height="2" fill="#F5C542" />
    <rect x="32" y="10" width="2" height="2" fill="#F5C542" />
    <rect x="30" y="12" width="4" height="2" fill="#F5C542" />
    {/* drooped arms */}
    <rect x="2" y="22" width="6" height="4" rx="1" fill="#C45A25" />
    <rect x="2" y="22" width="4" height="10" rx="1" fill="#C45A25" />
    <rect x="56" y="22" width="6" height="4" rx="1" fill="#C45A25" />
    <rect x="60" y="22" width="4" height="10" rx="1" fill="#C45A25" />
    {/* body */}
    <rect x="8" y="14" width="48" height="32" rx="4" fill="#C45A25" />
    <rect x="8" y="42" width="48" height="4" fill="#9A4119" />
    {/* squinted eyes */}
    <rect x="18" y="20" width="8" height="10" rx="2" fill="#1a1208" />
    <rect x="38" y="20" width="8" height="10" rx="2" fill="#1a1208" />
    <rect x="18" y="20" width="8" height="6" fill="#C45A25" />
    <rect x="38" y="20" width="8" height="6" fill="#C45A25" />
    <rect x="18" y="26" width="8" height="2" fill="#1a1208" />
    <rect x="38" y="26" width="8" height="2" fill="#1a1208" />
    {/* legs */}
    <rect x="14" y="46" width="8" height="12" rx="2" fill="#C45A25" />
    <rect x="28" y="46" width="8" height="12" rx="2" fill="#C45A25" />
    <rect x="42" y="46" width="8" height="12" rx="2" fill="#C45A25" />
    <rect x="14" y="56" width="8" height="2" fill="#9A4119" />
    <rect x="28" y="56" width="8" height="2" fill="#9A4119" />
    <rect x="42" y="56" width="8" height="2" fill="#9A4119" />
  </svg>
)

const Happy: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* star pixels */}
    <rect x="6" y="4" width="4" height="4" fill="#F5C542" />
    <rect x="22" y="2" width="2" height="2" fill="#F5C542" />
    <rect x="44" y="4" width="2" height="2" fill="#F5C542" />
    <rect x="56" y="6" width="4" height="4" fill="#F5C542" />
    <rect x="14" y="10" width="2" height="2" fill="#F5C542" />
    {/* arms thrown wide */}
    <rect x="0" y="20" width="8" height="4" rx="1" fill="#E87030" />
    <rect x="0" y="16" width="4" height="8" rx="1" fill="#E87030" />
    <rect x="56" y="20" width="8" height="4" rx="1" fill="#E87030" />
    <rect x="60" y="16" width="4" height="8" rx="1" fill="#E87030" />
    {/* body */}
    <rect x="8" y="14" width="48" height="32" rx="4" fill="#E87030" />
    <rect x="8" y="42" width="48" height="4" fill="#BC5520" />
    {/* smiling pixel-arc eyes */}
    <rect x="16" y="22" width="2" height="2" fill="#1a1208" />
    <rect x="18" y="20" width="6" height="2" fill="#1a1208" />
    <rect x="24" y="22" width="2" height="2" fill="#1a1208" />
    <rect x="38" y="22" width="2" height="2" fill="#1a1208" />
    <rect x="40" y="20" width="6" height="2" fill="#1a1208" />
    <rect x="46" y="22" width="2" height="2" fill="#1a1208" />
    {/* cheeks */}
    <rect x="14" y="28" width="6" height="4" rx="1" fill="#F0956A" />
    <rect x="44" y="28" width="6" height="4" rx="1" fill="#F0956A" />
    {/* asymmetric legs */}
    <rect x="14" y="46" width="8" height="10" rx="2" fill="#E87030" />
    <rect x="28" y="46" width="8" height="14" rx="2" fill="#E87030" />
    <rect x="42" y="46" width="8" height="10" rx="2" fill="#E87030" />
    <rect x="14" y="54" width="8" height="2" fill="#BC5520" />
    <rect x="28" y="58" width="8" height="2" fill="#BC5520" />
    <rect x="42" y="54" width="8" height="2" fill="#BC5520" />
  </svg>
)

/**
 * Blush — used while being petted. Closed-eye smile + pink cheeks. Body
 * matches the Idle pose exactly so the pet animation is purely a face change.
 */
const Blush: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* ear nubs */}
    <rect x="4" y="18" width="4" height="8" rx="2" fill="#D4622A" />
    <rect x="56" y="18" width="4" height="8" rx="2" fill="#D4622A" />
    {/* body */}
    <rect x="8" y="12" width="48" height="32" rx="4" fill="#D4622A" />
    <rect x="8" y="40" width="48" height="4" fill="#A84B1F" />
    {/* closed-eye "^^" — left */}
    <rect x="18" y="22" width="8" height="2" fill="#1a1208" />
    <rect x="16" y="24" width="2" height="2" fill="#1a1208" />
    <rect x="26" y="24" width="2" height="2" fill="#1a1208" />
    {/* closed-eye "^^" — right */}
    <rect x="38" y="22" width="8" height="2" fill="#1a1208" />
    <rect x="36" y="24" width="2" height="2" fill="#1a1208" />
    <rect x="46" y="24" width="2" height="2" fill="#1a1208" />
    {/* pink blush cheeks */}
    <rect x="12" y="30" width="6" height="4" rx="1" fill="#F8A8B0" />
    <rect x="46" y="30" width="6" height="4" rx="1" fill="#F8A8B0" />
    {/* legs */}
    <rect x="14" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="28" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="42" y="44" width="8" height="12" rx="2" fill="#D4622A" />
    <rect x="14" y="54" width="8" height="2" fill="#A84B1F" />
    <rect x="28" y="54" width="8" height="2" fill="#A84B1F" />
    <rect x="42" y="54" width="8" height="2" fill="#A84B1F" />
  </svg>
)

/** Sleep — closed eyes, gentle Clawd. Body squashed slightly to look curled. */
const Sleep: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* ear nubs lower */}
    <rect x="4" y="22" width="4" height="6" rx="2" fill="#D4622A" />
    <rect x="56" y="22" width="4" height="6" rx="2" fill="#D4622A" />
    {/* body — slightly shorter, slightly tilted */}
    <rect x="8" y="16" width="48" height="28" rx="6" fill="#D4622A" />
    <rect x="8" y="40" width="48" height="4" fill="#A84B1F" />
    {/* eyes — closed (single horizontal line) */}
    <rect x="18" y="26" width="8" height="2" fill="#1a1208" />
    <rect x="38" y="26" width="8" height="2" fill="#1a1208" />
    {/* legs — tucked under (shorter) */}
    <rect x="14" y="44" width="8" height="8" rx="2" fill="#D4622A" />
    <rect x="28" y="44" width="8" height="8" rx="2" fill="#D4622A" />
    <rect x="42" y="44" width="8" height="8" rx="2" fill="#D4622A" />
    <rect x="14" y="50" width="8" height="2" fill="#A84B1F" />
    <rect x="28" y="50" width="8" height="2" fill="#A84B1F" />
    <rect x="42" y="50" width="8" height="2" fill="#A84B1F" />
  </svg>
)

/**
 * Pick which variant to show based on:
 * - explicit avatar animation state
 * - todo completion (overrides → happy when ratio === 1)
 */
export interface ClawdProps extends SVGProps<SVGSVGElement> {
  state: AvatarAnimState
  todosComplete?: boolean
}

export function Clawd({ state, todosComplete, ...rest }: ClawdProps): JSX.Element {
  // happy short-circuits on full todo completion regardless of state
  if (todosComplete) return <Happy {...rest} />
  switch (state) {
    case 'active':
      return <Active {...rest} />
    case 'idle-alert':
      return <IdleAlert {...rest} />
    case 'blush':
      return <Blush {...rest} />
    case 'sleep':
      return <Sleep {...rest} />
    case 'whisper':
    case 'idle':
    default:
      return <Idle {...rest} />
  }
}

export const ClawdVariants = { Idle, Active, IdleAlert, Happy, Blush, Sleep }
