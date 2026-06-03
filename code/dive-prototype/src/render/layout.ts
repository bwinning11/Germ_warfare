// layout.ts — Fixed screen geometry for the 10-zone enriched dive map.
//
// Single source of truth for where each zone sits on the canvas and for the
// canvas chrome regions (top HUD band, right info panel, bottom tip strip).
// Both the renderer (render.ts) and the input mapper (input.ts) import from
// here so a click always lands on the node the player sees.
//
// No simulation logic lives here — only pixel coordinates and labels.

import type { ZoneId } from '../sim/types'

// Enlarged from 800×600 so all ten nodes, their labels, the right info panel,
// the top HUD, and the bottom tip strip fit with room to spare — nothing clips.
export const CANVAS_WIDTH = 1120
export const CANVAS_HEIGHT = 760

/** Radius of a zone node in pixels (also the click hit-radius for nodes). */
export const NODE_RADIUS = 30

/** How close (px) a click must be to an edge's midpoint to count as an edge click. */
export const EDGE_HIT_RADIUS = 24

// ─── Canvas chrome regions (kept clear of the graph) ─────────────────────────

/** Top HUD band: tick / biomass / zones / heat bar / multiplier / stage. */
export const HUD_BAND_H = 70

/** Right info panel: legend, selected node, available actions + costs, goal. */
export const PANEL_W = 270
export const PANEL_X = CANVAS_WIDTH - PANEL_W // 850
export const PANEL_Y = HUD_BAND_H + 8         // 78

/** Bottom tip strip: the always-on one-line "next action" hint. */
export const TIP_STRIP_H = 56
export const TIP_STRIP_Y = CANVAS_HEIGHT - TIP_STRIP_H // 704

export interface Point {
  x: number
  y: number
}

/**
 * Fixed positions for each of the ten zones, laid out to mirror the map graph:
 *
 *   entry (left hub / your core+portal)
 *     ├── upper arm:  vessel_a (chokepoint) ── vessel_c ── organ
 *     ├── lower arm:  vessel_b ── organ
 *     │                  └── gland (behind barrier, dead-end)
 *     │                  └── vessel_d (deep junction) ── organ_b
 *     │                          └── pickup (behind barrier, reward)
 *     └── loop back:  vessel_e ── vessel_d
 *
 * All centers sit inside the graph window (x 60..PANEL_X, y HUD..TIP_STRIP),
 * with enough vertical clearance below each node for its name label.
 */
export const ZONE_POS: Record<ZoneId, Point> = {
  entry:    { x: 150, y: 350 },
  vessel_a: { x: 365, y: 185 },
  vessel_c: { x: 575, y: 160 },
  organ:    { x: 745, y: 290 },
  vessel_b: { x: 350, y: 455 },
  gland:    { x: 250, y: 625 },
  vessel_e: { x: 165, y: 545 },
  vessel_d: { x: 525, y: 505 },
  organ_b:  { x: 760, y: 520 },
  pickup:   { x: 690, y: 650 },
}

/** Returns the screen position of a zone, or a safe default if unknown. */
export function zonePos(id: ZoneId): Point {
  return ZONE_POS[id] ?? { x: 0, y: 0 }
}

// ─── Human-readable labels & one-word kind tags ──────────────────────────────

/** Display name shown under each node. */
export const ZONE_LABEL: Record<ZoneId, string> = {
  entry: 'ENTRY',
  vessel_a: 'ARTERY A',
  vessel_b: 'ARTERY B',
  vessel_c: 'ARTERY C',
  vessel_d: 'ARTERY D',
  vessel_e: 'ARTERY E',
  organ: 'ORGAN',
  organ_b: 'ORGAN 2',
  gland: 'GLAND',
  pickup: 'NUTRIENT',
}

/** Short label for a zone kind, shown as a tag above special nodes. */
export const KIND_TAG: Record<string, string> = {
  portal: 'PORTAL · EXIT',
  gland: 'GLAND',
  pickup: 'REWARD',
}
