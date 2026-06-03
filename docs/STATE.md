# Germ Warfare — Project State & Next Steps

> **Living handoff note.** If resuming after a context compaction, read this first, then `DECISIONS.md` and `docs/2026-06-01-germ-warfare-contours.md`.

## Where things stand
- **Concept:** a disease-takeover game (Total War × deckbuilder × Plague Inc / Spore). Full design in `docs/2026-06-01-germ-warfare-contours.md` + `DECISIONS.md` on branch **`main`** (GitHub: `bwinning11/Germ_warfare`).
- **Current direction:** the tactical battle is a **real-time strategy (RTS)** inside a body. (Pivoted away from an earlier directed-spread dive — built, playtested, didn't deliver the RTS feel.)
- **Brian validated the RTS** ("already feels better").

## Prototypes (pushed to GitHub)
- **`rts-prototype` — CURRENT.** `code/rts-prototype/` (Vite + TS + canvas + Vitest). ~145 tests. Latest commit `b4166f1`. **Run:** `npm --prefix code/rts-prototype install` then `npm --prefix code/rts-prototype run dev` → http://localhost:5174/.
- **`dive-prototype` — SUPERSEDED** (the directed-spread dive; history).

## What the RTS has now
Top-down 2D RTS in a body: a **base**; **auto-production** ("set the mix" — Q/W/E weight each germ, the base auto-builds the tide, rate-limited by biomass); 3 units — **Spreader / Brute / Spitter**; selection (click + drag-box) + right-click move/attack; **combat**; **two-tier immune** — innate scouts (**Macrophage, Neutrophil**) + adaptive counters (**Dendritic** vs Spreader, **NK** vs Brute, **T-cell** vs Spitter), ramping with a threat level; a **vessel-lane body-map** (5 chambers + arteries + chokepoints; units flow through the vessels via graph pathing); **3 capturable points** — **Nutrient** (+income), **Colony** (forward spawn/rally), **Fortress** (+combat dmg) — hold to capture, immune contests them; **Organ** = win (hold ~24s), lose if base falls; **MAP CONTROL** HUD row; start-paused onboarding; visible rally point.

## Resolved (Brian's 2026-06-01 feedback)
- Immune cell identities + legend cleaned up (5 distinct types). ✓
- Rally point exposed (flag + hint). ✓
- Multiple capturable points with benefits. ✓ · Vessel/artery channels. ✓

## Awaiting / next
- **Awaiting Brian's playtest of the body-map iteration** — does it feel more strategic & fun? Feel-checks: movement-through-vessels smoothness (not stuck); balance (tuned via simulation, not a human yet); capture-point control churns as waves pass (intended tension). Play with the **tab focused** (rAF throttles hidden tabs).
- **Next (after playtest):** **mitosis** as Bacteria's signature reproduction ability; more unit/immune variety; begin **wiring the battle toward the campaign / geoscape** (the broader game in the contours doc).

## Process notes
- Build = **subagent-driven** (one implementer per task + controller review/verification).
- **Design docs + decisions on `main`** (durable); **prototype code on feature branches**; STATE.md lives on the active prototype branch.
- Preview tool: set an explicit viewport width (~1200); play with the tab focused.
