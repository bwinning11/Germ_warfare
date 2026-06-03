// ---------------------------------------------------------------------------
// Entry point.
// Sets up the canvas, wires up input, and runs the fixed-timestep game loop.
// ---------------------------------------------------------------------------

import { createWorld } from './world/world';
import { update } from './world/world';
import { render } from './render/render';

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------
const CANVAS_W = 1100;
const CANVAS_H = 740;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

const ctxMaybe = canvas.getContext('2d');
if (!ctxMaybe) throw new Error('Could not get 2D canvas context.');
const ctx: CanvasRenderingContext2D = ctxMaybe;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
const world = createWorld(CANVAS_W, CANVAS_H);

// ---------------------------------------------------------------------------
// Input — Space bar toggles pause
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();           // prevent page scroll
    world.paused = !world.paused;
  }
});

// ---------------------------------------------------------------------------
// Fixed-timestep game loop
//
// Pattern:
//   - requestAnimationFrame drives rendering at monitor refresh rate.
//   - Real elapsed time is accumulated into `accumulator`.
//   - We drain accumulator in fixed-size steps (FIXED_DT) so simulation is
//     deterministic regardless of frame rate.
//   - Render always happens once per rAF call using whatever world state we
//     have after draining (no interpolation this prototype — fine for now).
// ---------------------------------------------------------------------------
const FIXED_DT = 1 / 60;        // 60 Hz simulation steps
const MAX_ACCUMULATED = 0.25;   // safety cap: prevents spiral of death on lag

let lastTimestamp: number | null = null;
let accumulator = 0;

function loop(timestamp: number): void {
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }

  const realDelta = Math.min((timestamp - lastTimestamp) / 1000, MAX_ACCUMULATED);
  lastTimestamp = timestamp;

  if (!world.paused) {
    accumulator += realDelta;

    while (accumulator >= FIXED_DT) {
      update(world, FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }

  render(ctx, world);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
