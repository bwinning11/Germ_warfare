# Germ Warfare — Project State & Next Steps

> **Living handoff note (2026-06-01).** If resuming after a context compaction, read this first, then `DECISIONS.md` and `docs/2026-06-01-germ-warfare-contours.md`.

## Where things stand
- **Concept:** a disease-takeover game (Total War × deckbuilder × Plague Inc / Spore). Full design in `docs/2026-06-01-germ-warfare-contours.md` + `DECISIONS.md`, on branch **`main`** (GitHub: `bwinning11/Germ_warfare`).
- **Current direction:** the "dive" (the tactical battle) is now a **real-time strategy (RTS)**. We pivoted away from an earlier directed-spread / zone-graph dive — it was built and playtested but didn't deliver the RTS feel.
- **Brian validated the RTS pivot:** "already feels better than the previous game."

## Prototypes (both throwaway, pushed to GitHub)
- **`rts-prototype` branch — CURRENT.** Code in `code/rts-prototype/` (Vite + TS + HTML5 canvas + Vitest). ~89 tests. **Run:** `npm --prefix code/rts-prototype install` then `npm --prefix code/rts-prototype run dev` → http://localhost:5174/.
- **`dive-prototype` branch — SUPERSEDED.** `code/dive-prototype/` (the directed-spread dive; kept for history).

## What the RTS combat slice has (built subagent-driven, 8 tasks)
Top-down 2D RTS inside a body: a **base**; **biomass** economy; **auto-production** (set a mix via Q/W/E weights → base auto-builds the tide, rate-limited by biomass); 3 unit types — **Spreader** (fast/weak swarm), **Brute** (slow/tank), **Spitter** (ranged); **selection** (click + drag-box) + **right-click move/attack** + formation; a **rally point** (right-click with base selected); **combat** (melee + ranged, auto-acquire, death); **two-tier immune** — innate scouts (Macrophage, Neutrophil) roam/harass + adaptive siege (NK cell, T-cell) ramps with a threat level and **counters your most-used germ**; **objective** = capture/hold an **organ** to win, lose if base destroyed; full **HUD** + **start-paused onboarding**.

## Brian's open feedback (2026-06-01 — to act on)
1. **Production speed** — confirmed it's cost-driven (cheaper germs build faster). Could add explicit per-type build times as a dial.
2. **Rally point** — already exists (right-click base selected). Make it discoverable (visible flag + hint).
3. **Multiple capturable points**, each with distinct benefits (income / production / build-speed / forward-rally / defense) → RTS map control. *(NEW)*
4. **Vein/artery channels** — constrain movement to vessel lanes (vs. free-form), creating chokepoints & a real body-map; brings "defend your arteries" into the RTS. *(NEW)*
5. **Immune legend/identity unclear** — clean up the immune roster so each cell type is visually + functionally distinct and clearly explained. (Bug: `neutrophil` doubles as an innate scout AND the adaptive Spreader-counter — muddy.)

## Suggested next steps
1. **Small fixes:** expose the rally point (#2); clean up immune cell identities + legend (#5).
2. **Big next iteration — give the battle a real body-map:** vessel **lanes/arteries** + **chokepoints** connecting **multiple capturable points** (organs = win/vectors; nutrient nodes = income; forward colonies = production/rally; choke fortresses = defense). (#3 + #4 together.)
3. Then: **mitosis** as Bacteria's signature reproduction ability; more unit variety; begin wiring the battle toward the **campaign / geoscape**.

## Process notes
- Build = **subagent-driven** (one implementer per task + controller review/verification).
- **Design docs + decisions live on `main`** (durable); **prototype code on feature branches**.
- Preview tool: set an explicit viewport width (~1200); the game throttles when the browser tab is hidden — play with the tab focused.
- The broader game design (geoscape, dual win, herd immunity, classes, tone, meta-progression) is captured in the contours doc and remains the target the RTS battle plugs into.
