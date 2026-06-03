// main.ts — Enriched Dive Prototype entry point.
//
// Wires the pure simulation (src/sim) to canvas rendering (src/render) and
// player input (src/input). Runs an active-pause loop, collects orders from
// clicks/keys, feeds them to step() each tick, and re-renders continuously so
// the board feels responsive and warning/feedback animations can pulse.
//
// First-dive legibility lives here too: the dive starts FROZEN behind an
// onboarding overlay. The sim does not advance — and Heat does not rise — until
// the player clicks to begin. A selected-node cursor lets the keyboard verbs
// (D / B / C) act on a specific node, and every command produces a loud,
// named feedback banner.

import { initialState, step } from './sim/dive'
import type { GameState, Order, ZoneId } from './sim/types'
import { render, type LastAction } from './render/render'
import { CANVAS_WIDTH, CANVAS_HEIGHT, ZONE_LABEL } from './render/layout'
import { clickToResult, keyToAction } from './input/input'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')

if (!ctx) {
  throw new Error('Could not get 2D rendering context from canvas')
}

// ── State ──────────────────────────────────────────────────────────────────

let state: GameState = initialState()
let paused = false

/** Whether the dive has begun (false → onboarding overlay up, sim frozen). */
let started = false

/** The currently selected owned node (keyboard verbs act on it), or null. */
let selected: ZoneId | null = null

/**
 * The player's current sustained command. Colonize and breach must be re-sent
 * each tick to accumulate progress, so we hold the latest one and feed it in
 * until it completes or is replaced.
 */
let sustained: Order | null = null

/** One-shot orders (dormancy, escape, defense) queued by the most recent input. */
let oneShot: Order[] = []

/** Most recent player command, for the loud feedback banner. */
let lastAction: LastAction | null = null
let lastActionUntil = 0

const ACTION_BANNER_MS = 2000

const label = (id: ZoneId): string => ZONE_LABEL[id] ?? id

function setAction(a: LastAction): void {
  lastAction = a
  lastActionUntil = performance.now() + ACTION_BANNER_MS
}

// ── Order assembly ───────────────────────────────────────────────────────────

/** True once a sustained colonize/breach target has been achieved (so we drop it). */
function sustainedComplete(s: GameState, order: Order): boolean {
  if (order.type === 'colonize') {
    return s.map.zones.find(z => z.id === order.target)?.owner === 'you'
  }
  if (order.type === 'breach') {
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

// ~800ms/tick keeps a first dive readable: the Heat bar climbs slowly enough to
// read and react to. Pairs with the sim's heat-rise / colonize-tick constants.
const TICK_INTERVAL_MS = 800

function advance(): void {
  if (state.result !== 'ongoing') return
  const orders = collectOrders()
  state = step(state, orders)

  // Drop a sustained command once it has finished its job.
  if (sustained && sustainedComplete(state, sustained)) {
    sustained = null
    if (lastAction && (lastAction.kind === 'colonize' || lastAction.kind === 'breach')) {
      lastActionUntil = Math.min(lastActionUntil, performance.now() + 600)
    }
  }

  // If the selected node was lost to the immune system, clear the cursor.
  if (selected && state.map.zones.find(z => z.id === selected)?.owner !== 'you') {
    selected = null
  }
}

function draw(): void {
  const now = performance.now()
  if (lastAction && now > lastActionUntil) lastAction = null
  render(ctx!, state, paused, { started, lastAction, selected, nowMs: now })
}

const intervalId = setInterval(() => {
  if (started && !paused && state.result === 'ongoing') advance()
}, TICK_INTERVAL_MS)

let rafId = 0
function frame(): void {
  draw()
  rafId = requestAnimationFrame(frame)
}
rafId = requestAnimationFrame(frame)

// ── Immediate (one-shot) order application ────────────────────────────────────
//
// Dormancy / Brute / Cyst / escape should feel instant. While unpaused we apply
// them immediately via a step(); while paused we queue them so pause stays a
// true freeze (they fire on resume).

function applyImmediate(order: Order): void {
  if (paused) {
    oneShot.push(order)
  } else {
    state = step(state, [order, ...collectOrders()])
  }
}

// ── Input: mouse ──────────────────────────────────────────────────────────────

function canvasPoint(e: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH
  const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  return { x, y }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  // First click dismisses onboarding and begins the dive — issues no order.
  if (!started) {
    started = true
    return
  }

  if (state.result !== 'ongoing') return
  const { x, y } = canvasPoint(e)
  const result = clickToResult(state, x, y)

  if (result.kind === 'select') {
    selected = result.zoneId
    setAction({ kind: 'select', label: `SELECTED ${label(result.zoneId)} — D / B / C`, targetZone: result.zoneId })
    return
  }

  if (result.kind !== 'order') return
  const order = result.order

  if (order.type === 'colonize') {
    sustained = order
    setAction({ kind: 'colonize', label: `SPREADING → ${label(order.target)}`, targetZone: order.target })
  } else if (order.type === 'breach') {
    sustained = order
    setAction({ kind: 'breach', label: `BREACHING → ${label(order.target)}…`, targetZone: order.target })
  } else if (order.type === 'escape') {
    setAction({ kind: 'escape', label: `ESCAPING via ${label(order.portal)}`, targetZone: order.portal })
    applyImmediate(order)
  }
})

// ── Input: keyboard ────────────────────────────────────────────────────────

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const action = keyToAction(e.code, selected)

  if (action.kind === 'pause') {
    e.preventDefault()
    if (!started) return
    paused = !paused
    return
  }

  if (action.kind === 'restart') {
    e.preventDefault()
    // Allow restart any time after the dive has started (esp. on result screen).
    if (!started) return
    state = initialState()
    selected = null
    sustained = null
    oneShot = []
    lastAction = null
    paused = false
    return
  }

  if (!started || state.result !== 'ongoing') return

  if (action.kind === 'needSelect') {
    e.preventDefault()
    setAction({ kind: 'select', label: 'SELECT ONE OF YOUR NODES FIRST (click it)' })
    return
  }

  if (action.kind === 'order') {
    e.preventDefault()
    const order = action.order

    if (order.type === 'dormancy') {
      applyImmediate(order)
      const nowDormant = state.dormant.has(order.zoneId)
      setAction(
        nowDormant
          ? { kind: 'dormancy', label: `${label(order.zoneId)} → DORMANT (cooling)`, targetZone: order.zoneId }
          : { kind: 'dormancy', label: `${label(order.zoneId)} → HOT (earning)`, targetZone: order.zoneId },
      )
    } else if (order.type === 'deployBrute') {
      const before = state.brutes.has(order.zoneId)
      applyImmediate(order)
      const placed = !before && state.brutes.has(order.zoneId)
      setAction(
        placed
          ? { kind: 'brute', label: `BRUTE deployed → ${label(order.zoneId)}`, targetZone: order.zoneId }
          : { kind: 'brute', label: `can't deploy Brute (need biomass)`, targetZone: order.zoneId },
      )
    } else if (order.type === 'buildCyst') {
      const before = state.cysts.has(order.zoneId)
      applyImmediate(order)
      const placed = !before && state.cysts.has(order.zoneId)
      setAction(
        placed
          ? { kind: 'cyst', label: `CYST built → ${label(order.zoneId)}`, targetZone: order.zoneId }
          : { kind: 'cyst', label: `can't build Cyst (need biomass)`, targetZone: order.zoneId },
      )
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
