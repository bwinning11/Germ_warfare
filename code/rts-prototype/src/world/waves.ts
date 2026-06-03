// ---------------------------------------------------------------------------
// Immune wave system — escalating spawns + enemy AI targeting.
// DOM-free. All logic is in pure functions, fully testable.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from './types';
import { BODY_MAP, computeWaypoints } from './map';

// ---------------------------------------------------------------------------
// Tunable constants — adjust these to change wave feel
// ---------------------------------------------------------------------------

/** Seconds between wave arrivals. */
export const WAVE_INTERVAL = 20;          // seconds — enough to build a starting force, soon enough that waves contest the organ

/** How many immune units spawn in wave 1. */
export const WAVE_BASE_SIZE = 4;

/** Additional units added per subsequent wave. */
export const WAVE_SIZE_INCREMENT = 2;

/** Macrophage stats. */
const MACROPHAGE_HP     = 60;
const MACROPHAGE_SPEED  = 55;  // px/s — deliberate and menacing

/** Neutrophil stats — faster, lighter. */
const NEUTROPHIL_HP     = 30;
const NEUTROPHIL_SPEED  = 95;  // px/s — quick harasser

// ---------------------------------------------------------------------------
// Wave state — passed into tickWaves each frame
// ---------------------------------------------------------------------------

export interface WaveState {
  /** Seconds accumulated since the last wave (or game start). */
  timer: number;
  /** How many waves have spawned so far. */
  waveNumber: number;
  /** True for one tick after a wave spawns (used by renderer for "incoming" cue). */
  waveJustSpawned: boolean;
}

/** Create the initial wave state. */
export function createWaveState(): WaveState {
  return { timer: 0, waveNumber: 0, waveJustSpawned: false };
}

// ---------------------------------------------------------------------------
// Spawn helpers
// ---------------------------------------------------------------------------

let _waveUnitId = 10_000; // offset to avoid collisions with nextId() in world.ts
function waveId(): string {
  return `w${_waveUnitId++}`;
}

/**
 * Pick a spawn position inside the ORGAN chamber or one of its adjacent
 * vessel entry points (chambers 2 or 3 — the north/south junction chambers).
 * Immune units enter the body from the far side (organ side) and push
 * through the vessel network toward the player.
 */
function spawnPos(_world: World, rng: () => number): Vec2 {
  // Immune units spawn in/near one of: organ chamber (4), junction N (2), junction S (3)
  const spawnChamberIds = [4, 2, 3, 4]; // weighted toward the organ chamber
  const chId = spawnChamberIds[Math.floor(rng() * spawnChamberIds.length)];
  const ch = BODY_MAP.chambers[chId];
  // Scatter within ~60% of the chamber radius so units don't all stack on the centre
  const angle = rng() * Math.PI * 2;
  const r = rng() * ch.radius * 0.6;
  return { x: ch.centre.x + Math.cos(angle) * r, y: ch.centre.y + Math.sin(angle) * r };
}

function makeMacrophage(pos: Vec2, targetPos: Vec2): Entity {
  const waypoints = computeWaypoints(pos, targetPos);
  return {
    id: waveId(),
    kind: 'macrophage',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: MACROPHAGE_HP,
    maxHp: MACROPHAGE_HP,
    owner: 'immune',
    data: {
      speed: MACROPHAGE_SPEED,
      moveTo: { ...targetPos },
      waypoints,
      _waypointDest: { ...targetPos },
      attackCooldownLeft: 0,
    },
  };
}

function makeNeutrophil(pos: Vec2, targetPos: Vec2): Entity {
  const waypoints = computeWaypoints(pos, targetPos);
  return {
    id: waveId(),
    kind: 'neutrophil',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: NEUTROPHIL_HP,
    maxHp: NEUTROPHIL_HP,
    owner: 'immune',
    data: {
      speed: NEUTROPHIL_SPEED,
      moveTo: { ...targetPos },
      waypoints,
      _waypointDest: { ...targetPos },
      attackCooldownLeft: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Targeting AI — exported for tests
// ---------------------------------------------------------------------------

/**
 * Find the best target for an immune unit.
 *
 * Priority:
 *  1. Nearest player-owned non-base entity (spreader, brute, spitter, etc.).
 *  2. Player base (fallback if no combat units exist).
 *
 * Returns null if there are no player entities at all.
 */
export function immuneTargetFor(immune: Entity, world: World): Entity | null {
  let nearestUnit: Entity | null = null;
  let nearestUnitDist = Infinity;
  let base: Entity | null = null;

  for (const e of world.entities) {
    if (e.owner !== 'you') continue;

    if (e.kind === 'base') {
      base = e;
      continue;
    }

    const d = Math.hypot(e.pos.x - immune.pos.x, e.pos.y - immune.pos.y);
    if (d < nearestUnitDist) {
      nearestUnit = e;
      nearestUnitDist = d;
    }
  }

  return nearestUnit ?? base;
}

/**
 * Update moveTo for all immune units — call each sim step.
 * This is the core enemy AI: continuously re-target and steer.
 * The actual movement is handled by the generic movement system in world.ts.
 *
 * When the target changes significantly, we invalidate the waypoint cache so
 * world.ts recomputes the route on the next movement tick.
 */
export function tickImmunAI(world: World): void {
  for (const e of world.entities) {
    if (e.owner !== 'immune') continue;

    const target = immuneTargetFor(e, world);
    if (!target) continue;

    const newDest = { ...target.pos };
    const oldDest = e.data.moveTo as Vec2 | null;

    // Only invalidate waypoints when the target has moved enough to matter —
    // avoids thrashing the path cache every frame while chasing.
    const RETARGET_THRESHOLD = 40; // px
    if (!oldDest ||
        Math.hypot(newDest.x - oldDest.x, newDest.y - oldDest.y) > RETARGET_THRESHOLD) {
      e.data.moveTo = newDest;
      // Clear waypoint cache — world.ts will recompute next tick
      e.data.waypoints = [];
      e.data._waypointDest = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Wave spawner — call once per sim step
// ---------------------------------------------------------------------------

/**
 * Advance the wave timer by `dt` seconds.
 * Spawns a new wave whenever the timer crosses WAVE_INTERVAL.
 * Mutates `world.entities` and `ws` in place.
 */
export function tickWaves(world: World, ws: WaveState, dt: number): void {
  ws.waveJustSpawned = false;
  ws.timer += dt;

  while (ws.timer >= WAVE_INTERVAL) {
    ws.timer -= WAVE_INTERVAL;
    spawnWave(world, ws);
  }
}

/**
 * Spawn one wave of immune units.
 * Uses a seeded-ish rng derived from wave number for testability
 * (deterministic per wave, but looks varied to the player).
 */
function spawnWave(world: World, ws: WaveState): void {
  ws.waveNumber += 1;
  ws.waveJustSpawned = true;

  const waveSize = WAVE_BASE_SIZE + (ws.waveNumber - 1) * WAVE_SIZE_INCREMENT;

  // Simple deterministic-ish rng seeded by wave number + unit index
  let seed = ws.waveNumber * 31337;
  function rng(): number {
    seed = (seed * 1664525 + 1013904223) & 0xffff_ffff;
    return (seed >>> 0) / 0xffff_ffff;
  }

  // Find an initial target position (base or centre) to give spawned units a moveTo
  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  const defaultTarget: Vec2 = base
    ? { ...base.pos }
    : { x: world.width * 0.1, y: world.height * 0.5 };

  for (let i = 0; i < waveSize; i++) {
    const pos = spawnPos(world, rng);
    // Later waves mix in faster neutrophils
    const useNeutrophil = ws.waveNumber >= 3 && rng() < 0.4;
    const unit = useNeutrophil
      ? makeNeutrophil(pos, defaultTarget)
      : makeMacrophage(pos, defaultTarget);

    world.entities.push(unit);
  }
}
