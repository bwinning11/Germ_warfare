import { describe, it, expect } from 'vitest';
import { createWorld, update } from '../world/world';

describe('update()', () => {
  it('advances entity position by vel * dt', () => {
    const world = createWorld(1100, 740);
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
    const world = createWorld(1100, 740);
    world.paused = true;
    const entity = world.entities[0];

    const x0 = entity.pos.x;
    const y0 = entity.pos.y;

    update(world, 1 / 60);

    expect(entity.pos.x).toBe(x0);
    expect(entity.pos.y).toBe(y0);
  });

  it('clamps entity to arena walls (no bouncing)', () => {
    const world = createWorld(1100, 740);
    const entity = world.entities[0];

    // Place entity beyond the right wall with rightward velocity
    entity.pos.x = 1100;
    entity.vel.x = 200;

    update(world, 1 / 60);

    // Position must not exceed arena width
    expect(entity.pos.x).toBeLessThanOrEqual(1100);
  });

  it('increments world.elapsed by dt', () => {
    const world = createWorld(1100, 740);
    const dt = 1 / 60;
    update(world, dt);
    expect(world.elapsed).toBeCloseTo(dt, 10);
  });
});
