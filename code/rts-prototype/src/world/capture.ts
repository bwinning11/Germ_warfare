// ---------------------------------------------------------------------------
// Objective: capture the ORGAN.
//
// To win, the player must keep their unit(s) on/near the organ, uncontested by
// immune units, for CAPTURE_TIME seconds. Progress climbs while you hold it,
// stalls while an immune unit contests it, and decays when you walk away.
//
// DOM-free. Pure functions, fully testable.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from './types';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

/**
 * Seconds of uncontested holding required to capture the organ (WIN).
 * Tuned so a blind rush of the starting units CANNOT finish before the first
 * immune wave reaches the organ and contests it — you must win the fight there,
 * not just touch the organ. Long enough to force that fight, short enough to
 * stay tense rather than a slog.
 */
export const CAPTURE_TIME = 24; // seconds

/**
 * How close a unit must be to the organ centre to count as "holding" it.
 * Generous on purpose: your units drift off-centre to fight the immune wave at
 * the organ, and a fight just outside the gland should still count as a hold —
 * otherwise melee pursuit constantly drops you out of the capture zone.
 */
export const CAPTURE_RADIUS = 95; // px

/**
 * How fast capture progress decays (seconds of progress lost per real second)
 * when the player is NOT holding the organ. Gentle: brief slips (a unit chasing
 * an enemy out of range) barely cost you, but fully abandoning the organ does.
 */
export const CAPTURE_DECAY_RATE = 0.3;

// ---------------------------------------------------------------------------
// Organ factory
// ---------------------------------------------------------------------------

/** Create the neutral capture-objective organ at `pos`. */
export function makeOrgan(pos: Vec2): Entity {
  return {
    id: 'organ',
    kind: 'organ',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: 1,
    maxHp: 1,
    owner: 'neutral',
    data: {},
  };
}

/** Find the organ entity, or null if none exists. */
export function findOrgan(world: World): Entity | null {
  return world.entities.find((e) => e.kind === 'organ') ?? null;
}

// ---------------------------------------------------------------------------
// Capture state evaluation (pure — exported for tests)
// ---------------------------------------------------------------------------

export interface CaptureStatus {
  /** At least one player unit is within CAPTURE_RADIUS of the organ. */
  playerHolding: boolean;
  /** At least one immune unit is within CAPTURE_RADIUS of the organ. */
  immuneContesting: boolean;
}

/**
 * Evaluate who is standing on the organ this instant.
 * Only mobile units count — the base does not (it can't move there).
 */
export function evaluateCapture(world: World): CaptureStatus {
  const organ = findOrgan(world);
  if (!organ) return { playerHolding: false, immuneContesting: false };

  let playerHolding = false;
  let immuneContesting = false;

  for (const e of world.entities) {
    if (e.kind === 'organ' || e.kind === 'base') continue;
    const d = Math.hypot(e.pos.x - organ.pos.x, e.pos.y - organ.pos.y);
    if (d > CAPTURE_RADIUS) continue;
    if (e.owner === 'you') playerHolding = true;
    else if (e.owner === 'immune') immuneContesting = true;
  }

  return { playerHolding, immuneContesting };
}

// ---------------------------------------------------------------------------
// Capture tick — call once per sim step (mutates world)
// ---------------------------------------------------------------------------

/**
 * Advance organ capture by `dt` seconds and update world.captureProgress,
 * world.organContested, and the win/lose game state.
 *
 * Rules:
 *  - You must HOLD the organ (a unit within radius) AND it must be UNCONTESTED
 *    (no immune unit within radius) for progress to climb.
 *  - If contested, progress holds (stalls) — you have to clear the defenders.
 *  - If you aren't holding it at all, progress slowly decays.
 *  - At CAPTURE_TIME → win. If the base is gone → lose (handled in world.update).
 */
export function tickCapture(world: World, dt: number): void {
  const { playerHolding, immuneContesting } = evaluateCapture(world);
  world.organContested = playerHolding && immuneContesting;

  if (playerHolding && !immuneContesting) {
    // Uncontested hold — make progress
    world.captureProgress = Math.min(CAPTURE_TIME, world.captureProgress + dt);
  } else if (playerHolding && immuneContesting) {
    // Contested — stall (no change)
  } else {
    // Not holding — decay
    world.captureProgress = Math.max(0, world.captureProgress - CAPTURE_DECAY_RATE * dt);
  }

  if (world.captureProgress >= CAPTURE_TIME) {
    world.gameState = 'won';
  }
}
