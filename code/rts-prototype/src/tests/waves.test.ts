// ---------------------------------------------------------------------------
// Tests for immune wave spawning + enemy AI targeting.
// Written BEFORE implementation (fail → pass).
//
// Covered:
//   (a) A wave spawns at the configured interval
//   (b) Wave size escalates over successive waves
//   (c) An immune unit targets/paths to the nearest player entity (or base)
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  createWaveState,
  tickWaves,
  immuneTargetFor,
  WAVE_INTERVAL,
  WAVE_BASE_SIZE,
  WAVE_SIZE_INCREMENT,
  WaveState,
} from '../world/waves';
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
// (a) A wave spawns at the configured interval
// ---------------------------------------------------------------------------
describe('tickWaves() — wave spawning interval', () => {
  it('does NOT spawn immune units before the first wave interval elapses', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    // Step to just before the interval
    tickWaves(world, ws, WAVE_INTERVAL - 0.1);

    const immuneCount = world.entities.filter((e) => e.owner === 'immune').length;
    expect(immuneCount).toBe(0);
  });

  it('spawns immune units once the first wave interval elapses', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    tickWaves(world, ws, WAVE_INTERVAL);

    const immuneCount = world.entities.filter((e) => e.owner === 'immune').length;
    expect(immuneCount).toBeGreaterThan(0);
  });

  it('does NOT spawn a second wave before the second interval has elapsed', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    // First wave
    tickWaves(world, ws, WAVE_INTERVAL);
    const afterFirst = world.entities.filter((e) => e.owner === 'immune').length;

    // Advance almost-but-not-quite a second interval
    tickWaves(world, ws, WAVE_INTERVAL - 0.1);
    const afterAlmost = world.entities.filter((e) => e.owner === 'immune').length;

    expect(afterAlmost).toBe(afterFirst); // no new units
  });

  it('spawns a second wave after two intervals', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    tickWaves(world, ws, WAVE_INTERVAL);   // wave 1
    const afterFirst = world.entities.filter((e) => e.owner === 'immune').length;

    tickWaves(world, ws, WAVE_INTERVAL);   // wave 2
    const afterSecond = world.entities.filter((e) => e.owner === 'immune').length;

    expect(afterSecond).toBeGreaterThan(afterFirst);
  });
});

// ---------------------------------------------------------------------------
// (b) Wave size escalates over successive waves
// ---------------------------------------------------------------------------
describe('tickWaves() — wave size escalation', () => {
  it('wave 1 spawns WAVE_BASE_SIZE immune units', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    tickWaves(world, ws, WAVE_INTERVAL);

    const immuneCount = world.entities.filter((e) => e.owner === 'immune').length;
    expect(immuneCount).toBe(WAVE_BASE_SIZE);
  });

  it('wave 2 is larger than wave 1', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    tickWaves(world, ws, WAVE_INTERVAL);  // wave 1
    const wave1Count = world.entities.filter((e) => e.owner === 'immune').length;

    tickWaves(world, ws, WAVE_INTERVAL);  // wave 2
    const wave2Count = world.entities.filter((e) => e.owner === 'immune').length;
    const wave2Spawned = wave2Count - wave1Count;

    expect(wave2Spawned).toBeGreaterThan(wave1Count);
  });

  it('wave 2 spawns WAVE_BASE_SIZE + WAVE_SIZE_INCREMENT units', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    tickWaves(world, ws, WAVE_INTERVAL);  // wave 1
    const after1 = world.entities.filter((e) => e.owner === 'immune').length;

    tickWaves(world, ws, WAVE_INTERVAL);  // wave 2
    const after2 = world.entities.filter((e) => e.owner === 'immune').length;
    const spawned2 = after2 - after1;

    expect(spawned2).toBe(WAVE_BASE_SIZE + WAVE_SIZE_INCREMENT);
  });

  it('wave counter increments after each wave', () => {
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    expect(ws.waveNumber).toBe(0);
    tickWaves(world, ws, WAVE_INTERVAL);
    expect(ws.waveNumber).toBe(1);
    tickWaves(world, ws, WAVE_INTERVAL);
    expect(ws.waveNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// (c) Immune unit targets/paths to the nearest player entity (or base)
// ---------------------------------------------------------------------------
describe('immuneTargetFor() — targeting', () => {
  it('returns null when there are no player entities', () => {
    const immune = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    const world = makeWorld([immune]);

    const target = immuneTargetFor(immune, world);
    expect(target).toBeNull();
  });

  it('returns the nearest player unit', () => {
    const immune = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    const near   = makeUnit('p1', 'spreader', 'you', 520, 370); // 20 px away
    const far    = makeUnit('p2', 'spreader', 'you', 900, 370); // 400 px away

    const world = makeWorld([immune, near, far]);
    const target = immuneTargetFor(immune, world);

    expect(target?.id).toBe('p1');
  });

  it('falls back to the base when there are no other player units', () => {
    const immune = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    const base   = makeUnit('b1', 'base', 'you', 110, 370);

    const world = makeWorld([immune, base]);
    const target = immuneTargetFor(immune, world);

    expect(target?.id).toBe('b1');
  });

  it('prefers a non-base unit over the base even when the base is closer', () => {
    // base is closer but a unit also exists — unit should be preferred
    const immune = makeUnit('m1', 'macrophage', 'immune', 500, 370);
    const base   = makeUnit('b1', 'base', 'you', 510, 370);  // 10 px — very close
    const unit   = makeUnit('p1', 'spreader', 'you', 600, 370); // 100 px

    const world = makeWorld([immune, base, unit]);
    const target = immuneTargetFor(immune, world);

    // Any non-base unit should be preferred; if implementation prefers nearest of all
    // player entities (including base), the base would win by distance — so we accept
    // either the nearest overall OR the nearest non-base. The spec says "nearest your-
    // entity, fall back to the base" — so the implementation must choose `unit` here.
    // This test intentionally fails if the base is naively returned as "nearest".
    expect(target?.id).toBe('p1');
  });

  it('immune unit sets moveTo toward its target after tickWaves AI step', () => {
    // After a wave tick, the immune unit should have a moveTo pointing toward the nearest player entity
    const world = makeWorld([]);
    const ws: WaveState = createWaveState();

    // Add a player unit so the immune has something to chase
    const playerUnit = makeUnit('p1', 'spreader', 'you', 110, 370);
    world.entities.push(playerUnit);

    // Trigger wave 1
    tickWaves(world, ws, WAVE_INTERVAL);

    const immuneUnits = world.entities.filter((e) => e.owner === 'immune');
    expect(immuneUnits.length).toBeGreaterThan(0);

    // Each immune unit should have a moveTo set toward the player unit
    for (const u of immuneUnits) {
      const moveTo = u.data.moveTo as { x: number; y: number } | null;
      expect(moveTo).not.toBeNull();
    }
  });
});
