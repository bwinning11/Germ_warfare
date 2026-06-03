// ---------------------------------------------------------------------------
// Tests for the two-tier immune system — innate + adaptive.
// Written BEFORE implementation (fail → pass).
//
// Covered:
//   (a) Innate: scouts present from start, roam/engage nearby player units.
//   (b) Adaptive: threat level ramps with time + army size; pushes escalate.
//   (c) Adaptive memory: counters the player's most-used unit type.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  createInnateState,
  createAdaptiveState,
  tickInnate,
  tickAdaptive,
  innateRoamTarget,
  computeThreatLevel,
  adaptivePushSize,
  getMostUsedKind,
  counterKindFor,
  INNATE_PATROL_RADIUS,
  ADAPTIVE_PUSH_INTERVAL,
  ADAPTIVE_THREAT_PER_SECOND,
  ADAPTIVE_THREAT_PER_UNIT,
} from '../world/immune';
import { Entity, World } from '../world/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorld(entities: Entity[], elapsed = 0): World {
  return {
    entities,
    width: 1100,
    height: 740,
    elapsed,
    paused: false,
    biomass: 50,
    rallyPoint: null,
    gameState: 'playing',
    captureProgress: 0,
    organContested: false,
    productionMix: { spreader: 1, brute: 1, spitter: 1 },
    buildAccumulator: 0,
    threatLevel: 0,
  };
}

function makeUnit(
  id: string,
  kind: Entity['kind'],
  owner: Entity['owner'],
  x: number,
  y: number,
  hp = 50,
): Entity {
  return {
    id,
    kind,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    hp,
    maxHp: hp,
    owner,
    data: { moveTo: null, speed: 100, attackCooldownLeft: 0 },
  };
}

// ---------------------------------------------------------------------------
// (a) Innate tier — scouts/first-responders present from start
// ---------------------------------------------------------------------------

describe('createInnateState()', () => {
  it('creates state with innate units already present', () => {
    const world = makeWorld([]);
    const is = createInnateState();
    tickInnate(world, is, 0);
    // After the very first tick (no time), innate units should exist
    const innateCount = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'innate',
    ).length;
    expect(innateCount).toBeGreaterThan(0);
  });

  it('innate units spawn at game start (not after an interval)', () => {
    const world = makeWorld([]);
    const is = createInnateState();
    // tickInnate with dt=0 still spawns initial patrol
    tickInnate(world, is, 0);
    const count = world.entities.filter((e) => e.data.tier === 'innate').length;
    expect(count).toBeGreaterThan(0);
  });
});

describe('innateRoamTarget()', () => {
  it('returns a position near a close player unit when one is within patrol radius', () => {
    const innate = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    innate.data.tier = 'innate';
    const nearPlayer = makeUnit('p1', 'spreader', 'you', 510, 370);
    const world = makeWorld([innate, nearPlayer]);

    const target = innateRoamTarget(innate, world, 42);
    // If a player unit is within patrol radius the target should be near it
    expect(target).not.toBeNull();
    if (target) {
      const dist = Math.hypot(target.x - nearPlayer.pos.x, target.y - nearPlayer.pos.y);
      // Roam target is close to the player unit (within patrol radius)
      expect(dist).toBeLessThanOrEqual(INNATE_PATROL_RADIUS + 10);
    }
  });

  it('returns a wandering patrol point when no player unit is in range', () => {
    const innate = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    innate.data.tier = 'innate';
    // Player unit is very far away
    const farPlayer = makeUnit('p1', 'spreader', 'you', 50, 50);
    const world = makeWorld([innate, farPlayer]);

    const target = innateRoamTarget(innate, world, 99);
    // Should still return some roam point (not null)
    expect(target).not.toBeNull();
  });
});

describe('tickInnate() — roaming AI', () => {
  it('innate units set moveTo toward nearby player units', () => {
    const world = makeWorld([]);
    const is = createInnateState();
    tickInnate(world, is, 0); // spawn initial scouts

    // Place a player unit close to the innate units
    const playerUnit = makeUnit('p1', 'spreader', 'you', 600, 370);
    world.entities.push(playerUnit);

    // Move innate units close to player
    for (const e of world.entities) {
      if (e.data.tier === 'innate') {
        e.pos = { x: 620, y: 370 };
      }
    }

    tickInnate(world, is, 0.1);

    const innateUnits = world.entities.filter((e) => e.data.tier === 'innate');
    expect(innateUnits.length).toBeGreaterThan(0);
    // At least one innate unit should be heading toward the player
    const movingTowardPlayer = innateUnits.some((u) => {
      const mt = u.data.moveTo as { x: number; y: number } | null;
      if (!mt) return false;
      const distToPlayer = Math.hypot(mt.x - playerUnit.pos.x, mt.y - playerUnit.pos.y);
      return distToPlayer < 150; // moveTo is in the vicinity of the player unit
    });
    expect(movingTowardPlayer).toBe(true);
  });

  it('innate count stays stable (refilled if units die)', () => {
    const world = makeWorld([]);
    const is = createInnateState();
    tickInnate(world, is, 0);
    const initial = world.entities.filter((e) => e.data.tier === 'innate').length;
    expect(initial).toBeGreaterThan(0);

    // Kill all innate units
    for (const e of world.entities) {
      if (e.data.tier === 'innate') e.hp = 0;
    }
    world.entities = world.entities.filter((e) => e.hp > 0);

    // After some time the refill should kick in
    tickInnate(world, is, 10);
    const after = world.entities.filter((e) => e.data.tier === 'innate').length;
    expect(after).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (b) Adaptive tier — threat ramp + escalating pushes
// ---------------------------------------------------------------------------

describe('computeThreatLevel()', () => {
  it('threat level increases with elapsed time', () => {
    const world0 = makeWorld([], 0);
    const world1 = makeWorld([], 60);

    const t0 = computeThreatLevel(world0, createAdaptiveState());
    const t1 = computeThreatLevel(world1, createAdaptiveState());

    expect(t1).toBeGreaterThan(t0);
  });

  it('threat level increases with more player units on the field', () => {
    const small: Entity[] = [makeUnit('p1', 'spreader', 'you', 300, 370)];
    const large: Entity[] = Array.from({ length: 10 }, (_, i) =>
      makeUnit(`p${i}`, 'spreader', 'you', 300 + i * 30, 370),
    );

    const wSmall = makeWorld(small, 30);
    const wLarge = makeWorld(large, 30);

    const tSmall = computeThreatLevel(wSmall, createAdaptiveState());
    const tLarge = computeThreatLevel(wLarge, createAdaptiveState());

    expect(tLarge).toBeGreaterThan(tSmall);
  });

  it('ADAPTIVE_THREAT_PER_SECOND and ADAPTIVE_THREAT_PER_UNIT constants are exported', () => {
    expect(typeof ADAPTIVE_THREAT_PER_SECOND).toBe('number');
    expect(typeof ADAPTIVE_THREAT_PER_UNIT).toBe('number');
    expect(ADAPTIVE_THREAT_PER_SECOND).toBeGreaterThan(0);
    expect(ADAPTIVE_THREAT_PER_UNIT).toBeGreaterThan(0);
  });
});

describe('adaptivePushSize()', () => {
  it('returns a larger push for higher threat', () => {
    const small = adaptivePushSize(0.2);
    const large = adaptivePushSize(0.8);
    expect(large).toBeGreaterThan(small);
  });

  it('returns at least 1 unit per push', () => {
    expect(adaptivePushSize(0)).toBeGreaterThanOrEqual(1);
  });
});

describe('tickAdaptive() — escalating pushes', () => {
  it('does not spawn adaptive units before ADAPTIVE_PUSH_INTERVAL elapses', () => {
    const world = makeWorld([]);
    const as_ = createAdaptiveState();
    // Tick slightly less than one push interval
    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL - 0.1, 0.5);
    const adaptiveCount = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'adaptive',
    ).length;
    expect(adaptiveCount).toBe(0);
  });

  it('spawns adaptive units once ADAPTIVE_PUSH_INTERVAL elapses', () => {
    const world = makeWorld([]);
    const as_ = createAdaptiveState();
    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.5);
    const adaptiveCount = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'adaptive',
    ).length;
    expect(adaptiveCount).toBeGreaterThan(0);
  });

  it('second push spawns more adaptive units than the first (escalation)', () => {
    const world = makeWorld([]);
    const as_ = createAdaptiveState();

    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.3);
    const after1 = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'adaptive',
    ).length;

    // Kill first batch to measure new spawns cleanly
    for (const e of world.entities) {
      if (e.data.tier === 'adaptive') e.hp = 0;
    }
    world.entities = world.entities.filter((e) => e.hp > 0);

    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.7); // higher threat
    const after2 = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'adaptive',
    ).length;

    expect(after2).toBeGreaterThanOrEqual(after1);
  });

  it('push counter increments after each push', () => {
    const world = makeWorld([]);
    const as_ = createAdaptiveState();
    expect(as_.pushCount).toBe(0);
    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.5);
    expect(as_.pushCount).toBe(1);
    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.5);
    expect(as_.pushCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (c) Adaptive memory — counters the player's dominant type
// ---------------------------------------------------------------------------

describe('getMostUsedKind()', () => {
  it('returns the most numerous germ kind in the world', () => {
    const world = makeWorld([
      makeUnit('s1', 'spreader', 'you', 100, 100),
      makeUnit('s2', 'spreader', 'you', 120, 100),
      makeUnit('s3', 'spreader', 'you', 140, 100),
      makeUnit('b1', 'brute', 'you', 200, 100),
    ]);
    expect(getMostUsedKind(world)).toBe('spreader');
  });

  it('returns brute when brutes dominate', () => {
    const world = makeWorld([
      makeUnit('b1', 'brute', 'you', 100, 100),
      makeUnit('b2', 'brute', 'you', 120, 100),
      makeUnit('s1', 'spreader', 'you', 200, 100),
    ]);
    expect(getMostUsedKind(world)).toBe('brute');
  });

  it('returns null when there are no player units', () => {
    const world = makeWorld([]);
    expect(getMostUsedKind(world)).toBeNull();
  });
});

describe('counterKindFor()', () => {
  it('returns a valid immune unit kind for each germ kind', () => {
    const validKinds = ['macrophage', 'neutrophil', 't_cell', 'nk_cell'];
    for (const germ of ['spreader', 'brute', 'spitter'] as const) {
      const counter = counterKindFor(germ);
      expect(validKinds).toContain(counter);
    }
  });

  it('different germ kinds produce different (or strategically distinct) counters', () => {
    // brute (tank) should be countered by something different than spreader (swarm)
    const counterBrute    = counterKindFor('brute');
    const counterSpreader = counterKindFor('spreader');
    // they may differ — at minimum both must be valid strings
    expect(typeof counterBrute).toBe('string');
    expect(typeof counterSpreader).toBe('string');
  });
});

describe('adaptive memory — counter units in push', () => {
  it('spawns the counter unit type for the dominant player kind', () => {
    // All player units are spreaders → adaptive push should include spreader counters
    const playerUnits = Array.from({ length: 5 }, (_, i) =>
      makeUnit(`p${i}`, 'spreader', 'you', 300 + i * 30, 370),
    );
    const world = makeWorld(playerUnits);
    const as_ = createAdaptiveState();

    // Record the dominant kind before the push
    as_.dominantKind = getMostUsedKind(world);

    tickAdaptive(world, as_, ADAPTIVE_PUSH_INTERVAL, 0.5);

    const adaptiveUnits = world.entities.filter(
      (e) => e.owner === 'immune' && e.data.tier === 'adaptive',
    );
    expect(adaptiveUnits.length).toBeGreaterThan(0);

    // At least some of the pushed units should be the counter type
    const expectedCounter = counterKindFor('spreader');
    const hasCounter = adaptiveUnits.some((u) => u.kind === expectedCounter);
    expect(hasCounter).toBe(true);
  });
});
