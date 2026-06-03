// ---------------------------------------------------------------------------
// Pure selection-geometry functions — no DOM, fully unit-testable.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from './types';

/** Axis-aligned rect (can have negative w/h from a right-to-left drag). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalise a rect so x,y is always the top-left and w,h are positive. */
export function normaliseRect(r: Rect): Rect {
  return {
    x: r.w >= 0 ? r.x : r.x + r.w,
    y: r.h >= 0 ? r.y : r.y + r.h,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

/** Hit-radius used for point-picks (in pixels). */
export const HIT_RADIUS = 14;

/**
 * Return all player-owned ('you') entities whose centre lies inside `rect`.
 * Handles negative-dimension rects produced by right-to-left / bottom-to-top drags.
 */
export function unitsInRect(world: World, rect: Rect): Entity[] {
  const { x, y, w, h } = normaliseRect(rect);
  return world.entities.filter(
    (e) =>
      e.owner === 'you' &&
      e.pos.x >= x && e.pos.x <= x + w &&
      e.pos.y >= y && e.pos.y <= y + h,
  );
}

/**
 * Return the player-owned entity whose centre is within HIT_RADIUS of `point`.
 * When multiple units are close, returns the one nearest the point.
 * Returns null if none qualify.
 */
export function unitAtPoint(world: World, point: Vec2): Entity | null {
  let best: Entity | null = null;
  let bestDist = Infinity;

  for (const e of world.entities) {
    if (e.owner !== 'you') continue;
    const d = Math.hypot(e.pos.x - point.x, e.pos.y - point.y);
    if (d <= HIT_RADIUS && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }

  return best;
}
