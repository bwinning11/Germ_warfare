// ---------------------------------------------------------------------------
// Tests for unit movement and selection geometry.
// These must pass before shipping rts-T2.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createWorld, update } from '../world/world';
import { unitsInRect, unitAtPoint } from '../world/selection';
import { Entity } from '../world/types';

// ---------------------------------------------------------------------------
// Helper: spawn a minimal 'you'-owned spreader at a given position.
// ---------------------------------------------------------------------------
function makeUnit(id: string, x: number, y: number, owner: Entity['owner'] = 'you'): Entity {
  return {
    id,
    kind: 'spreader',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    hp: 10,
    maxHp: 10,
    owner,
    data: { moveTo: null, speed: 100 },
  };
}

// ---------------------------------------------------------------------------
// Movement tests
// ---------------------------------------------------------------------------
describe('unit movement', () => {
  it('moves toward moveTo target and reduces distance each step', () => {
    const world = createWorld(1100, 740);
    // Replace placeholder with a spreader that has a move target
    world.entities = [];
    const unit = makeUnit('u1', 100, 100);
    (unit.data as Record<string, unknown>).moveTo = { x: 200, y: 200 };
    (unit.data as Record<string, unknown>).speed = 100;
    world.entities.push(unit);

    const distBefore = Math.hypot(200 - unit.pos.x, 200 - unit.pos.y);
    update(world, 1 / 60);
    const distAfter = Math.hypot(200 - unit.pos.x, 200 - unit.pos.y);

    expect(distAfter).toBeLessThan(distBefore);
  });

  it('stops within arrival radius when close to moveTo', () => {
    const world = createWorld(1100, 740);
    world.entities = [];
    const unit = makeUnit('u1', 199, 199);
    (unit.data as Record<string, unknown>).moveTo = { x: 200, y: 200 };
    (unit.data as Record<string, unknown>).speed = 100;
    world.entities.push(unit);

    // Run many steps — unit should settle near target
    for (let i = 0; i < 120; i++) update(world, 1 / 60);

    const dist = Math.hypot(200 - unit.pos.x, 200 - unit.pos.y);
    // Should be within a small arrival radius (≤ 8 px)
    expect(dist).toBeLessThanOrEqual(8);
  });

  it('clears moveTo once arrived', () => {
    const world = createWorld(1100, 740);
    world.entities = [];
    const unit = makeUnit('u1', 200, 200);
    (unit.data as Record<string, unknown>).moveTo = { x: 200, y: 200 };
    (unit.data as Record<string, unknown>).speed = 100;
    world.entities.push(unit);

    update(world, 1 / 60);

    expect(unit.data.moveTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Selection geometry tests
// ---------------------------------------------------------------------------
describe('unitsInRect()', () => {
  it('returns only player-owned units fully inside the rect', () => {
    const world = createWorld(1100, 740);
    world.entities = [
      makeUnit('inside', 200, 200, 'you'),
      makeUnit('outside', 500, 500, 'you'),
      makeUnit('enemy-inside', 200, 200, 'immune'),   // inside but wrong owner
      makeUnit('neutral-inside', 200, 200, 'neutral'), // inside but wrong owner
    ];

    const rect = { x: 100, y: 100, w: 200, h: 200 }; // covers 100–300 x 100–300
    const result = unitsInRect(world, rect);

    expect(result.map((u) => u.id)).toEqual(['inside']);
  });

  it('returns empty array when no units are inside', () => {
    const world = createWorld(1100, 740);
    world.entities = [makeUnit('far', 800, 800, 'you')];

    const rect = { x: 0, y: 0, w: 100, h: 100 };
    expect(unitsInRect(world, rect)).toHaveLength(0);
  });

  it('handles a rect drawn right-to-left (negative w/h) correctly', () => {
    const world = createWorld(1100, 740);
    world.entities = [makeUnit('inside', 200, 200, 'you')];

    // Dragged from bottom-right to top-left
    const rect = { x: 300, y: 300, w: -200, h: -200 }; // normalized: 100–300 x 100–300
    const result = unitsInRect(world, rect);

    expect(result.map((u) => u.id)).toEqual(['inside']);
  });
});

describe('unitAtPoint()', () => {
  it('returns the unit whose centre is within hit radius of the point', () => {
    const world = createWorld(1100, 740);
    world.entities = [
      makeUnit('a', 200, 200, 'you'),
      makeUnit('b', 400, 400, 'you'),
    ];

    const hit = unitAtPoint(world, { x: 205, y: 198 });
    expect(hit?.id).toBe('a');
  });

  it('returns null when no unit is close enough', () => {
    const world = createWorld(1100, 740);
    world.entities = [makeUnit('a', 200, 200, 'you')];

    const miss = unitAtPoint(world, { x: 999, y: 999 });
    expect(miss).toBeNull();
  });

  it('prefers the unit closest to the click point when multiple overlap', () => {
    const world = createWorld(1100, 740);
    world.entities = [
      makeUnit('far', 210, 200, 'you'),
      makeUnit('near', 202, 200, 'you'),
    ];

    const hit = unitAtPoint(world, { x: 200, y: 200 });
    expect(hit?.id).toBe('near');
  });
});
