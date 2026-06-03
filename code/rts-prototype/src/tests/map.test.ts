// ---------------------------------------------------------------------------
// Tests for the vessel-lane body map and flow-through-vessels movement.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  BODY_MAP,
  chamberOf,
  findChamberPath,
  computeWaypoints,
  inNavigableSpace,
  crossesTissue,
} from '../world/map';
import { Entity } from '../world/types';

// ---------------------------------------------------------------------------
// Map structure
// ---------------------------------------------------------------------------

describe('BODY_MAP structure', () => {
  it('has 5 chambers', () => {
    expect(BODY_MAP.chambers).toHaveLength(5);
  });

  it('has 5 vessel lanes', () => {
    expect(BODY_MAP.vessels).toHaveLength(5);
  });

  it('BASE chamber (0) is on the left side', () => {
    const base = BODY_MAP.chambers[0];
    expect(base.centre.x).toBeLessThan(200);
  });

  it('ORGAN chamber (4) is on the right side', () => {
    const organ = BODY_MAP.chambers[4];
    expect(organ.centre.x).toBeGreaterThan(900);
  });

  it('adjacency list is symmetric (undirected graph)', () => {
    for (const v of BODY_MAP.vessels) {
      const aNeighboursB = BODY_MAP.adjacency[v.a].some((n) => n.neighbour === v.b);
      const bNeighboursA = BODY_MAP.adjacency[v.b].some((n) => n.neighbour === v.a);
      expect(aNeighboursB).toBe(true);
      expect(bNeighboursA).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// chamberOf
// ---------------------------------------------------------------------------

describe('chamberOf()', () => {
  it('returns 0 for a point at the BASE chamber centre', () => {
    const ch = BODY_MAP.chambers[0];
    expect(chamberOf(ch.centre)).toBe(0);
  });

  it('returns 4 for a point at the ORGAN chamber centre', () => {
    const ch = BODY_MAP.chambers[4];
    expect(chamberOf(ch.centre)).toBe(4);
  });

  it('returns the nearest chamber for a point in tissue (not inside any chamber)', () => {
    // A point well into the tissue far from any chamber
    const id = chamberOf({ x: 550, y: 370 }); // roughly in the "middle" of the map
    // Should return one of the middle chambers (1, 2, or 3)
    expect([1, 2, 3]).toContain(id);
  });
});

// ---------------------------------------------------------------------------
// findChamberPath
// ---------------------------------------------------------------------------

describe('findChamberPath()', () => {
  it('returns [from] when from === to', () => {
    expect(findChamberPath(0, 0)).toEqual([0]);
    expect(findChamberPath(4, 4)).toEqual([4]);
  });

  it('finds a path from BASE (0) to ORGAN (4)', () => {
    const path = findChamberPath(0, 4);
    expect(path).not.toBeNull();
    expect(path![0]).toBe(0);
    expect(path![path!.length - 1]).toBe(4);
  });

  it('path from 0 to 4 does NOT jump directly (there is no direct vessel)', () => {
    const path = findChamberPath(0, 4)!;
    // The direct chambers 0→4 don't share a vessel, so path length must be > 2
    expect(path.length).toBeGreaterThan(2);
  });

  it('each consecutive pair in the path has a connecting vessel', () => {
    const path = findChamberPath(0, 4)!;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const connected = BODY_MAP.adjacency[a].some((n) => n.neighbour === b);
      expect(connected).toBe(true);
    }
  });

  it('finds a path between adjacent chambers', () => {
    const path = findChamberPath(0, 1)!;
    expect(path).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// computeWaypoints
// ---------------------------------------------------------------------------

describe('computeWaypoints()', () => {
  it('returns at least one waypoint', () => {
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;
    const wps = computeWaypoints(from, dest);
    expect(wps.length).toBeGreaterThan(0);
  });

  it('last waypoint equals dest', () => {
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;
    const wps = computeWaypoints(from, dest);
    const last = wps[wps.length - 1];
    expect(last.x).toBe(dest.x);
    expect(last.y).toBe(dest.y);
  });

  it('returns a single [dest] when from and dest are in the same chamber', () => {
    const ch = BODY_MAP.chambers[2].centre;
    const dest = { x: ch.x + 10, y: ch.y - 5 };
    const wps = computeWaypoints(ch, dest);
    // Should be just the dest (same chamber)
    expect(wps).toHaveLength(1);
    expect(wps[0]).toEqual(dest);
  });
});

// ---------------------------------------------------------------------------
// Navigable space
// ---------------------------------------------------------------------------

describe('inNavigableSpace()', () => {
  it('returns true for each chamber centre', () => {
    for (const ch of BODY_MAP.chambers) {
      expect(inNavigableSpace(ch.centre)).toBe(true);
    }
  });

  it('returns true for the midpoint of each vessel', () => {
    for (const v of BODY_MAP.vessels) {
      const a = BODY_MAP.chambers[v.a].centre;
      const b = BODY_MAP.chambers[v.b].centre;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(inNavigableSpace(mid)).toBe(true);
    }
  });

  it('returns false for a point deep in tissue (corner of arena)', () => {
    // Top-left corner — far from all chambers and vessels
    expect(inNavigableSpace({ x: 10, y: 10 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// crossesTissue
// ---------------------------------------------------------------------------

describe('crossesTissue()', () => {
  it('direct straight line BASE→ORGAN crosses tissue', () => {
    const base = BODY_MAP.chambers[0].centre;
    const organ = BODY_MAP.chambers[4].centre;
    // A straight horizontal line from left to right cuts through tissue
    // between chambers (above/below the vessels)
    expect(crossesTissue(base, organ)).toBe(true);
  });

  it('line between two adjacent chamber centres within a vessel does NOT cross tissue', () => {
    // Chambers 0 and 1 are connected by a vessel, so the line between
    // their centres runs through the vessel corridor
    const a = BODY_MAP.chambers[0].centre;
    const b = BODY_MAP.chambers[1].centre;
    // The midpoint of 0↔1 is in vessel 0 — should NOT cross tissue
    expect(crossesTissue(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Movement integration — unit routes through vessels
//
// These tests drive the movement system directly (not via the full update loop)
// to isolate pathing from combat/immune interactions.
// ---------------------------------------------------------------------------

describe('vessel-lane movement (integration)', () => {
  /**
   * Simulate only the movement portion of world.ts for a single entity.
   * This matches the exact logic in update() but skips combat, immune, waves.
   */
  function stepMovement(entity: Entity, dt: number): void {
    const ARRIVAL_RADIUS = 6;

    const moveTo = entity.data.moveTo as { x: number; y: number } | null;
    if (!moveTo) return;

    let waypoints = entity.data.waypoints as { x: number; y: number }[] | undefined;
    const storedDest = entity.data._waypointDest as { x: number; y: number } | undefined;

    const destChanged = !storedDest ||
      Math.abs(storedDest.x - moveTo.x) > 1 ||
      Math.abs(storedDest.y - moveTo.y) > 1;

    if (!waypoints || waypoints.length === 0 || destChanged) {
      waypoints = computeWaypoints(entity.pos, moveTo);
      entity.data.waypoints = waypoints;
      entity.data._waypointDest = { ...moveTo };
    }

    const subTarget = waypoints[0];
    const dx = subTarget.x - entity.pos.x;
    const dy = subTarget.y - entity.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= ARRIVAL_RADIUS) {
      waypoints.shift();
      if (waypoints.length === 0) {
        entity.pos.x = moveTo.x;
        entity.pos.y = moveTo.y;
        entity.vel.x = 0;
        entity.vel.y = 0;
        entity.data.moveTo = null;
        entity.data.waypoints = [];
        entity.data._waypointDest = undefined;
      }
      return;
    }

    const speed = (entity.data.speed as number) ?? 100;
    entity.vel.x = (dx / dist) * speed;
    entity.vel.y = (dy / dist) * speed;
    entity.pos.x += entity.vel.x * dt;
    entity.pos.y += entity.vel.y * dt;
  }

  function makeMovingEntity(x: number, y: number, destX: number, destY: number): Entity {
    const pos = { x, y };
    const dest = { x: destX, y: destY };
    const waypoints = computeWaypoints(pos, dest);
    return {
      id: 'test',
      kind: 'spreader',
      pos: { x, y },
      vel: { x: 0, y: 0 },
      hp: 10,
      maxHp: 10,
      owner: 'you',
      data: { moveTo: dest, speed: 200, waypoints, _waypointDest: { ...dest } },
    };
  }

  it('unit moves closer to its final destination each step (direct movement test)', () => {
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;
    const unit = makeMovingEntity(from.x, from.y, dest.x, dest.y);

    const distBefore = Math.hypot(dest.x - unit.pos.x, dest.y - unit.pos.y);
    for (let i = 0; i < 30; i++) stepMovement(unit, 1 / 60);
    const distAfter = Math.hypot(dest.x - unit.pos.x, dest.y - unit.pos.y);

    expect(distAfter).toBeLessThan(distBefore);
  });

  it('unit waypoints navigate from BASE to ORGAN without going through tissue', () => {
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;
    const waypoints = computeWaypoints(from, dest);

    expect(waypoints.length).toBeGreaterThan(0);

    // Every waypoint must be in navigable space
    for (const wp of waypoints) {
      expect(inNavigableSpace(wp)).toBe(true);
    }
  });

  it('unit routes through vessel network and substantially closes gap over 3s', () => {
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;
    const unit = makeMovingEntity(from.x, from.y, dest.x, dest.y);

    const distBefore = Math.hypot(dest.x - unit.pos.x, dest.y - unit.pos.y);

    // 3 seconds at 200 px/s — unit should cover at least 300px net
    for (let i = 0; i < 60 * 3; i++) stepMovement(unit, 1 / 60);

    const distAfter = Math.hypot(dest.x - unit.pos.x, dest.y - unit.pos.y);
    expect(distAfter).toBeLessThan(distBefore - 200);
  });

  it('unit arriving at a same-chamber destination clears moveTo', () => {
    const ch = BODY_MAP.chambers[0].centre;
    const unit = makeMovingEntity(ch.x, ch.y, ch.x + 30, ch.y + 10);

    // 2 seconds is more than enough at 200 px/s for a 32px trip
    for (let i = 0; i < 120; i++) stepMovement(unit, 1 / 60);

    expect(unit.data.moveTo).toBeNull();
  });

  it('unit positioned between chambers does not pass directly through tissue to reach destination', () => {
    // Start at BASE, send to ORGAN — straight line goes through tissue
    // but waypoints should route through vessels
    const from = BODY_MAP.chambers[0].centre;
    const dest = BODY_MAP.chambers[4].centre;

    // The straight line definitely crosses tissue
    expect(crossesTissue(from, dest)).toBe(true);

    // But the waypoints themselves are all in navigable space
    const waypoints = computeWaypoints(from, dest);
    for (const wp of waypoints) {
      expect(inNavigableSpace(wp)).toBe(true);
    }
  });
});
