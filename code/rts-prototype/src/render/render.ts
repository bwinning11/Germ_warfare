// ---------------------------------------------------------------------------
// Canvas renderer — knows about the DOM, knows nothing about game logic.
// ---------------------------------------------------------------------------

import { World, Entity } from '../world/types';
import { InputState, MoveMarker } from '../input/input';
import { normaliseRect } from '../world/selection';
import { UNIT_DEFS } from '../world/economy';
import { attackEffects, AttackEffect } from '../world/combat';

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

/** Draw the base structure (larger hexagonal shape). */
function drawBase(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 28;
  const color = ENTITY_COLORS.base;

  // Selection ring
  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#aa88ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Outer glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
  grd.addColorStop(0, color + '44');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Hexagon body
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ccaaff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Inner nucleus dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();

  // HP bar (only if damaged)
  if (entity.hp < entity.maxHp) {
    const barW = radius * 2;
    const barH = 4;
    const bx = x - radius;
    const by = y - radius - 8;
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#aa66ff';
    ctx.fillRect(bx, by, barW * (entity.hp / entity.maxHp), barH);
  }

  // "BASE" label
  ctx.fillStyle = '#ddbbff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('BASE', x, y + radius + 4);
}

/** Draw a macrophage immune enemy. */
function drawMacrophage(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 14;
  const color = ENTITY_COLORS.macrophage;

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff4455';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Outer pulsing glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
  grd.addColorStop(0, color + '66');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Body: irregular pentagon-ish blob (rotate slightly for organic feel)
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ff8899';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const sides = 5;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (0.85 + 0.15 * Math.sin(i * 2.1));
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Inner nucleus
  ctx.fillStyle = '#ff0020';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  // HP bar — always shown for immune units so player can see health at a glance
  const barW = radius * 2.2;
  const barH = 3;
  const bx = x - radius * 1.1;
  const by = y - radius - 7;
  ctx.fillStyle = '#441111';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = '#ff4455';
  ctx.fillRect(bx, by, barW * Math.max(0, entity.hp / entity.maxHp), barH);
}

/** Draw attack effects (projectile lines and melee flashes). */
function drawAttackEffects(ctx: CanvasRenderingContext2D, effects: AttackEffect[]): void {
  for (const fx of effects) {
    const alpha = Math.max(0, fx.ttl / (fx.kind === 'projectile' ? 0.25 : 0.10));
    ctx.save();
    ctx.globalAlpha = alpha;

    if (fx.kind === 'projectile') {
      // Spitter beam: bright acid line
      ctx.strokeStyle = '#ccff00';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#aaff00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(fx.from.x, fx.from.y);
      ctx.lineTo(fx.to.x, fx.to.y);
      ctx.stroke();
      // Dot at impact point
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fx.to.x, fx.to.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Melee flash: white ring at target
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(fx.to.x, fx.to.y, 10 * (1 - alpha * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

/** Draw a single unit entity as a circle with a direction indicator. */
function drawUnit(
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

/** Draw a single entity, routing to the correct renderer by kind. */
function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  if (entity.kind === 'base') {
    drawBase(ctx, entity, selected);
  } else if (entity.kind === 'macrophage') {
    drawMacrophage(ctx, entity, selected);
  } else {
    drawUnit(ctx, entity, selected);
  }
}

/** Draw the rally point flag when the base is selected. */
function drawRallyPoint(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  if (!world.rallyPoint) return;
  // Only show rally when the base is selected
  const baseSelected = world.entities.some(
    (e) => e.kind === 'base' && input.selected.has(e.id),
  );
  if (!baseSelected) return;

  const { x, y } = world.rallyPoint;
  ctx.save();
  ctx.strokeStyle = '#8866ff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  // Flagpole
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 18);
  ctx.stroke();
  ctx.setLineDash([]);
  // Flag triangle
  ctx.fillStyle = '#8866ff';
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x + 10, y - 13);
  ctx.lineTo(x, y - 8);
  ctx.closePath();
  ctx.fill();
  // Circle at base of pole
  ctx.strokeStyle = '#8866ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Draw the production panel (bottom-left) when the base is selected. */
function drawProductionPanel(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  const baseSelected = world.entities.some(
    (e) => e.kind === 'base' && input.selected.has(e.id),
  );
  if (!baseSelected) return;

  const panelX = 10;
  const panelY = world.height - 110;
  const panelW = 310;
  const panelH = 96;

  // Panel background
  ctx.fillStyle = 'rgba(10, 8, 20, 0.82)';
  ctx.strokeStyle = '#8866ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ccaaff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PRODUCTION  (base selected)', panelX + 10, panelY + 8);

  const units: Array<{ key: string; label: string; kind: 'spreader' | 'brute' | 'spitter'; color: string }> = [
    { key: 'Q', label: 'Spreader', kind: 'spreader', color: ENTITY_COLORS.spreader },
    { key: 'W', label: 'Brute',    kind: 'brute',    color: ENTITY_COLORS.brute    },
    { key: 'E', label: 'Spitter',  kind: 'spitter',  color: ENTITY_COLORS.spitter  },
  ];

  units.forEach((u, i) => {
    const bx = panelX + 10 + i * 100;
    const by = panelY + 28;
    const bw = 90;
    const bh = 56;
    const def = UNIT_DEFS[u.kind];
    const canAfford = world.biomass >= def.cost;

    // Button background
    ctx.fillStyle = canAfford ? 'rgba(40,30,60,0.9)' : 'rgba(20,15,30,0.9)';
    ctx.strokeStyle = canAfford ? u.color : '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill();
    ctx.stroke();

    // Hotkey badge
    ctx.fillStyle = canAfford ? u.color : '#666';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`[${u.key}]`, bx + 6, by + 6);

    // Unit name
    ctx.fillStyle = canAfford ? '#ffffff' : '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(u.label, bx + 6, by + 24);

    // Stats line
    ctx.fillStyle = canAfford ? '#aaaaaa' : '#555';
    ctx.font = '9px monospace';
    ctx.fillText(`HP:${def.hp} SPD:${def.speed}`, bx + 6, by + 36);

    // Cost
    ctx.fillStyle = canAfford ? '#88ff88' : '#ff6666';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${def.cost} BIO`, bx + 6, by + 48);
  });
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
    const color = m.isAttack ? '#ff4444' : '#ffffff';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (m.isAttack) {
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 6;
    }
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

/** HUD — biomass, elapsed time, entity count, selection count. */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  // Biomass bar (top-right)
  const barX = world.width - 210;
  const barY = 8;
  const barW = 200;
  const barH = 20;
  const fillFrac = Math.min(world.biomass / 200, 1); // cap bar at 200 for visual

  ctx.fillStyle = 'rgba(10, 8, 20, 0.75)';
  ctx.strokeStyle = '#44aa44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#33bb33';
  ctx.beginPath();
  ctx.roundRect(barX + 1, barY + 1, (barW - 2) * fillFrac, barH - 2, 2);
  ctx.fill();

  ctx.fillStyle = '#aaffaa';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`BIOMASS  ${Math.floor(world.biomass)}`, barX + barW / 2, barY + barH / 2);

  // Left-side info
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

  // Draw rally point before units so units render on top
  drawRallyPoint(ctx, world, input);

  for (const entity of world.entities) {
    drawEntity(ctx, entity, input.selected.has(entity.id));
  }

  drawAttackEffects(ctx, attackEffects);
  drawDragBox(ctx, input);
  drawMoveMarkers(ctx, input.moveMarkers);
  drawHUD(ctx, world, input);
  drawProductionPanel(ctx, world, input);

  if (world.paused) {
    drawPauseOverlay(ctx, width, height);
  }
}
