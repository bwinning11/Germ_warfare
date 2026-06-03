// ---------------------------------------------------------------------------
// Tests for multiple capturable control points and their benefits.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { Entity, World } from '../world/types';
import {
  makeCapturePoints,
  evaluateCapturePoint,
  tickCapturePoints,
  nutrientNodeBonus,
  forwardColonySpawnPos,
  forwardColonyRallyPoint,
  inFortressBuff,
  POINT_CAPTURE_TIME,
  POINT_CAPTURE_RADIUS,
  NUTRIENT_INCOME_BONUS,
  FORTRESS_BUFF_RADIUS,
  FORTRESS_DAMAGE_MULT,
  findCapturePoint,
} from '../world/capturePoints';
import { tickIncome, INCOME_RATE } from '../world/economy';
import { BODY_MAP } from '../world/map';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorld(extras: Partial<World> = {}): World {
  return {
    entities: [],
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
    capturePoints: makeCapturePoints(),
    ...extras,
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
    data: { moveTo: null, speed: 100 },
  };
}

// Convenient position for each point
const NUTRIENT_POS = BODY_MAP.chambers[1].centre; // Junction W
const COLONY_POS   = BODY_MAP.chambers[2].centre; // Junction N
const FORTRESS_POS = BODY_MAP.chambers[3].centre; // Junction S

// ---------------------------------------------------------------------------
// makeCapturePoints() — basic factory checks
// ---------------------------------------------------------------------------

describe('makeCapturePoints()', () => {
  it('returns three non-organ points', () => {
    const pts = makeCapturePoints();
    expect(pts).toHaveLength(3);
    expect(pts.map((p) => p.kind)).toContain('nutrient_node');
    expect(pts.map((p) => p.kind)).toContain('forward_colony');
    expect(pts.map((p) => p.kind)).toContain('choke_fortress');
  });

  it('all points start neutral with zero progress', () => {
    for (const pt of makeCapturePoints()) {
      expect(pt.owner).toBe('neutral');
      expect(pt.captureProgress).toBe(0);
      expect(pt.contested).toBe(false);
    }
  });

  it('nutrient node is at Junction W (chamber 1)', () => {
    const pts = makeCapturePoints();
    const node = pts.find((p) => p.kind === 'nutrient_node')!;
    expect(node.pos.x).toBe(NUTRIENT_POS.x);
    expect(node.pos.y).toBe(NUTRIENT_POS.y);
  });
});

// ---------------------------------------------------------------------------
// evaluateCapturePoint()
// ---------------------------------------------------------------------------

describe('evaluateCapturePoint()', () => {
  it('reports playerHolding when a player unit is within radius', () => {
    const world = makeWorld({
      entities: [makeUnit('p1', 'you', NUTRIENT_POS.x, NUTRIENT_POS.y)],
    });
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    const { playerHolding, immuneContesting } = evaluateCapturePoint(world, node);
    expect(playerHolding).toBe(true);
    expect(immuneContesting).toBe(false);
  });

  it('does not count units outside the capture radius', () => {
    const world = makeWorld({
      entities: [
        makeUnit('p1', 'you', NUTRIENT_POS.x + POINT_CAPTURE_RADIUS + 20, NUTRIENT_POS.y),
      ],
    });
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    const { playerHolding } = evaluateCapturePoint(world, node);
    expect(playerHolding).toBe(false);
  });

  it('reports both sides when contested', () => {
    const world = makeWorld({
      entities: [
        makeUnit('p1', 'you', NUTRIENT_POS.x, NUTRIENT_POS.y),
        makeUnit('m1', 'immune', NUTRIENT_POS.x + 5, NUTRIENT_POS.y),
      ],
    });
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    const { playerHolding, immuneContesting } = evaluateCapturePoint(world, node);
    expect(playerHolding).toBe(true);
    expect(immuneContesting).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tickCapturePoints() — capture state machine
// ---------------------------------------------------------------------------

describe('tickCapturePoints()', () => {
  it('accrues progress while player holds uncontested', () => {
    const world = makeWorld({
      entities: [makeUnit('p1', 'you', NUTRIENT_POS.x, NUTRIENT_POS.y)],
    });
    tickCapturePoints(world, 1.0);
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    expect(node.captureProgress).toBeCloseTo(1.0, 5);
    expect(node.contested).toBe(false);
  });

  it('stalls progress when contested', () => {
    const world = makeWorld({
      entities: [
        makeUnit('p1', 'you', COLONY_POS.x, COLONY_POS.y),
        makeUnit('m1', 'immune', COLONY_POS.x + 5, COLONY_POS.y),
      ],
    });
    tickCapturePoints(world, 1.0);
    const colony = world.capturePoints.find((p) => p.kind === 'forward_colony')!;
    expect(colony.captureProgress).toBe(0);
    expect(colony.contested).toBe(true);
  });

  it('decays progress when nobody holds the point', () => {
    const world = makeWorld();
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    node.captureProgress = 5;
    tickCapturePoints(world, 1.0);
    expect(node.captureProgress).toBeLessThan(5);
  });

  it('flips owner to "you" when progress reaches POINT_CAPTURE_TIME', () => {
    const world = makeWorld({
      entities: [makeUnit('p1', 'you', NUTRIENT_POS.x, NUTRIENT_POS.y)],
    });
    tickCapturePoints(world, POINT_CAPTURE_TIME);
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    expect(node.owner).toBe('you');
  });

  it('losing the point reverts owner to neutral', () => {
    const world = makeWorld();
    const fortress = world.capturePoints.find((p) => p.kind === 'choke_fortress')!;
    fortress.owner = 'you';
    fortress.captureProgress = 0; // progress already depleted

    // Immune unit holds uncontested for long enough
    world.entities.push(makeUnit('m1', 'immune', FORTRESS_POS.x, FORTRESS_POS.y));
    tickCapturePoints(world, 1.0);

    // Progress should be 0 and owner should revert
    expect(fortress.captureProgress).toBe(0);
    expect(fortress.owner).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// Benefit: Nutrient Node — income bonus
// ---------------------------------------------------------------------------

describe('nutrientNodeBonus()', () => {
  it('returns 0 when nutrient node is neutral', () => {
    const world = makeWorld();
    expect(nutrientNodeBonus(world)).toBe(0);
  });

  it('returns NUTRIENT_INCOME_BONUS when held by player', () => {
    const world = makeWorld();
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    node.owner = 'you';
    expect(nutrientNodeBonus(world)).toBe(NUTRIENT_INCOME_BONUS);
  });

  it('tickIncome gives more biomass when nutrient node is held', () => {
    const world = makeWorld();
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;
    node.owner = 'you';

    const worldWithout = makeWorld();
    const before = world.biomass;
    const beforeWithout = worldWithout.biomass;

    tickIncome(world, 1.0);
    tickIncome(worldWithout, 1.0);

    const gained = world.biomass - before;
    const gainedWithout = worldWithout.biomass - beforeWithout;

    expect(gained).toBeGreaterThan(gainedWithout);
    expect(gained).toBeCloseTo(INCOME_RATE + NUTRIENT_INCOME_BONUS, 5);
    expect(gainedWithout).toBeCloseTo(INCOME_RATE, 5);
  });

  it('losing the nutrient node removes the income bonus', () => {
    const world = makeWorld();
    const node = world.capturePoints.find((p) => p.kind === 'nutrient_node')!;

    node.owner = 'you';
    expect(nutrientNodeBonus(world)).toBe(NUTRIENT_INCOME_BONUS);

    node.owner = 'neutral';
    expect(nutrientNodeBonus(world)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Benefit: Forward Colony — spawn / rally
// ---------------------------------------------------------------------------

describe('forwardColonySpawnPos()', () => {
  const basePos = { x: 110, y: 370 };

  it('returns base pos when colony is neutral', () => {
    const world = makeWorld();
    const pos = forwardColonySpawnPos(world, basePos);
    // Should be near base pos (same coords, no colony scatter)
    expect(pos.x).toBe(basePos.x);
    expect(pos.y).toBe(basePos.y);
  });

  it('returns a position near the colony when colony is held', () => {
    const world = makeWorld();
    const colony = world.capturePoints.find((p) => p.kind === 'forward_colony')!;
    colony.owner = 'you';

    const pos = forwardColonySpawnPos(world, basePos);
    // Should be within the scatter radius of the colony centre
    const dist = Math.hypot(pos.x - COLONY_POS.x, pos.y - COLONY_POS.y);
    expect(dist).toBeLessThanOrEqual(30); // scatter ≤ 20px each axis → max ~28px diagonal
  });
});

describe('forwardColonyRallyPoint()', () => {
  it('returns world.rallyPoint when colony is neutral', () => {
    const rp = { x: 200, y: 300 };
    const world = makeWorld({ rallyPoint: rp });
    const result = forwardColonyRallyPoint(world);
    expect(result).toEqual(rp);
  });

  it('returns a forward rally point when colony is held', () => {
    const world = makeWorld({ rallyPoint: { x: 200, y: 300 } });
    const colony = world.capturePoints.find((p) => p.kind === 'forward_colony')!;
    colony.owner = 'you';

    const result = forwardColonyRallyPoint(world);
    // Should be to the right of the colony (toward the organ)
    expect(result).not.toBeNull();
    expect(result!.x).toBeGreaterThan(COLONY_POS.x);
  });
});

// ---------------------------------------------------------------------------
// Benefit: Choke Fortress — damage buff detection
// ---------------------------------------------------------------------------

describe('inFortressBuff()', () => {
  it('returns false when fortress is neutral', () => {
    const world = makeWorld();
    expect(inFortressBuff(world, FORTRESS_POS)).toBe(false);
  });

  it('returns true for a position inside the buff radius when held', () => {
    const world = makeWorld();
    const fortress = world.capturePoints.find((p) => p.kind === 'choke_fortress')!;
    fortress.owner = 'you';

    const insidePos = { x: FORTRESS_POS.x + 10, y: FORTRESS_POS.y };
    expect(inFortressBuff(world, insidePos)).toBe(true);
  });

  it('returns false for a position outside the buff radius even when held', () => {
    const world = makeWorld();
    const fortress = world.capturePoints.find((p) => p.kind === 'choke_fortress')!;
    fortress.owner = 'you';

    const outsidePos = { x: FORTRESS_POS.x + FORTRESS_BUFF_RADIUS + 50, y: FORTRESS_POS.y };
    expect(inFortressBuff(world, outsidePos)).toBe(false);
  });

  it('FORTRESS_DAMAGE_MULT is greater than 1', () => {
    expect(FORTRESS_DAMAGE_MULT).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// findCapturePoint() helper
// ---------------------------------------------------------------------------

describe('findCapturePoint()', () => {
  it('returns the correct point by kind', () => {
    const world = makeWorld();
    const node = findCapturePoint(world, 'nutrient_node');
    expect(node).toBeDefined();
    expect(node!.kind).toBe('nutrient_node');
  });

  it('returns undefined for organ kind (not in capturePoints array)', () => {
    const world = makeWorld();
    const organ = findCapturePoint(world, 'organ');
    expect(organ).toBeUndefined();
  });
});
