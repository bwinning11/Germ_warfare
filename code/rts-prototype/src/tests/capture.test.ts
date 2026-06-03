// ---------------------------------------------------------------------------
// Tests for the ORGAN capture objective (win condition).
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Entity, World } from '../world/types';
import {
  makeOrgan,
  findOrgan,
  evaluateCapture,
  tickCapture,
  CAPTURE_TIME,
  CAPTURE_RADIUS,
} from '../world/capture';

function makeWorld(entities: Entity[]): World {
  return {
    entities,
    width: 1100,
    height: 740,
    elapsed: 0,
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
  owner: Entity['owner'],
  x: number,
  y: number,
): Entity {
  return {
    id,
    kind: owner === 'you' ? 'spreader' : 'macrophage',
    pos: { x, y },
    vel: { x: 0, y: 0 },
    hp: 50,
    maxHp: 50,
    owner,
    data: { moveTo: null, speed: 100, attackCooldownLeft: 0 },
  };
}

const ORGAN_POS = { x: 800, y: 370 };

describe('evaluateCapture()', () => {
  it('reports playerHolding when a player unit is within the capture radius', () => {
    const organ = makeOrgan(ORGAN_POS);
    const unit = makeUnit('p1', 'you', ORGAN_POS.x + CAPTURE_RADIUS - 5, ORGAN_POS.y);
    const status = evaluateCapture(makeWorld([organ, unit]));
    expect(status.playerHolding).toBe(true);
    expect(status.immuneContesting).toBe(false);
  });

  it('does not count a player unit outside the capture radius', () => {
    const organ = makeOrgan(ORGAN_POS);
    const unit = makeUnit('p1', 'you', ORGAN_POS.x + CAPTURE_RADIUS + 20, ORGAN_POS.y);
    const status = evaluateCapture(makeWorld([organ, unit]));
    expect(status.playerHolding).toBe(false);
  });

  it('reports immuneContesting when an immune unit is on the organ', () => {
    const organ = makeOrgan(ORGAN_POS);
    const you = makeUnit('p1', 'you', ORGAN_POS.x, ORGAN_POS.y);
    const imm = makeUnit('m1', 'immune', ORGAN_POS.x + 10, ORGAN_POS.y);
    const status = evaluateCapture(makeWorld([organ, you, imm]));
    expect(status.playerHolding).toBe(true);
    expect(status.immuneContesting).toBe(true);
  });
});

describe('tickCapture()', () => {
  it('accrues progress while holding uncontested', () => {
    const organ = makeOrgan(ORGAN_POS);
    const you = makeUnit('p1', 'you', ORGAN_POS.x, ORGAN_POS.y);
    const world = makeWorld([organ, you]);

    tickCapture(world, 1.0);
    expect(world.captureProgress).toBeCloseTo(1.0, 5);
    expect(world.organContested).toBe(false);
  });

  it('stalls (no progress) while contested', () => {
    const organ = makeOrgan(ORGAN_POS);
    const you = makeUnit('p1', 'you', ORGAN_POS.x, ORGAN_POS.y);
    const imm = makeUnit('m1', 'immune', ORGAN_POS.x + 5, ORGAN_POS.y);
    const world = makeWorld([organ, you, imm]);

    tickCapture(world, 1.0);
    expect(world.captureProgress).toBe(0);
    expect(world.organContested).toBe(true);
  });

  it('decays progress when not holding', () => {
    const organ = makeOrgan(ORGAN_POS);
    const world = makeWorld([organ]);
    world.captureProgress = 5;

    tickCapture(world, 1.0);
    expect(world.captureProgress).toBeLessThan(5);
  });

  it('sets gameState = "won" when progress reaches CAPTURE_TIME', () => {
    const organ = makeOrgan(ORGAN_POS);
    const you = makeUnit('p1', 'you', ORGAN_POS.x, ORGAN_POS.y);
    const world = makeWorld([organ, you]);

    tickCapture(world, CAPTURE_TIME);
    expect(world.captureProgress).toBe(CAPTURE_TIME);
    expect(world.gameState).toBe('won');
  });

  it('findOrgan returns the organ entity', () => {
    const organ = makeOrgan(ORGAN_POS);
    expect(findOrgan(makeWorld([organ]))?.id).toBe('organ');
    expect(findOrgan(makeWorld([]))).toBeNull();
  });
});
