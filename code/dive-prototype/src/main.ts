// main.ts — Dive Prototype entry point.
//
// Wires the pure simulation (src/sim) to canvas rendering (src/render) and
// player input (src/input). Runs an active-pause loop (~2 ticks/sec, Space
// toggles pause), collects orders from clicks/keys, feeds them to step() each
// tick, and re-renders on every tick AND on every input so the board feels
// responsive. Dormancy and escape are applied immediately on input.

import { initialState, step } from './sim/dive'
import type { GameState, Order } from './sim/types'
import { render } from './render/render'
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
 * The player's current sustained command. Colonize and breach require the same
 * order to be re-sent every tick to accumulate progress, so we hold the latest
 * one here and feed it in on each tick until it completes or is replaced.
 * Cleared automatically once the target is owned (colonize) or the barrier opens
 * (breach), so it never lingers.
 */
let sustained: Order | null = null

/** One-shot orders (dormancy, escape) queued by the most recent input. */
let oneShot: Order[] = []

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

const TICK_INTERVAL_MS = 500 // ~2 ticks/sec

function advance(): void {
  if (state.result !== 'ongoing') return
  const orders = collectOrders()
  state = step(state, orders)
  // Drop a sustained command once it has finished its job.
  if (sustained && sustainedComplete(state, sustained)) sustained = null
}

function draw(): void {
  render(ctx!, state, paused)
}

const intervalId = setInterval(() => {
  if (!paused && state.result === 'ongoing') advance()
  draw()
}, TICK_INTERVAL_MS)

draw() // initial paint before the first interval fires

// ── Input: mouse ──────────────────────────────────────────────────────────────

function canvasPoint(e: MouseEvent): { x: number; y: number } {
  // Map client coords → canvas pixel coords (handles CSS scaling if any).
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH
  const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
  return { x, y }
}

canvas.addEventListener('click', (e: MouseEvent) => {
  if (state.result !== 'ongoing') return
  const { x, y } = canvasPoint(e)
  const order = clickToOrder(state, x, y)
  if (!order) return

  if (order.type === 'colonize' || order.type === 'breach') {
    // Sustained command — replaces any previous one. Takes effect on ticks.
    sustained = order
  } else if (order.type === 'escape') {
    // Escape resolves immediately so it feels instant — but not while paused
    // (a paused game is a true freeze). Queue it; it fires on resume otherwise.
    oneShot.push(order)
    if (!paused) state = step(state, collectOrders())
  }
  draw()
})

// ── Input: keyboard ────────────────────────────────────────────────────────

window.addEventListener('keydown', (e: KeyboardEvent) => {
  const action = keyToAction(e.code)

  if (action.kind === 'pause') {
    e.preventDefault() // stop page scroll on Space
    paused = !paused
    draw()
    return
  }

  if (action.kind === 'order') {
    e.preventDefault()
    if (state.result !== 'ongoing') return
    if (action.order.type === 'dormancy') {
      // Apply dormancy immediately so the stealth toggle feels instant. While
      // paused, queue it instead so pause stays a true freeze (fires on resume).
      if (paused) {
        oneShot.push(action.order)
      } else {
        state = step(state, [action.order, ...collectOrders()])
      }
      draw()
    }
  }
})

// ── HMR cleanup (dev only) ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((import.meta as any).hot) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(import.meta as any).hot.dispose(() => clearInterval(intervalId))
}
