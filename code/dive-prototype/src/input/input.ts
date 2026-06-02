// input.ts — Translates raw player input into simulation Orders.
//
// The sim (src/sim) is pure and DOM-free; this module is the bridge between
// pointer/keyboard events and the Order union the sim understands. It mirrors
// the sim's own validity rules (spread.ts / breach.ts) so a click only ever
// produces an order the sim will actually accept — clicks that can't do
// anything return null and the caller ignores them.

import type { GameState, Order, ZoneId } from '../sim/types'
import { neighbors } from '../sim/map'
import { ZONE_POS, NODE_RADIUS, EDGE_HIT_RADIUS, type Point } from '../render/layout'

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Nearest zone to a point within NODE_RADIUS, or null if the click missed all nodes. */
function nearestZone(state: GameState, pt: Point): ZoneId | null {
  let best: ZoneId | null = null
  let bestD = NODE_RADIUS
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
 * Finds the barrier edge the click is closest to (within EDGE_HIT_RADIUS) and
 * returns the gated (target) zone of that edge — the one to breach.
 * Returns null if no barrier edge is near the click.
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
function canColonize(state: GameState, target: ZoneId): boolean {
  const z = state.map.zones.find(z => z.id === target)
  if (!z || z.owner === 'you') return false
  return ownedZones(state).some(owned =>
    neighbors(state.map, owned.id).some(n => n.id === target && !n.barrier),
  )
}

/** True if `target` is breachable: shares a still-closed BARRIER edge with an owned zone. */
function canBreach(state: GameState, target: ZoneId): boolean {
  return ownedZones(state).some(owned =>
    neighbors(state.map, owned.id).some(n => n.id === target && n.barrier),
  )
}

/** True if `target` is an owned portal (a valid escape point). */
function canEscape(state: GameState, target: ZoneId): boolean {
  const z = state.map.zones.find(z => z.id === target)
  return !!z && z.kind === 'portal' && z.owner === 'you'
}

// ─── Public: click → Order ─────────────────────────────────────────────────────

/**
 * Maps a canvas click at (x, y) to the appropriate Order, given current state.
 *
 * Resolution order:
 *   1. Click on a node:
 *        - owned portal      → escape
 *        - breachable zone   → breach   (e.g. the gated gland)
 *        - colonizable zone  → colonize
 *      (an owned non-portal or an unreachable zone yields no order)
 *   2. Click near a locked barrier edge → breach the gated zone.
 *   3. Otherwise → null.
 *
 * Returns the Order, or null if the click can't produce a legal action.
 */
export function clickToOrder(state: GameState, x: number, y: number): Order | null {
  if (state.result !== 'ongoing') return null
  const pt: Point = { x, y }

  // 1. Node hit takes priority.
  const zone = nearestZone(state, pt)
  if (zone) {
    if (canEscape(state, zone)) return { type: 'escape', portal: zone }
    if (canBreach(state, zone)) return { type: 'breach', target: zone }
    if (canColonize(state, zone)) return { type: 'colonize', target: zone }
    return null // owned non-portal, or not yet reachable
  }

  // 2. Locked barrier edge hit → breach.
  const barrierTarget = nearestBarrierTarget(state, pt)
  if (barrierTarget && canBreach(state, barrierTarget)) {
    return { type: 'breach', target: barrierTarget }
  }

  return null
}

// ─── Public: keyboard ───────────────────────────────────────────────────────

export type KeyAction =
  | { kind: 'order'; order: Order }   // produced an Order (e.g. dormancy)
  | { kind: 'pause' }                 // toggle active-pause
  | { kind: 'none' }                  // unhandled key

/**
 * Maps a keyboard event code to a high-level action.
 *   'KeyD'  → dormancy order (toggle stealth)
 *   'Space' → pause toggle (handled by the loop, not the sim)
 */
export function keyToAction(code: string): KeyAction {
  switch (code) {
    case 'KeyD':
      return { kind: 'order', order: { type: 'dormancy' } }
    case 'Space':
      return { kind: 'pause' }
    default:
      return { kind: 'none' }
  }
}
