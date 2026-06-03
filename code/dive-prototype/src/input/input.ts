// input.ts — Translates raw player input into simulation Orders (+ UI intents).
//
// The sim (src/sim) is pure and DOM-free; this module is the bridge between
// pointer/keyboard events and what the game should do. It mirrors the sim's own
// validity rules (spread.ts / breach.ts) so a click only ever produces an order
// the sim will actually accept.
//
// Click scheme (teachable verb set):
//   • click a NEUTRAL neighbour of an owned node → spread (colonize) toward it
//   • click an OWNED non-portal node             → SELECT it (keys act on it)
//   • click an OWNED PORTAL                       → escape
//   • click a LOCKED barrier edge (or its gated node) → breach
// Keyboard (act on the currently selected owned node):
//   • D → toggle Dormant   • B → deploy Brute   • C → build Cyst
//   • Space → pause/unpause   • R → restart (handled by the loop)

import type { GameState, Order, ZoneId } from '../sim/types'
import { neighbors } from '../sim/map'
import { ZONE_POS, NODE_RADIUS, EDGE_HIT_RADIUS, type Point } from '../render/layout'

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Nearest zone to a point within NODE_RADIUS (a small grace margin added). */
function nearestZone(state: GameState, pt: Point): ZoneId | null {
  let best: ZoneId | null = null
  let bestD = NODE_RADIUS + 6
  for (const z of state.map.zones) {
    const p = ZONE_POS[z.id]
    if (!p) continue
    const d = dist(pt, p)
    if (d <= bestD) {
      bestD = d
      best = z.id
    }
  }
  return best
}

/** Shortest distance from point p to the segment a→b. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/**
 * Finds the closest LOCKED barrier edge to a click (within EDGE_HIT_RADIUS) and
 * returns the gated (target) zone — the one to breach. Null if none near.
 */
function nearestBarrierTarget(state: GameState, pt: Point): ZoneId | null {
  let best: ZoneId | null = null
  let bestD = EDGE_HIT_RADIUS
  const seen = new Set<string>()

  for (const e of state.map.edges) {
    if (!e.barrier) continue
    const key = [e.from, e.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const a = ZONE_POS[e.from]
    const b = ZONE_POS[e.to]
    if (!a || !b) continue

    const d = distToSegment(pt, a, b)
    if (d <= bestD) {
      bestD = d
      // The breach target is whichever endpoint is NOT you-owned (the gated zone).
      const fromOwned = state.map.zones.find(z => z.id === e.from)?.owner === 'you'
      best = fromOwned ? e.to : e.from
    }
  }
  return best
}

// ─── Sim-mirroring predicates ─────────────────────────────────────────────────

const ownedZones = (state: GameState) => state.map.zones.filter(z => z.owner === 'you')

/** True if `target` is reachable for colonize: adjacent to an owned zone via an OPEN edge. */
export function canColonize(state: GameState, target: ZoneId): boolean {
  const z = state.map.zones.find(z => z.id === target)
  if (!z || z.owner === 'you') return false
  return ownedZones(state).some(owned =>
    neighbors(state.map, owned.id).some(n => n.id === target && !n.barrier),
  )
}

/** True if `target` is breachable: shares a still-closed BARRIER edge with an owned zone. */
export function canBreach(state: GameState, target: ZoneId): boolean {
  return ownedZones(state).some(owned =>
    neighbors(state.map, owned.id).some(n => n.id === target && n.barrier),
  )
}

/** True if `target` is an owned portal (a valid escape point). */
export function canEscape(state: GameState, target: ZoneId): boolean {
  const z = state.map.zones.find(z => z.id === target)
  return !!z && z.kind === 'portal' && z.owner === 'you'
}

// ─── Public: click → ClickResult ───────────────────────────────────────────────

/**
 * The outcome of a click: either an Order to feed the sim, a UI "select"
 * intent (clicked one of your own nodes), or nothing.
 */
export type ClickResult =
  | { kind: 'order'; order: Order }
  | { kind: 'select'; zoneId: ZoneId }
  | { kind: 'none' }

/**
 * Maps a canvas click at (x, y) to a ClickResult, given the current state.
 *
 * Resolution order (node hit takes priority over edge hit):
 *   1. Click on a node:
 *        - owned PORTAL      → escape order
 *        - owned non-portal  → SELECT it (keys D/B/C will act on it)
 *        - neutral reachable → colonize order
 *        - (neutral unreachable → none)
 *   2. Click near a LOCKED barrier edge → breach the gated zone.
 *   3. Otherwise → none.
 */
export function clickToResult(state: GameState, x: number, y: number): ClickResult {
  if (state.result !== 'ongoing') return { kind: 'none' }
  const pt: Point = { x, y }

  // 1. Node hit takes priority.
  const zone = nearestZone(state, pt)
  if (zone) {
    const z = state.map.zones.find(zz => zz.id === zone)!
    if (z.owner === 'you') {
      // Owned portal: escape. Otherwise: select (manage with keys).
      if (z.kind === 'portal') return { kind: 'order', order: { type: 'escape', portal: zone } }
      return { kind: 'select', zoneId: zone }
    }
    // Neutral node: colonize if reachable, else breach if it's barrier-gated.
    if (canColonize(state, zone)) return { kind: 'order', order: { type: 'colonize', target: zone } }
    if (canBreach(state, zone)) return { kind: 'order', order: { type: 'breach', target: zone } }
    return { kind: 'none' }
  }

  // 2. Locked barrier edge hit → breach.
  const barrierTarget = nearestBarrierTarget(state, pt)
  if (barrierTarget && canBreach(state, barrierTarget)) {
    return { kind: 'order', order: { type: 'breach', target: barrierTarget } }
  }

  return { kind: 'none' }
}

// ─── Public: keyboard ───────────────────────────────────────────────────────

export type KeyAction =
  | { kind: 'order'; order: Order }   // a targeted order (dormancy / brute / cyst)
  | { kind: 'pause' }                 // toggle active-pause
  | { kind: 'restart' }               // restart the dive
  | { kind: 'needSelect' }            // an action key was pressed with no node selected
  | { kind: 'none' }                  // unhandled key

/**
 * Maps a keyboard event code to a high-level action, acting on `selected`
 * (the currently selected owned node) where relevant.
 *
 *   'KeyD'  → toggle dormancy on selected
 *   'KeyB'  → deploy Brute on selected
 *   'KeyC'  → build Cyst on selected
 *   'Space' → pause toggle (handled by the loop)
 *   'KeyR'  → restart (handled by the loop)
 *
 * If an action key is pressed with no selection, returns { kind: 'needSelect' }
 * so the caller can nudge the player to select a node first.
 */
export function keyToAction(code: string, selected: ZoneId | null): KeyAction {
  switch (code) {
    case 'KeyD':
      return selected ? { kind: 'order', order: { type: 'dormancy', zoneId: selected } } : { kind: 'needSelect' }
    case 'KeyB':
      return selected ? { kind: 'order', order: { type: 'deployBrute', zoneId: selected } } : { kind: 'needSelect' }
    case 'KeyC':
      return selected ? { kind: 'order', order: { type: 'buildCyst', zoneId: selected } } : { kind: 'needSelect' }
    case 'Space':
      return { kind: 'pause' }
    case 'KeyR':
      return { kind: 'restart' }
    default:
      return { kind: 'none' }
  }
}
