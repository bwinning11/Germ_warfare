// ---------------------------------------------------------------------------
// Canvas renderer — knows about the DOM, knows nothing about game logic.
// ---------------------------------------------------------------------------

import { World, Entity } from '../world/types';
import { InputState, MoveMarker } from '../input/input';
import { normaliseRect } from '../world/selection';
import { UNIT_DEFS } from '../world/economy';
import { attackEffects, AttackEffect } from '../world/combat';
import { WaveState, WAVE_INTERVAL } from '../world/waves';
import { waveState } from '../world/world';
import { CAPTURE_TIME, CAPTURE_RADIUS, findOrgan } from '../world/capture';

const ENTITY_COLORS: Record<string, string> = {
  placeholder: '#44ff88',
  spreader:    '#33ccff',
  brute:       '#ff6644',
  spitter:     '#ffcc22',
  base:        '#8866ff',
  macrophage:  '#ff4455',
  neutrophil:  '#ff8800',
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

/** Draw a neutrophil — fast immune harasser. */
function drawNeutrophil(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 9;
  const color = ENTITY_COLORS.neutrophil;

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Outer glow — orange
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
  grd.addColorStop(0, color + '55');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Body: diamond shape (4-pointed)
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffcc88';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius * 0.7, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // HP bar — always shown
  const barW = radius * 2;
  const barH = 3;
  const bx = x - radius;
  const by = y - radius - 6;
  ctx.fillStyle = '#442200';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = '#ff8800';
  ctx.fillRect(bx, by, barW * Math.max(0, entity.hp / entity.maxHp), barH);
}

/**
 * Draw the ORGAN capture objective.
 *
 * - A faint dashed ring shows the capture radius (where your units must stand).
 * - A bold arc around the organ fills clockwise as capture progresses.
 * - Color/labels make the state obvious: gold = idle, green = capturing,
 *   red pulse = contested by the immune system.
 */
function drawOrgan(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  world: World,
): void {
  const { x, y } = entity.pos;
  const radius = 26;
  const frac = Math.min(1, world.captureProgress / CAPTURE_TIME);
  const capturing = world.captureProgress > 0;
  const contested = world.organContested;

  // Capture-radius ring (where units must stand to hold it)
  ctx.save();
  ctx.strokeStyle = contested ? 'rgba(255,70,90,0.45)' : 'rgba(255,200,60,0.30)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(x, y, CAPTURE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Outer glow — pulses red when contested
  const t = world.elapsed;
  const pulse = contested ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
  const glowColor = contested ? '#ff3344' : '#ffaa00';
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
  grd.addColorStop(0, glowColor + (contested ? '88' : '55'));
  grd.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Organ body — a clustered "gland" of overlapping lobes
  ctx.save();
  ctx.fillStyle = '#ffaa00';
  ctx.strokeStyle = '#ffdd66';
  ctx.lineWidth = 2;
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const lx = x + Math.cos(a) * radius * 0.5;
    const ly = y + Math.sin(a) * radius * 0.5;
    ctx.beginPath();
    ctx.arc(lx, ly, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Capture progress arc (thick ring, fills clockwise from top)
  if (capturing) {
    ctx.save();
    ctx.strokeStyle = contested ? '#ff5566' : '#55ff66';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Label + percentage
  ctx.fillStyle = '#ffe08a';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('ORGAN (capture)', x, y + radius + 12);

  if (capturing) {
    const pct = Math.floor(frac * 100);
    ctx.fillStyle = contested ? '#ff8899' : '#aaffaa';
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      contested ? `CONTESTED ${pct}%` : `${pct}%`,
      x,
      y - radius - 12,
    );
  }
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
  if (entity.kind === 'organ') {
    return; // organ is drawn separately (needs world capture state)
  } else if (entity.kind === 'base') {
    drawBase(ctx, entity, selected);
  } else if (entity.kind === 'macrophage') {
    drawMacrophage(ctx, entity, selected);
  } else if (entity.kind === 'neutrophil') {
    drawNeutrophil(ctx, entity, selected);
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

/** Overlay shown when paused mid-game (Space). */
function drawPauseOverlay(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', width / 2, height / 2);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('SPACE to resume', width / 2, height / 2 + 30);
}

// ---------------------------------------------------------------------------
// Overlay button — a single clickable rectangle. The geometry is exported so
// the input layer can hit-test clicks against it.
// ---------------------------------------------------------------------------

export interface ButtonRect { x: number; y: number; w: number; h: number; }

/** Compute the standard centred overlay button rect for a given arena size. */
export function overlayButtonRect(width: number, height: number): ButtonRect {
  const w = 240;
  const h = 52;
  return { x: width / 2 - w / 2, y: height * 0.66, w, h };
}

function drawButton(ctx: CanvasRenderingContext2D, r: ButtonRect, label: string, accent: string): void {
  ctx.save();
  ctx.fillStyle = accent;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#06140b';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.restore();
}

/**
 * Onboarding overlay — start-paused tutorial.
 * Leads with the core loop, then the controls, then the win/lose lines.
 * The sim does not run until the player clicks BEGIN (handled by input layer).
 */
function drawOnboarding(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(2, 8, 5, 0.92)';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  ctx.textAlign = 'center';

  // Title
  ctx.fillStyle = '#7CFF9B';
  ctx.font = 'bold 34px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('GERM WARFARE', cx, height * 0.10);

  ctx.fillStyle = '#cfe8d8';
  ctx.font = '15px monospace';
  ctx.fillText('You are an INFECTION inside a body. The immune system wants you dead.', cx, height * 0.10 + 44);

  // Core loop — the headline
  const loop: string[] = [
    'THE LOOP:',
    '1.  BUILD germs from your BASE  —  press  Q / W / E  (Spreader / Brute / Spitter)',
    '2.  COMMAND them  —  click to select · drag a box to select many · right-click to move/attack',
    '3.  DEFEND your base from the immune WAVES (they get bigger over time)',
    '4.  PUSH across the map and HOLD the ORGAN to capture it',
  ];
  ctx.font = '15px monospace';
  let y = height * 0.30;
  for (const line of loop) {
    const isHeader = line.endsWith(':');
    ctx.fillStyle = isHeader ? '#ffe08a' : '#e6f3ec';
    ctx.font = isHeader ? 'bold 16px monospace' : '15px monospace';
    ctx.fillText(line, cx, y);
    y += isHeader ? 30 : 26;
  }

  // Win / lose one-liners
  y += 10;
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#7CFF9B';
  ctx.fillText('WIN: hold the ORGAN long enough to take the vector.', cx, y);
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText('LOSE: your BASE is destroyed.', cx, y + 26);

  // Begin button
  drawButton(ctx, overlayButtonRect(width, height), '▶ BEGIN', '#7CFF9B');

  ctx.fillStyle = '#8fae9c';
  ctx.font = '12px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('(click BEGIN or press SPACE to start — no rush, the game is paused)',
    cx, overlayButtonRect(width, height).y + overlayButtonRect(width, height).h + 12);

  ctx.restore();
}

/** Win / Lose end-screen overlay with a one-line reason and restart prompt. */
function drawEndOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  won: boolean,
): void {
  ctx.save();
  ctx.fillStyle = won ? 'rgba(4, 20, 10, 0.90)' : 'rgba(22, 4, 6, 0.90)';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = won ? '#7CFF9B' : '#ff5a5a';
  ctx.font = 'bold 56px monospace';
  ctx.fillText(won ? 'VICTORY' : 'DEFEAT', cx, height * 0.36);

  ctx.fillStyle = '#e6f3ec';
  ctx.font = '17px monospace';
  ctx.fillText(
    won
      ? 'You captured the organ — the vector is yours.'
      : 'Your base was destroyed by the immune system.',
    cx, height * 0.36 + 56,
  );

  drawButton(ctx, overlayButtonRect(width, height), '↻ RESTART (R)', won ? '#7CFF9B' : '#ff8a6b');
  ctx.restore();
}

/** Small labelled stat bar helper (label left, value baked into the fill). */
function drawStatBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  frac: number,
  fillColor: string,
  trackBorder: string,
  label: string,
): void {
  ctx.fillStyle = 'rgba(10, 8, 20, 0.78)';
  ctx.strokeStyle = trackBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, frac)), h - 2, 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

/**
 * Top HUD bar — the player's at-a-glance dashboard.
 * Left → right: base health, biomass, your-unit count, wave + next-wave timer,
 * and organ capture progress. Everything pinned to the top edge so nothing clips.
 */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  world: World,
  ws: WaveState,
): void {
  const top = 8;
  const h = 22;
  let x = 10;

  // Translucent strip behind the whole HUD for legibility over the arena
  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 9, 0.55)';
  ctx.fillRect(0, 0, world.width, top + h + 8);
  ctx.restore();

  // --- Base health ---
  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  const baseFrac = base ? base.hp / base.maxHp : 0;
  const baseHp = base ? Math.ceil(base.hp) : 0;
  const baseMax = base ? base.maxHp : 0;
  const baseColor = baseFrac > 0.5 ? '#aa66ff' : baseFrac > 0.25 ? '#ffaa33' : '#ff4444';
  drawStatBar(ctx, x, top, 168, h, baseFrac, baseColor, '#8866ff',
    `BASE HP  ${baseHp}/${baseMax}`);
  x += 168 + 8;

  // --- Biomass ---
  drawStatBar(ctx, x, top, 150, h, Math.min(world.biomass / 200, 1), '#33bb33', '#44aa44',
    `BIOMASS  ${Math.floor(world.biomass)}`);
  x += 150 + 8;

  // --- Your unit count (mobile 'you' units, excluding base) ---
  const unitCount = world.entities.filter(
    (e) => e.owner === 'you' && e.kind !== 'base',
  ).length;
  ctx.fillStyle = 'rgba(10, 8, 20, 0.78)';
  ctx.strokeStyle = '#33ccff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, top, 110, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#aef0ff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`GERMS  ${unitCount}`, x + 55, top + h / 2);
  x += 110 + 8;

  // --- Wave + next-wave timer ---
  const nextWaveIn = Math.max(0, WAVE_INTERVAL - ws.timer);
  const waveLabel = ws.waveNumber === 0
    ? `WAVE 1 in ${nextWaveIn.toFixed(0)}s`
    : `WAVE ${ws.waveNumber}  next ${nextWaveIn.toFixed(0)}s`;
  const waveW = 168;
  ctx.fillStyle = 'rgba(20, 6, 10, 0.8)';
  ctx.strokeStyle = '#cc4466';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, top, waveW, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ff8095';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(waveLabel, x + waveW / 2, top + h / 2);
  x += waveW + 8;

  // --- Organ capture progress ---
  const capFrac = Math.min(1, world.captureProgress / CAPTURE_TIME);
  const capColor = world.organContested ? '#ff5566' : '#55ff66';
  drawStatBar(ctx, x, top, 188, h, capFrac, capColor, '#ffaa00',
    `ORGAN  ${Math.floor(capFrac * 100)}%${world.organContested ? ' (contested)' : ''}`);
}

/** "WAVE INCOMING" flash when a wave just spawned. */
function drawWaveFlash(
  ctx: CanvasRenderingContext2D,
  world: World,
  ws: WaveState,
): void {
  if (!ws.waveJustSpawned) return;
  ctx.save();
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#ff2244';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`WAVE ${ws.waveNumber} INCOMING`, world.width / 2, 70);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Persistent legend (bottom-right) — what every shape means.
// ---------------------------------------------------------------------------

function drawLegend(ctx: CanvasRenderingContext2D, world: World): void {
  const rows: Array<{ color: string; text: string }> = [
    { color: ENTITY_COLORS.base,       text: 'BASE — your home (defend it!)' },
    { color: ENTITY_COLORS.spreader,   text: 'YOUR GERMS (Q/W/E)' },
    { color: ENTITY_COLORS.macrophage, text: 'IMMUNE (waves attack you)' },
    { color: ENTITY_COLORS.organ,      text: 'ORGAN — hold it to WIN' },
  ];

  const padX = 10;
  const lineH = 16;
  const boxW = 232;
  const boxH = rows.length * lineH + 30;
  const bx = world.width - boxW - 8;
  const by = world.height - boxH - 8;

  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 9, 0.82)';
  ctx.strokeStyle = '#2a5a38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#bfe8cc';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('LEGEND', bx + padX, by + 8);

  rows.forEach((r, i) => {
    const ry = by + 24 + i * lineH;
    // Swatch
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(bx + padX + 5, ry + 5, 5, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.fillStyle = '#dfeee5';
    ctx.font = '10px monospace';
    ctx.fillText(r.text, bx + padX + 16, ry);
  });
  ctx.restore();

  // One-line goal/tip just above the legend box
  ctx.save();
  ctx.fillStyle = '#ffe08a';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('GOAL: build germs, defend base, take the ORGAN →',
    world.width - 8, by - 6);
  ctx.restore();
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

  // Organ first (under units) so units holding it render on top of the gland
  const organ = findOrgan(world);
  if (organ) drawOrgan(ctx, organ, world);

  for (const entity of world.entities) {
    drawEntity(ctx, entity, input.selected.has(entity.id));
  }

  drawAttackEffects(ctx, attackEffects);
  drawDragBox(ctx, input);
  drawMoveMarkers(ctx, input.moveMarkers);
  drawHUD(ctx, world, waveState);
  drawWaveFlash(ctx, world, waveState);
  drawProductionPanel(ctx, world, input);
  drawLegend(ctx, world);

  // --- Overlays (mutually exclusive by game state) ---
  if (world.gameState === 'onboarding') {
    drawOnboarding(ctx, width, height);
  } else if (world.gameState === 'won') {
    drawEndOverlay(ctx, width, height, true);
  } else if (world.gameState === 'lost') {
    drawEndOverlay(ctx, width, height, false);
  } else if (world.paused) {
    drawPauseOverlay(ctx, width, height);
  }
}
