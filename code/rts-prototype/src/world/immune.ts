// ---------------------------------------------------------------------------
// Two-tier immune system — Innate scouts + Adaptive escalating siege.
// DOM-free. All logic in pure/stateful functions, fully testable.
//
// INNATE TIER (always present, roaming):
//   - Macrophage: slow, tanky first-responder; generic threat.
//   - Neutrophil: fast, weak harasser; rapid-response scout.
//   - Refilled when innate count drops below INNATE_POOL_SIZE.
//
// ADAPTIVE TIER (escalating, memory-driven, counter-specific):
//   - Triggered after ADAPTIVE_PUSH_INTERVAL elapses.
//   - Threat level = f(elapsed time, army size).
//   - Memory: tracks player's dominant unit type and spawns targeted counters.
//   - Dendritic cell: anti-swarm; counters Spreader (numerous, fast).
//   - NK cell:        heavy melee; counters Brute.
//   - T-cell:         ranged interceptor; counters Spitter.
//   Adaptive units are visually distinct (different shapes/colors) from innate.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2, GermKind } from './types';
import { BODY_MAP, computeWaypoints } from './map';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------

/** Number of innate scouts kept alive at all times. */
export const INNATE_POOL_SIZE = 4;

/** Radius (px) within which an innate scout will lock onto a player unit. */
export const INNATE_PATROL_RADIUS = 260;

/** How often innate scouts pick a new random patrol point (seconds). */
export const INNATE_WANDER_INTERVAL = 6;

/** Seconds between adaptive pushes. */
export const ADAPTIVE_PUSH_INTERVAL = 30;

/** Threat points added per second of elapsed time. */
export const ADAPTIVE_THREAT_PER_SECOND = 1;

/** Threat points added per player combat unit on the field. */
export const ADAPTIVE_THREAT_PER_UNIT = 2;

/** Base adaptive push size (units per push at 0 threat). */
const ADAPTIVE_BASE_SIZE = 3;

/** Extra units per 10 threat points. */
const ADAPTIVE_SIZE_PER_10_THREAT = 2;

/** Fraction of a push that will be the counter unit type. */
const COUNTER_UNIT_FRACTION = 0.5;

// ---------------------------------------------------------------------------
// Innate unit stats
// ---------------------------------------------------------------------------

const INNATE_MACROPHAGE_HP    = 45;
const INNATE_MACROPHAGE_SPEED = 70;  // px/s — deliberate roamer

const INNATE_NEUTROPHIL_HP    = 22;
const INNATE_NEUTROPHIL_SPEED = 110; // px/s — fast scout

// Adaptive unit stats — heavier than innate
const ADAPTIVE_MACROPHAGE_HP    = 90;
const ADAPTIVE_MACROPHAGE_SPEED = 55;

const NK_CELL_HP    = 75;           // counters brute
const NK_CELL_SPEED = 65;

const T_CELL_HP    = 55;            // counters spitter
const T_CELL_SPEED = 80;

// Dendritic cell — ADAPTIVE anti-swarm (counters Spreader)
const DENDRITIC_CELL_HP    = 35;
const DENDRITIC_CELL_SPEED = 105;

// ---------------------------------------------------------------------------
// ID generator — offset to avoid world.ts collision
// ---------------------------------------------------------------------------

let _immuneId = 20_000;
function immuneId(): string {
  return `im${_immuneId++}`;
}

// ---------------------------------------------------------------------------
// Innate state
// ---------------------------------------------------------------------------

export interface InnateState {
  /** Seconds since last wander target was picked per unit (keyed by entity id). */
  wanderTimers: Map<string, number>;
  /** Whether the initial patrol pool has been spawned. */
  initialised: boolean;
}

export function createInnateState(): InnateState {
  return { wanderTimers: new Map(), initialised: false };
}

// ---------------------------------------------------------------------------
// Adaptive state
// ---------------------------------------------------------------------------

export interface AdaptiveState {
  /** Seconds accumulated since last adaptive push. */
  timer: number;
  /** How many pushes have gone out. */
  pushCount: number;
  /** The dominant player germ kind we last observed (memory). */
  dominantKind: GermKind | null;
  /** True for one tick after a push spawns (used for flash cue). */
  pushJustSpawned: boolean;
}

export function createAdaptiveState(): AdaptiveState {
  return {
    timer: 0,
    pushCount: 0,
    dominantKind: null,
    pushJustSpawned: false,
  };
}

// ---------------------------------------------------------------------------
// Spawn helpers
// ---------------------------------------------------------------------------

function spawnEdgePos(_world: World, rng: () => number): Vec2 {
  // Immune units spawn in/near the organ side chambers (4, 2, 3) and move
  // through the vessel network toward the player — same as wave spawns.
  const spawnChamberIds = [4, 2, 3, 4];
  const chId = spawnChamberIds[Math.floor(rng() * spawnChamberIds.length)];
  const ch = BODY_MAP.chambers[chId];
  const angle = rng() * Math.PI * 2;
  const r = rng() * ch.radius * 0.6;
  return { x: ch.centre.x + Math.cos(angle) * r, y: ch.centre.y + Math.sin(angle) * r };
}

function rngFromSeed(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffff_ffff;
    return (s >>> 0) / 0xffff_ffff;
  };
}

/** Build an innate macrophage entity. */
function makeInnateMacrophage(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 'macrophage',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: INNATE_MACROPHAGE_HP,
    maxHp: INNATE_MACROPHAGE_HP,
    owner: 'immune',
    data: {
      speed: INNATE_MACROPHAGE_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'innate',
    },
  };
}

/** Build an innate neutrophil entity. */
function makeInnateNeutrophil(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 'neutrophil',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: INNATE_NEUTROPHIL_HP,
    maxHp: INNATE_NEUTROPHIL_HP,
    owner: 'immune',
    data: {
      speed: INNATE_NEUTROPHIL_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'innate',
    },
  };
}

/** Build an adaptive macrophage (heavier version). */
function makeAdaptiveMacrophage(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 'macrophage',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: ADAPTIVE_MACROPHAGE_HP,
    maxHp: ADAPTIVE_MACROPHAGE_HP,
    owner: 'immune',
    data: {
      speed: ADAPTIVE_MACROPHAGE_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'adaptive',
    },
  };
}

/** NK cell — adaptive counter to brute. */
function makeNkCell(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 'nk_cell',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: NK_CELL_HP,
    maxHp: NK_CELL_HP,
    owner: 'immune',
    data: {
      speed: NK_CELL_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'adaptive',
    },
  };
}

/** T-cell — adaptive counter to spitter. */
function makeTCell(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 't_cell',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: T_CELL_HP,
    maxHp: T_CELL_HP,
    owner: 'immune',
    data: {
      speed: T_CELL_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'adaptive',
    },
  };
}

/** Dendritic cell — adaptive anti-swarm counter to Spreader. */
function makeDendriticCell(pos: Vec2, moveTo: Vec2): Entity {
  const waypoints = computeWaypoints(pos, moveTo);
  return {
    id: immuneId(),
    kind: 'dendritic_cell',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: DENDRITIC_CELL_HP,
    maxHp: DENDRITIC_CELL_HP,
    owner: 'immune',
    data: {
      speed: DENDRITIC_CELL_SPEED,
      moveTo: { ...moveTo },
      waypoints,
      _waypointDest: { ...moveTo },
      attackCooldownLeft: 0,
      tier: 'adaptive',
    },
  };
}

// ---------------------------------------------------------------------------
// Targeting helpers
// ---------------------------------------------------------------------------

/** Base or arena-centre fallback position. */
function playerBaseOrCentre(world: World): Vec2 {
  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  return base ? { ...base.pos } : { x: world.width * 0.1, y: world.height * 0.5 };
}

// ---------------------------------------------------------------------------
// Innate roam target — exported for tests
// ---------------------------------------------------------------------------

/**
 * Pick a movement target for an innate unit.
 *
 * If a player unit is within INNATE_PATROL_RADIUS, converge on it (harassment).
 * Otherwise pick a pseudo-random wander point on the arena.
 * The `rngSeed` parameter makes this deterministic in tests.
 */
export function innateRoamTarget(immune: Entity, world: World, rngSeed: number): Vec2 | null {
  // Look for closest player unit within patrol radius
  let nearestPlayer: Entity | null = null;
  let nearestDist = INNATE_PATROL_RADIUS;

  for (const e of world.entities) {
    if (e.owner !== 'you' || e.kind === 'base') continue;
    const d = Math.hypot(e.pos.x - immune.pos.x, e.pos.y - immune.pos.y);
    if (d < nearestDist) {
      nearestPlayer = e;
      nearestDist = d;
    }
  }

  if (nearestPlayer) {
    // Head toward the player unit with a small jitter so units don't stack exactly
    const rng = rngFromSeed(rngSeed);
    const jitter = 30;
    return {
      x: nearestPlayer.pos.x + (rng() - 0.5) * jitter,
      y: nearestPlayer.pos.y + (rng() - 0.5) * jitter,
    };
  }

  // No nearby player — pick a random chamber centre to wander toward.
  // This ensures innate units stay in navigable space while patrolling.
  const rng = rngFromSeed(rngSeed);
  // Bias toward the player-side chambers (0, 1) for pressure, but mix in
  // central chambers (2, 3) to give varied patrol patterns.
  const wander = BODY_MAP.chambers[Math.floor(rng() * BODY_MAP.chambers.length)];
  const jitter = 40;
  return {
    x: wander.centre.x + (rng() - 0.5) * jitter,
    y: wander.centre.y + (rng() - 0.5) * jitter,
  };
}

// ---------------------------------------------------------------------------
// Innate tick — exported
// ---------------------------------------------------------------------------

/** Ensure the innate patrol pool is initialised and AI is updated each step. */
export function tickInnate(world: World, is: InnateState, dt: number): void {
  // 1. Spawn initial scouts on first call
  if (!is.initialised) {
    _spawnInnatePool(world, is, INNATE_POOL_SIZE);
    is.initialised = true;
  }

  // 2. Refill if scouts have been killed
  const alive = world.entities.filter((e) => e.data.tier === 'innate');
  const deficit = INNATE_POOL_SIZE - alive.length;
  if (deficit > 0) {
    _spawnInnatePool(world, is, deficit);
  }

  // 3. Update wander timers and assign moveTo
  for (const e of world.entities) {
    if (e.data.tier !== 'innate') continue;

    const prev = is.wanderTimers.get(e.id) ?? 0;
    const next = prev + dt;
    is.wanderTimers.set(e.id, next);

    const hasMoveTarget = !!(e.data.moveTo);
    const timerExpired = next >= INNATE_WANDER_INTERVAL;

    if (!hasMoveTarget || timerExpired) {
      // Pick new roam target
      const seed = Math.floor(e.pos.x * 13 + e.pos.y * 7 + next * 100) | 0;
      const target = innateRoamTarget(e, world, seed);
      if (target) {
        e.data.moveTo = target;
      }
      if (timerExpired) {
        is.wanderTimers.set(e.id, 0);
      }
    }
  }
}

function _spawnInnatePool(world: World, is: InnateState, count: number): void {
  const rng = rngFromSeed(Date.now() | count * 997);
  const centre: Vec2 = { x: world.width * 0.6, y: world.height * 0.5 };

  for (let i = 0; i < count; i++) {
    const pos = spawnEdgePos(world, rng);
    // Alternate macrophage / neutrophil — neutrophils are faster scouts
    const unit = i % 2 === 0
      ? makeInnateMacrophage(pos, centre)
      : makeInnateNeutrophil(pos, centre);
    world.entities.push(unit);
    is.wanderTimers.set(unit.id, 0);
  }
}

// ---------------------------------------------------------------------------
// Threat level — exported for tests and HUD
// ---------------------------------------------------------------------------

/**
 * Compute the current adaptive threat level (0..∞).
 * Threat = (elapsed seconds × per-second rate) + (player unit count × per-unit rate).
 */
export function computeThreatLevel(world: World, _as: AdaptiveState): number {
  const playerUnits = world.entities.filter(
    (e) => e.owner === 'you' && e.kind !== 'base',
  ).length;
  return world.elapsed * ADAPTIVE_THREAT_PER_SECOND + playerUnits * ADAPTIVE_THREAT_PER_UNIT;
}

// ---------------------------------------------------------------------------
// Adaptive push size — exported for tests
// ---------------------------------------------------------------------------

/**
 * How many units to send in an adaptive push given a threat fraction (0..1).
 * threat fraction: normalize to 0-1 by dividing by a reference maximum (100).
 */
export function adaptivePushSize(threatFraction: number): number {
  const extra = Math.floor(threatFraction * 10 * ADAPTIVE_SIZE_PER_10_THREAT);
  return Math.max(1, ADAPTIVE_BASE_SIZE + extra);
}

// ---------------------------------------------------------------------------
// Memory — most-used kind and counter lookup — exported for tests
// ---------------------------------------------------------------------------

/** Return the player's most-numerous combat unit kind, or null if none. */
export function getMostUsedKind(world: World): GermKind | null {
  const counts: Record<string, number> = {};
  for (const e of world.entities) {
    if (e.owner !== 'you' || e.kind === 'base') continue;
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  const keys = Object.keys(counts) as GermKind[];
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
}

/**
 * Return the immune unit kind that counters the given germ kind.
 *
 * | Germ kind | Counter        | Rationale                                      |
 * |-----------|----------------|------------------------------------------------|
 * | spreader  | dendritic_cell | anti-swarm — fast, numerous; floods the spread  |
 * | brute     | nk_cell        | heavy melee — punishes tanky clustered brutes   |
 * | spitter   | t_cell         | ranged interceptor — matches Spitter's range    |
 */
export function counterKindFor(germ: GermKind): string {
  switch (germ) {
    case 'spreader': return 'dendritic_cell';
    case 'brute':    return 'nk_cell';
    case 'spitter':  return 't_cell';
  }
}

// ---------------------------------------------------------------------------
// Adaptive tick — exported
// ---------------------------------------------------------------------------

/**
 * Advance the adaptive immune timer by `dt` seconds.
 * Spawns a heavy push when the timer crosses ADAPTIVE_PUSH_INTERVAL.
 * `threatLevel` should be the current value from computeThreatLevel().
 */
export function tickAdaptive(
  world: World,
  as: AdaptiveState,
  dt: number,
  threatFraction: number,
): void {
  as.pushJustSpawned = false;
  as.timer += dt;

  while (as.timer >= ADAPTIVE_PUSH_INTERVAL) {
    as.timer -= ADAPTIVE_PUSH_INTERVAL;
    _spawnAdaptivePush(world, as, threatFraction);
  }
}

function _spawnAdaptivePush(world: World, as: AdaptiveState, threatFraction: number): void {
  as.pushCount += 1;
  as.pushJustSpawned = true;

  // Update memory — what's the player building now?
  as.dominantKind = getMostUsedKind(world);

  const totalSize = adaptivePushSize(threatFraction) + (as.pushCount - 1);
  const counterCount = as.dominantKind
    ? Math.max(1, Math.round(totalSize * COUNTER_UNIT_FRACTION))
    : 0;
  const heavyCount = totalSize - counterCount;

  const rng = rngFromSeed(as.pushCount * 9973 + Math.floor(threatFraction * 100));

  const target = playerBaseOrCentre(world);

  // Spawn heavy adaptive units
  for (let i = 0; i < heavyCount; i++) {
    const pos = spawnEdgePos(world, rng);
    // Mix macrophage (tank) with dendritic cells based on push number
    const unit = i % 3 === 0
      ? makeAdaptiveMacrophage(pos, target)
      : makeDendriticCell(pos, target);
    world.entities.push(unit);
  }

  // Spawn counter units (memory mechanic)
  if (as.dominantKind && counterCount > 0) {
    const counter = counterKindFor(as.dominantKind);
    for (let i = 0; i < counterCount; i++) {
      const pos = spawnEdgePos(world, rng);
      let unit: Entity;
      switch (counter) {
        case 'nk_cell':
          unit = makeNkCell(pos, target);
          break;
        case 't_cell':
          unit = makeTCell(pos, target);
          break;
        case 'dendritic_cell':
        default:
          unit = makeDendriticCell(pos, target);
          break;
      }
      world.entities.push(unit);
    }
  }
}
