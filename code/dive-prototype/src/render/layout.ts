// layout.ts — Fixed screen geometry for the 5-zone prototype map.
//
// This is the single source of truth for where each zone sits on the
// 800×600 canvas. Both the renderer (render.ts) and the input mapper
// (input.ts) import from here so a click always lands on the node the
// player sees.
//
// No simulation logic lives here — only pixel coordinates.

import type { ZoneId } from '../sim/types'

export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 600

/** Radius of a zone node in pixels (also the click hit-radius for nodes). */
export const NODE_RADIUS = 34

/** How close (px) a click must be to an edge's midpoint to count as an edge click. */
export const EDGE_HIT_RADIUS = 26

export interface Point {
  x: number
  y: number
}

/**
 * Fixed positions for each zone.
 *
 *   entry (portal) — far left, the spawn / exit
 *   vessel_a       — upper bridge
 *   vessel_b       — lower bridge (gates the gland)
 *   organ (portal) — far right, the deep exit
 *   gland          — branches down-right off vessel_b, behind the barrier
 */
export const ZONE_POS: Record<ZoneId, Point> = {
  entry:    { x: 120, y: 300 },
  vessel_a: { x: 340, y: 165 },
  vessel_b: { x: 330, y: 430 },
  organ:    { x: 620, y: 300 },
  gland:    { x: 610, y: 480 },
}

/** Returns the screen position of a zone, or a safe default if unknown. */
export function zonePos(id: ZoneId): Point {
  return ZONE_POS[id] ?? { x: 0, y: 0 }
}
