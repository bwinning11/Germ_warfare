// ---------------------------------------------------------------------------
// Canvas renderer — knows about the DOM, knows nothing about game logic.
// ---------------------------------------------------------------------------

import { World, Entity } from '../world/types';
import { InputState, MoveMarker } from '../input/input';
import { normaliseRect } from '../world/selection';
import { UNIT_DEFS } from '../world/economy';
import { attackEffects, AttackEffect } from '../world/combat';
import { WaveState, WAVE_INTERVAL } from '../world/waves';
import { waveState, adaptiveState } from '../world/world';
import { ADAPTIVE_PUSH_INTERVAL } from '../world/immune';
import { CAPTURE_TIME, CAPTURE_RADIUS, findOrgan } from '../world/capture';

const ENTITY_COLORS: Record<string, string> = {
  placeholder: '#44ff88',
  spreader:    '#33ccff',
  brute:       '#ff6644',
  spitter:     '#ffcc22',
  base:        '#8866ff',
  // Innate tier — warmer, lighter
  macrophage:  '#ff4455',
  neutrophil:  '#ff8800',
  // Adaptive tier — colder, heavier
  nk_cell:     '#cc00ff',   // deep violet — heavy counter to brute
  t_cell:      '#00ccff',   // icy blue — ranged counter to spitter
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

/** Draw an NK cell — adaptive heavy unit (counter to brute). */
function drawNkCell(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 17; // larger than innate units
  const color = ENTITY_COLORS.nk_cell;

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Heavy glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
  grd.addColorStop(0, color + '77');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Body: hexagon — heavy, structured
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ee88ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const r = radius * (0.9 + 0.1 * Math.cos(i * 1.7));
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Inner bright nucleus
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  // Label: ADPT tag to distinguish from innate
  ctx.fillStyle = '#ddaaff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('NK', x, y + radius + 2);

  // HP bar
  const barW = radius * 2.2;
  const barH = 3;
  const bx = x - radius * 1.1;
  const by = y - radius - 8;
  ctx.fillStyle = '#220033';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(bx, by, barW * Math.max(0, entity.hp / entity.maxHp), barH);
}

/** Draw a T-cell — adaptive ranged unit (counter to spitter). */
function drawTCell(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 14;
  const color = ENTITY_COLORS.t_cell;

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Icy glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
  grd.addColorStop(0, color + '66');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Body: elongated capsule (rectangle + circles) — ranged shape
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#88eeff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // 8-pointed star (ranged interceptor feel)
  const spikes = 8;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.55;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.fillStyle = '#aaeeff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('TC', x, y + radius + 2);

  // HP bar
  const barW = radius * 2;
  const barH = 3;
  const bx = x - radius;
  const by = y - radius - 7;
  ctx.fillStyle = '#001133';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(bx, by, barW * Math.max(0, entity.hp / entity.maxHp), barH);
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
  } else if (entity.kind === 'nk_cell') {
    drawNkCell(ctx, entity, selected);
  } else if (entity.kind === 't_cell') {
    drawTCell(ctx, entity, selected);
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

/** Draw the production-mix panel (bottom-left) when the base is selected. */
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
  const panelY = world.height - 122;
  const panelW = 316;
  const panelH = 108;

  // Panel background
  ctx.fillStyle = 'rgba(10, 8, 20, 0.88)';
  ctx.strokeStyle = '#8866ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.stroke();

  // Title row
  ctx.fillStyle = '#ccaaff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PRODUCTION MIX  (base selected)', panelX + 10, panelY + 7);

  ctx.fillStyle = '#7755bb';
  ctx.font = '9px monospace';
  ctx.fillText('Q/W/E to set weight (0–3)  ·  auto-builds continuously', panelX + 10, panelY + 21);

  const units: Array<{ key: string; label: string; kind: 'spreader' | 'brute' | 'spitter'; color: string }> = [
    { key: 'Q', label: 'Spreader', kind: 'spreader', color: ENTITY_COLORS.spreader },
    { key: 'W', label: 'Brute',    kind: 'brute',    color: ENTITY_COLORS.brute    },
    { key: 'E', label: 'Spitter',  kind: 'spitter',  color: ENTITY_COLORS.spitter  },
  ];

  const totalWeight = world.productionMix.spreader + world.productionMix.brute + world.productionMix.spitter;

  units.forEach((u, i) => {
    const bx = panelX + 8 + i * 100;
    const by = panelY + 35;
    const bw = 92;
    const bh = 68;
    const def = UNIT_DEFS[u.kind];
    const weight = world.productionMix[u.kind];
    const isEnabled = weight > 0;
    const targetPct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;

    // Button background — brighter when weight > 0
    ctx.fillStyle = isEnabled ? 'rgba(40,30,70,0.95)' : 'rgba(14,10,22,0.9)';
    ctx.strokeStyle = isEnabled ? u.color : '#3a2a4a';
    ctx.lineWidth = isEnabled ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.stroke();

    // Hotkey badge
    ctx.fillStyle = isEnabled ? u.color : '#554466';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`[${u.key}]`, bx + 5, by + 5);

    // Unit name
    ctx.fillStyle = isEnabled ? '#ffffff' : '#554466';
    ctx.font = '10px monospace';
    ctx.fillText(u.label, bx + 5, by + 21);

    // Cost / HP hint
    ctx.fillStyle = isEnabled ? '#888' : '#443355';
    ctx.font = '9px monospace';
    ctx.fillText(`${def.cost}bio  HP:${def.hp}`, bx + 5, by + 33);

    // Weight pips (filled circles = weight, empty = remaining slots up to 3)
    const pipY = by + 47;
    for (let p = 0; p < 3; p++) {
      const px = bx + 5 + p * 13;
      ctx.beginPath();
      ctx.arc(px + 4, pipY + 4, 4, 0, Math.PI * 2);
      if (p < weight) {
        ctx.fillStyle = u.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = '#443355';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Target percentage label
    ctx.fillStyle = isEnabled ? '#aaffaa' : '#443355';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(isEnabled ? `${targetPct}%` : 'OFF', bx + bw - 5, by + 44);
    ctx.textAlign = 'left';
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
    '1.  SET your production mix  —  click BASE, then press  Q / W / E  to weight each germ type',
    '2.  The base AUTO-BUILDS a continuous tide — you command, not click-spam',
    '3.  COMMAND your swarm  —  click/drag to select · right-click to move or attack',
    '4.  DEFEND base from immune WAVES  ·  PUSH to the ORGAN and HOLD it to win',
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

  // --- Production mix indicator ---
  {
    const mix = world.productionMix;
    const total = mix.spreader + mix.brute + mix.spitter;
    const mixLabel = total === 0
      ? 'MIX: OFF'
      : `MIX S${mix.spreader} B${mix.brute} P${mix.spitter}`;
    const mixActive = total > 0;
    ctx.fillStyle = 'rgba(10, 8, 20, 0.78)';
    ctx.strokeStyle = mixActive ? '#8866ff' : '#553355';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, top, 122, h, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = mixActive ? '#ccaaff' : '#554466';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mixLabel, x + 61, top + h / 2);
    x += 122 + 8;
  }

  // --- Innate wave timer (legacy wave system = innate cadence) ---
  const nextWaveIn = Math.max(0, WAVE_INTERVAL - ws.timer);
  const waveLabel = ws.waveNumber === 0
    ? `INNATE in ${nextWaveIn.toFixed(0)}s`
    : `INNATE #${ws.waveNumber}  next ${nextWaveIn.toFixed(0)}s`;
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

  // --- Adaptive threat / immune-response indicator ---
  const THREAT_REFERENCE = 100;
  const threatFrac = Math.min(1, (world.threatLevel ?? 0) / THREAT_REFERENCE);
  const nextPushIn = Math.max(0, ADAPTIVE_PUSH_INTERVAL - adaptiveState.timer);
  const threatColor = threatFrac < 0.4 ? '#ff8800' : threatFrac < 0.7 ? '#ff4400' : '#ff0022';
  drawStatBar(
    ctx, x, top, 188, h,
    threatFrac, threatColor, '#881122',
    `ADAPTIVE ${Math.round(threatFrac * 100)}%  push ${nextPushIn.toFixed(0)}s`,
  );
  x += 188 + 8;

  // --- Organ capture progress ---
  const capFrac = Math.min(1, world.captureProgress / CAPTURE_TIME);
  const capColor = world.organContested ? '#ff5566' : '#55ff66';
  drawStatBar(ctx, x, top, 188, h, capFrac, capColor, '#ffaa00',
    `ORGAN  ${Math.floor(capFrac * 100)}%${world.organContested ? ' (contested)' : ''}`);
}

/** "INNATE WAVE INCOMING" flash when an innate wave just spawned. */
function drawWaveFlash(
  ctx: CanvasRenderingContext2D,
  world: World,
  ws: WaveState,
): void {
  if (ws.waveJustSpawned) {
    ctx.save();
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ff8855';
    ctx.shadowColor = '#ff4400';
    ctx.shadowBlur = 14;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`INNATE SCOUTS — wave ${ws.waveNumber}`, world.width / 2, 70);
    ctx.restore();
  }

  // Adaptive push flash — more alarming
  if (adaptiveState.pushJustSpawned) {
    ctx.save();
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#cc00ff';
    ctx.shadowColor = '#aa00ff';
    ctx.shadowBlur = 28;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ADAPTIVE PUSH ${adaptiveState.pushCount} — body remembers you`, world.width / 2, 100);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Persistent legend (bottom-right) — what every shape means.
// ---------------------------------------------------------------------------

function drawLegend(ctx: CanvasRenderingContext2D, world: World): void {
  const rows: Array<{ color: string; text: string }> = [
    { color: ENTITY_COLORS.base,       text: 'BASE — your home (defend it!)' },
    { color: ENTITY_COLORS.spreader,   text: 'YOUR GERMS (auto-produced)' },
    { color: ENTITY_COLORS.macrophage, text: 'INNATE scouts — fast, roaming' },
    { color: ENTITY_COLORS.nk_cell,    text: 'ADAPTIVE push — heavy siege' },
    { color: ENTITY_COLORS.t_cell,     text: 'ADAPTIVE T-cell — counters you' },
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
  ctx.fillText('GOAL: set mix, tide builds itself, take the ORGAN →',
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
