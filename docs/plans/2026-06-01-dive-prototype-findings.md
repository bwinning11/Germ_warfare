# Dive Prototype — Playtest Findings (Step 9 gate)

**Date:** 2026-06-01 · **Branch:** `dive-prototype` (commits `f1e07cf` → `a2f4db9`)

## v1 (`365aa95`) — FAILED on legibility & fairness
A non-technical first-time player bounced hard: *"no idea what I'm looking at; clicking doesn't seem to do much; caught almost immediately for no reason."* Diagnosis (confirmed by screenshot): no onboarding; the sim ran from page load so Heat climbed during orientation; near-invisible click feedback; clipped layout.

## v2 fix pass (`a2f4db9`) — legibility & fairness fixed
Added a start-paused onboarding overlay (goal + controls), a persistent legend, loud click feedback (highlight + banners), an escalating Heat warning, fairer/slower pacing; fixed clipping. Verified on screen: clear goal/legend, TICK frozen until "begin," CALM/slow Heat. **Legibility ✅.**

## v2 deeper finding — the LOOP is too thin (the real gate result)
With legibility fixed, the core problem surfaced: **only one verb (expand)**, so **Dormancy is a non-decision** (just pause-and-cool — everything inevitably moves forward), and the **linear map** offers no real choices. The minimal loop is **not yet fun**.

## Direction — enrich to a network/territory dive
Add meaningful verbs so every choice (incl. Dormancy) is a real tradeoff: **node-chaining + a resource multiplier** (the immune system *severs* your network), a **defense verb** (Brute/Cyst), **selective per-node dormancy** (hot vs. dormant), and **pickups** that drive in-dive routing. See contours §4 *network model* + `DECISIONS.md`.

## Next
Design fully captured; build the **enriched-dive prototype** (chaining + defense + selective dormancy) and re-test the fun gate. Adaptive immunity (Step 1.5) follows.

**Gate verdict:** v1/v2 = NOT YET FUN (loop too thin). **Iterating, not pivoting** — the depth is addable and the sim core is sound.
