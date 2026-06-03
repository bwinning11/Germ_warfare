// main.ts — Dive Prototype entry point.
//
// Wires the pure simulation (src/sim) to canvas rendering (src/render) and
// player input (src/input). Runs an active-pause loop, collects orders from
// clicks/keys, feeds them to step() each tick, and re-renders continuously so
// the board feels responsive and warning/feedback animations can pulse.
//
// First-dive legibility lives here too: the dive starts FROZEN behind an
// onboarding overlay. The sim does not advance — and Heat does not rise — until
// the player clicks to begin. The most recent command is held as `lastAction`
// so the renderer can show a loud, named feedback banner.

import { initialState, step } from './sim/dive'
import type { GameState, Order } from './sim/types'
import { render, type LastAction } from './render/render'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './render/layout'
import { clickToOrder, keyToAction } from './input/input'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')

if (!ctx) {
  throw new Error('Could not get 2D rendering context from canvas')
}

// ── State ──────────────────────────────────────────────────────────────────

let state: GameState = initialState()
let paused = false

/**
 * Whether the dive has begun. Starts false: the onboarding overlay is up and
 * the sim is frozen (no ticks, Heat stays at 0) until the player clicks begin.
 */
let started = false

/**
 * The player's current sustained command. Colonize and breach require the same
 * order to be re-sent every tick to accumulate progress, so we hold the latest
 * one here and feed it in on each tick until it completes or is replaced.
 * Cleared automatically once the target is owned (colonize) or the barrier opens
 * (breach), so it never lingers.
 */
let sustained: Order | null = null

/** One-shot orders (dormancy, escape) queued by the most recent input. */
let oneShot: Order[] = []

/** Most recent player command, for the loud feedback banner. Cleared on expiry. */
let lastAction: LastAction | null = null
let lastActionUntil = 0

const ACTION_BANNER_MS = 2200

// Human-readable zone names for feedback banners.
const ZONE_LABEL: Record<string, string> = {
  entry: 'ENTRY',
  vessel_a: 'VESSEL A',
  vessel_b: 'VESSEL B',
  organ: 'ORGAN',
  gland: 'GLAND',
}

function setAction(a: LastAction): void {
  lastAction = a
  lastActionUntil = performance.now() + ACTION_BANNER_MS
}

/** Turns an Order into the loud banner shown to the player. */
function bannerFor(order: Order): LastAction {
  switch (order.type) {
    case 'colonize':
      return { kind: 'colonize', label: `SPREADING → ${ZONE_LABEL[order.target] ?? order.target}`, targetZone: order.target }
    case 'breach':
      return { kind: 'breach', label: `BREACHING → ${ZONE_LABEL[order.target] ?? order.target}…`, targetZone: order.target }
    case 'escape':
      return { kind: 'escape', label: `ESCAPING via ${ZONE_LABEL[order.portal] ?? order.portal}`, targetZone: order.portal }
    case 'dormancy':
      return { kind: 'dormancy', label: `DORMANCY TOGGLE — ${order.zoneId}` }
    case 'deployBrute':
      return { kind: 'dormancy', label: `BRUTE DEPLOYED → ${order.zoneId}` }
    case 'buildCyst':
      return { kind: 'dormancy', label: `CYST BUILT → ${order.zoneId}` }
  }
}

// ── Order assembly ───────────────────────────────────────────────────────────

/** True once a sustained colonize/breach target has been achieved (so we can drop it). */
function sustainedComplete(s: GameState, order: Order): boolean {
  if (order.type === 'colonize') {
    return s.map.zones.find(z => z.id === order.target)?.owner === 'you'
  }
  if (order.type === 'breach') {
    // Barrier opened when no edge to the target is a barrier any more.
    return !s.map.edges.some(e => e.to === order.target && e.barrier)
  }
  return true
}

/** Builds the order list for one tick: the sustained command plus any one-shots. */
function collectOrders(): Order[] {
  const orders: Order[] = []
  if (sustained) orders.push(sustained)
  orders.push(...oneShot)
  oneShot = []
  return orders
}

// ── Tick + render ────────────────────────────────────────────────────────────

// Slowed from 500ms so a first-time player can read the Heat bar climbing and
// react before danger. Pairs with the lowered HEAT_RISE_* / *_TICKS constants.
const TICK_INTERVAL_MS = 800

function advance(): void {
  if (state.result !== 'ongoing') return
  const orders = collectOrders()
  state = step(state, orders)
  // Drop a sustained command once it has finished its job.
  if (sustained && sustainedComplete(state, sustained)) {
    sustained = null
    // Let a finished spread's banner fade rather than linger forever.
    if (lastAction && (lastAction.kind === 'colonize' || lastAction.kind === 'breach')) {
      lastActionUntil = Math.min(lastActionUntil, performance.now() + 600)
    }
  }
}

function draw(): void {
  const now = performance.now()
  if (lastAction && now > lastActionUntil) lastAction = null
  render(ctx!, state, paused, { started, lastAction, nowMs: now })
}

// Sim ticks on a fixed interval; only advances once started, unpaused, ongoing.
const intervalId = setInterval(() => {
  if (started && !paused && state.result === 'ongoing') advance()
}, TICK_INTERVAL_MS)

// Continuous repaint so warning glows and feedback banners animate smoothly.
let rafId = 0
function frame(): void {
  draw()
  rafId = requestAnimationFrame(frame)
}
rafId = requestAnimationFrame(frame)

// ── Input: mouse ──────────────────────────────────────────────────────────────

function canvasPoint(e: MouseEvent): { x: number; y: number } {
  // Map client coords → canvas pixel coords (handles CSS scaling if any).
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH
  const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  return { x, y }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  // First click dismisses onboarding and begins the dive — it issues no order,
  // so the player can't accidentally fling a command while orienting.
  if (!started) {
    started = true
    return
  }

  if (state.result !== 'ongoing') return
  const { x, y } = canvasPoint(e)
  const order = clickToOrder(state, x, y)
  if (!order) return

  if (order.type === 'colonize' || order.type === 'breach') {
    // Sustained command — replaces any previous one. Takes effect on ticks.
    sustained = order
    setAction(bannerFor(order))
  } else if (order.type === 'escape') {
    // Escape resolves immediately so it feels instant — but not while paused
    // (a paused game is a true freeze). Queue it; it fires on resume otherwise.
    oneShot.push(order)
    setAction(bannerFor(order))
    if (!paused) state = step(state, collectOrders())
  }
})

// ── Input: keyboard ────────────────────────────────────────────────────────

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const action = keyToAction(e.code)

  if (action.kind === 'pause') {
    e.preventDefault() // stop page scroll on Space
    if (!started) return // Space does nothing while onboarding is up
    paused = !paused
    return
  }

  if (action.kind === 'order') {
    e.preventDefault()
    if (!started) return
    if (state.result !== 'ongoing') return
    if (action.order.type === 'dormancy') {
      // Apply dormancy immediately so the stealth toggle feels instant. While
      // paused, queue it instead so pause stays a true freeze (fires on resume).
      if (paused) {
        oneShot.push(action.order)
      } else {
        state = step(state, [action.order, ...collectOrders()])
      }
      // Banner reflects the resulting mode (entering vs leaving dormancy).
      if (state.dormant || paused) {
        setAction(bannerFor(action.order))
      } else {
        setAction({ kind: 'dormancy', label: 'WAKING — resuming spread' })
      }
    }
  }
})

// ── HMR cleanup (dev only) ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((import.meta as any).hot) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(import.meta as any).hot.dispose(() => {
    clearInterval(intervalId)
    cancelAnimationFrame(rafId)
  })
}
