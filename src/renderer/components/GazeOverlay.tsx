/**
 * Gaze overlay — two small white pupils painted on top of Clawd's eyes,
 * offset horizontally based on the gaze direction. Stacked on the same
 * 64×64 viewBox as Clawd so it can be absolute-positioned at inset:0.
 *
 * Eye block coordinates from Clawd's Idle / IdleAlert / Active variants:
 *   left  eye: x=18..26, y=20..30 (rect 8×10)
 *   right eye: x=38..46, y=20..30 (rect 8×10) — IdleAlert is wider 10×12
 *
 * The pupils are 2×2 white squares centered in each eye, then nudged ±2px
 * horizontally toward the gaze direction. Uses CSS transition so the eyes
 * smoothly slide when the chat window opens / closes.
 */
import type { SVGProps } from 'react'

type GazeDir = 'none' | 'left' | 'right'

interface Props extends SVGProps<SVGSVGElement> {
  gaze: GazeDir
}

export function GazeOverlay({ gaze, ...rest }: Props): JSX.Element | null {
  if (gaze === 'none') return null
  // Center of each eye; pupil offset = ±2 px horizontally.
  const dx = gaze === 'right' ? 2 : -2
  const leftCx = 22 + dx // left eye horizontal center is at x=22
  const rightCx = 42 + dx // right eye horizontal center is at x=42
  const pupilY = 24 // vertical center of the eye block
  return (
    <svg viewBox="0 0 64 64" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg" {...rest}>
      {/* white pupils — 2×2 px squares */}
      <rect x={leftCx - 1} y={pupilY - 1} width="2" height="2" fill="#FFFFFF">
        <animate attributeName="x" to={leftCx - 1} dur="0.15s" fill="freeze" />
      </rect>
      <rect x={rightCx - 1} y={pupilY - 1} width="2" height="2" fill="#FFFFFF">
        <animate attributeName="x" to={rightCx - 1} dur="0.15s" fill="freeze" />
      </rect>
    </svg>
  )
}
