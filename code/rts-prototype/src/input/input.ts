// ---------------------------------------------------------------------------
// Input handler — wires canvas mouse events to RTS selection + move commands.
// Owns mutable UI state (selection, drag box, move markers).
// Pure logic lives in world/selection.ts; this file is the glue.
// ---------------------------------------------------------------------------

import { World, Entity, Vec2 } from '../world/types';
import { unitAtPoint, unitsInRect, Rect } from '../world/selection';
import { produce } from '../world/economy';
import { resetWorld } from '../world/world';
import { overlayButtonRect } from '../render/render';

// ---------------------------------------------------------------------------
// State transitions shared by mouse + keyboard handlers.
// ---------------------------------------------------------------------------

/** Leave onboarding (or a pause) and start the live match. */
function beginMatch(world: World): void {
  if (world.gameState === 'onboarding') {
    world.gameState = 'playing';
    world.paused = false;
  }
}

/** Restart from a fresh world (used on R or the RESTART button). */
function restartMatch(world: World, state: InputState): void {
  resetWorld(world);
  state.selected.clear();
  state.dragBox = null;
  state.dragStart = null;
  state.isDragging = false;
  state.moveMarkers = [];
}

/** Is a point inside the centred overlay button for this world size? */
function hitOverlayButton(world: World, p: Vec2): boolean {
  const r = overlayButtonRect(world.width, world.height);
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

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
  /** True when this marker was spawned from an attack order (rendered red). */
  isAttack?: boolean;
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
  // --- Mouse down: overlay buttons first, else start potential drag/click ---
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pos = canvasPos(canvas, e);

    // Overlay buttons: BEGIN (onboarding) / RESTART (won|lost)
    if (world.gameState === 'onboarding') {
      if (hitOverlayButton(world, pos)) beginMatch(world);
      return; // no world interaction while the tutorial is up
    }
    if (world.gameState === 'won' || world.gameState === 'lost') {
      if (hitOverlayButton(world, pos)) restartMatch(world, state);
      return;
    }

    // Live play — begin a potential drag or click selection
    state.dragStart = pos;
    state.isDragging = false;
    state.dragBox = { x: pos.x, y: pos.y, w: 0, h: 0 };
  });

  // --- Mouse move: update drag box ---
  canvas.addEventListener('mousemove', (e) => {
    if (world.gameState !== 'playing') return;
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
    if (world.gameState !== 'playing') return;

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

  // --- Right-click: set rally (if base selected alone), attack-command (if clicking enemy), or move ---
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (world.gameState !== 'playing') return;
    if (state.selected.size === 0) return;

    const clickPos = canvasPos(canvas, e);

    // If the ONLY selected entity is the base, set the rally point
    const selectedEntities = world.entities.filter(
      (u) => state.selected.has(u.id) && u.owner === 'you',
    );
    const isBaseOnlySelection =
      selectedEntities.length === 1 && selectedEntities[0].kind === 'base';

    if (isBaseOnlySelection) {
      world.rallyPoint = { ...clickPos };
      state.moveMarkers.push({ pos: { ...clickPos }, ttl: MARKER_TTL });
      return;
    }

    // Check if the right-click landed on an enemy entity (hit radius 16)
    const clickedEnemy = world.entities.find(
      (en) => en.owner === 'immune' &&
               Math.hypot(en.pos.x - clickPos.x, en.pos.y - clickPos.y) <= 16,
    );

    // Exclude structures from receiving move/attack commands
    const selectedUnits: Entity[] = selectedEntities.filter(
      (u) => u.kind !== 'base',
    );
    if (selectedUnits.length === 0) return;

    if (clickedEnemy) {
      // Attack command — set attackTarget on all selected units, clear any moveTo
      for (const unit of selectedUnits) {
        unit.data.attackTarget = clickedEnemy.id;
        unit.data.moveTo = null; // combat tick will set pursuit moveTo
      }
      // Red-tinted marker for attack order
      state.moveMarkers.push({ pos: { ...clickPos }, ttl: MARKER_TTL, isAttack: true });
    } else {
      // Move command — clear any lingering attack target so units focus on the destination
      for (const unit of selectedUnits) {
        unit.data.attackTarget = undefined;
      }
      // Assign formation targets
      const targets = formationTargets(clickPos, selectedUnits.length);
      for (let i = 0; i < selectedUnits.length; i++) {
        selectedUnits[i].data.moveTo = targets[i];
      }
      state.moveMarkers.push({ pos: { ...clickPos }, ttl: MARKER_TTL });
    }
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
    // R — restart from anywhere (most useful on the win/lose screens)
    if (e.code === 'KeyR') {
      e.preventDefault();
      restartMatch(world, state);
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (world.gameState === 'onboarding') {
        beginMatch(world);          // SPACE also starts the match from the tutorial
      } else if (world.gameState === 'playing') {
        world.paused = !world.paused; // toggle pause during live play
      }
      return;
    }

    // Everything below is live-play only
    if (world.gameState !== 'playing') return;

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
