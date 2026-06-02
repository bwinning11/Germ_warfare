// Dive Prototype — tick loop + active-pause
// Runs the sim forward at ~2 ticks/sec; spacebar toggles pause.
// No real rendering yet — just proves the loop and pause work.

import { initialState, step } from './sim/dive'
import type { GameState } from './sim/types'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')

if (!ctx) {
  throw new Error('Could not get 2D rendering context from canvas')
}

// ── Sim state ────────────────────────────────────────────────────────────────

let state: GameState = initialState()
let paused = false

// ── Rendering ────────────────────────────────────────────────────────────────

function render(s: GameState, isPaused: boolean): void {
  const { width, height } = canvas

  // Background
  ctx!.fillStyle = '#0d2b4e'
  ctx!.fillRect(0, 0, width, height)

  // Tick counter
  ctx!.fillStyle = '#7ecef4'
  ctx!.font = '28px monospace'
  ctx!.textAlign = 'center'
  ctx!.textBaseline = 'middle'
  ctx!.fillText(`tick: ${s.tick}`, width / 2, height / 2 - 24)

  // Pause indicator
  ctx!.fillStyle = isPaused ? '#f4c97e' : '#5ecf7e'
  ctx!.font = '20px monospace'
  ctx!.fillText(isPaused ? '⏸  PAUSED  (space to resume)' : '▶  RUNNING  (space to pause)', width / 2, height / 2 + 24)
}

// ── Tick loop (setInterval at ~2 ticks/sec) ───────────────────────────────────

const TICK_INTERVAL_MS = 500 // 2 ticks per second

const intervalId = setInterval(() => {
  if (!paused) {
    state = step(state, [])
  }
  render(state, paused)
}, TICK_INTERVAL_MS)

// Initial render so the canvas isn't blank before the first interval fires
render(state, paused)

// ── Input — spacebar toggles pause ───────────────────────────────────────────

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault() // prevent page scroll
    paused = !paused
    render(state, paused)
  }
})

// Expose intervalId so hot-module-reload can clear it during dev
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((import.meta as any).hot) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(import.meta as any).hot.dispose(() => clearInterval(intervalId))
}
