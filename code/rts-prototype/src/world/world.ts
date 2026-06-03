// ---------------------------------------------------------------------------
// World factory and simulation step.
// DOM-free. Safe to import in Vitest without a browser environment.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2, ProductionMix } from './types';
import { tickIncome, autoBuildStep } from './economy';
import { tickCombat, removeDeadEntities, updateEffects } from './combat';
import { createWaveState, tickWaves, tickImmunAI, WaveState } from './waves';
import { makeOrgan, tickCapture } from './capture';
import {
  createInnateState,
  createAdaptiveState,
  tickInnate,
  tickAdaptive,
  computeThreatLevel,
  InnateState,
  AdaptiveState,
} from './immune';

// ---------------------------------------------------------------------------
// Module-level immune state — lives alongside the world singleton
// ---------------------------------------------------------------------------
export let waveState: WaveState = createWaveState();
export let innateState: InnateState = createInnateState();
export let adaptiveState: AdaptiveState = createAdaptiveState();

/** Auto-incrementing id generator. */
let _nextId = 1;
export function nextId(): string {
  return `e${_nextId++}`;
}

// ---------------------------------------------------------------------------
// Unit constants
// ---------------------------------------------------------------------------

/** How close a unit must get to its moveTo before it is considered arrived. */
const ARRIVAL_RADIUS = 6;         // px

/** Default speed for spreader units. */
const SPREADER_SPEED = 120;       // px/s

/**
 * Separation push strength — applied when two units overlap.
 * Cheap O(n²) push-apart; fine for small unit counts in a prototype.
 */
const SEPARATION_RADIUS = 22;    // px — units within this push apart
const SEPARATION_STRENGTH = 180; // px/s² (impulse per second)

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Spawn a player-owned spreader at `pos` with optional move target. */
function makeUnit(pos: Vec2, moveTo: Vec2 | null = null): Entity {
  return {
    id: nextId(),
    kind: 'spreader',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: 10,
    maxHp: 10,
    owner: 'you',
    data: { moveTo, speed: SPREADER_SPEED },
  };
}

/** Base hit points. High enough to survive early waves if defended; falls if ignored. */
export const BASE_HP = 320;

/** Spawn the player's base at `pos`. */
function makeBase(pos: Vec2): Entity {
  return {
    id: nextId(),
    kind: 'base',
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    hp: BASE_HP,
    maxHp: BASE_HP,
    owner: 'you',
    data: { rallyPoint: null },
  };
}

/**
 * Create a fresh World.
 * Spawns the player base on the left side with a small escort of spreaders.
 */
export function createWorld(width: number, height: number): World {
  // Base sits on the left-centre
  const baseX = width * 0.10;
  const baseY = height * 0.5;
  const spacing = 36;

  const base = makeBase({ x: baseX, y: baseY });

  // The capture objective sits on the FAR side of the arena — the player must
  // build an army and fight across the map (past the immune entry edges) to it.
  const organ = makeOrgan({ x: width * 0.88, y: height * 0.5 });

  // Default rally point: just to the right of the base
  const rallyPoint: Vec2 = { x: baseX + 160, y: baseY };

  // A few starting spreaders clustered to the right of the base
  const offsets: Vec2[] = [
    { x: 90,  y: -spacing },
    { x: 130, y: -spacing },
    { x: 90,  y: 0        },
    { x: 130, y: 0        },
    { x: 90,  y:  spacing },
    { x: 130, y:  spacing },
  ];

  const units: Entity[] = offsets.map((o) =>
    makeUnit({ x: baseX + o.x, y: baseY + o.y }),
  );

  // Reset wave state and two-tier immune state for a fresh game
  waveState = createWaveState();
  innateState = createInnateState();
  adaptiveState = createAdaptiveState();

  // Default mix: all three types equally weighted (the player can adjust)
  const productionMix: ProductionMix = { spreader: 1, brute: 1, spitter: 1 };

  return {
    entities: [base, organ, ...units],
    width,
    height,
    elapsed: 0,
    // Start paused under the onboarding overlay — the sim does not run until
    // the player clicks BEGIN (no time pressure while reading the tutorial).
    paused: true,
    biomass: 60,          // starting resource — enough for a couple of units up front
    rallyPoint,
    gameState: 'onboarding',
    captureProgress: 0,
    organContested: false,
    productionMix,
    buildAccumulator: 0,
    threatLevel: 0,
  };
}

/**
 * Reset an existing world object in place to a fresh start (used by Restart).
 * Keeps the same object reference so input/render bindings stay valid.
 */
export function resetWorld(world: World): void {
  const fresh = createWorld(world.width, world.height);
  world.entities = fresh.entities;
  world.elapsed = fresh.elapsed;
  world.paused = fresh.paused;
  world.biomass = fresh.biomass;
  world.rallyPoint = fresh.rallyPoint;
  world.gameState = fresh.gameState;
  world.captureProgress = fresh.captureProgress;
  world.organContested = fresh.organContested;
  world.productionMix = fresh.productionMix;
  world.buildAccumulator = fresh.buildAccumulator;
  world.threatLevel = fresh.threatLevel;
}

// ---------------------------------------------------------------------------
// Simulation step
// ---------------------------------------------------------------------------

/**
 * Advance the world by `dt` seconds.
 *
 * - Mutates world in place for performance.
 * - All player units with a `moveTo` steer toward it and stop on arrival.
 * - Light separation prevents full stacking.
 */
export function update(world: World, dt: number): World {
  // The sim only advances during live play. Onboarding / won / lost all freeze
  // the world (paused also freezes it, e.g. via the Space key).
  if (world.paused || world.gameState !== 'playing') return world;

  world.elapsed += dt;

  // Passive biomass trickle
  tickIncome(world, dt);

  // Auto-production: spend biomass on units per the current mix
  autoBuildStep(world, dt);

  const units = world.entities;

  // --- Movement toward moveTo (skip static structures) ---
  for (const e of units) {
    if (e.kind === 'base') continue;
    const moveTo = e.data.moveTo as Vec2 | null;
    if (!moveTo) continue;

    const dx = moveTo.x - e.pos.x;
    const dy = moveTo.y - e.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= ARRIVAL_RADIUS) {
      // Snap to target, clear moveTo, zero velocity
      e.pos.x = moveTo.x;
      e.pos.y = moveTo.y;
      e.vel.x = 0;
      e.vel.y = 0;
      e.data.moveTo = null;
      continue;
    }

    const speed = (e.data.speed as number) ?? SPREADER_SPEED;
    const nx = dx / dist;
    const ny = dy / dist;

    // Set velocity directly (not acceleration) for crisp, predictable feel
    e.vel.x = nx * speed;
    e.vel.y = ny * speed;
  }

  // --- Separation: cheap pairwise push-apart (skip static structures) ---
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      // Structures don't participate in separation
      if (a.kind === 'base' || b.kind === 'base') continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < SEPARATION_RADIUS && dist > 0.001) {
        const overlap = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS;
        const pushX = (dx / dist) * overlap * SEPARATION_STRENGTH * dt;
        const pushY = (dy / dist) * overlap * SEPARATION_STRENGTH * dt;

        a.pos.x -= pushX;
        a.pos.y -= pushY;
        b.pos.x += pushX;
        b.pos.y += pushY;
      }
    }
  }

  // --- Integrate velocity → position, clamp to arena ---
  for (const e of units) {
    e.pos.x += e.vel.x * dt;
    e.pos.y += e.vel.y * dt;

    // Clamp (no bouncing — units just stop at walls)
    e.pos.x = Math.max(0, Math.min(world.width, e.pos.x));
    e.pos.y = Math.max(0, Math.min(world.height, e.pos.y));
  }

  // --- Legacy wave spawner (now the adaptive tier) + innate scouts ---
  tickWaves(world, waveState, dt);
  // Innate tier: roaming scouts from game start
  tickInnate(world, innateState, dt);
  // Adaptive tier: escalating targeted pushes
  const threat = computeThreatLevel(world, adaptiveState);
  world.threatLevel = threat;
  const THREAT_MAX_REFERENCE = 100;
  const threatFrac = Math.min(1, threat / THREAT_MAX_REFERENCE);
  tickAdaptive(world, adaptiveState, dt, threatFrac);
  // Immune AI (update moveTo for all immune units)
  tickImmunAI(world);

  // --- Combat ---
  tickCombat(world, dt);
  removeDeadEntities(world);
  updateEffects(dt);

  // --- Objective: capture the organ (may set gameState = 'won') ---
  tickCapture(world, dt);

  // --- Lose check: base destroyed ---
  const baseAlive = world.entities.some((e) => e.kind === 'base' && e.owner === 'you');
  if (!baseAlive && world.gameState === 'playing') {
    world.gameState = 'lost';
  }

  return world;
}
