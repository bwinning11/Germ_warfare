// ---------------------------------------------------------------------------
// World factory and simulation step.
// DOM-free. Safe to import in Vitest without a browser environment.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from './types';

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

/**
 * Create a fresh World.
 * Spawns several player units arranged in a loose cluster on the left side.
 */
export function createWorld(width: number, height: number): World {
  const cx = width * 0.18;
  const cy = height * 0.5;
  const spacing = 36;

  // 6 units in a 2-column grid
  const offsets: Vec2[] = [
    { x: 0,       y: -spacing },
    { x: spacing, y: -spacing },
    { x: 0,       y: 0        },
    { x: spacing, y: 0        },
    { x: 0,       y:  spacing },
    { x: spacing, y:  spacing },
  ];

  const entities: Entity[] = offsets.map((o) =>
    makeUnit({ x: cx + o.x, y: cy + o.y }),
  );

  return {
    entities,
    width,
    height,
    elapsed: 0,
    paused: false,
  };
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
  if (world.paused) return world;

  world.elapsed += dt;

  const units = world.entities;

  // --- Movement toward moveTo ---
  for (const e of units) {
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

  // --- Separation: cheap pairwise push-apart ---
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
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

  return world;
}
