# Dive Prototype — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A throwaway, browser-playable prototype of the *Germ Warfare* "dive" that answers one question — is the **harvest → breach → escape** loop fun?

**Architecture:** A pure, deterministic **sim core** (no DOM, unit-tested) + a **thin canvas render/input layer** + an **active-pause** game loop. Keep sim and rendering strictly separated so logic is testable and tweakable.

**Tech Stack:** TypeScript · HTML5 canvas · Vite (dev/build) · Vitest (unit tests).

**Calibration (throwaway):** Unit-test the sim's deterministic logic only. Do NOT test rendering or "feel" — those are manual playtest. Ugly visuals are fine. Commit after every task.

**Success gate (contours §10 Step 1) — judged by playing, not tests:**
1. The greed-vs-escape decision feels genuinely tense.
2. A new player can read the Heat curve within ~2 dives (teachable, not punishing-by-surprise).

If yes → proceed to Step 1.5 (adaptive immunity). If no → iterate or pivot. Cheap either way.

---

## File structure

```
code/dive-prototype/
  package.json · tsconfig.json · vite.config.ts · index.html      # scaffold
  src/
    sim/                # pure logic, no DOM — unit-tested
      types.ts          # Zone, ZoneState, Strain, GameState, Order
      map.ts            # the one-region zone graph + adjacency
      economy.ts        # biomass income & spend
      spread.ts         # colonize adjacent zones; breach barriers
      heat.ts           # Heat accrual/decay + stepped thresholds
      immune.ts         # innate responders: spawn at thresholds, clear infection
      dive.ts           # step(state, orders) -> state; escape/caught resolution
      *.test.ts         # Vitest unit tests
    render/render.ts    # draw zones, units, Heat meter, result (canvas)
    input/input.ts      # click zones/borders, pause + dormancy toggles -> Orders
    main.ts             # active-pause loop wiring sim + render + input
```

Responsibility split: `sim/` is a pure state machine (`step` is referentially transparent — same state+orders → same next state). `render/` and `input/` never mutate sim state directly; they read state and emit `Order`s.

---

## Task 1: Scaffold

**Files:** Create `code/dive-prototype/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/main.ts`.

- [ ] **Step 1:** Init Vite + TS + Vitest in `code/dive-prototype/` (vanilla-ts template). Add a `<canvas>` to `index.html`; `main.ts` gets the 2D context and fills it one color.
- [ ] **Step 2:** Verify `npm run dev` opens a colored canvas in the browser, and `npm test` runs (zero tests OK).
- [ ] **Step 3:** Commit — `chore: scaffold dive-prototype (vite + ts + vitest)`.

## Task 2: Sim types + the one-region zone map

**Files:** Create `src/sim/types.ts`, `src/sim/map.ts`, `src/sim/map.test.ts`.

Map for the prototype (one region, ~5 zones): `entry` (portal/spawn) — `vessel_a` — `vessel_b` — `organ` (portal/exit), plus `gland` gated behind a `barrier` border off `vessel_b`.

- [ ] **Step 1 (test):** `buildMap()` returns 5 zones; `entry` and `organ` are portals; `adjacent('vessel_b')` includes `gland` only via a barrier edge flagged `barrier: true`.
- [ ] **Step 2:** Run test — fails (no `buildMap`).
- [ ] **Step 3:** Implement `types.ts` (Zone {id, kind: 'portal'|'connective'|'organ'|'gland'; owner: 'none'|'you'; infection: number}) and `map.ts` (zones + edges).
- [ ] **Step 4:** Run test — passes.
- [ ] **Step 5:** Commit — `feat(sim): one-region zone map + adjacency`.

## Task 3: Tick loop + active-pause

**Files:** Create `src/sim/dive.ts`, `src/sim/dive.test.ts`. Modify `src/main.ts`.

- [ ] **Step 1 (test):** `step(state, [])` with no orders is deterministic and pure — calling it twice on the same input yields equal output; it advances `state.tick` by 1.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement `step(state, orders): GameState` (start: just `tick++`, applies orders later). In `main.ts`, run a `setInterval`-driven loop calling `step`; spacebar toggles `paused`.
- [ ] **Step 4:** Run — passes. Manually confirm spacebar pauses the tick counter on screen.
- [ ] **Step 5:** Commit — `feat(sim): deterministic step + active-pause loop`.

## Task 4: Spread + biomass economy

**Files:** Create `src/sim/economy.ts`, `src/sim/spread.ts` (+ tests). Modify `dive.ts` to apply `colonize` orders.

- [ ] **Step 1 (test, economy):** each `you`-owned zone yields +1 biomass/tick; `spend(state, n)` fails if insufficient.
- [ ] **Step 2 (test, spread):** a `colonize` order toward a zone adjacent to an owned zone (non-barrier edge) flips it to `owner:'you'` over K ticks; non-adjacent target is rejected.
- [ ] **Step 3:** Run — fail. Implement `economy.ts` + `spread.ts`; wire into `step`.
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit — `feat(sim): colonize spread + biomass economy`.

## Task 5: Heat + innate immunity

**Files:** Create `src/sim/heat.ts`, `src/sim/immune.ts` (+ tests). Modify `dive.ts`.

- [ ] **Step 1 (test, heat):** Heat rises proportional to owned-zone count + recent actions; a `dormancy` order halts spread and decays Heat; thresholds map to stages `calm < alerted < active < overwhelming`.
- [ ] **Step 2 (test, immune):** at/above `alerted`, a responder spawns in the highest-infection owned zone and reduces its infection each tick; infection hitting 0 flips the zone back to `none` (a lost zone). A unit/zone lost bumps Heat.
- [ ] **Step 3:** Run — fail. Implement; wire into `step` (Heat update → maybe spawn responder → responders act).
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit — `feat(sim): body-wide Heat + innate responders`.

## Task 6: Breacher + barrier

**Files:** Modify `src/sim/spread.ts` (+ test), `dive.ts`.

- [ ] **Step 1 (test):** a `breach` order on the `barrier` edge clears it after B ticks; only then can `gland` be colonized.
- [ ] **Step 2:** Run — fail. Implement breach (edge `barrier:false` after B ticks of a breach order).
- [ ] **Step 3:** Run — pass.
- [ ] **Step 4:** Commit — `feat(sim): breacher opens barriers`.

## Task 7: Escape + Caught + result

**Files:** Modify `src/sim/dive.ts` (+ `dive.test.ts`).

- [ ] **Step 1 (test, escape):** an `escape` order issued while you hold a portal ends the dive with `result:'escape'` and `banked = virality(zonesHeld, ticksSurvived)` (a simple monotonic formula).
- [ ] **Step 2 (test, caught):** Heat reaching `overwhelming` ends the dive with `result:'caught'`, `banked = 0`.
- [ ] **Step 3:** Run — fail. Implement end-conditions in `step` (return a terminal state with `result` + `banked`).
- [ ] **Step 4:** Run — pass.
- [ ] **Step 5:** Commit — `feat(sim): escape/caught resolution + virality payout`.

## Task 8: Render + input — the playable layer

**Files:** Create `src/render/render.ts`, `src/input/input.ts`. Modify `main.ts`. (No unit tests — manual playtest.)

- [ ] **Step 1:** `render(ctx, state)` draws each zone (position from `map`, color by owner + infection), responders, a **Heat bar** with stage labels, biomass count, tick, and a result overlay on dive end.
- [ ] **Step 2:** `input` maps: click a zone → `colonize` toward it; click a barrier edge → `breach`; click a held portal → `escape`; `D` → toggle `dormancy`; `Space` → pause. Emit `Order`s the loop feeds to `step`.
- [ ] **Step 3:** Manually play a full dive end-to-end (spread → breach → escape, and a deliberate get-caught). Confirm state reads clearly.
- [ ] **Step 4:** Commit — `feat: playable canvas render + input (dive end-to-end)`.

## Task 9: Playtest gate (manual — no code)

- [ ] Play ~6–10 dives. Assess the two success criteria: (1) is greed-vs-escape tense? (2) can a fresh player read the Heat curve in ~2 dives?
- [ ] Write findings to `docs/plans/2026-06-01-dive-prototype-findings.md`: what felt fun, what didn't, what one change would most improve it.
- [ ] Decision: **pass** → Step 1.5 (adaptive immunity); **fail** → iterate the loop or pivot. Log the call in `DECISIONS.md`.

---

## Notes for the executor
- Tune constants (Heat rates, K/B tick counts, virality formula) freely — they're the fun dials; expect to revisit them during the playtest gate.
- Keep `sim/` DOM-free so tests stay fast and the core is portable to the production engine later.
- Burst, adaptive immunity, fog of war, pickups, multiple regions, and the geoscape are **out of scope** for this prototype (deferred per contours §10–§11).
