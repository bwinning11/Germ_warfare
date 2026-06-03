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
import { BODY_MAP } from '../world/map';
import {
  POINT_CAPTURE_TIME,
  FORTRESS_BUFF_RADIUS,
  NUTRIENT_INCOME_BONUS,
  FORTRESS_DAMAGE_MULT,
} from '../world/capturePoints';

const ENTITY_COLORS: Record<string, string> = {
  placeholder: '#44ff88',
  spreader:    '#33ccff',
  brute:       '#ff6644',
  spitter:     '#ffcc22',
  base:        '#8866ff',
  // INNATE tier — warm hues, lighter weight
  macrophage:  '#ff4455',   // red-pink pentagon — slow, tanky roamer
  neutrophil:  '#ff8800',   // orange diamond — fast, weak scout
  // ADAPTIVE tier — cool/electric hues, heavier visual weight
  dendritic_cell: '#aaff00', // acid-green star burst — anti-swarm, counters Spreader
  nk_cell:     '#cc00ff',   // deep violet hexagon — heavy, counters Brute
  t_cell:      '#00ccff',   // icy blue 8-star — ranged, counters Spitter
  antibody:    '#ffaacc',
  organ:       '#ffaa00',
};

function entityColor(entity: Entity): string {
  return ENTITY_COLORS[entity.kind] ?? '#ffffff';
}


// ---------------------------------------------------------------------------
// Vessel-lane body map rendering
// ---------------------------------------------------------------------------

/**
 * Draw the vessel-lane body map — tissue background, vessel corridors,
 * chamber open areas, and chokepoint markers.
 *
 * Render order (back to front):
 *  1. Tissue wall fill (dark maroon / opaque body background)
 *  2. Vessel lane corridors (lighter, semi-transparent)
 *  3. Chamber open areas (brightest — navigable zones)
 *  4. Vessel centrelines (faint dotted guide)
 *  5. Chokepoint markers at vessel openings
 *  6. Chamber labels
 */
function drawBodyMap(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // 1. Tissue wall — fills the whole canvas behind everything
  ctx.fillStyle = '#0d0808';
  ctx.fillRect(0, 0, width, height);

  // 2. Vessel lanes — rounded rectangles along the centreline between chambers
  for (const vessel of BODY_MAP.vessels) {
    const a = BODY_MAP.chambers[vessel.a].centre;
    const b = BODY_MAP.chambers[vessel.b].centre;
    const hw = vessel.halfWidth;

    // Direction and perpendicular
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny; // perpendicular
    const py = nx;

    // Four corners of the vessel lane
    const corners = [
      { x: a.x + px * hw, y: a.y + py * hw },
      { x: b.x + px * hw, y: b.y + py * hw },
      { x: b.x - px * hw, y: b.y - py * hw },
      { x: a.x - px * hw, y: a.y - py * hw },
    ];

    ctx.save();
    ctx.fillStyle = '#1a0b12';
    ctx.strokeStyle = '#3a1a22';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Faint centreline guide (dashed)
    ctx.save();
    ctx.strokeStyle = '#3a1828';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 3. Chambers — circular open areas, brighter than tissue
  for (const ch of BODY_MAP.chambers) {
    const { x, y } = ch.centre;
    const r = ch.radius;

    // Chamber fill gradient — brighter at centre
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, '#200f16');
    grd.addColorStop(0.7, '#180b11');
    grd.addColorStop(1, '#0d0808');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Chamber border
    ctx.strokeStyle = '#4a1a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Chokepoint markers — small arrows/diamonds at vessel openings
  for (const vessel of BODY_MAP.vessels) {
    const a = BODY_MAP.chambers[vessel.a].centre;
    const b = BODY_MAP.chambers[vessel.b].centre;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Diamond at midpoint — shows the chokepoint
    ctx.save();
    ctx.fillStyle = '#5a2030';
    ctx.strokeStyle = '#8a3048';
    ctx.lineWidth = 1;
    const ds = 5; // half-size of diamond
    ctx.beginPath();
    ctx.moveTo(midX, midY - ds);
    ctx.lineTo(midX + ds, midY);
    ctx.lineTo(midX, midY + ds);
    ctx.lineTo(midX - ds, midY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 5. Chamber labels (tiny, low-contrast — visible but not distracting)
  for (const ch of BODY_MAP.chambers) {
    // Skip BASE and ORGAN — those are labelled by drawBase / drawOrgan
    if (ch.label === 'BASE' || ch.label === 'ORGAN') continue;
    ctx.save();
    ctx.fillStyle = '#6a3040';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ch.label.toUpperCase(), ch.centre.x, ch.centre.y - ch.radius - 3);
    ctx.restore();
  }
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

// ---------------------------------------------------------------------------
// Capturable control-point rendering
// ---------------------------------------------------------------------------

/** Icon colours per capture point kind. */
const CP_COLORS: Record<string, string> = {
  nutrient_node:   '#44ff99',  // green — income
  forward_colony:  '#3388ff',  // blue — production
  choke_fortress:  '#ffaa22',  // amber — defense/buff
};

const CP_LABELS: Record<string, string> = {
  nutrient_node:   'NUTRIENT +income',
  forward_colony:  'COLONY +spawn here',
  choke_fortress:  'FORTRESS +dmg buff',
};

/**
 * Draw all non-organ capturable control points.
 *
 * Each point shows:
 *  - Capture-zone dashed ring
 *  - Filled icon whose colour reflects type
 *  - Progress arc that fills as the player captures it
 *  - Owner state label (NEUTRAL / YOURS / CONTESTED / ENEMY)
 *  - Fortress also draws its buff-radius ring when held
 */
function drawCapturePoints(ctx: CanvasRenderingContext2D, world: World): void {
  for (const cp of (world.capturePoints ?? [])) {
    const { x, y } = cp.pos;
    const color = CP_COLORS[cp.kind] ?? '#ffffff';
    const r = 18; // icon radius
    const frac = Math.min(1, cp.captureProgress / POINT_CAPTURE_TIME);
    const owned = cp.owner === 'you';
    const contested = cp.contested;
    const neutral = cp.owner === 'neutral';

    // --- Fortress buff radius ring (only when held by player) ---
    if (cp.kind === 'choke_fortress' && owned) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 170, 34, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(x, y, FORTRESS_BUFF_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // --- Capture-zone ring ---
    ctx.save();
    const ringColor = contested
      ? 'rgba(255,70,90,0.5)'
      : owned
        ? `${color}55`
        : 'rgba(200,200,200,0.25)';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, cp.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // --- Outer glow ---
    const glowColor = contested ? '#ff3344' : color;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    grd.addColorStop(0, glowColor + '44');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // --- Icon body (circle for neutral/contested, filled for owned) ---
    ctx.save();
    ctx.fillStyle = owned ? color : (neutral ? '#333344' : '#661122');
    ctx.strokeStyle = owned ? color : (contested ? '#ff4455' : '#666688');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- Inner type indicator ---
    ctx.save();
    ctx.fillStyle = owned ? '#000' : color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sym = cp.kind === 'nutrient_node' ? '$'
               : cp.kind === 'forward_colony' ? '+'
               : '★'; // star for fortress
    ctx.fillText(sym, x, y);
    ctx.restore();

    // --- Capture progress arc ---
    if (frac > 0) {
      ctx.save();
      ctx.strokeStyle = contested ? '#ff5566' : color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- State label below the icon ---
    const stateLabel = contested ? 'CONTESTED'
      : owned       ? 'YOURS'
      : cp.owner === 'immune' ? 'ENEMY'
      : 'NEUTRAL';
    const stateColor = contested ? '#ff8899'
      : owned     ? color
      : cp.owner === 'immune' ? '#ff5566'
      : '#888899';

    ctx.save();
    ctx.fillStyle = stateColor;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(stateLabel, x, y + r + 4);
    ctx.fillStyle = '#aaaacc';
    ctx.font = '8px monospace';
    ctx.fillText(CP_LABELS[cp.kind] ?? cp.kind, x, y + r + 14);
    ctx.restore();
  }
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

/** Draw a dendritic cell — adaptive anti-swarm unit (counter to Spreader). */
function drawDendriticCell(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  selected: boolean,
): void {
  const { x, y } = entity.pos;
  const radius = 11; // smaller than NK/macrophage — numerous but not huge
  const color = ENTITY_COLORS.dendritic_cell;

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

  // Acid-green glow
  const grd = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
  grd.addColorStop(0, color + '66');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Body: 6-pointed star (dendritic = branching processes)
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ddff88';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const spikes = 6;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Label: ADPT tag
  ctx.fillStyle = '#ccff66';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('DC', x, y + radius + 2);

  // HP bar
  const barW = radius * 2;
  const barH = 3;
  const bx = x - radius;
  const by = y - radius - 6;
  ctx.fillStyle = '#112200';
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
  } else if (entity.kind === 'dendritic_cell') {
    drawDendriticCell(ctx, entity, selected);
  } else if (entity.kind === 'nk_cell') {
    drawNkCell(ctx, entity, selected);
  } else if (entity.kind === 't_cell') {
    drawTCell(ctx, entity, selected);
  } else {
    drawUnit(ctx, entity, selected);
  }
}

/**
 * Draw the rally point flag — always visible, brighter when base is selected.
 *
 * - A dashed line from the base to the flag shows the connection.
 * - When the base is selected, the flag is brighter and a hint prompts
 *   "right-click → set rally point".
 */
function drawRallyPoint(
  ctx: CanvasRenderingContext2D,
  world: World,
  input: InputState,
): void {
  if (!world.rallyPoint) return;

  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  const baseSelected = base !== undefined && input.selected.has(base.id);

  const { x, y } = world.rallyPoint;
  const alpha = baseSelected ? 1.0 : 0.38; // dimmer when base not selected
  const color = baseSelected ? '#aa88ff' : '#7755cc';
  const glowColor = baseSelected ? '#8866ff' : '#4433aa';

  ctx.save();
  ctx.globalAlpha = alpha;

  // Line from base to rally point
  if (base) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(base.pos.x, base.pos.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Ground circle (anchor)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.stroke();

  // Flagpole
  ctx.strokeStyle = color;
  ctx.lineWidth = baseSelected ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 22);
  ctx.stroke();

  // Flag triangle — filled
  if (baseSelected) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 22);
  ctx.lineTo(x + 14, y - 15);
  ctx.lineTo(x, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // "RALLY" label (only when selected, above the flag)
  if (baseSelected) {
    ctx.fillStyle = '#ccaaff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('RALLY', x + 4, y - 24);
  }

  ctx.restore();

  // Hint text: "right-click → set rally point" when base is selected
  if (baseSelected) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 14, 9, 0.78)';
    ctx.strokeStyle = '#7755aa';
    ctx.lineWidth = 1;
    const hintX = x - 70;
    const hintY = y + 12;
    ctx.beginPath();
    ctx.roundRect(hintX, hintY, 156, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bbaaff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('right-click → set rally point', hintX + 78, hintY + 9);
    ctx.restore();
  }
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
  ctx.textBaseline = 'top';

  // Title
  ctx.fillStyle = '#7CFF9B';
  ctx.font = 'bold 34px monospace';
  ctx.fillText('GERM WARFARE', cx, 40);

  ctx.fillStyle = '#cfe8d8';
  ctx.font = '15px monospace';
  ctx.fillText('You are an INFECTION inside a body. Flow through its vessels and take the organ.', cx, 84);

  // ---- THE LOOP — lead with the core gameplay arc -----------------------
  let y = 124;
  ctx.fillStyle = '#ffe08a';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('THE LOOP', cx, y);
  y += 28;

  const loop: string[] = [
    '1.  SET your production mix — click BASE, press Q / W / E to weight each germ',
    '2.  Your germs AUTO-BUILD and FLOW through the vessels toward the front',
    '3.  CAPTURE the points for advantages — hold a unit on each to take it:',
    '4.  HOLD the chokepoints, then PUSH to the ORGAN and hold it to WIN',
  ];
  ctx.font = '15px monospace';
  ctx.fillStyle = '#e6f3ec';
  for (const line of loop) {
    ctx.fillText(line, cx, y);
    y += 25;
  }

  // Capture-point benefits — the heart of map control, taught explicitly.
  y += 4;
  const cpY = y;
  ctx.font = 'bold 13px monospace';
  const seg = [
    { t: '$ NUTRIENT = +income', c: CP_COLORS.nutrient_node },
    { t: '+ COLONY = forward spawn', c: CP_COLORS.forward_colony },
    { t: '* FORTRESS = +combat dmg', c: CP_COLORS.choke_fortress },
  ];
  // Lay the three benefit chips out centred on one line.
  const sep = '     ';
  let totalW = 0;
  for (let i = 0; i < seg.length; i++) {
    totalW += ctx.measureText(seg[i].t).width;
    if (i < seg.length - 1) totalW += ctx.measureText(sep).width;
  }
  ctx.textAlign = 'left';
  let sx = cx - totalW / 2;
  for (let i = 0; i < seg.length; i++) {
    ctx.fillStyle = seg[i].c;
    ctx.fillText(seg[i].t, sx, cpY);
    sx += ctx.measureText(seg[i].t).width;
    if (i < seg.length - 1) {
      ctx.fillStyle = '#5a6a60';
      ctx.fillText(sep, sx, cpY);
      sx += ctx.measureText(sep).width;
    }
  }
  ctx.textAlign = 'center';
  y += 34;

  // Controls + threat reminder
  ctx.font = '14px monospace';
  ctx.fillStyle = '#bcd8c8';
  ctx.fillText('COMMAND: click / drag to select · right-click to move or attack', cx, y);
  y += 24;
  ctx.fillStyle = '#ffb0b0';
  ctx.fillText('DEFEND: immune waves come DOWN THE VESSELS from the organ side — guard your base.', cx, y);
  y += 30;

  // Win / lose one-liners
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#7CFF9B';
  ctx.fillText('WIN: hold the ORGAN long enough to take the vector.', cx, y);
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText('LOSE: your BASE is destroyed.', cx, y + 24);

  // Begin button
  drawButton(ctx, overlayButtonRect(width, height), 'BEGIN', '#7CFF9B');

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
 * Top HUD bar — the player's at-a-glance dashboard (two rows).
 *
 * Row 1 (resources + threat): base HP · biomass · germ count · production mix ·
 *        innate wave timer · adaptive threat · organ-capture %.
 * Row 2 (MAP CONTROL): one chip per capturable point (nutrient / colony /
 *        fortress) showing who holds it and its concrete benefit. This answers
 *        "what do I hold and what is it doing for me?" at a glance.
 *
 * The whole bar is laid out to FIT inside world.width with no clipping — box
 * widths are computed from the usable width so the rightmost box ends inside
 * the right edge regardless of canvas size.
 */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  world: World,
  ws: WaveState,
): void {
  const pad = 8;       // left/right margin
  const top = 8;
  const h = 22;        // row height
  const gap = 6;       // gap between boxes
  const row2 = top + h + 6; // second row y

  // Translucent strip behind the whole two-row HUD for legibility over the arena
  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 9, 0.62)';
  ctx.fillRect(0, 0, world.width, row2 + h + 8);
  ctx.restore();

  // ---- ROW 1: resources + threat -----------------------------------------
  const usable = world.width - pad * 2;
  let x = pad;

  const base = world.entities.find((e) => e.kind === 'base' && e.owner === 'you');
  const baseFrac = base ? base.hp / base.maxHp : 0;
  const baseHp = base ? Math.ceil(base.hp) : 0;
  const baseMax = base ? base.maxHp : 0;
  const baseColor = baseFrac > 0.5 ? '#aa66ff' : baseFrac > 0.25 ? '#ffaa33' : '#ff4444';

  const unitCount = world.entities.filter(
    (e) => e.owner === 'you' && e.kind !== 'base',
  ).length;

  const mix = world.productionMix;
  const mixTotal = mix.spreader + mix.brute + mix.spitter;
  const mixLabel = mixTotal === 0 ? 'MIX: OFF' : `MIX S${mix.spreader} B${mix.brute} P${mix.spitter}`;
  const mixActive = mixTotal > 0;

  const nextWaveIn = Math.max(0, WAVE_INTERVAL - ws.timer);
  const waveLabel = ws.waveNumber === 0
    ? `INNATE in ${nextWaveIn.toFixed(0)}s`
    : `INNATE #${ws.waveNumber}  ${nextWaveIn.toFixed(0)}s`;

  const THREAT_REFERENCE = 100;
  const threatFrac = Math.min(1, (world.threatLevel ?? 0) / THREAT_REFERENCE);
  const nextPushIn = Math.max(0, ADAPTIVE_PUSH_INTERVAL - adaptiveState.timer);
  const threatColor = threatFrac < 0.4 ? '#ff8800' : threatFrac < 0.7 ? '#ff4400' : '#ff0022';

  const capFrac = Math.min(1, world.captureProgress / CAPTURE_TIME);
  const capColor = world.organContested ? '#ff5566' : '#55ff66';

  // Seven boxes, sized by weight to fit `usable - 6*gap` exactly (no overflow).
  const weights = [0.155, 0.13, 0.10, 0.115, 0.155, 0.165, 0.18];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const innerW = usable - gap * (weights.length - 1);
  const boxW = weights.map((wt) => Math.floor((wt / wsum) * innerW));

  // 1 · Base HP
  drawStatBar(ctx, x, top, boxW[0], h, baseFrac, baseColor, '#8866ff',
    `BASE ${baseHp}/${baseMax}`);
  x += boxW[0] + gap;

  // 2 · Biomass
  drawStatBar(ctx, x, top, boxW[1], h, Math.min(world.biomass / 200, 1), '#33bb33', '#44aa44',
    `BIOMASS ${Math.floor(world.biomass)}`);
  x += boxW[1] + gap;

  // 3 · Germ count
  drawLabelBox(ctx, x, top, boxW[2], h, `GERMS ${unitCount}`, '#33ccff', '#aef0ff');
  x += boxW[2] + gap;

  // 4 · Production mix
  drawLabelBox(ctx, x, top, boxW[3], h, mixLabel,
    mixActive ? '#8866ff' : '#553355', mixActive ? '#ccaaff' : '#7a6a8a');
  x += boxW[3] + gap;

  // 5 · Innate wave timer
  drawLabelBox(ctx, x, top, boxW[4], h, waveLabel, '#cc4466', '#ff8095');
  x += boxW[4] + gap;

  // 6 · Adaptive threat
  drawStatBar(ctx, x, top, boxW[5], h, threatFrac, threatColor, '#881122',
    `ADAPTIVE ${Math.round(threatFrac * 100)}% ${nextPushIn.toFixed(0)}s`);
  x += boxW[5] + gap;

  // 7 · Organ capture
  drawStatBar(ctx, x, top, boxW[6], h, capFrac, capColor, '#ffaa00',
    `ORGAN ${Math.floor(capFrac * 100)}%${world.organContested ? ' !' : ''}`);

  // ---- ROW 2: MAP CONTROL -------------------------------------------------
  drawMapControlRow(ctx, world, pad, row2, h, gap, usable);
}

/** A plain bordered label box (no fill bar) — for discrete readouts. */
function drawLabelBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, border: string, textColor: string,
): void {
  ctx.fillStyle = 'rgba(10, 8, 20, 0.80)';
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

/**
 * MAP CONTROL row — a leading tag plus three chips, one per capturable point.
 * Each chip shows: icon symbol, name, who holds it, and the concrete benefit
 * (active = bright + ✓; not-yours = dimmed). A capturing chip under-fills with
 * its % progress so the player can see it being taken.
 */
function drawMapControlRow(
  ctx: CanvasRenderingContext2D,
  world: World,
  pad: number,
  y: number,
  h: number,
  gap: number,
  usable: number,
): void {
  // Leading "MAP CONTROL" tag box
  const tagW = 116;
  ctx.fillStyle = 'rgba(8, 14, 10, 0.85)';
  ctx.strokeStyle = '#3a6a48';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pad, y, tagW, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9fe0b4';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MAP CONTROL', pad + tagW / 2, y + h / 2);

  // Three chips fill the remaining width evenly.
  const chipsX = pad + tagW + gap;
  const chipsTotal = usable - tagW - gap;
  const chipW = Math.floor((chipsTotal - gap * 2) / 3);

  type ChipSpec = { kind: 'nutrient_node' | 'forward_colony' | 'choke_fortress'; sym: string; name: string; benefit: string; };
  const specs: ChipSpec[] = [
    { kind: 'nutrient_node',  sym: '$', name: 'NUTRIENT', benefit: `+${NUTRIENT_INCOME_BONUS}/s biomass` },
    { kind: 'forward_colony', sym: '+', name: 'COLONY',   benefit: 'forward spawn' },
    { kind: 'choke_fortress', sym: '*', name: 'FORTRESS', benefit: `${FORTRESS_DAMAGE_MULT}x dmg` },
  ];

  specs.forEach((spec, i) => {
    const cx = chipsX + i * (chipW + gap);
    const cp = (world.capturePoints ?? []).find((p) => p.kind === spec.kind);
    const owned = cp?.owner === 'you';
    const enemy = cp?.owner === 'immune';
    const contested = cp?.contested ?? false;
    const frac = cp ? Math.min(1, cp.captureProgress / POINT_CAPTURE_TIME) : 0;
    const color = CP_COLORS[spec.kind] ?? '#ffffff';

    // Chip background — bright bordered when held, dim otherwise; red when contested.
    const border = contested ? '#ff5566' : owned ? color : enemy ? '#aa3344' : '#3a3a4a';
    ctx.fillStyle = owned ? 'rgba(20,30,22,0.92)' : 'rgba(10,8,18,0.82)';
    ctx.strokeStyle = border;
    ctx.lineWidth = owned ? 1.8 : 1;
    ctx.beginPath();
    ctx.roundRect(cx, y, chipW, h, 3);
    ctx.fill();
    ctx.stroke();

    // Capturing under-fill so chips read as "filling" toward yours.
    if (!owned && frac > 0) {
      ctx.save();
      ctx.fillStyle = contested ? 'rgba(255,85,102,0.22)' : `${color}33`;
      ctx.beginPath();
      ctx.roundRect(cx + 1, y + 1, Math.max(0, (chipW - 2) * frac), h - 2, 2);
      ctx.fill();
      ctx.restore();
    }

    // Symbol
    ctx.fillStyle = owned ? color : enemy ? '#ff8090' : '#8a8aa0';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.sym, cx + 7, y + h / 2);

    // Name + state
    const stateTxt = contested ? 'CONTESTED'
      : owned ? 'YOURS'
      : enemy ? 'ENEMY'
      : frac > 0 ? `${Math.floor(frac * 100)}%`
      : 'NEUTRAL';
    ctx.fillStyle = owned ? '#ffffff' : '#cfd6e0';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${spec.name} · ${stateTxt}`, cx + 20, y + h / 2 - 5);

    // Benefit line (bright if active, dim if not held)
    ctx.fillStyle = owned ? color : '#6a6a80';
    ctx.font = '9px monospace';
    ctx.fillText(spec.benefit + (owned ? '  ON' : ''), cx + 20, y + h / 2 + 6);
  });
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
// Clearly separates player units, innate immune, and adaptive immune.
// ---------------------------------------------------------------------------

function drawLegend(ctx: CanvasRenderingContext2D, world: World): void {
  // Each entry: color swatch, text, optional tier-header before it
  interface LegendRow {
    color: string;
    text: string;
    header?: string; // draws a section header line above this row
  }

  const rows: LegendRow[] = [
    { color: ENTITY_COLORS.base,    text: 'BASE — your home (protect!)' },
    { color: ENTITY_COLORS.organ,   text: 'ORGAN — hold to WIN' },
    { color: CP_COLORS.nutrient_node,  header: '— CAPTURE POINTS (hold) —', text: '$ Nutrient · +income' },
    { color: CP_COLORS.forward_colony, text: '+ Colony · spawn forward' },
    { color: CP_COLORS.choke_fortress, text: '* Fortress · +dmg buff' },
    { color: ENTITY_COLORS.spreader, header: '— YOUR GERMS —', text: 'Spreader (Q) · fast swarm' },
    { color: ENTITY_COLORS.brute,   text: 'Brute (W) · heavy melee' },
    { color: ENTITY_COLORS.spitter, text: 'Spitter (E) · ranged acid' },
    { color: ENTITY_COLORS.macrophage, header: '— IMMUNE: INNATE (roaming) —', text: 'Macrophage · slow tank' },
    { color: ENTITY_COLORS.neutrophil, text: 'Neutrophil · fast harasser' },
    { color: ENTITY_COLORS.dendritic_cell, header: '— IMMUNE: ADAPTIVE (escalates) —', text: 'Dendritic · vs Spreader' },
    { color: ENTITY_COLORS.nk_cell, text: 'NK cell · vs Brute (heavy)' },
    { color: ENTITY_COLORS.t_cell,  text: 'T-cell · vs Spitter (ranged)' },
  ];

  const padX = 10;
  const lineH = 15;
  const headerH = 13;
  // Pre-compute total height
  let totalContentH = 0;
  for (const r of rows) {
    if (r.header) totalContentH += headerH;
    totalContentH += lineH;
  }
  const boxW = 248;
  const boxH = totalContentH + 30;
  const bx = world.width - boxW - 8;
  const by = world.height - boxH - 8;

  ctx.save();
  ctx.fillStyle = 'rgba(6, 14, 9, 0.88)';
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

  let ry = by + 22;
  for (const r of rows) {
    if (r.header) {
      // Section divider + header text
      ctx.fillStyle = '#6a9a7a';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(r.header, bx + padX, ry);
      ry += headerH;
    }
    // Color swatch (small circle)
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(bx + padX + 5, ry + 5, 5, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.fillStyle = '#dfeee5';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(r.text, bx + padX + 16, ry);
    ry += lineH;
  }
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

  // Draw vessel-lane body map (replaces plain dark background + grid)
  drawBodyMap(ctx, width, height);

  // Draw rally point before units so units render on top
  drawRallyPoint(ctx, world, input);

  // Capture control points (under units so units render on top)
  drawCapturePoints(ctx, world);

  // Organ first (under units) so units holding it render on top of the gland
  const organ = findOrgan(world);
  if (organ) drawOrgan(ctx, organ, world);

  for (const entity of world.entities) {
    drawEntity(ctx, entity, input.selected.has(entity.id));
  }

  drawAttackEffects(ctx, attackEffects);
  drawDragBox(ctx, input);
  drawMoveMarkers(ctx, input.moveMarkers);

  // Dashboard chrome is only meaningful once the match is live. Skipping it
  // during onboarding keeps the tutorial overlay clean (no faint bleed-through).
  if (world.gameState !== 'onboarding') {
    drawHUD(ctx, world, waveState);
    drawWaveFlash(ctx, world, waveState);
    drawProductionPanel(ctx, world, input);
    drawLegend(ctx, world);
  }

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
