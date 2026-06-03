// ---------------------------------------------------------------------------
// Vessel-lane body map.
//
// The arena is divided into CHAMBERS (open areas where units can spread)
// connected by VESSEL LANES (narrow corridors). Units must travel through
// vessels to move between chambers — they cannot cross tissue walls directly.
//
// Graph layout (1100 × 740 arena):
//
//   [BASE]─────[JCT-W]──────[JCT-CENTER]──────[JCT-E]─────[ORGAN]
//                     ╲                         ╱
//                      ╲────[JCT-CENTER]───────╱  (top + bottom lanes)
//
// More precisely:
//   Chamber 0: BASE chamber     (left)
//   Chamber 1: Junction West    (center-left)
//   Chamber 2: Junction North   (center top)    — chokepoint
//   Chamber 3: Junction South   (center bottom) — chokepoint
//   Chamber 4: ORGAN chamber    (right)
//
// Vessels:
//   0 ↔ 1  (main artery, left)
//   1 ↔ 2  (north branch)
//   1 ↔ 3  (south branch)
//   2 ↔ 4  (north convergence to organ)
//   3 ↔ 4  (south convergence to organ)
//
// DOM-free. Safe to import in Vitest.
// ---------------------------------------------------------------------------

import { Vec2 } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chamber {
  /** Unique index (used in pathfinding). */
  id: number;
  /** Centre of the chamber in world coords. */
  centre: Vec2;
  /** Approximate radius of the open area (px). Units spread freely within. */
  radius: number;
  /** Human-readable label (for rendering). */
  label: string;
}

export interface VesselLane {
  /** Index into MapGraph.chambers for each endpoint. */
  a: number;
  b: number;
  /**
   * Half-width of the vessel corridor (px).
   * Units travelling through here stay within this band around the centreline.
   */
  halfWidth: number;
}

export interface MapGraph {
  chambers: Chamber[];
  vessels: VesselLane[];
  /**
   * Adjacency list: adjacency[i] = array of { neighbour, vesselIndex } for
   * chamber i. Built once in buildGraph().
   */
  adjacency: Array<Array<{ neighbour: number; vesselIndex: number }>>;
}

// ---------------------------------------------------------------------------
// Map dimensions (must match CANVAS_W / CANVAS_H in main.ts — 1100 × 740)
// ---------------------------------------------------------------------------

export const MAP_WIDTH  = 1100;
export const MAP_HEIGHT = 740;

// ---------------------------------------------------------------------------
// Chamber & vessel definitions
// ---------------------------------------------------------------------------

const CHAMBERS: Chamber[] = [
  { id: 0, centre: { x: 110,  y: 370 }, radius: 90,  label: 'BASE'      },
  { id: 1, centre: { x: 360,  y: 370 }, radius: 75,  label: 'Junction W'  },
  { id: 2, centre: { x: 620,  y: 200 }, radius: 65,  label: 'Junction N'  },
  { id: 3, centre: { x: 620,  y: 540 }, radius: 65,  label: 'Junction S'  },
  { id: 4, centre: { x: 980,  y: 370 }, radius: 90,  label: 'ORGAN'       },
];

/**
 * Half-width of vessel corridors.
 * 38 px gives ~76 px of traversable width — enough for several units abreast.
 * The narrow lanes between chambers 1↔2, 1↔3, 2↔4, 3↔4 are slightly narrower
 * to create real chokepoints.
 */
const VESSELS: VesselLane[] = [
  { a: 0, b: 1, halfWidth: 44 },  // main left artery — wide
  { a: 1, b: 2, halfWidth: 34 },  // north branch (chokepoint)
  { a: 1, b: 3, halfWidth: 34 },  // south branch (chokepoint)
  { a: 2, b: 4, halfWidth: 34 },  // north merge to organ
  { a: 3, b: 4, halfWidth: 34 },  // south merge to organ
];

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

function buildAdjacency(chambers: Chamber[], vessels: VesselLane[]): MapGraph['adjacency'] {
  const adj: MapGraph['adjacency'] = chambers.map(() => []);
  vessels.forEach((v, vi) => {
    adj[v.a].push({ neighbour: v.b, vesselIndex: vi });
    adj[v.b].push({ neighbour: v.a, vesselIndex: vi });
  });
  return adj;
}

// The singleton map graph — built once, shared by all systems.
export const BODY_MAP: MapGraph = {
  chambers: CHAMBERS,
  vessels:  VESSELS,
  adjacency: buildAdjacency(CHAMBERS, VESSELS),
};

// ---------------------------------------------------------------------------
// Spatial query: which chamber is a position inside?
// Returns the id of the nearest chamber whose radius contains the point,
// or the globally nearest chamber if none fully contains it.
// ---------------------------------------------------------------------------

export function chamberOf(pos: Vec2): number {
  let bestId = 0;
  let bestDist = Infinity;

  for (const ch of BODY_MAP.chambers) {
    const d = Math.hypot(pos.x - ch.centre.x, pos.y - ch.centre.y);
    if (d <= ch.radius) return ch.id; // inside this chamber
    if (d < bestDist) { bestDist = d; bestId = ch.id; }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// Pathfinding: Dijkstra on the chamber graph.
//
// Returns the list of *chamber indices* from `fromChamber` to `toChamber`
// (inclusive at both ends). Returns null if no path exists.
// ---------------------------------------------------------------------------

export function findChamberPath(fromChamber: number, toChamber: number): number[] | null {
  if (fromChamber === toChamber) return [fromChamber];

  const dist: number[] = BODY_MAP.chambers.map(() => Infinity);
  const prev: number[] = BODY_MAP.chambers.map(() => -1);
  dist[fromChamber] = 0;

  // Simple priority queue (array-based — graph is tiny, so linear scan is fine)
  const open: number[] = [fromChamber];

  while (open.length > 0) {
    // Pop minimum-dist node
    let minIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (dist[open[i]] < dist[open[minIdx]]) minIdx = i;
    }
    const u = open[minIdx];
    open.splice(minIdx, 1);

    if (u === toChamber) break;

    for (const { neighbour: v } of BODY_MAP.adjacency[u]) {
      // Edge cost = Euclidean distance between chamber centres
      const ch_u = BODY_MAP.chambers[u];
      const ch_v = BODY_MAP.chambers[v];
      const cost = Math.hypot(ch_v.centre.x - ch_u.centre.x, ch_v.centre.y - ch_u.centre.y);
      const alt = dist[u] + cost;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
        if (!open.includes(v)) open.push(v);
      }
    }
  }

  if (dist[toChamber] === Infinity) return null; // unreachable

  // Reconstruct
  const path: number[] = [];
  let cur = toChamber;
  while (cur !== -1) {
    path.unshift(cur);
    cur = prev[cur];
  }
  return path;
}

// ---------------------------------------------------------------------------
// Waypoint list for moving a unit from `pos` to `dest`.
//
// The returned array is a list of Vec2 world-coord waypoints that the unit
// should walk through in order. The first waypoint is the centre of the
// *next* chamber (not the current one, which the unit is already in), and the
// last waypoint is `dest` itself.
//
// Local steering in world.ts just pops waypoints as the unit arrives.
// ---------------------------------------------------------------------------

export function computeWaypoints(pos: Vec2, dest: Vec2): Vec2[] {
  const fromCh = chamberOf(pos);
  const toCh   = chamberOf(dest);

  const path = findChamberPath(fromCh, toCh);
  if (!path || path.length === 0) return [{ ...dest }];

  const waypoints: Vec2[] = [];

  // For each chamber transition, add the centre of the next chamber (except
  // the final one, which we replace with dest to land precisely).
  for (let i = 1; i < path.length; i++) {
    const ch = BODY_MAP.chambers[path[i]];
    if (i === path.length - 1) {
      // Final leg: go to the actual destination, not just the chamber centre
      waypoints.push({ ...dest });
    } else {
      waypoints.push({ ...ch.centre });
    }
  }

  // Edge case: same chamber → just walk to dest directly
  if (waypoints.length === 0) return [{ ...dest }];

  return waypoints;
}

// ---------------------------------------------------------------------------
// Tissue-wall collision: returns true if a straight line from `a` to `b`
// passes through tissue (i.e. exits all vessels and chambers).
//
// Used by tests to verify units don't path through walls.
// Approximation: sample the midpoint — good enough for corridor widths we use.
// ---------------------------------------------------------------------------

function inChamber(p: Vec2): boolean {
  for (const ch of BODY_MAP.chambers) {
    if (Math.hypot(p.x - ch.centre.x, p.y - ch.centre.y) <= ch.radius) return true;
  }
  return false;
}

function inVessel(p: Vec2): boolean {
  for (const v of BODY_MAP.vessels) {
    const a = BODY_MAP.chambers[v.a].centre;
    const b = BODY_MAP.chambers[v.b].centre;
    // Project p onto segment ab, clamp, check distance
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    if (Math.hypot(p.x - cx, p.y - cy) <= v.halfWidth) return true;
  }
  return false;
}

/** Returns true if the point is in navigable space (chamber OR vessel). */
export function inNavigableSpace(p: Vec2): boolean {
  return inChamber(p) || inVessel(p);
}

/**
 * Returns true if the straight line from `a` to `b` crosses tissue (is NOT
 * fully within navigable space at the midpoint and quarter-points).
 * Lightweight check — sufficient for the test assertions we need.
 */
export function crossesTissue(a: Vec2, b: Vec2): boolean {
  const samples = 8;
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const p: Vec2 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!inNavigableSpace(p)) return true;
  }
  return false;
}
