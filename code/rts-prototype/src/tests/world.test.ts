import { describe, it, expect } from 'vitest';
import { createWorld, update } from '../world/world';

/**
 * createWorld() now starts in the 'onboarding' state (paused, sim frozen) so the
 * player can read the tutorial. These step tests need a *live* world, so we flip
 * it to 'playing' first — mirroring what clicking BEGIN does.
 */
function liveWorld(w = 1100, h = 740) {
  const world = createWorld(w, h);
  world.gameState = 'playing';
  world.paused = false;
  return world;
}

describe('update()', () => {
  it('advances entity position by vel * dt', () => {
    const world = liveWorld();
    const entity = world.entities[0];

    // Record starting position and velocity
    const x0 = entity.pos.x;
    const y0 = entity.pos.y;
    const vx = entity.vel.x;
    const vy = entity.vel.y;

    const dt = 1 / 60;
    update(world, dt);

    expect(entity.pos.x).toBeCloseTo(x0 + vx * dt, 8);
    expect(entity.pos.y).toBeCloseTo(y0 + vy * dt, 8);
  });

  it('does not advance position when paused', () => {
    const world = liveWorld();
    world.paused = true;
    const entity = world.entities[0];

    const x0 = entity.pos.x;
    const y0 = entity.pos.y;

    update(world, 1 / 60);

    expect(entity.pos.x).toBe(x0);
    expect(entity.pos.y).toBe(y0);
  });

  it('does not advance position during onboarding', () => {
    const world = createWorld(1100, 740); // stays in 'onboarding'
    const entity = world.entities[0];
    const x0 = entity.pos.x;

    update(world, 1 / 60);

    expect(entity.pos.x).toBe(x0);
    expect(world.elapsed).toBe(0);
  });

  it('clamps entity to arena walls (no bouncing)', () => {
    const world = liveWorld();
    const entity = world.entities[0];

    // Place entity beyond the right wall with rightward velocity
    entity.pos.x = 1100;
    entity.vel.x = 200;

    update(world, 1 / 60);

    // Position must not exceed arena width
    expect(entity.pos.x).toBeLessThanOrEqual(1100);
  });

  it('increments world.elapsed by dt', () => {
    const world = liveWorld();
    const dt = 1 / 60;
    update(world, dt);
    expect(world.elapsed).toBeCloseTo(dt, 10);
  });
});

describe('win / lose conditions', () => {
  it('sets gameState = "lost" when the base is destroyed', () => {
    const world = liveWorld();
    // Remove the base to simulate its destruction
    world.entities = world.entities.filter((e) => e.kind !== 'base');

    update(world, 1 / 60);

    expect(world.gameState).toBe('lost');
  });

  it('does not lose while the base is alive', () => {
    const world = liveWorld();
    update(world, 1 / 60);
    expect(world.gameState).toBe('playing');
  });
});
