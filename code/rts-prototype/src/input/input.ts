// ---------------------------------------------------------------------------
// Input handler — wires canvas mouse events to RTS selection + move commands.
// Owns mutable UI state (selection, drag box, move markers).
// Pure logic lives in world/selection.ts; this file is the glue.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from '../world/types';
import { unitAtPoint, unitsInRect, Rect } from '../world/selection';
import { produce } from '../world/economy';

// ---------------------------------------------------------------------------
// Formation spread: when right-clicking with N units selected, spread their
// targets so they don't all pile onto the same pixel.
// ---------------------------------------------------------------------------

/** Radius of the formation spread circle. */
const FORMATION_SPREAD = 28; // px between targets

/** Compute N formation positions centred on `target`. */
function formationTargets(target: Vec2, count: number): Vec2[] {
  if (count === 1) return [{ ...target }];

  const positions: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    // Pack tightly for small groups, scale for larger ones
    const r = FORMATION_SPREAD * Math.max(1, Math.ceil(count / 6));
    positions.push({
      x: target.x + Math.cos(angle) * r,
      y: target.y + Math.sin(angle) * r,
    });
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Move-marker flash (visual feedback for right-click)
// ---------------------------------------------------------------------------

export interface MoveMarker {
  pos: Vec2;
  /** Remaining lifetime in seconds. */
  ttl: number;
}

// ---------------------------------------------------------------------------
// Input state
// ---------------------------------------------------------------------------

/** Mutable input/UI state — kept outside World to avoid coupling. */
export interface InputState {
  /** Currently selected player units. */
  selected: Set<string>;

  /** Active drag-box, or null when not dragging. */
  dragBox: Rect | null;

  /** Drag start position in canvas coords. */
  dragStart: Vec2 | null;

  /** Whether a drag (vs a click) has been committed. */
  isDragging: boolean;

  /** Brief move-markers shown after a right-click. */
  moveMarkers: MoveMarker[];
}

export function createInputState(): InputState {
  return {
    selected: new Set(),
    dragBox: null,
    dragStart: null,
    isDragging: false,
    moveMarkers: [],
  };
}

// Drag threshold — must move this many pixels before a drag is registered
const DRAG_THRESHOLD = 5;
// Move-marker display duration
const MARKER_TTL = 0.5;

// ---------------------------------------------------------------------------
// Canvas-coordinate helpers
// ---------------------------------------------------------------------------

function canvasPos(canvas: HTMLCanvasElement, e: MouseEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------

export function attachInput(
  canvas: HTMLCanvasElement,
  world: World,
  state: InputState,
): void {
  // --- Mouse down: start potential drag or click ---
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      // Left button
      const pos = canvasPos(canvas, e);
      state.dragStart = pos;
      state.isDragging = false;
      state.dragBox = { x: pos.x, y: pos.y, w: 0, h: 0 };
    }
  });

  // --- Mouse move: update drag box ---
  canvas.addEventListener('mousemove', (e) => {
    if (state.dragStart === null) return;
    const pos = canvasPos(canvas, e);
    const dx = pos.x - state.dragStart.x;
    const dy = pos.y - state.dragStart.y;

    if (!state.isDragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      state.isDragging = true;
    }

    if (state.isDragging) {
      state.dragBox = {
        x: state.dragStart.x,
        y: state.dragStart.y,
        w: dx,
        h: dy,
      };
    }
  });

  // --- Mouse up: finalise click or drag selection ---
  canvas.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;

    const pos = canvasPos(canvas, e);

    if (state.isDragging && state.dragBox) {
      // Drag-box selection — replace current selection (includes base)
      const hits = unitsInRect(world, state.dragBox);
      state.selected = new Set(hits.map((u) => u.id));
    } else {
      // Click — try hit-test on units first, then base
      const hit = unitAtPoint(world, pos);
      if (hit) {
        state.selected = new Set([hit.id]);
      } else {
        // Check if we clicked the base (larger hit radius)
        const base = world.entities.find(
          (e) => e.kind === 'base' && e.owner === 'you' &&
                 Math.hypot(e.pos.x - pos.x, e.pos.y - pos.y) <= 32,
        );
        if (base) {
          state.selected = new Set([base.id]);
        } else {
          state.selected.clear();
        }
      }
    }

    // Reset drag state
    state.dragStart = null;
    state.isDragging = false;
    state.dragBox = null;
  });

  // --- Right-click: set rally (if base selected alone) or issue move command ---
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.selected.size === 0) return;

    const target = canvasPos(canvas, e);

    // If the ONLY selected entity is the base, set the rally point
    const selectedEntities = world.entities.filter(
      (u) => state.selected.has(u.id) && u.owner === 'you',
    );
    const isBaseOnlySelection =
      selectedEntities.length === 1 && selectedEntities[0].kind === 'base';

    if (isBaseOnlySelection) {
      world.rallyPoint = { ...target };
      state.moveMarkers.push({ pos: { ...target }, ttl: MARKER_TTL });
      return;
    }

    // Otherwise move selected units (exclude structures from movement)
    const selectedUnits: Entity[] = selectedEntities.filter(
      (u) => u.kind !== 'base',
    );
    if (selectedUnits.length === 0) return;

    // Assign formation targets
    const targets = formationTargets(target, selectedUnits.length);
    for (let i = 0; i < selectedUnits.length; i++) {
      selectedUnits[i].data.moveTo = targets[i];
    }

    // Brief visual marker
    state.moveMarkers.push({ pos: { ...target }, ttl: MARKER_TTL });
  });
}

// ---------------------------------------------------------------------------
// Keyboard handler: Space (pause), Q/W/E (production hotkeys)
// ---------------------------------------------------------------------------

/**
 * Wire up keyboard shortcuts.
 * - Space: toggle pause
 * - Q / W / E: produce Spreader / Brute / Spitter (only when base is selected)
 *
 * Call once after createInputState() and createWorld().
 */
export function attachKeyboard(world: World, state: InputState): void {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      world.paused = !world.paused;
      return;
    }

    // Production hotkeys only fire when the base is selected
    const baseSelected = world.entities.some(
      (en) => en.kind === 'base' && state.selected.has(en.id),
    );
    if (!baseSelected) return;

    const keyMap: Record<string, 'spreader' | 'brute' | 'spitter'> = {
      KeyQ: 'spreader',
      KeyW: 'brute',
      KeyE: 'spitter',
    };
    const kind = keyMap[e.code];
    if (kind) {
      e.preventDefault();
      produce(world, kind);
    }
  });
}

// ---------------------------------------------------------------------------
// Update move markers (called each sim step)
// ---------------------------------------------------------------------------

export function updateMarkers(state: InputState, dt: number): void {
  for (const m of state.moveMarkers) {
    m.ttl -= dt;
  }
  state.moveMarkers = state.moveMarkers.filter((m) => m.ttl > 0);
}
