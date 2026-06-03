// ---------------------------------------------------------------------------
// Tests for base production and biomass economy.
// Written BEFORE the implementation (fail → pass).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createWorld } from '../world/world';
import { produce, tickIncome, UNIT_DEFS } from '../world/economy';

// ---------------------------------------------------------------------------
// Unit definition sanity
// ---------------------------------------------------------------------------
describe('UNIT_DEFS', () => {
  it('defines spreader, brute, and spitter', () => {
    expect(UNIT_DEFS.spreader).toBeDefined();
    expect(UNIT_DEFS.brute).toBeDefined();
    expect(UNIT_DEFS.spitter).toBeDefined();
  });

  it('each unit type has cost, hp, and speed', () => {
    for (const [, def] of Object.entries(UNIT_DEFS)) {
      expect(typeof def.cost).toBe('number');
      expect(typeof def.hp).toBe('number');
      expect(typeof def.speed).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// tickIncome
// ---------------------------------------------------------------------------
describe('tickIncome()', () => {
  it('accrues biomass over time', () => {
    const world = createWorld(1100, 740);
    const before = world.biomass;
    tickIncome(world, 1.0); // one full second
    expect(world.biomass).toBeGreaterThan(before);
  });

  it('income is proportional to dt', () => {
    const worldA = createWorld(1100, 740);
    const worldB = createWorld(1100, 740);
    tickIncome(worldA, 0.5);
    tickIncome(worldB, 1.0);
    expect(worldB.biomass - worldB.biomass + (worldB.biomass)).toBeGreaterThan(worldA.biomass);
    // More direct: two ticks of 0.5 == one tick of 1.0
    const worldC = createWorld(1100, 740);
    tickIncome(worldC, 0.5);
    tickIncome(worldC, 0.5);
    expect(worldC.biomass).toBeCloseTo(worldB.biomass, 10);
  });
});

// ---------------------------------------------------------------------------
// produce()
// ---------------------------------------------------------------------------
describe('produce()', () => {
  it('spawns a unit of the requested kind at the base position', () => {
    const world = createWorld(1100, 740);
    world.biomass = 9999; // enough for anything
    const countBefore = world.entities.filter(e => e.kind === 'spreader').length;

    const result = produce(world, 'spreader');
    expect(result.success).toBe(true);

    const countAfter = world.entities.filter(e => e.kind === 'spreader').length;
    expect(countAfter).toBe(countBefore + 1);
  });

  it('deducts the correct cost from biomass', () => {
    const world = createWorld(1100, 740);
    const cost = UNIT_DEFS.spreader.cost;
    world.biomass = cost + 50;

    produce(world, 'spreader');

    expect(world.biomass).toBeCloseTo(50, 10);
  });

  it('deducts brute cost correctly', () => {
    const world = createWorld(1100, 740);
    const cost = UNIT_DEFS.brute.cost;
    world.biomass = cost + 100;

    produce(world, 'brute');

    expect(world.biomass).toBeCloseTo(100, 10);
  });

  it('fails when biomass is insufficient', () => {
    const world = createWorld(1100, 740);
    world.biomass = 0;

    const result = produce(world, 'spreader');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('insufficient_biomass');
    }
  });

  it('does not modify entity list when production fails', () => {
    const world = createWorld(1100, 740);
    world.biomass = 0;
    const countBefore = world.entities.length;

    produce(world, 'brute');

    expect(world.entities.length).toBe(countBefore);
  });

  it('spawned unit is player-owned', () => {
    const world = createWorld(1100, 740);
    world.biomass = 9999;

    produce(world, 'spitter');

    const newUnit = world.entities[world.entities.length - 1];
    expect(newUnit.owner).toBe('you');
    expect(newUnit.kind).toBe('spitter');
  });

  it('spawned unit has correct stats from UNIT_DEFS', () => {
    const world = createWorld(1100, 740);
    world.biomass = 9999;

    produce(world, 'brute');

    const newUnit = world.entities[world.entities.length - 1];
    expect(newUnit.hp).toBe(UNIT_DEFS.brute.hp);
    expect(newUnit.maxHp).toBe(UNIT_DEFS.brute.hp);
    expect(newUnit.data.speed).toBe(UNIT_DEFS.brute.speed);
  });
});
