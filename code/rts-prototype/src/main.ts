// ---------------------------------------------------------------------------
// Entry point.
// Sets up the canvas, wires up input, and runs the fixed-timestep game loop.
// ---------------------------------------------------------------------------

import { createWorld, update } from './world/world';
import { render } from './render/render';
import { createInputState, attachInput, attachKeyboard, updateMarkers } from './input/input';

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------
const CANVAS_W = 1100;
const CANVAS_H = 740;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;

// Prevent the right-click context menu on the canvas
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const ctxMaybe = canvas.getContext('2d');
if (!ctxMaybe) throw new Error('Could not get 2D canvas context.');
const ctx: CanvasRenderingContext2D = ctxMaybe;

// ---------------------------------------------------------------------------
// World + input state
// ---------------------------------------------------------------------------
const world = createWorld(CANVAS_W, CANVAS_H);
const inputState = createInputState();

attachInput(canvas, world, inputState);
attachKeyboard(world, inputState);

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
      updateMarkers(inputState, FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }

  render(ctx, world, inputState);

  requestAnimationFrame(loop);
}

// Dev-only introspection / fast-forward hook (playtesting + tuning).
// Stripped from production builds by the import.meta.env.DEV guard.
// (import.meta.env is cast here because this tsconfig scopes `types` to
//  vitest/globals and omits vite/client's ambient ImportMeta augmentation.)
const __DEV__ = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__game = {
    world,
    input: inputState,
    /** Run N fixed sim steps headlessly — fast-forward for testing balance. */
    step(seconds: number): void {
      const n = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < n; i++) update(world, FIXED_DT);
    },
    /** Force one render (rAF is throttled when the tab is in the background). */
    draw(): void {
      render(ctx, world, inputState);
    },
  };
}

requestAnimationFrame(loop);
