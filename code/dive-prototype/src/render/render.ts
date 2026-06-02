// render.ts — Draws the whole dive to a 2D canvas from a GameState.
//
// Pure presentation: it reads GameState (never mutates it) and the fixed
// layout, and paints. All simulation lives in src/sim. All input lives in
// src/input. Readability is the priority — clear labels, obvious colors.
//
// Palette: a cold clinical body (deep blues / teal) with one bright
// "infection" color (magenta) for the player's hold and progress.

import type { GameState, Zone } from '../sim/types'
import { heatStage } from '../sim/heat'
import {
  HEAT_THRESHOLD_ALERTED,
  HEAT_THRESHOLD_ACTIVE,
  HEAT_THRESHOLD_OVERWHELMING,
} from '../sim/heat'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  NODE_RADIUS,
  zonePos,
} from './layout'

// ─── Palette ───────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#06121f',          // deep body background
  edge: '#2b5878',        // open passage
  barrier: '#ff4d5e',     // locked barrier (drawn dashed)
  neutralFill: '#123047', // unowned zone body
  neutralRing: '#3d6e92',
  ownedFill: '#b1126b',   // player-held zone body (bright infection)
  ownedRing: '#ff5fb0',
  infection: '#ff3d9a',   // in-progress infection accent
  portalRing: '#ffd166',  // portals marked gold
  glandRing: '#7be0c8',   // gland marked teal
  responder: '#e8f6ff',   // immune responder marker
  responderRing: '#9fd2ff',
  text: '#dcefff',
  textDim: '#7fa8c9',
  heatLow: '#37c97a',     // calm
  heatMid: '#f4c542',     // alerted/active
  heatHigh: '#ff4d5e',    // overwhelming
  panel: 'rgba(4, 14, 24, 0.78)',
}

// Human-readable labels for zone ids.
const ZONE_LABEL: Record<string, string> = {
  entry: 'ENTRY',
  vessel_a: 'VESSEL A',
  vessel_b: 'VESSEL B',
  organ: 'ORGAN',
  gland: 'GLAND',
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Renders the entire game state to the canvas context.
 * @param ctx     2D rendering context (800×600)
 * @param state   current GameState
 * @param paused  whether the active-pause loop is paused (for the HUD badge)
 */
export function render(ctx: CanvasRenderingContext2D, state: GameState, paused = false): void {
  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawEdges(ctx, state)
  drawZones(ctx, state)
  drawResponders(ctx, state)
  drawHeatBar(ctx, state)
  drawHud(ctx, state, paused)
  drawControlsHint(ctx)

  if (state.result !== 'ongoing') {
    drawResultOverlay(ctx, state)
  }
}

// ─── Edges ───────────────────────────────────────────────────────────────────

function drawEdges(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Dedup the directed edge list into undirected pairs so each line draws once.
  const seen = new Set<string>()

  for (const e of state.map.edges) {
    const key = [e.from, e.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const a = zonePos(e.from)
    const b = zonePos(e.to)

    if (e.barrier) {
      // Locked barrier — bright red, dashed, with a small "lock" label at midpoint.
      ctx.save()
      ctx.strokeStyle = COLORS.barrier
      ctx.lineWidth = 4
      ctx.setLineDash([10, 8])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.restore()

      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      // small badge so the player knows it's clickable to breach
      ctx.fillStyle = COLORS.barrier
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('LOCKED', mx, my - 10)
      ctx.fillText('click to breach', mx, my + 6)
    } else {
      // Open passage — solid teal.
      ctx.strokeStyle = COLORS.edge
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
}

// ─── Zones ───────────────────────────────────────────────────────────────────

function drawZones(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const z of state.map.zones) {
    drawZone(ctx, z, state)
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, state: GameState): void {
  const p = zonePos(z.id)
  const owned = z.owner === 'you'

  // Body fill — neutral or owned (bright). Shade by infection progress.
  ctx.beginPath()
  ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = owned ? COLORS.ownedFill : COLORS.neutralFill
  ctx.fill()

  // Infection shading: a partial ring fill that grows with infection (0..100).
  // For neutral zones this shows colonize progress; for owned it confirms hold.
  if (z.infection > 0 && !owned) {
    const frac = Math.min(1, z.infection / 100)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, NODE_RADIUS, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = COLORS.infection
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.restore()
  }

  // Ring — owner ring first, then a special-kind outer ring for portals/gland.
  ctx.lineWidth = 3
  ctx.strokeStyle = owned ? COLORS.ownedRing : COLORS.neutralRing
  ctx.beginPath()
  ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2)
  ctx.stroke()

  if (z.kind === 'portal') {
    // Portals: gold double-ring + small "EXIT" tag.
    ctx.lineWidth = 3
    ctx.strokeStyle = COLORS.portalRing
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 6, 0, Math.PI * 2)
    ctx.stroke()
  } else if (z.kind === 'gland') {
    // Gland: teal dashed outer ring.
    ctx.save()
    ctx.lineWidth = 3
    ctx.strokeStyle = COLORS.glandRing
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // Label (zone name) under the node.
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(ZONE_LABEL[z.id] ?? z.id, p.x, p.y + NODE_RADIUS + 18)

  // Kind tag inside / above the node for portals & gland so they read clearly.
  ctx.font = '11px monospace'
  if (z.kind === 'portal') {
    ctx.fillStyle = COLORS.portalRing
    ctx.fillText('PORTAL', p.x, p.y - NODE_RADIUS - 14)
  } else if (z.kind === 'gland') {
    ctx.fillStyle = COLORS.glandRing
    ctx.fillText('GLAND', p.x, p.y - NODE_RADIUS - 14)
  }

  // Owned + portal → it's an escape point. Make that obvious.
  if (owned && z.kind === 'portal') {
    ctx.fillStyle = COLORS.portalRing
    ctx.font = 'bold 10px monospace'
    ctx.fillText('ESCAPE', p.x, p.y)
  } else if (owned) {
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 10px monospace'
    ctx.fillText('YOURS', p.x, p.y)
  }

  // In-progress colonize / breach numeric hint.
  const cp = state.colonizeProgress[z.id]
  const bp = state.breachProgress[z.id]
  if (cp && cp > 0) {
    ctx.fillStyle = COLORS.infection
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`colonizing ${cp}/3`, p.x, p.y + NODE_RADIUS + 33)
  } else if (bp && bp > 0) {
    ctx.fillStyle = COLORS.barrier
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`breaching ${bp}/3`, p.x, p.y + NODE_RADIUS + 33)
  }
}

// ─── Responders ────────────────────────────────────────────────────────────

function drawResponders(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const r of state.responders) {
    const p = zonePos(r.zone)
    // Diamond marker pinned to the node's right edge (3 o'clock), clear of the
    // top kind-tag ("PORTAL"/"GLAND") so labels never collide.
    const cx = p.x + NODE_RADIUS + 8
    const cy = p.y
    const s = 12
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = COLORS.responder
    ctx.strokeStyle = COLORS.responderRing
    ctx.lineWidth = 2
    ctx.fillRect(-s / 2, -s / 2, s, s)
    ctx.strokeRect(-s / 2, -s / 2, s, s)
    ctx.restore()

    // "IMMUNE" label to the right of the marker.
    ctx.fillStyle = COLORS.responderRing
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('IMMUNE', cx + 10, cy)
  }
}

// ─── Heat bar ────────────────────────────────────────────────────────────────

function drawHeatBar(ctx: CanvasRenderingContext2D, state: GameState): void {
  const stage = heatStage(state.heat)

  // Geometry of the bar (top-center, prominent).
  const barX = 200
  const barY = 30
  const barW = 400
  const barH = 26

  // Scale: 0 .. (slightly past overwhelming) so the overwhelming line sits inside.
  const max = HEAT_THRESHOLD_OVERWHELMING + 10
  const clamp = Math.max(0, Math.min(state.heat, max))
  const fillW = (clamp / max) * barW

  // Title
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('HEAT', barX, barY - 8)

  // Track
  ctx.fillStyle = '#0c2236'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.strokeStyle = COLORS.neutralRing
  ctx.lineWidth = 2
  ctx.strokeRect(barX, barY, barW, barH)

  // Fill — color by stage.
  const fillColor =
    stage === 'overwhelming' ? COLORS.heatHigh
      : stage === 'active' ? COLORS.heatHigh
        : stage === 'alerted' ? COLORS.heatMid
          : COLORS.heatLow
  ctx.fillStyle = fillColor
  ctx.fillRect(barX, barY, fillW, barH)

  // Threshold ticks (alerted / active / overwhelming) with labels above.
  const thresholds: Array<[number, string]> = [
    [HEAT_THRESHOLD_ALERTED, 'alerted'],
    [HEAT_THRESHOLD_ACTIVE, 'active'],
    [HEAT_THRESHOLD_OVERWHELMING, 'overwhelming'],
  ]
  ctx.font = '10px monospace'
  for (const [t, label] of thresholds) {
    const tx = barX + (t / max) * barW
    ctx.strokeStyle = COLORS.text
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(tx, barY - 3)
    ctx.lineTo(tx, barY + barH + 3)
    ctx.stroke()
    ctx.fillStyle = COLORS.textDim
    ctx.textAlign = 'center'
    ctx.fillText(label, tx, barY + barH + 15)
  }

  // Current stage label + numeric heat, to the right of the bar.
  ctx.fillStyle = fillColor
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${stage.toUpperCase()}`, barX + barW + 12, barY + barH - 8)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '11px monospace'
  ctx.fillText(`heat ${Math.round(state.heat)}`, barX + barW + 12, barY + barH + 6)
}

// ─── HUD (biomass / tick / dormant / pause) ─────────────────────────────────

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, paused: boolean): void {
  const ownedCount = state.map.zones.filter(z => z.owner === 'you').length

  // Top-left stats panel.
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(10, 20, 165, 92)
  ctx.strokeStyle = COLORS.neutralRing
  ctx.lineWidth = 1
  ctx.strokeRect(10, 20, 165, 92)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 13px monospace'
  ctx.fillText(`TICK   ${state.tick}`, 20, 42)
  ctx.fillText(`BIOMASS ${state.biomass}`, 20, 62)
  ctx.fillText(`ZONES  ${ownedCount}`, 20, 82)

  // Dormant indicator (bright, unmissable).
  if (state.dormant) {
    ctx.fillStyle = COLORS.glandRing
    ctx.font = 'bold 13px monospace'
    ctx.fillText('● DORMANT', 20, 102)
  } else {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '13px monospace'
    ctx.fillText('  active', 20, 102)
  }

  // Pause badge (top-right corner).
  if (paused) {
    ctx.fillStyle = COLORS.heatMid
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('|| PAUSED', CANVAS_WIDTH - 14, 18)
  }
}

// ─── Controls hint (bottom strip) ────────────────────────────────────────────

function drawControlsHint(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(0, CANVAS_HEIGHT - 26, CANVAS_WIDTH, 26)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    'click zone: colonize   ·   click LOCKED edge / gland: breach   ·   click your PORTAL: escape   ·   D: dormancy   ·   Space: pause',
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT - 13,
  )
}

// ─── Result overlay ──────────────────────────────────────────────────────────

function drawResultOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Dim the board.
  ctx.fillStyle = 'rgba(2, 8, 14, 0.82)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.result === 'escape') {
    ctx.fillStyle = COLORS.heatLow
    ctx.font = 'bold 52px monospace'
    ctx.fillText('ESCAPED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 24px monospace'
    ctx.fillText(`banked ${state.banked} virality`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22)
  } else {
    // caught
    ctx.fillStyle = COLORS.heatHigh
    ctx.font = 'bold 52px monospace'
    ctx.fillText('CAUGHT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 22px monospace'
    ctx.fillText('the immune system overwhelmed you', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22)
  }

  ctx.fillStyle = COLORS.textDim
  ctx.font = '14px monospace'
  ctx.fillText('reload the page to dive again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 64)
}
