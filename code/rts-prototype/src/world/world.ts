// ---------------------------------------------------------------------------
// World factory and simulation step.
// DOM-free. Safe to import in Vitest without a browser environment.
// ---------------------------------------------------------------------------

import { World, Entity } from './types';

/** Auto-incrementing id generator. */
let _nextId = 1;
export function nextId(): string {
  return `e${_nextId++}`;
}

/** Create a fresh World with default dimensions and a single placeholder entity. */
export function createWorld(width: number, height: number): World {
  const placeholder: Entity = {
    id: nextId(),
    kind: 'placeholder',
    pos: { x: width * 0.15, y: height * 0.5 },
    vel: { x: 120, y: 60 },   // px/s
    hp: 10,
    maxHp: 10,
    owner: 'you',
    data: {},
  };

  return {
    entities: [placeholder],
    width,
    height,
    elapsed: 0,
    paused: false,
  };
}

/**
 * Advance the world by `dt` seconds.
 *
 * Design notes:
 * - Mutates `world` in place for performance (avoids per-frame allocations).
 * - Callers that need immutability can shallow-clone before calling.
 * - Logic stays here, never in render code.
 */
export function update(world: World, dt: number): World {
  if (world.paused) return world;

  world.elapsed += dt;

  for (const entity of world.entities) {
    // Move entity by velocity * dt
    entity.pos.x += entity.vel.x * dt;
    entity.pos.y += entity.vel.y * dt;

    // Bounce off arena walls
    if (entity.pos.x < 0) {
      entity.pos.x = 0;
      entity.vel.x = Math.abs(entity.vel.x);
    } else if (entity.pos.x > world.width) {
      entity.pos.x = world.width;
      entity.vel.x = -Math.abs(entity.vel.x);
    }

    if (entity.pos.y < 0) {
      entity.pos.y = 0;
      entity.vel.y = Math.abs(entity.vel.y);
    } else if (entity.pos.y > world.height) {
      entity.pos.y = world.height;
      entity.vel.y = -Math.abs(entity.vel.y);
    }
  }

  return world;
}
