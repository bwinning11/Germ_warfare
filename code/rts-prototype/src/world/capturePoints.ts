// ---------------------------------------------------------------------------
// Multiple capturable control points with map-control benefits.
//
// The map has three non-organ capturable points placed at junction chambers:
//
//   NUTRIENT NODE  (Junction W, chamber 1)
//     Benefit: +NUTRIENT_INCOME_BONUS biomass/s while held.
//
//   FORWARD COLONY (Junction N, chamber 2)
//     Benefit: auto-produced units spawn/rally here instead of the base,
//              putting them further forward on the north branch.
//
//   CHOKE FORTRESS (Junction S, chamber 3)
//     Benefit: player units within FORTRESS_BUFF_RADIUS deal
//              FORTRESS_DAMAGE_MULT × their normal damage.
//
//   ORGAN (chamber 4 — handled by capture.ts for win condition)
//
// All points use the same hold-uncontested-for-a-timer mechanic.
// They can be contested and retaken by the immune system.
//
// DOM-free. Pure functions, fully testable.
// ---------------------------------------------------------------------------

import { World, CapturePoint, CapturePointKind } from './types';
import { BODY_MAP } from './map';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

/** Seconds of uncontested holding to flip a control point. */
export const POINT_CAPTURE_TIME = 12; // seconds — faster than the organ

/** How fast progress decays when no player is holding the point. */
export const POINT_DECAY_RATE = 0.4;

/** Capture zone radius — how close a unit must be to contest/hold. */
export const POINT_CAPTURE_RADIUS = 70; // px

// --- Nutrient Node ---
/** Extra biomass/s earned while the nutrient node is held. */
export const NUTRIENT_INCOME_BONUS = 8; // biomass/s

// --- Choke Fortress ---
/** Radius around the fortress in which the damage buff applies. */
export const FORTRESS_BUFF_RADIUS = 140; // px
/** Multiplier applied to player-unit damage inside the fortress buff zone. */
export const FORTRESS_DAMAGE_MULT = 1.5;

// ---------------------------------------------------------------------------
// Factory — build the three non-organ capturable points at match start.
//
// Placed at the junction chambers (1 = JCT-W, 2 = JCT-N, 3 = JCT-S).
// Chamber indices match BODY_MAP.chambers defined in map.ts.
// ---------------------------------------------------------------------------

export function makeCapturePoints(): CapturePoint[] {
  const chambers = BODY_MAP.chambers;

  return [
    {
      id: 'cp-nutrient',
      kind: 'nutrient_node',
      pos: { ...chambers[1].centre }, // Junction W
      owner: 'neutral',
      captureProgress: 0,
      contested: false,
      radius: POINT_CAPTURE_RADIUS,
    },
    {
      id: 'cp-colony',
      kind: 'forward_colony',
      pos: { ...chambers[2].centre }, // Junction N
      owner: 'neutral',
      captureProgress: 0,
      contested: false,
      radius: POINT_CAPTURE_RADIUS,
    },
    {
      id: 'cp-fortress',
      kind: 'choke_fortress',
      pos: { ...chambers[3].centre }, // Junction S
      owner: 'neutral',
      captureProgress: 0,
      contested: false,
      radius: POINT_CAPTURE_RADIUS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Capture evaluation — who is standing on a given point?
// ---------------------------------------------------------------------------

export interface PointStatus {
  playerHolding: boolean;
  immuneContesting: boolean;
}

export function evaluateCapturePoint(world: World, point: CapturePoint): PointStatus {
  let playerHolding = false;
  let immuneContesting = false;

  for (const e of world.entities) {
    if (e.kind === 'base' || e.kind === 'organ') continue;
    const d = Math.hypot(e.pos.x - point.pos.x, e.pos.y - point.pos.y);
    if (d > point.radius) continue;
    if (e.owner === 'you') playerHolding = true;
    else if (e.owner === 'immune') immuneContesting = true;
  }

  return { playerHolding, immuneContesting };
}

// ---------------------------------------------------------------------------
// Capture tick — advance all control points by dt.
// Mutates each CapturePoint in world.capturePoints in place.
// ---------------------------------------------------------------------------

export function tickCapturePoints(world: World, dt: number): void {
  for (const point of world.capturePoints) {
    const { playerHolding, immuneContesting } = evaluateCapturePoint(world, point);
    point.contested = playerHolding && immuneContesting;

    if (playerHolding && !immuneContesting) {
      // Uncontested hold — progress toward capture
      point.captureProgress = Math.min(POINT_CAPTURE_TIME, point.captureProgress + dt);

      // Flip ownership once progress is full
      if (point.captureProgress >= POINT_CAPTURE_TIME && point.owner !== 'you') {
        point.owner = 'you';
      }
    } else if (immuneContesting && !playerHolding) {
      // Immune holding uncontested — regress toward neutral / immune
      point.captureProgress = Math.max(0, point.captureProgress - dt);
      if (point.captureProgress <= 0 && point.owner !== 'neutral') {
        // If it was ours, it goes neutral first, then immune can re-take it
        point.owner = 'neutral';
      }
    } else if (immuneContesting && playerHolding) {
      // Contested — stall
    } else {
      // Nobody here — progress decays toward neutral
      point.captureProgress = Math.max(0, point.captureProgress - POINT_DECAY_RATE * dt);
      if (point.captureProgress <= 0 && point.owner !== 'neutral') {
        point.owner = 'neutral';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Benefit: Nutrient Node — income multiplier.
//
// Returns the extra biomass/s that should be added on top of base income.
// Call from tickIncome().
// ---------------------------------------------------------------------------

export function nutrientNodeBonus(world: World): number {
  const node = world.capturePoints.find((p) => p.kind === 'nutrient_node');
  if (!node || node.owner !== 'you') return 0;
  return NUTRIENT_INCOME_BONUS;
}

// ---------------------------------------------------------------------------
// Benefit: Forward Colony — spawn / rally position.
//
// Returns the spawn position for a newly produced unit.
// If the forward colony is held by the player, units spawn near it.
// Otherwise, falls back to the base position.
// ---------------------------------------------------------------------------

export function forwardColonySpawnPos(
  world: World,
  basePos: { x: number; y: number },
): { x: number; y: number } {
  const colony = world.capturePoints.find((p) => p.kind === 'forward_colony');
  if (!colony || colony.owner !== 'you') return basePos;

  // Scatter slightly around the colony centre so units don't stack
  return {
    x: colony.pos.x + (Math.random() - 0.5) * 40,
    y: colony.pos.y + (Math.random() - 0.5) * 40,
  };
}

/**
 * The effective rally point for auto-built units.
 * When the forward colony is held, return its position as the rally target
 * (overrides world.rallyPoint for auto-produced units).
 */
export function forwardColonyRallyPoint(
  world: World,
): { x: number; y: number } | null {
  const colony = world.capturePoints.find((p) => p.kind === 'forward_colony');
  if (!colony || colony.owner !== 'you') return world.rallyPoint;
  // Units produced from the colony rally forward — use the organ approach angle
  const organ = BODY_MAP.chambers[4];
  return { x: (colony.pos.x + organ.centre.x) / 2, y: colony.pos.y };
}

// ---------------------------------------------------------------------------
// Benefit: Choke Fortress — damage buff for nearby player units.
//
// Returns true if `pos` is within the fortress buff radius AND the fortress
// is owned by the player.  Combat.ts consults this per attacker.
// ---------------------------------------------------------------------------

export function inFortressBuff(world: World, pos: { x: number; y: number }): boolean {
  const fortress = world.capturePoints.find((p) => p.kind === 'choke_fortress');
  if (!fortress || fortress.owner !== 'you') return false;
  return Math.hypot(pos.x - fortress.pos.x, pos.y - fortress.pos.y) <= FORTRESS_BUFF_RADIUS;
}

// ---------------------------------------------------------------------------
// Helper: find a capture point by kind.
// ---------------------------------------------------------------------------

export function findCapturePoint(
  world: World,
  kind: CapturePointKind,
): CapturePoint | undefined {
  return world.capturePoints.find((p) => p.kind === kind);
}
