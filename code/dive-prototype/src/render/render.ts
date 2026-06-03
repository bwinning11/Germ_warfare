// render.ts — Draws the whole enriched dive to a 2D canvas from a GameState.
//
// Pure presentation: it reads GameState (never mutates it) plus a small
// RenderInfo bundle from main.ts, and paints. All simulation lives in src/sim;
// all input lives in src/input.
//
// Legibility is priority #1 (a non-technical player must understand one frame):
//   • owner + HOT vs DORMANT per node (bright/pulsing vs dimmed "Zzz")
//   • connectivity — core-connected nodes glow on a network spine; cut-off
//     owned nodes are ringed in alarm orange and tagged "CUT OFF"
//   • the live income multiplier ("×1.8") in the HUD
//   • Brutes (shield) and Cysts (hex) drawn on their nodes
//   • the NUTRIENT pickup, and its "collected" state
//   • barriers: LOCKED (dashed red, "click to breach") vs breached (faint)
//   • the immune responder, with its target
//   • a Heat bar + named stage, biomass/tick/zones
//   • a SELECTED node read-out with its available actions and biomass costs
//   • a persistent legend + goal, and a one-line tip strip
//   • a start-paused onboarding overlay and an end-of-dive result overlay
//
// Palette: a cold clinical body (deep blues/teal) with one bright "infection"
// magenta for the player's hold.

import type { GameState, Zone, ZoneId } from '../sim/types'
import { heatStage } from '../sim/heat'
import {
  HEAT_THRESHOLD_ALERTED,
  HEAT_THRESHOLD_ACTIVE,
  HEAT_THRESHOLD_OVERWHELMING,
} from '../sim/heat'
import { coreConnected, hotConnected, connectedMultiplier } from '../sim/network'
import { BRUTE_COST, CYST_COST } from '../sim/immune'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  NODE_RADIUS,
  HUD_BAND_H,
  PANEL_W,
  PANEL_X,
  PANEL_Y,
  TIP_STRIP_H,
  TIP_STRIP_Y,
  ZONE_LABEL,
  zonePos,
} from './layout'

// ─── Render-side info (presentation only; never touches the sim) ─────────────

/** What the player most recently commanded — drives the loud feedback banner. */
export interface LastAction {
  kind: 'colonize' | 'breach' | 'escape' | 'dormancy' | 'brute' | 'cyst' | 'select'
  /** Big banner text, e.g. "SPREADING → ARTERY A". */
  label: string
  /** Zone to visibly highlight, if any. */
  targetZone?: ZoneId
}

/** Presentation state passed from main.ts each frame. */
export interface RenderInfo {
  /** False until the player dismisses onboarding. While false the sim is frozen. */
  started: boolean
  /** The most recent player command, or null. Used for highlight + banner. */
  lastAction: LastAction | null
  /** The currently selected owned node (keys act on it), or null. */
  selected: ZoneId | null
  /** Monotonic time in ms (performance.now) — drives pulsing animations. */
  nowMs: number
}

// ─── Palette ───────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#06121f',
  graphBg: '#081a2b',
  edge: '#2b5878',          // open passage
  edgeSpine: '#ff6fbf',     // network spine: open edge between two core-connected nodes
  barrier: '#ff4d5e',       // locked barrier (dashed)
  barrierBreached: '#37557a', // a barrier that has been opened (faint)
  neutralFill: '#123047',
  neutralRing: '#3d6e92',
  ownedFill: '#b1126b',     // player-held hot zone (bright)
  ownedFillDormant: '#4a2a40', // player-held dormant zone (dim)
  ownedRing: '#ff5fb0',
  ownedRingDormant: '#9c6f8a',
  cutoffRing: '#ffae42',    // owned but severed from core (alarm orange)
  infection: '#ff3d9a',     // in-progress infection accent
  portalRing: '#ffd166',    // portals: gold
  glandRing: '#7be0c8',     // gland: teal
  pickupRing: '#9be870',    // pickup: green
  responder: '#e8f6ff',
  responderRing: '#9fd2ff',
  brute: '#6fd3ff',         // Brute marker (shield)
  cyst: '#c89bff',          // Cyst marker (hex)
  health: '#ff7ac0',        // standing-infection (hold "health") bar
  text: '#dcefff',
  textDim: '#7fa8c9',
  textFaint: '#557a98',
  heatLow: '#37c97a',
  heatMid: '#f4c542',
  heatHigh: '#ff4d5e',
  panel: 'rgba(4, 16, 28, 0.92)',
  panelStrong: 'rgba(3, 11, 20, 0.96)',
  panelLine: '#1d4663',
  highlight: '#ffe27a',     // click-feedback / target highlight
  selectRing: '#ffffff',    // selected-node ring
  good: '#37c97a',
  bad: '#ff4d5e',
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  paused = false,
  info: RenderInfo = { started: true, lastAction: null, selected: null, nowMs: 0 },
): void {
  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Graph backdrop (the central play area, clear of HUD/panel/tip).
  ctx.fillStyle = COLORS.graphBg
  ctx.fillRect(0, HUD_BAND_H, PANEL_X, TIP_STRIP_Y - HUD_BAND_H)

  const cc = coreConnected(state)
  const hc = hotConnected(state)

  drawEdges(ctx, state, cc)
  drawZones(ctx, state, info, cc)
  drawResponders(ctx, state, info.nowMs)

  // Heat warning glow (behind HUD chrome, over the board).
  if (state.result === 'ongoing' && info.started) {
    drawHeatWarning(ctx, state, info.nowMs)
  }

  drawHudBand(ctx, state, hc, paused)
  drawSidePanel(ctx, state, info)
  drawTipStrip(ctx, state, info)

  if (state.result === 'ongoing' && info.started && info.lastAction) {
    drawActionBanner(ctx, info.lastAction)
  }

  if (!info.started && state.result === 'ongoing') {
    drawOnboarding(ctx, info.nowMs)
  }

  if (state.result !== 'ongoing') {
    drawResultOverlay(ctx, state)
  }
}

// ─── Edges ───────────────────────────────────────────────────────────────────

function drawEdges(ctx: CanvasRenderingContext2D, state: GameState, cc: Set<ZoneId>): void {
  const seen = new Set<string>()

  for (const e of state.map.edges) {
    const key = [e.from, e.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    const a = zonePos(e.from)
    const b = zonePos(e.to)

    if (e.barrier) {
      // Locked barrier — bright red dashed, with a "click to breach" badge.
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
      drawBadge(ctx, mx, my, ['LOCKED', 'click to breach'], COLORS.barrier, '#1a0608')
    } else {
      // Open passage. Highlight the network spine: open edges where BOTH ends
      // are core-connected to entry glow magenta (your living supply line).
      const spine = cc.has(e.from) && cc.has(e.to)
      ctx.strokeStyle = spine ? COLORS.edgeSpine : COLORS.edge
      ctx.lineWidth = spine ? 6 : 4
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lines: string[],
  fill: string,
  textColor: string,
): void {
  ctx.save()
  ctx.font = 'bold 11px monospace'
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14
  const h = lines.length * 14 + 8
  ctx.fillStyle = fill
  ctx.globalAlpha = 0.95
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 5)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => {
    ctx.fillText(l, cx, cy - h / 2 + 4 + 7 + i * 14)
  })
  ctx.restore()
}

// ─── Zones ───────────────────────────────────────────────────────────────────

function drawZones(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  info: RenderInfo,
  cc: Set<ZoneId>,
): void {
  for (const z of state.map.zones) {
    drawZone(ctx, z, state, info, cc)
  }
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  z: Zone,
  state: GameState,
  info: RenderInfo,
  cc: Set<ZoneId>,
): void {
  const p = zonePos(z.id)
  const owned = z.owner === 'you'
  const dormant = owned && state.dormant.has(z.id)
  const hot = owned && !dormant
  const connected = owned && cc.has(z.id)
  const cutoff = owned && !connected // owned but no owned-open path back to entry
  const isSelected = info.selected === z.id

  // Loud click-feedback: pulsing highlight ring around the action target.
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

  // HOT nodes pulse gently so they read as "alive / producing".
  let bodyFill: string
  if (!owned) bodyFill = COLORS.neutralFill
  else if (dormant) bodyFill = COLORS.ownedFillDormant
  else bodyFill = COLORS.ownedFill

  ctx.save()
  if (hot) {
    const pulse = 0.5 + 0.5 * Math.sin(info.nowMs / 360)
    ctx.shadowColor = COLORS.ownedRing
    ctx.shadowBlur = 8 + pulse * 10
  }
  ctx.beginPath()
  ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = bodyFill
  ctx.fill()
  ctx.restore()

  // Colonize progress on a still-neutral target: a growing pie wedge.
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

  // Owner ring (dim if dormant).
  ctx.lineWidth = 3
  ctx.strokeStyle = !owned ? COLORS.neutralRing : dormant ? COLORS.ownedRingDormant : COLORS.ownedRing
  ctx.beginPath()
  ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2)
  ctx.stroke()

  // Kind ring (portal gold / gland teal / pickup green) just outside the body.
  if (z.kind === 'portal' || z.kind === 'gland' || z.kind === 'pickup') {
    ctx.save()
    ctx.lineWidth = 3
    ctx.strokeStyle =
      z.kind === 'portal' ? COLORS.portalRing : z.kind === 'gland' ? COLORS.glandRing : COLORS.pickupRing
    if (z.kind !== 'portal') ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // CUT-OFF alarm ring for owned-but-severed nodes (the "you got severed" tell).
  if (cutoff) {
    const pulse = 0.5 + 0.5 * Math.sin(info.nowMs / 160)
    ctx.save()
    ctx.strokeStyle = COLORS.cutoffRing
    ctx.globalAlpha = 0.6 + 0.4 * pulse
    ctx.lineWidth = 4
    ctx.setLineDash([7, 5])
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 11, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // Selected-node bright white ring.
  if (isSelected) {
    ctx.save()
    ctx.strokeStyle = COLORS.selectRing
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(p.x, p.y, NODE_RADIUS + 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // ── In-node glyphs ──────────────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Center label: state of the node.
  if (owned) {
    if (z.kind === 'portal') {
      ctx.fillStyle = COLORS.portalRing
      ctx.font = 'bold 11px monospace'
      ctx.fillText('ESCAPE', p.x, p.y - 4)
    } else {
      ctx.fillStyle = COLORS.text
      ctx.font = 'bold 10px monospace'
      ctx.fillText('YOURS', p.x, p.y - 4)
    }
    // HOT / Zzz indicator below center.
    if (dormant) {
      ctx.fillStyle = COLORS.glandRing
      ctx.font = 'bold 12px monospace'
      ctx.fillText('Zzz', p.x, p.y + 10)
    } else {
      ctx.fillStyle = COLORS.ownedRing
      ctx.font = 'bold 9px monospace'
      ctx.fillText('● HOT', p.x, p.y + 10)
    }
  }

  // Standing-infection ("hold health") mini-bar under owned nodes — shows the
  // immune system grinding a hold down before it severs.
  if (owned && z.infection > 0) {
    const bw = NODE_RADIUS * 1.7
    const bh = 5
    const bx = p.x - bw / 2
    const by = p.y + NODE_RADIUS - 1
    ctx.fillStyle = '#0c2236'
    ctx.fillRect(bx, by, bw, bh)
    const frac = Math.max(0, Math.min(1, z.infection / 100))
    ctx.fillStyle = COLORS.health
    ctx.fillRect(bx, by, bw * frac, bh)
  }

  // Brute (shield, left shoulder) and Cyst (hex, right shoulder) markers.
  if (state.brutes.has(z.id)) drawBruteGlyph(ctx, p.x - NODE_RADIUS - 2, p.y - NODE_RADIUS - 2)
  if (state.cysts.has(z.id)) drawCystGlyph(ctx, p.x + NODE_RADIUS + 2, p.y - NODE_RADIUS - 2)

  // ── Labels outside the node ───────────────────────────────────────────────
  // Kind tag above.
  ctx.font = '10px monospace'
  if (z.kind === 'portal') {
    ctx.fillStyle = COLORS.portalRing
    ctx.fillText('PORTAL', p.x, p.y - NODE_RADIUS - 13)
  } else if (z.kind === 'gland') {
    ctx.fillStyle = COLORS.glandRing
    ctx.fillText('GLAND', p.x, p.y - NODE_RADIUS - 13)
  } else if (z.kind === 'pickup') {
    ctx.fillStyle = COLORS.pickupRing
    const collected = state.collectedPickups.has(z.id)
    ctx.fillText(collected ? 'COLLECTED' : '+BIOMASS', p.x, p.y - NODE_RADIUS - 13)
  }

  // Name label below.
  ctx.fillStyle = owned ? COLORS.text : COLORS.textDim
  ctx.font = 'bold 13px monospace'
  ctx.fillText(ZONE_LABEL[z.id] ?? z.id, p.x, p.y + NODE_RADIUS + 16)

  // Status line below name: progress, cut-off, or hint.
  const cp = state.colonizeProgress[z.id]
  const bp = state.breachProgress[z.id]
  ctx.font = 'bold 10px monospace'
  if (cp && cp > 0) {
    ctx.fillStyle = COLORS.infection
    ctx.fillText(`spreading ${cp}/2`, p.x, p.y + NODE_RADIUS + 30)
  } else if (bp && bp > 0) {
    ctx.fillStyle = COLORS.barrier
    ctx.fillText(`breaching ${bp}/2`, p.x, p.y + NODE_RADIUS + 30)
  } else if (cutoff) {
    ctx.fillStyle = COLORS.cutoffRing
    ctx.fillText('CUT OFF', p.x, p.y + NODE_RADIUS + 30)
  }
}

function drawBruteGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  // shield
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(8, -4)
  ctx.lineTo(8, 4)
  ctx.lineTo(0, 9)
  ctx.lineTo(-8, 4)
  ctx.lineTo(-8, -4)
  ctx.closePath()
  ctx.fillStyle = COLORS.brute
  ctx.fill()
  ctx.strokeStyle = '#0a2030'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#0a2030'
  ctx.font = 'bold 9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('B', 0, 1)
  ctx.restore()
}

function drawCystGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const x = Math.cos(a) * 9
    const y = Math.sin(a) * 9
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = COLORS.cyst
  ctx.fill()
  ctx.strokeStyle = '#1a0f2a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#1a0f2a'
  ctx.font = 'bold 9px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('C', 0, 1)
  ctx.restore()
}

// ─── Responders ────────────────────────────────────────────────────────────

function drawResponders(ctx: CanvasRenderingContext2D, state: GameState, nowMs: number): void {
  for (const r of state.responders) {
    const p = zonePos(r.zone)
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 120)
    // Diamond marker pinned below-right of the node, clear of glyphs/labels.
    const cx = p.x + NODE_RADIUS + 14
    const cy = p.y + 6
    const s = 13
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = COLORS.responder
    ctx.globalAlpha = 0.7 + 0.3 * pulse
    ctx.strokeStyle = COLORS.responderRing
    ctx.lineWidth = 2
    ctx.fillRect(-s / 2, -s / 2, s, s)
    ctx.strokeRect(-s / 2, -s / 2, s, s)
    ctx.restore()

    ctx.fillStyle = COLORS.responderRing
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('IMMUNE', cx + 12, cy)
  }
}

// ─── Heat warning (escalating danger telegraph) ──────────────────────────────

function drawHeatWarning(ctx: CanvasRenderingContext2D, state: GameState, nowMs: number): void {
  const stage = heatStage(state.heat)
  if (stage === 'calm') return

  const speed = stage === 'overwhelming' ? 80 : stage === 'active' ? 140 : 240
  const baseAlpha = stage === 'overwhelming' ? 0.5 : stage === 'active' ? 0.34 : 0.18
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / speed)
  const alpha = baseAlpha * (0.55 + 0.45 * pulse)
  const color = stage === 'alerted' ? COLORS.heatMid : COLORS.heatHigh

  const t = stage === 'overwhelming' ? 64 : stage === 'active' ? 44 : 28
  ctx.save()
  ctx.globalAlpha = alpha
  let g = ctx.createLinearGradient(0, 0, 0, t)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_WIDTH, t)
  g = ctx.createLinearGradient(0, CANVAS_HEIGHT, 0, CANVAS_HEIGHT - t)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, CANVAS_HEIGHT - t, CANVAS_WIDTH, t)
  g = ctx.createLinearGradient(0, 0, t, 0)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, t, CANVAS_HEIGHT)
  g = ctx.createLinearGradient(CANVAS_WIDTH, 0, CANVAS_WIDTH - t, 0)
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g; ctx.fillRect(CANVAS_WIDTH - t, 0, t, CANVAS_HEIGHT)
  ctx.restore()
}

// ─── Top HUD band (tick / biomass / zones / heat / multiplier / stage) ───────

function drawHudBand(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  hc: Set<ZoneId>,
  paused: boolean,
): void {
  // Band background.
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_BAND_H)
  ctx.strokeStyle = COLORS.panelLine
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HUD_BAND_H); ctx.lineTo(CANVAS_WIDTH, HUD_BAND_H); ctx.stroke()

  const ownedCount = state.map.zones.filter(z => z.owner === 'you').length
  const mult = connectedMultiplier(hc.size)

  // Left stats cluster.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`BIOMASS ${Math.floor(state.biomass)}`, 16, 22)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px monospace'
  ctx.fillText(`zones ${ownedCount}   ·   tick ${state.tick}`, 16, 44)

  // Income multiplier — bright, with hot-connected count.
  ctx.textAlign = 'left'
  ctx.fillStyle = mult > 1 ? COLORS.edgeSpine : COLORS.textDim
  ctx.font = 'bold 18px monospace'
  ctx.fillText(`×${mult.toFixed(1)}`, 200, 24)
  ctx.fillStyle = COLORS.textDim
  ctx.font = '11px monospace'
  ctx.fillText('income', 200, 44)
  ctx.fillText(`${hc.size} hot connected`, 200, 57)

  // Heat bar (center of the band).
  drawHeatBar(ctx, state)

  // Pause badge.
  if (paused) {
    ctx.fillStyle = COLORS.heatMid
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('|| PAUSED', CANVAS_WIDTH - 16, 22)
  }
}

function drawHeatBar(ctx: CanvasRenderingContext2D, state: GameState): void {
  const stage = heatStage(state.heat)

  const barX = 320
  const barY = 18
  const barW = 420
  const barH = 20

  const max = HEAT_THRESHOLD_OVERWHELMING + 10
  const clamp = Math.max(0, Math.min(state.heat, max))
  const fillW = (clamp / max) * barW

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 12px monospace'
  ctx.fillText('HEAT (immune alarm)', barX, barY - 5)

  ctx.fillStyle = '#0c2236'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.strokeStyle = COLORS.neutralRing
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barY, barW, barH)

  const fillColor =
    stage === 'overwhelming' ? COLORS.heatHigh
      : stage === 'active' ? COLORS.heatHigh
        : stage === 'alerted' ? COLORS.heatMid
          : COLORS.heatLow
  ctx.fillStyle = fillColor
  ctx.fillRect(barX, barY, fillW, barH)

  const thresholds: Array<[number, string]> = [
    [HEAT_THRESHOLD_ALERTED, 'alerted'],
    [HEAT_THRESHOLD_ACTIVE, 'active'],
    [HEAT_THRESHOLD_OVERWHELMING, 'caught'],
  ]
  ctx.font = '9px monospace'
  for (const [t, label] of thresholds) {
    const tx = barX + (t / max) * barW
    ctx.strokeStyle = COLORS.text
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tx, barY - 2)
    ctx.lineTo(tx, barY + barH + 2)
    ctx.stroke()
    ctx.fillStyle = COLORS.textDim
    ctx.textAlign = 'center'
    ctx.fillText(label, tx, barY + barH + 12)
  }

  // Stage + numeric readout to the right of the bar.
  ctx.fillStyle = fillColor
  ctx.font = 'bold 13px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${stage.toUpperCase()} ${Math.round(state.heat)}`, barX + barW + 12, barY + barH / 2 + 4)
}

// ─── Right side panel (legend · selected node · actions · goal) ──────────────

function drawSidePanel(ctx: CanvasRenderingContext2D, state: GameState, info: RenderInfo): void {
  const x = PANEL_X
  const y = PANEL_Y
  const w = PANEL_W
  const h = TIP_STRIP_Y - PANEL_Y - 8

  ctx.fillStyle = COLORS.panel
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = COLORS.panelLine
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)

  const pad = 14
  let cy = y + 22

  // ── Selected-node read-out + actions ──────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 13px monospace'
  ctx.fillText('SELECTED NODE', x + pad, cy)
  cy += 22

  const sel = info.selected ? state.map.zones.find(z => z.id === info.selected) : null
  if (sel && sel.owner === 'you') {
    const dormant = state.dormant.has(sel.id)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 15px monospace'
    ctx.fillText(ZONE_LABEL[sel.id] ?? sel.id, x + pad, cy)
    cy += 18
    ctx.fillStyle = COLORS.textDim
    ctx.font = '11px monospace'
    const mode = dormant ? 'DORMANT (cooling, no income)' : 'HOT (earning + raising heat)'
    ctx.fillText(mode, x + pad, cy)
    cy += 16
    if (state.brutes.has(sel.id) || state.cysts.has(sel.id)) {
      const def = [
        state.brutes.has(sel.id) ? 'Brute' : null,
        state.cysts.has(sel.id) ? 'Cyst' : null,
      ].filter(Boolean).join(' + ')
      ctx.fillStyle = COLORS.brute
      ctx.fillText(`fortified: ${def}`, x + pad, cy)
      cy += 16
    }
    cy += 6

    // Action list with keys + costs, greyed when unaffordable.
    const canAffordBrute = state.biomass >= BRUTE_COST && !state.brutes.has(sel.id)
    const canAffordCyst = state.biomass >= CYST_COST && !state.cysts.has(sel.id)
    const actions: Array<[string, string, boolean]> = [
      ['D', dormant ? 'wake (go HOT)' : 'go Dormant', true],
      ['B', state.brutes.has(sel.id) ? `Brute (placed)` : `deploy Brute  −${BRUTE_COST}`, canAffordBrute],
      ['C', state.cysts.has(sel.id) ? `Cyst (placed)` : `build Cyst  −${CYST_COST}`, canAffordCyst],
    ]
    for (const [key, desc, enabled] of actions) {
      // key chip
      ctx.fillStyle = enabled ? COLORS.highlight : '#2a3f52'
      roundRect(ctx, x + pad, cy - 11, 18, 16, 3)
      ctx.fill()
      ctx.fillStyle = '#0a1622'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(key, x + pad + 9, cy + 1)
      // desc
      ctx.textAlign = 'left'
      ctx.fillStyle = enabled ? COLORS.text : COLORS.textFaint
      ctx.font = '12px monospace'
      ctx.fillText(desc, x + pad + 26, cy + 1)
      cy += 22
    }
  } else {
    ctx.fillStyle = COLORS.textDim
    ctx.font = '12px monospace'
    cy = wrapText(ctx, 'Click one of YOUR nodes to select it, then press D / B / C.', x + pad, cy, w - pad * 2, 16)
    cy += 4
  }

  // Divider.
  cy += 6
  ctx.strokeStyle = COLORS.panelLine
  ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke()
  cy += 22

  // ── Legend ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 13px monospace'
  ctx.fillText('LEGEND', x + pad, cy)
  cy += 20

  const sx = x + pad + 7
  const tx = x + pad + 22
  const row = (draw: () => void, label: string, color = COLORS.text) => {
    draw()
    ctx.fillStyle = color
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, tx, cy)
    cy += 18
  }
  const dot = (fill: string, ring: string) => () => {
    ctx.beginPath(); ctx.arc(sx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = fill; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke()
  }

  row(dot(COLORS.ownedFill, COLORS.ownedRing), 'YOU · HOT (earns, heats)')
  row(dot(COLORS.ownedFillDormant, COLORS.ownedRingDormant), 'YOU · Dormant (Zzz, safe)')
  row(() => {
    ctx.beginPath(); ctx.arc(sx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.ownedFill; ctx.fill()
    ctx.lineWidth = 2.5; ctx.strokeStyle = COLORS.cutoffRing
    ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([])
  }, 'CUT OFF (no income)', COLORS.cutoffRing)
  row(dot(COLORS.neutralFill, COLORS.neutralRing), 'neutral (click to spread)')
  row(() => {
    ctx.beginPath(); ctx.arc(sx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.neutralFill; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = COLORS.portalRing; ctx.stroke()
  }, 'PORTAL = escape exit', COLORS.portalRing)
  row(() => {
    ctx.beginPath(); ctx.arc(sx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.neutralFill; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = COLORS.pickupRing; ctx.stroke()
  }, 'NUTRIENT = +biomass', COLORS.pickupRing)
  row(() => {
    ctx.strokeStyle = COLORS.barrier; ctx.lineWidth = 3
    ctx.setLineDash([5, 3]); ctx.beginPath()
    ctx.moveTo(sx - 7, cy); ctx.lineTo(sx + 7, cy); ctx.stroke(); ctx.setLineDash([])
  }, 'LOCKED barrier (breach)', COLORS.barrier)
  row(() => {
    ctx.beginPath(); ctx.moveTo(sx, cy - 7); ctx.lineTo(sx + 6, cy - 3)
    ctx.lineTo(sx + 6, cy + 3); ctx.lineTo(sx, cy + 7); ctx.lineTo(sx - 6, cy + 3)
    ctx.lineTo(sx - 6, cy - 3); ctx.closePath()
    ctx.fillStyle = COLORS.brute; ctx.fill()
  }, 'Brute shield / Cyst hex', COLORS.brute)
  row(() => {
    ctx.save(); ctx.translate(sx, cy); ctx.rotate(Math.PI / 4)
    ctx.fillStyle = COLORS.responder; ctx.fillRect(-5, -5, 10, 10)
    ctx.strokeStyle = COLORS.responderRing; ctx.lineWidth = 1.5; ctx.strokeRect(-5, -5, 10, 10)
    ctx.restore()
  }, 'IMMUNE responder', COLORS.responderRing)

  // ── Goal at the bottom of the panel ────────────────────────────────────────
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const goalY = y + h - 40
  ctx.fillText('GOAL', x + pad, goalY)
  ctx.fillStyle = COLORS.text
  ctx.font = '11px monospace'
  wrapText(ctx, 'Spread to a PORTAL, then escape to bank virality — before HEAT fills.', x + pad, goalY + 16, w - pad * 2, 14)
}

// ─── Bottom tip strip (always-on "next action") ──────────────────────────────

function drawTipStrip(ctx: CanvasRenderingContext2D, state: GameState, info: RenderInfo): void {
  ctx.fillStyle = COLORS.panelStrong
  ctx.fillRect(0, TIP_STRIP_Y, CANVAS_WIDTH, TIP_STRIP_H)
  ctx.strokeStyle = COLORS.panelLine
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, TIP_STRIP_Y); ctx.lineTo(CANVAS_WIDTH, TIP_STRIP_Y); ctx.stroke()

  const tip = nextTip(state, info)
  ctx.fillStyle = COLORS.highlight
  ctx.font = 'bold 15px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(tip, CANVAS_WIDTH / 2, TIP_STRIP_Y + 19)

  // Static controls reminder underneath.
  ctx.fillStyle = COLORS.textDim
  ctx.font = '11px monospace'
  ctx.fillText(
    'click neutral → spread   ·   click LOCKED edge → breach   ·   click YOUR node → select   ·   D dorm · B brute · C cyst   ·   click PORTAL → escape   ·   Space pause',
    CANVAS_WIDTH / 2,
    TIP_STRIP_Y + 41,
  )
}

/** Picks the single most relevant next-action hint for the current state. */
function nextTip(state: GameState, info: RenderInfo): string {
  const stage = heatStage(state.heat)
  const owned = state.map.zones.filter(z => z.owner === 'you')
  const ownedPortals = owned.filter(z => z.kind === 'portal')
  const ownedOrgan = ownedPortals.some(z => z.id !== 'entry')

  // Danger first.
  if (stage === 'overwhelming') return 'OVERWHELMED! Click an owned PORTAL to ESCAPE right now!'
  if (state.responders.length > 0) {
    const tgt = state.responders[0].zone
    const zone = state.map.zones.find(z => z.id === tgt)
    const label = ZONE_LABEL[tgt] ?? tgt
    // Only warn about a node being ground down if it actually has infection to
    // lose (your infection-0 ENTRY core can't be cleared — no false alarm there).
    if (zone && zone.infection > 0 && !state.cysts.has(tgt)) {
      return `IMMUNE is clearing ${label} — fortify it (select, press B/C) or escape.`
    }
    if (zone && zone.infection > 0) {
      return `IMMUNE is grinding ${label}, but your Cyst is holding. Keep pushing.`
    }
  }
  if (stage === 'active') return 'HEAT is high — go Dormant (select a node, press D) or escape soon.'

  // Progression.
  if (ownedOrgan) return 'You hold an ORGAN portal — click it to ESCAPE and bank your score.'
  if (owned.length === 1) return 'Click a neighbouring ARTERY to spread into it (2 ticks to capture).'
  if (!info.selected) return 'Push toward an ORGAN. Tip: click one of YOUR nodes to manage it (D/B/C).'
  return 'Keep spreading toward an ORGAN portal, then escape. Watch the HEAT bar.'
}

// ─── Loud click-feedback banner ──────────────────────────────────────────────

function drawActionBanner(ctx: CanvasRenderingContext2D, action: LastAction): void {
  const color =
    action.kind === 'escape' ? COLORS.portalRing
      : action.kind === 'breach' ? COLORS.barrier
        : action.kind === 'dormancy' ? COLORS.glandRing
          : action.kind === 'brute' ? COLORS.brute
            : action.kind === 'cyst' ? COLORS.cyst
              : action.kind === 'select' ? COLORS.selectRing
                : COLORS.infection

  const text = action.label
  ctx.save()
  ctx.font = 'bold 22px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = Math.min(PANEL_X - 60, ctx.measureText(text).width + 48)
  const h = 38
  // Centered over the graph area, just under the HUD band.
  const x = (PANEL_X - w) / 2
  const y = HUD_BAND_H + 16

  ctx.fillStyle = COLORS.panelStrong
  roundRect(ctx, x, y, w, h, 6)
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = color
  roundRect(ctx, x, y, w, h, 6)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fillText(text, PANEL_X / 2, y + h / 2 + 1)
  ctx.restore()
}

// ─── Onboarding overlay ──────────────────────────────────────────────────────

function drawOnboarding(ctx: CanvasRenderingContext2D, nowMs: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(2, 8, 14, 0.93)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const cx = CANVAS_WIDTH / 2

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.infection
  ctx.font = 'bold 38px monospace'
  ctx.fillText('YOU ARE THE INFECTION', cx, 86)

  ctx.fillStyle = COLORS.textDim
  ctx.font = '16px monospace'
  ctx.fillText('A dive into the body. You start as a tiny foothold at ENTRY (far left).', cx, 124)

  // ── The core loop (big, lead with this) ────────────────────────────────────
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 20px monospace'
  ctx.fillText('THE GOAL — in 3 steps', cx, 178)

  const steps: Array<[string, string]> = [
    ['1.  SPREAD', 'click a neighbouring node to infect it (takes 2 ticks)'],
    ['2.  REACH AN ORGAN', 'ORGANs (gold rings) are exit PORTALs'],
    ['3.  ESCAPE', 'click your ORGAN to leave and bank virality'],
  ]
  let ly = 212
  ctx.textAlign = 'left'
  const stepX = cx - 300
  for (const [head, desc] of steps) {
    ctx.fillStyle = COLORS.infection
    ctx.font = 'bold 17px monospace'
    ctx.fillText(head, stepX, ly)
    ctx.fillStyle = COLORS.text
    ctx.font = '15px monospace'
    ctx.fillText('—  ' + desc, stepX + 210, ly)
    ly += 30
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = COLORS.heatHigh
  ctx.font = '15px monospace'
  ctx.fillText("Do it before the HEAT bar fills — that's the immune system, and it means CAUGHT.", cx, ly + 16)

  // ── Secondary depth hints (smaller) ─────────────────────────────────────────
  ctx.fillStyle = COLORS.portalRing
  ctx.font = 'bold 16px monospace'
  ctx.fillText('ONCE YOU GET THAT — the deeper game', cx, ly + 66)

  const hints = [
    'Every HOT node earns biomass and raises Heat. More CONNECTED nodes = a bigger income ×multiplier.',
    'Select one of your nodes (click it), then:  D = go Dormant (cools Heat, stops earning),',
    'B = deploy a Brute, C = build a Cyst — both defend a node from the IMMUNE responder.',
    'The immune system grinds your nodes down and can SEVER your network. Breach LOCKED edges for new routes & a NUTRIENT bonus.',
  ]
  ctx.fillStyle = COLORS.textDim
  ctx.font = '13px monospace'
  let hy = ly + 92
  for (const h of hints) {
    ctx.fillText(h, cx, hy)
    hy += 20
  }

  // Pulsing call to action.
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 400)
  ctx.globalAlpha = 0.7 + 0.3 * pulse
  ctx.fillStyle = COLORS.good
  ctx.font = 'bold 24px monospace'
  ctx.fillText('▶  Click anywhere to begin the dive', cx, CANVAS_HEIGHT - 70)
  ctx.globalAlpha = 1
  ctx.fillStyle = COLORS.textDim
  ctx.font = '12px monospace'
  ctx.fillText('(the body stays frozen — and Heat stays at zero — until you do)', cx, CANVAS_HEIGHT - 42)
  ctx.restore()
}

// ─── Result overlay ──────────────────────────────────────────────────────────

function drawResultOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = 'rgba(2, 8, 14, 0.85)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.result === 'escape') {
    ctx.fillStyle = COLORS.good
    ctx.font = 'bold 58px monospace'
    ctx.fillText('ESCAPED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 36)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 26px monospace'
    ctx.fillText(`banked ${state.banked} virality`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22)
  } else {
    ctx.fillStyle = COLORS.heatHigh
    ctx.font = 'bold 58px monospace'
    ctx.fillText('CAUGHT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 36)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 22px monospace'
    ctx.fillText('the immune system overwhelmed you', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22)
  }

  ctx.fillStyle = COLORS.textDim
  ctx.font = '15px monospace'
  ctx.fillText('press R or reload the page to dive again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 66)
}

// ─── Small drawing helpers ───────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Word-wraps text; returns the y after the last line. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineH
    } else {
      line = test
    }
  }
  if (line) {
    ctx.fillText(line, x, yy)
    yy += lineH
  }
  return yy
}
