/**
 * Motion tokens for JS-driven animation (CSS equivalents live in `tokens.css`).
 * All animation must respect `prefers-reduced-motion` (spec §12 / §20).
 */

export interface SpringParams {
  readonly stiffness: number
  readonly damping: number
  readonly mass: number
}

export const MOTION = {
  durationFastMs: 150,
  durationBaseMs: 250,
  durationSlowMs: 400,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  springSnappy: { stiffness: 380, damping: 30, mass: 1 } satisfies SpringParams,
  springGentle: { stiffness: 210, damping: 26, mass: 1 } satisfies SpringParams,
} as const

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
