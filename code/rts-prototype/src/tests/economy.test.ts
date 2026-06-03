// ---------------------------------------------------------------------------
// Tests for base production and biomass economy.
// Written BEFORE the implementation (fail → pass).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createWorld } from '../world/world';
import { produce, tickIncome, UNIT_DEFS, setMix, autoBuildStep } from '../world/economy';
import type { ProductionMix } from '../world/types';

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

// ---------------------------------------------------------------------------
// setMix()
// ---------------------------------------------------------------------------
describe('setMix()', () => {
  it('updates world.productionMix weights', () => {
    const world = createWorld(1100, 740);
    const mix: ProductionMix = { spreader: 2, brute: 1, spitter: 0 };
    setMix(world, mix);
    expect(world.productionMix.spreader).toBe(2);
    expect(world.productionMix.brute).toBe(1);
    expect(world.productionMix.spitter).toBe(0);
  });

  it('allows setting all weights to zero (disables production)', () => {
    const world = createWorld(1100, 740);
    setMix(world, { spreader: 0, brute: 0, spitter: 0 });
    expect(world.productionMix.spreader).toBe(0);
    expect(world.productionMix.brute).toBe(0);
    expect(world.productionMix.spitter).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// autoBuildStep()
// ---------------------------------------------------------------------------
describe('autoBuildStep()', () => {
  it('spawns at least one unit when biomass is sufficient and mix is set', () => {
    const world = createWorld(1100, 740);
    world.productionMix = { spreader: 1, brute: 0, spitter: 0 };
    world.biomass = 9999;
    const before = world.entities.filter(e => e.owner === 'you' && e.kind !== 'base').length;

    autoBuildStep(world, 1.0); // 1 second — plenty of time to build something

    const after = world.entities.filter(e => e.owner === 'you' && e.kind !== 'base').length;
    expect(after).toBeGreaterThan(before);
  });

  it('never overspends — biomass does not go below zero', () => {
    const world = createWorld(1100, 740);
    world.productionMix = { spreader: 1, brute: 1, spitter: 1 };
    world.biomass = UNIT_DEFS.spreader.cost - 1; // just under cheapest cost

    autoBuildStep(world, 1.0);

    expect(world.biomass).toBeGreaterThanOrEqual(0);
  });

  it('does not spawn any unit when biomass is below the cheapest enabled type', () => {
    const world = createWorld(1100, 740);
    world.productionMix = { spreader: 0, brute: 1, spitter: 0 }; // only brutes, cost 60
    world.biomass = UNIT_DEFS.brute.cost - 1; // 59 — not enough

    const before = world.entities.filter(e => e.owner === 'you' && e.kind !== 'base').length;
    autoBuildStep(world, 1.0);
    const after = world.entities.filter(e => e.owner === 'you' && e.kind !== 'base').length;

    expect(after).toBe(before);
  });

  it('does nothing when all mix weights are zero', () => {
    const world = createWorld(1100, 740);
    world.productionMix = { spreader: 0, brute: 0, spitter: 0 };
    world.biomass = 9999;

    const before = world.entities.length;
    autoBuildStep(world, 1.0);
    expect(world.entities.length).toBe(before);
  });

  it('changing the mix changes what is produced', () => {
    // Mix A: only spreaders
    const worldA = createWorld(1100, 740);
    worldA.productionMix = { spreader: 1, brute: 0, spitter: 0 };
    worldA.biomass = 9999;
    autoBuildStep(worldA, 5.0);
    const spreaderCount = worldA.entities.filter(e => e.kind === 'spreader').length;
    const bruteCountA = worldA.entities.filter(e => e.kind === 'brute').length;
    expect(spreaderCount).toBeGreaterThan(0);
    expect(bruteCountA).toBe(0);

    // Mix B: only brutes
    const worldB = createWorld(1100, 740);
    worldB.productionMix = { spreader: 0, brute: 1, spitter: 0 };
    worldB.biomass = 9999;
    autoBuildStep(worldB, 5.0);
    const spreaderCountB = worldB.entities.filter(e => e.kind === 'spreader').length;
    // worldB starts with 6 spreader escorts from createWorld; new ones spawned would be brutes
    const bruteCountB = worldB.entities.filter(e => e.kind === 'brute').length;
    expect(bruteCountB).toBeGreaterThan(0);
    expect(spreaderCountB).toBe(6); // only the starting escort, no new spreaders
  });

  it('produces units in roughly the set proportions over many steps', () => {
    const world = createWorld(1100, 740);
    // 2:1 spreader-to-spitter mix (no brutes)
    world.productionMix = { spreader: 2, brute: 0, spitter: 1 };
    world.biomass = 100_000;

    // Run many steps of 1 s each
    for (let i = 0; i < 60; i++) {
      autoBuildStep(world, 1.0);
    }

    const spreaders = world.entities.filter(e => e.kind === 'spreader').length - 6; // subtract starting escort
    const spitters  = world.entities.filter(e => e.kind === 'spitter').length;
    const total = spreaders + spitters;

    expect(total).toBeGreaterThan(0);
    const spreaderFrac = spreaders / total;
    // With 2:1 weight, spreaders should be roughly 66 % — allow ±15 %
    expect(spreaderFrac).toBeGreaterThan(0.50);
    expect(spreaderFrac).toBeLessThan(0.82);
  });
});
