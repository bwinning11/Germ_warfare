// ---------------------------------------------------------------------------
// Canvas renderer — knows about the DOM, knows nothing about game logic.
// ---------------------------------------------------------------------------

import { World, Entity } from '../world/types';
import { InputState, MoveMarker } from '../input/input';
import { normaliseRect } from '../world/selection';

const ENTITY_COLORS: Record<string, string> = {
  placeholder: '#44ff88',
  spreader:    '#33ccff',
  brute:       '#ff6644',
  spitter:     '#ffcc22',
  base:        '#8866ff',
  macrophage:  '#ff4455',
  antibody:    '#ffaacc',
  organ:       '#ffaa00',
};

function entityColor(entity: Entity): string {
  return ENTITY_COLORS[entity.kind] ?? '#ffffff';
}

/** Draw the background — a dark organic-looking arena. */
function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#0a1a0f';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid to give spatial reference
  ctx.strokeStyle = '#0f2a18';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Arena border
  ctx.strokeStyle = '#1a4428';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
}

/** Draw a single entity as a circle with a direction indicator. */
function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 12;
  const color = entityColor(entity);

  // Selection ring (drawn below glow so it's visible)
  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#88eeff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Glow effect
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
  grd.addColorStop(0, color + '55');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();

  // Main circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Direction dot (shows velocity direction)
  const speed = Math.hypot(entity.vel.x, entity.vel.y);
  if (speed > 0.5) {
    const nx = entity.vel.x / speed;
    const ny = entity.vel.y / speed;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + nx * (radius * 0.55), y + ny * (radius * 0.55), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // HP bar (only if damaged)
  if (entity.hp < entity.maxHp) {
    const barW = radius * 2;
    const barH = 3;
    const bx = x - radius;
    const by = y - radius - 6;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#44ff44';
    ctx.fillRect(bx, by, barW * (entity.hp / entity.maxHp), barH);
  }
}

/** Draw the drag-selection box. */
function drawDragBox(ctx: CanvasRenderingContext2D, input: InputState): void {
  if (!input.isDragging || !input.dragBox) return;

  const { x, y, w, h } = normaliseRect(input.dragBox);

  ctx.save();
  ctx.strokeStyle = '#44ccff';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = 'rgba(68, 204, 255, 0.06)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** Draw brief move-order markers at right-click targets. */
function drawMoveMarkers(ctx: CanvasRenderingContext2D, markers: MoveMarker[]): void {
  for (const m of markers) {
    const alpha = Math.max(0, m.ttl / 0.5); // fade out over marker lifetime
    const r = 8 * (1 - alpha * 0.5);        // slightly shrinks as it fades

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.pos.x, m.pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Cross-hair lines
    ctx.beginPath();
    ctx.moveTo(m.pos.x - r, m.pos.y);
    ctx.lineTo(m.pos.x + r, m.pos.y);
    ctx.moveTo(m.pos.x, m.pos.y - r);
    ctx.lineTo(m.pos.x, m.pos.y + r);
    ctx.stroke();
    ctx.restore();
  }
}

/** Overlay shown when paused. */
function drawPauseOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', width / 2, height / 2);
}

/** HUD — elapsed time + entity count + selection count. */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  ctx.fillStyle = '#aaffaa';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`t = ${world.elapsed.toFixed(2)}s`, 10, 10);
  ctx.fillText(`entities: ${world.entities.length}`, 10, 26);
  ctx.fillText(`selected: ${input.selected.size}`, 10, 42);
}

// ---------------------------------------------------------------------------
// Main render entry point — call once per animation frame.
// ---------------------------------------------------------------------------

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  const { width, height } = world;

  drawBackground(ctx, width, height);

  for (const entity of world.entities) {
    drawEntity(ctx, entity, input.selected.has(entity.id));
  }

  drawDragBox(ctx, input);
  drawMoveMarkers(ctx, input.moveMarkers);
  drawHUD(ctx, world, input);

  if (world.paused) {
    drawPauseOverlay(ctx, width, height);
  }
}
