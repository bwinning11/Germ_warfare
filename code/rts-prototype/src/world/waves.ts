// ---------------------------------------------------------------------------
// Immune wave system — escalating spawns + enemy AI targeting.
// DOM-free. All logic is in pure functions, fully testable.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from './types';

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
 * Pick a random spawn position on one of the map edges.
 * Entry points are concentrated on the right side and top/bottom edges —
 * matching biological sense (vessels entering from the far side of the arena).
 */
function spawnPos(world: World, rng: () => number): Vec2 {
  const edge = Math.floor(rng() * 4); // 0=right, 1=top, 2=bottom, 3=right-again (weighted)
  const margin = 20;
  switch (edge % 3) {
    case 0: // right edge
      return { x: world.width - margin, y: margin + rng() * (world.height - margin * 2) };
    case 1: // top edge — biased toward the right half
      return { x: world.width * 0.5 + rng() * world.width * 0.5, y: margin };
    case 2: // bottom edge — biased toward the right half
      return { x: world.width * 0.5 + rng() * world.width * 0.5, y: world.height - margin };
    default:
      return { x: world.width - margin, y: world.height / 2 };
  }
}

function makeMacrophage(pos: Vec2, targetPos: Vec2): Entity {
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
      attackCooldownLeft: 0,
    },
  };
}

function makeNeutrophil(pos: Vec2, targetPos: Vec2): Entity {
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
 */
export function tickImmunAI(world: World): void {
  for (const e of world.entities) {
    if (e.owner !== 'immune') continue;

    const target = immuneTargetFor(e, world);
    if (target) {
      e.data.moveTo = { ...target.pos };
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
