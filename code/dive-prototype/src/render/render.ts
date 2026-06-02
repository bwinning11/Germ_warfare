// render.ts — Draws the whole dive to a 2D canvas from a GameState.
//
// Pure presentation: it reads GameState (never mutates it) and the fixed
// layout, and paints. All simulation lives in src/sim. All input lives in
// src/input. Readability is the priority — clear labels, obvious colors.
//
// A first-time player must be able to look at one frame and understand: who
// they are, what to do, and why Heat is rising. So this renderer also draws a
// start-of-dive onboarding overlay, a persistent legend, loud click feedback,
// and an escalating Heat warning. None of that lives in the sim — it is all
// presentation driven by a small RenderInfo bundle passed from main.ts.
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

// ─── Render-side info (presentation only; never touches the sim) ─────────────

/** What the player most recently commanded — drives the loud click feedback. */
export interface LastAction {
  kind: 'colonize' | 'breach' | 'escape' | 'dormancy'
  /** Big banner text, e.g. "SPREADING → VESSEL A". */
  label: string
  /** Zone to visibly highlight (colonize/breach/escape target), if any. */
  targetZone?: string
}

/** Presentation state passed from main.ts each frame. */
export interface RenderInfo {
  /** False until the player dismisses onboarding. While false the sim is frozen. */
  started: boolean
  /** The most recent player command, or null. Used for highlight + banner. */
  lastAction: LastAction | null
  /** Monotonic time in ms (performance.now) — drives pulsing animations. */
  nowMs: number
}

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
  panel: 'rgba(4, 14, 24, 0.82)',
  panelStrong: 'rgba(3, 11, 20, 0.94)',
  highlight: '#ffe27a',   // click-feedback target highlight
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
 * @param info    presentation bundle (onboarding gate, click feedback, clock)
 */
export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  paused = false,
  info: RenderInfo = { started: true, lastAction: null, nowMs: 0 },
): void {
  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawEdges(ctx, state)
  drawZones(ctx, state, info)
  drawResponders(ctx, state)

  // Heat warning glow sits behind the HUD chrome but over the board.
  if (state.result === 'ongoing' && info.started) {
    drawHeatWarning(ctx, state, info.nowMs)
  }

  drawHeatBar(ctx, state)
  drawHud(ctx, state, paused)
  drawLegend(ctx)
  drawControlsHint(ctx)

  // Loud, transient feedback banner for the last command.
  if (state.result === 'ongoing' && info.started && info.lastAction) {
    drawActionBanner(ctx, info.lastAction)
  }

  if (!info.started && state.result === 'ongoing') {
    drawOnboarding(ctx)
  }

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

function drawZones(ctx: CanvasRenderingContext2D, state: GameState, info: RenderInfo): void {
  for (const z of state.map.zones) {
    drawZone(ctx, z, state, info)
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, state: GameState, info: RenderInfo): void {
  const p = zonePos(z.id)
  const owned = z.owner === 'you'

  // Loud click feedback: pulsing highlight ring around the targeted zone.
  if (info.lastAction?.targetZone === z.id && state.result === 'ongoing' && info.started) {
    const pulse = 0.5 + 0.5 * Math.sin(info.nowMs / 110)
    ctx.save()
    ctx.strokeStyle = COLORS.highlight
    ctx.globalAlpha = 0.55 + 0.45 * pulse
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 12 + pulse * 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

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
    ctx.fillText(`colonizing ${cp}/2`, p.x, p.y + NODE_RADIUS + 33)
  } else if (bp && bp > 0) {
    ctx.fillStyle = COLORS.barrier
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`breaching ${bp}/2`, p.x, p.y + NODE_RADIUS + 33)
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

// ─── Heat warning (escalating danger telegraph) ──────────────────────────────

/**
 * Draws a pulsing screen-edge glow plus a loud banner once Heat reaches the
 * 'alerted' stage, intensifying through 'active' and 'overwhelming'. This is
 * the "why am I in danger" signal: it tells the player to go Dormant or Escape.
 */
function drawHeatWarning(ctx: CanvasRenderingContext2D, state: GameState, nowMs: number): void {
  const stage = heatStage(state.heat)
  if (stage === 'calm') return

  // Pulse speed and intensity ramp up with the stage.
  const speed = stage === 'overwhelming' ? 80 : stage === 'active' ? 140 : 240
  const baseAlpha = stage === 'overwhelming' ? 0.5 : stage === 'active' ? 0.34 : 0.18
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / speed)
  const alpha = baseAlpha * (0.55 + 0.45 * pulse)
  const color = stage === 'alerted' ? COLORS.heatMid : COLORS.heatHigh

  // Vignette: a thick glowing border drawn as four gradient bands.
  const t = stage === 'overwhelming' ? 64 : stage === 'active' ? 44 : 28
  ctx.save()
  ctx.globalAlpha = alpha
  // top
  let g = ctx.createLinearGradient(0, 0, 0, t)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_WIDTH, t)
  // bottom
  g = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - t)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, CANVAS_HEIGHT - t, CANVAS_WIDTH, t)
  // left
  g = ctx.createLinearGradient(0, 0, t, 0)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, t, CANVAS_HEIGHT)
  // right
  g = ctx.createLinearGradient(CANVAS_WIDTH, 0, CANVAS_WIDTH - t, 0)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(CANVAS_WIDTH - t, 0, t, CANVAS_HEIGHT)
  ctx.restore()

  // Warning banner under the heat readout (only at active+, the real "act now"
  // line). Sits in the band between the heat readout and the top node row, and
  // is right-clamped so it never reaches the top-right legend panel.
  if (stage === 'active' || stage === 'overwhelming') {
    const msg =
      stage === 'overwhelming'
        ? 'OVERWHELMING — ESCAPE NOW or go Dormant (D)!'
        : 'HEAT: ACTIVE — go Dormant (D) or Escape!'
    const bx = 172
    const bw = 384          // right edge 556, clear of the legend at x≈564
    const by = 92
    ctx.save()
    ctx.globalAlpha = 0.85 + 0.15 * pulse
    ctx.fillStyle = stage === 'overwhelming' ? COLORS.heatHigh : COLORS.heatMid
    ctx.fillRect(bx, by, bw, 26)
    ctx.fillStyle = '#0a0a0a'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(msg, bx + bw / 2, by + 13)
    ctx.restore()
  }
}

// ─── Heat bar ────────────────────────────────────────────────────────────────

function drawHeatBar(ctx: CanvasRenderingContext2D, state: GameState): void {
  const stage = heatStage(state.heat)

  // Geometry of the bar. It lives between the top-left HUD (ends ~x162) and the
  // top-right legend (starts ~x564), and its stage/value readout sits BELOW the
  // bar so nothing collides with the legend on the right.
  const barX = 188
  const barY = 30
  const barW = 300
  const barH = 24

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
    ctx.fillText(label, tx, barY + barH + 14)
  }

  // Current stage label + numeric heat, centered BELOW the bar (clear of the
  // legend on the right). Threshold tick labels are at barY+barH+14; this sits
  // one line lower so they don't overlap.
  ctx.fillStyle = fillColor
  ctx.font = 'bold 15px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `${stage.toUpperCase()}   ·   heat ${Math.round(state.heat)}`,
    barX + barW / 2,
    barY + barH + 30,
  )
}

// ─── HUD (biomass / tick / dormant / pause) ─────────────────────────────────

function drawHud(ctx: CanvasRenderingContext2D, state: GameState, paused: boolean): void {
  const ownedCount = state.map.zones.filter(z => z.owner === 'you').length

  // Top-left stats panel (kept well inside the left/top margins).
  const x = 12
  const y = 14
  const w = 150
  const h = 96
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = COLORS.neutralRing
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 13px monospace'
  ctx.fillText(`TICK    ${state.tick}`, x + 10, y + 22)
  ctx.fillText(`BIOMASS ${state.biomass}`, x + 10, y + 42)
  ctx.fillText(`ZONES   ${ownedCount}`, x + 10, y + 62)

  // Dormant indicator (bright, unmissable).
  if (state.dormant) {
    ctx.fillStyle = COLORS.glandRing
    ctx.font = 'bold 13px monospace'
    ctx.fillText('● DORMANT', x + 10, y + 84)
  } else {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '13px monospace'
    ctx.fillText('  active', x + 10, y + 84)
  }

  // Pause badge (top-right corner, inside margin).
  if (paused) {
    ctx.fillStyle = COLORS.heatMid
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('|| PAUSED', CANVAS_WIDTH - 16, 24)
  }
}

// ─── Persistent legend (always-on key + goal) ────────────────────────────────

/**
 * A compact, always-visible legend in the top-right. Explains the colors and
 * what a portal is, plus a one-line goal reminder, so a first-time player never
 * has to guess what they are looking at. Fully inside the canvas margins.
 */
function drawLegend(ctx: CanvasRenderingContext2D): void {
  const w = 224
  const h = 104
  const x = CANVAS_WIDTH - w - 12
  const y = 44

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = COLORS.neutralRing
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)

  const sx = x + 14          // swatch center x
  let ly = y + 18            // first row center y
  const rowH = 19
  const tx = x + 28          // label x

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = '12px monospace'

  const swatch = (color: string, ring: string) => {
    ctx.beginPath()
    ctx.arc(sx, ly, 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = ring
    ctx.stroke()
  }

  // Row 1 — your hold
  swatch(COLORS.ownedFill, COLORS.ownedRing)
  ctx.fillStyle = COLORS.text
  ctx.fillText('YOU (infected zone)', tx, ly)

  // Row 2 — neutral
  ly += rowH
  swatch(COLORS.neutralFill, COLORS.neutralRing)
  ctx.fillStyle = COLORS.text
  ctx.fillText('neutral (clickable)', tx, ly)

  // Row 3 — portal
  ly += rowH
  ctx.beginPath()
  ctx.arc(sx, ly, 6, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.neutralFill
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.portalRing
  ctx.stroke()
  ctx.fillStyle = COLORS.text
  ctx.fillText('PORTAL = escape exit', tx, ly)

  // Row 4 — barrier
  ly += rowH
  ctx.strokeStyle = COLORS.barrier
  ctx.lineWidth = 3
  ctx.setLineDash([5, 3])
  ctx.beginPath()
  ctx.moveTo(sx - 6, ly)
  ctx.lineTo(sx + 6, ly)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = COLORS.text
  ctx.fillText('LOCKED barrier', tx, ly)

  // Goal line at the bottom of the panel.
  ly += rowH
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 11px monospace'
  ctx.fillText('GOAL: reach a PORTAL, escape', x + 12, ly)
}

// ─── Controls hint (bottom strip) ────────────────────────────────────────────

function drawControlsHint(ctx: CanvasRenderingContext2D): void {
  // Two shorter lines so nothing runs off the right edge at 800px wide.
  const h = 40
  const top = CANVAS_HEIGHT - h
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(0, top, CANVAS_WIDTH, h)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    'click a zone → spread   ·   click LOCKED edge → breach   ·   click your PORTAL → escape',
    CANVAS_WIDTH / 2,
    top + 13,
  )
  ctx.fillText(
    'D → go Dormant (cool Heat)   ·   Space → pause',
    CANVAS_WIDTH / 2,
    top + 29,
  )
}

// ─── Loud click-feedback banner ──────────────────────────────────────────────

/**
 * Big, obvious banner naming the player's current command, e.g.
 * "SPREADING → VESSEL A", "BREACHING…", "ESCAPING". Sits just above the
 * controls strip so it never collides with the heat bar or warning banner.
 */
function drawActionBanner(ctx: CanvasRenderingContext2D, action: LastAction): void {
  const color =
    action.kind === 'escape' ? COLORS.portalRing
      : action.kind === 'breach' ? COLORS.barrier
        : action.kind === 'dormancy' ? COLORS.glandRing
          : COLORS.infection

  const text = action.label
  ctx.save()
  ctx.font = 'bold 22px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(CANVAS_WIDTH - 40, ctx.measureText(text).width + 48)
  const h = 38
  const x = (CANVAS_WIDTH - w) / 2
  const y = CANVAS_HEIGHT - 40 - h - 10

  ctx.fillStyle = COLORS.panelStrong
  ctx.fillRect(x, y, w, h)
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillText(text, CANVAS_WIDTH / 2, y + h / 2 + 1)
  ctx.restore()
}

// ─── Onboarding overlay (shown on load, before the dive begins) ───────────────

/**
 * A one-screen orientation overlay. It explains who the player is, the goal,
 * and the controls, and invites a click to begin. While this is up the sim is
 * frozen (main.ts holds `started=false`), so Heat does NOT rise during reading.
 */
function drawOnboarding(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.fillStyle = 'rgba(2, 8, 14, 0.92)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const cx = CANVAS_WIDTH / 2

  // Title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.infection
  ctx.font = 'bold 34px monospace'
  ctx.fillText('YOU ARE THE INFECTION', cx, 78)

  ctx.fillStyle = COLORS.textDim
  ctx.font = '15px monospace'
  ctx.fillText('A dive into the body — you start as a tiny foothold at ENTRY.', cx, 112)

  // Goal block
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 18px monospace'
  ctx.fillText('GOAL', cx, 158)
  ctx.fillStyle = COLORS.text
  ctx.font = '15px monospace'
  ctx.fillText('Spread to a PORTAL and ESCAPE to bank virality —', cx, 184)
  ctx.fillText("before Heat fills the bar and you're CAUGHT.", cx, 206)

  // Controls block — left-aligned list, centered as a group.
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 18px monospace'
  ctx.fillText('CONTROLS', cx, 252)

  const lines: Array<[string, string]> = [
    ['click an adjacent zone', 'spread your infection into it'],
    ['click the LOCKED edge', 'breach through a barrier'],
    ['click your PORTAL', 'escape and bank your score'],
    ['press  D', 'go Dormant — cools Heat, halts spread'],
    ['press  Space', 'pause / unpause'],
  ]
  const listX = cx - 250
  let ly = 286
  ctx.textAlign = 'left'
  for (const [key, desc] of lines) {
    ctx.fillStyle = COLORS.infection
    ctx.font = 'bold 14px monospace'
    ctx.fillText(key.padEnd(24, ' '), listX, ly)
    ctx.fillStyle = COLORS.text
    ctx.font = '14px monospace'
    ctx.fillText('→  ' + desc, listX + 230, ly)
    ly += 26
  }

  // Heat explainer.
  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.heatMid
  ctx.font = '14px monospace'
  ctx.fillText('Heat rises while you hold zones. Go Dormant to cool it. Escape before it fills.', cx, ly + 18)

  // Call to action (pulse-free; the static prompt is clear enough).
  ctx.fillStyle = COLORS.heatLow
  ctx.font = 'bold 22px monospace'
  ctx.fillText('▶  Click anywhere to begin', cx, CANVAS_HEIGHT - 52)
  ctx.restore()
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
