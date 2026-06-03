# Decisions

Running log of non-trivial decisions. Append-only. Newest at top.

## Format

Each entry uses this template:

```
## YYYY-MM-DD — Title

**Context:** What situation prompted this?
**Options considered:** What was looked at, briefly.
**Decision:** What we picked.
**Why:** Reasoning.
**Reversibility:** Easy / Hard / Irreversible.
**Revisit if:** What would make us reconsider.
```

---

## 2026-06-01 — Pivot the dive to a real-time strategy (RTS) battle

**Context:** The directed-spread dive was prototyped (v1 → v2 legibility fix → enriched network/territory model) and playtested by Brian. Even after the legibility fixes, the loop wasn't fun *for him* — the zone-spread abstraction didn't deliver the RTS feel he wanted from the start. He asked to build the actual RTS he originally imagined.

**Decision:** The dive becomes a **real-time strategy battle**: inside a body, a **base** harvests and produces **units (your strains)** and **structures (colonies)** that you **command in real time** (select, move, attack) against the **immune system**, pushing toward **organs**. This **supersedes** the directed-spread hybrid + network/territory model (contours §4) for the dive's *interaction*. Everything around it carries over: germ-vs-immune, the body setting, harvest/biomass, strains/colonies, Heat/detection, organs-as-vectors, escape, the dual win, and the geoscape above it.

First build: a tiny **RTS "combat slice"** — one arena, a small base, 3 unit types (Spreader / Brute / Spitter), real-time command vs. escalating immune waves, win by capturing/holding an organ — to answer the load-bearing question: *is commanding your germs fun?* Scale to a fuller base-builder only if it lands.

**Why:** Player experience is the north star — a cheaper abstraction the designer doesn't enjoy is worthless, and the RTS is what Brian wanted. RTS is the biggest/riskiest build (units, pathing, AI, balance — the "scope cliff"), so we de-risk with a small combat-feel prototype before committing to the full thing.

**Reversibility:** Hard — reverses the "directed-spread, RTS deferred" calls and is a much larger build. Mitigated by prototyping the combat slice first.

**Revisit if:** The combat slice isn't fun or proves infeasible for a solo + Claude team (reconsider scale, or a lighter combat model).

---

## 2026-06-01 — Dive enriched to a network/territory model (playtest-driven)

**Context:** The v1 minimal dive prototype was playtested. After a fix pass made it legible and fair (v2), the deeper finding surfaced: the loop is **too thin** — one verb (expand), so Dormancy is a non-decision and the map is linear. Brian proposed defense and node-chaining, and asked how pickups/relics work in a dive.

**Decision:** Deepen the dive into a **network/territory** model:
- **Graph map, multiple organs, many paths** (not a line) — topology, chokepoints, and routes become real decisions.
- **Chains + multiplier:** owned nodes connected to your **core** channel a **resource multiplier** (bigger connected network → more income per node). The immune system's signature threat becomes **severing** your network — cut-off nodes still work and stay yours but lose the multiplier (base only). Protecting your arteries is the strategic heart, and *that* is why defense matters.
- **Defense verb:** spend biomass to hold ground — **Brute** (actively fights responders in a node) / **Cyst** (fortifies a node). The alternative to going quiet.
- **Selective per-node dormancy:** each node runs **hot** (produces, feeds the chain, raises Heat, draws immunity) or **dormant** (safe, idle, off the multiplier). Heat derives from *hot* nodes. Replaces the global pause.
- **Pickups** sit in specific nodes (biomass cache, mutagen, Heat-purge, one-shot power) — they drive in-dive routing (risk/reward). **Relics** = permanent evolutions banked on escape; some pickups bank as relics.

**Why:** The minimal loop failed the fun gate on *depth*, not just legibility. More verbs make every choice — including Dormancy — a real tradeoff; chaining + severing turns a line into a strategy space and gives the immune system a meatier role; defense and pickups give reasons to hold ground and route.

**Reversibility:** Medium — a meaningful expansion of the dive, but it builds on the same sim core; topology and constants are tunable.

**Revisit if:** The enriched loop still isn't fun in prototype (rethink the core verb), or it over-complicates (trim the multiplier or defense).

---

## 2026-06-01 — Prototype tech: web (TypeScript + canvas)

**Context:** Choosing how to build the throwaway dive prototype (Step 1), whose only job is to test whether the dive loop is fun.

**Options considered:** web (TypeScript + HTML5 canvas, optionally a light lib like PixiJS) vs. Godot vs. Unity.

**Decision:** Build the **dive prototype in a web stack — TypeScript + HTML5 canvas**. The production engine for a shipping game is a **separate, later decision** (likely Godot), made only once fun is proven.

**Why:** Fastest path to click-and-play (zero install, shareable, Claude writes it fluently); the design has no physics/pathfinding (zone-map, active-pause), so a browser canvas suffices. Reversibility: the prototype is throwaway, so don't marry a heavy engine — a rewrite into the production engine is cheap and expected.

**Reversibility:** Easy — throwaway prototype; production engine chosen later.

**Revisit if:** The prototype proves fun and we commit to a production engine (re-decide then).

---

## 2026-06-01 — Escape vs. Burst balance: compounding vs. consuming

**Context:** Design review flagged that Burst (explosive spread + a lethality evolution) could dominate Escape (a mere "floor"), collapsing the Endemic identity. Escape needed to be *attractive*, not just safe.

**Decision:** **Escape keeps the host alive as a compounding asset** (an Endemic region keeps spreading + generating) and stays **quiet** (low alarm) — the long-game, compounding engine. **Burst consumes** the host (one-time, now Abandoned) *and* **spikes global alarm**, accelerating herd immunity — a loud, fast Extinction sprint that races its own doom clock. So the choice is sustainable compounding (Endemic) vs. a one-time spike that hastens your end (Extinction), mapping to the dual win and the Game Speed tilt.

**Why:** Gives a concrete reason to Escape beyond safety, protects the Endemic playstyle (and the Sim-fan fantasy), and keeps Burst a committed, costed choice rather than a default.

**Reversibility:** Easy — a tuning relationship.

**Revisit if:** Burst still dominates in prototype (raise its alarm cost / strand risk, or strengthen the compounding payoff).

---

## 2026-06-01 — Dive outcomes: Escape / Burst / Caught, virality floor, pickups

**Context:** Refining the dive after three questions — do no-organ dives pay, is biomass the only resource, and is host death a real playstyle?

**Decision:** (1) **Every escaped dive pays a virality/resistance floor** from spreading + surviving; reaching organs adds new *vectors* (upside, not required), and you can always **bail out your entry portal** — only being **caught** (Heat maxes) zeroes you. (2) **Biomass stays the single economy resource**, but add **pickups** — discrete found treasure (biomass caches, mutagens, scavenged cards, Heat-cutting glands) that reward exploration; not a second currency. (3) **Host death is a deliberate "Burst" exit** (Extinction-leaning): kill the host → explosive super-spread + lethality spike. So a dive ends two *intentional* ways — **Escape** (Endemic-leaning, persist) or **Burst** (Extinction-leaning, aggressive) — plus the **Caught** failure. Killing is a committed playstyle, not a mistake.

**Why:** No-brick dives keep every attempt rewarding; pickups add roguelike texture without a second economy; Burst makes the dual win legible at the dive level (StS aggro vs. control archetypes) and resolves "is killing good?" — it's good when you commit to it.

**Reversibility:** Easy — tune the virality floor; pickups and Burst are additive.

**Revisit if:** Burst dominates (rebalance the lethality/strand risk), or pickups clutter the dive.

---

## 2026-06-01 — Tone & aesthetic: clinical-sinister (stylized)

**Context:** Setting the game's identity — emotional register and visual direction — which drives art, audio, writing, and marketing.

**Options considered:** clinical-sinister (elegant menace) vs. darkly comic vs. visceral body-horror vs. cute-grotesque; stylized vs. photoreal.

**Decision:** **Clinical-sinister**, executed **stylized/graphic** (not photoreal). Played straight — you're indifferent evolution, and the horror/thrill is the calm of a clean world destabilizing. Signature image: the disease's color creeping across a cold, clean world. Two scales in one cold elegance — a detached, data-viz **world** vs. an intimate, glowing-microscopy **dive**. Cold clinical palette pierced by the disease's signature hue. Touchstones: Contagion, Annihilation, Alien: Isolation, Plague Inc.

**Why:** Original and mature (Plague Inc's elegant cousin), pairs with the strategic depth, and stylized execution is art-feasible for a solo + Claude team (photoreal body-horror would be the scope / uncanny-valley cliff).

**Reversibility:** Medium — direction can shift with an artist on board, but it shapes early art/UI choices.

**Revisit if:** Playtests want more personality/levity, or an artist brings a stronger direction.

---

## 2026-06-01 — Third faction = a rival (post-MVP), not a class

**Context:** Clarifying the "third faction" idea from day one — is it a rival force, or just another playable class?

**Options considered:** rival (a competing pathogen as a third in-world force) vs. "just another playable class" (already covered by the bacteria/virus/fungus/parasite roster).

**Decision:** The third faction is a **rival** — a competing pathogen as a third force (you vs. humanity vs. rival), distinct from the playable-class roster. Antagonist *and* opportunity (soak humanity's attention, co-infect/recombine). It needs opponent AI, so it's **post-MVP**; build cheap-to-rich: **NPC force** (a second auto-spread presence, almost no AI) → **smart AI rival** → **PvP** (a rival is just a second player). Captured as a direction; mechanics deferred.

**Why:** A third force adds genre-classic richness the playable classes don't (they're variety, not competition); the cheap NPC-force rung delivers the three-body feel without heavy AI, and the path leads naturally to multiplayer.

**Reversibility:** Easy — deferred; the rung-1 NPC version is low-commitment.

**Revisit if:** We pursue PvP early (jump to rung 3), or three-body dynamics prove to muddy the core fantasy.

---

## 2026-06-01 — Meta-progression (horizontal unlocks) + Game Speed as the pacing dial

**Context:** Defining the between-run layer, and correcting an earlier conflation — Civ's player-facing choice (per Brian's reference) is **Game Speed = campaign length**, not difficulty. (Refines the "Player-configurable pacing & difficulty" entry below.)

**Options considered:** Meta — horizontal unlocks vs. vertical power vs. hybrid. Pacing dial — Game Speed (length tiers) vs. a difficulty slider; whether to ship a difficulty axis in the MVP at all.

**Decision:** Meta-progression is **horizontal unlocks only** (Slay the Spire): a run = one campaign (everything in-run resets); between runs you unlock new *options* (classes, entry vectors, cards, relics, hosts incl. eventual zoonotic animals, setup options) — never raw power, since in-run evolution is the power fantasy. Unlocks are **achievement/milestone-gated** (win with a class, reach a tough organ, win via Extinction *and* Endemic, win at faster speeds), which also supplies mastery/prestige — **no separate ascension ladder**. The headline player dial is **Game Speed** — Civ-style length *tiers* that scale the whole clock proportionally and *tilt playstyle* (long → Endemic/patient, short → Extinction sprint). **Difficulty** (how hard humanity fights) is a separate, secondary axis, **deferred**. All dials ride on tuned defaults; the prototype ships one default.

**Why:** Horizontal unlocks fit the deckbuilder DNA, respect skill, avoid grind/power-creep, and are cheapest to build. Game Speed delivers the Civ "let the player decide" intent (length) and doubles as a playstyle lever; deferring difficulty keeps the prototype lean.

**Reversibility:** Easy — add a difficulty axis or a light vertical layer later; tune unlock triggers.

**Revisit if:** Horizontal unlocks don't sustain replay (consider a light vertical layer), or players want a difficulty knob sooner.

---

## 2026-06-01 — Player-configurable pacing & difficulty (Civ-style)

**Context:** Macro pacing/difficulty needs a value (e.g., world-time per dive). Rather than the designers hard-setting one, expose it to the player — like Civ's game speed / difficulty / map size.

**Options considered:** designers fix a single pacing/difficulty; expose player-facing settings (Civ-style); expose settings with no tuned default.

**Decision:** Pacing and challenge are **player-configurable in campaign setup** (alongside the patient-zero loadout): **Game Speed** (world-time per dive + clock rate), **Difficulty** (humanity aggression, herd-immunity rate, immune toughness), **Map size** (region count); win-condition toggles possibly later. These sit **on top of tuned defaults** — we still must nail one core feel — and it's a **full-game** feature; the **prototype ships a single default** to validate the loop.

**Why:** Player-set pacing/difficulty is a genre strength (Civ) and extends the campaign setup we already have; but options must orbit a well-tuned baseline, and balancing across the range is full-game work, so the prototype uses one setting.

**Reversibility:** Easy — settings can be added/removed; defaults retuned.

**Revisit if:** The range proves unbalanceable, or players ignore the knobs (then trim to a default + one or two presets).

---

## 2026-06-01 — Geoscape model: selector + react, with cards + relics

**Context:** The world layer (the "world falling" spine) was thin next to the dive. Needed the player's role there, the map, and how the deckbuilder DNA survives now that evolution is earned in dives.

**Options considered:** Role — selector+react vs. strategist+builder vs. full grand-campaign. Map — stylized world vs. abstract graph vs. full detailed world. React layer — cards vs. abilities vs. pure dive-selection; relics as a separate layer vs. unified with evolutions.

**Decision:** The geoscape is **selector + react** (real-time-with-pause): the world auto-runs; you choose which dives to take (Beachhead / Opportunity / Defense pop-ups, triaged because each costs world-time) and react. The board is a **stylized world map** (~12–20 regions + routes). The build layer is **cards + relics** (Slay the Spire's two tiers): **relics = your evolutions** (one unified system; rare ones run-defining), **cards = a light reactive hand**. Dives feed both.

**Why:** Selector+react keeps the dive the star and is the right MVP weight; a stylized map sells "the world falling" while staying tractable; cards+relics keeps the deckbuilder pillar alive at world scale while unifying relics with dive-earned evolutions (fewer systems).

**Reversibility:** Medium — the geoscape can deepen toward strategist/grand-campaign later; map granularity is tunable.

**Revisit if:** The geoscape feels too passive (deepen the role), or cards+relics adds friction (trim toward pure dive-selection).

---

## 2026-06-01 — Dive maps: regional sub-maps as the variety engine

**Context:** Human anatomy is fixed, so a single whole-body dive map risks feeling samey across many dives. Needed a source of variety that survives anatomical realism.

**Options considered:** one whole-body map + modifier layers; multiple regional sub-maps (thorax / abdomen / head / …); fully procedural anatomy.

**Decision:** Each dive is a **regional zone-map** (one body region), and the regions themselves are our distinct "maps." The **bloodstream is the connective highway** between regions (deep-runs cross at higher Heat). Variety = regions × layered modifiers (host state, entry point, mission, procedural micro-layout). Evolution is accumulated **across** dives and regions, not crammed into one. (Zoonotic / non-human hosts are a deferred way to add still more maps.)

**Why:** Regional maps give XCOM-style tileset variety while keeping a fixed, learnable anatomy; the per-dive limit becomes the campaign's progression and "which region do I dive?" strategy rather than a constraint. Scales as a clean content pipeline (add regions over time).

**Reversibility:** Medium — could collapse back to a single whole-body map if regional content proves too costly.

**Revisit if:** Building distinct regions proves too art/design-heavy, or regional scoping hurts the "spreading through a body" feel.

---

## 2026-06-01 — Dive board, controls, and campaign start

**Context:** Resolving the two threads that gate any dive prototype — the dive's spatial structure and its control scheme — plus how a campaign begins (patient zero).

**Options considered:** Board — node-graph vs. zone map vs. continuous "blob" spread. Tempo — active-pause vs. pure real-time vs. slow ticks. Start — a fixed default vs. a small player-chosen loadout.

**Decision:** The dive plays on a **zone map** (portal organs + connective bloodstream + breachable barriers; no physics/pathfinding). Controls are **active-pause, zone-command** — click zones and borders to spread, breach, spawn/station strains, plant colonies, or go dormant; no unit micro. Touchstone: *They Are Billions*, theme inverted (you're the infection; the immune system is the escalating swarm). An evolved **vector does triple duty** — geoscape reach, dive spawn point, and available exit (how you escape host N is how you enter host N+1). **Patient zero** is a small starting loadout: class + entry vector + 1–2 traits.

**Why:** A zone map feels like a spreading front while staying tractable. Active-pause makes the tension about decisions, not APM, and honors "not micro." Entry = exit closes the micro/macro loop and makes vectors triply meaningful. A small loadout grants opening agency without stealing from the earned-by-diving pillar.

**Reversibility:** Medium — board granularity and tempo can be retuned in prototype; the zone-map + active-pause foundation is load-bearing.

**Revisit if:** The zone map feels too board-gamey (continuous spread is the later dream), active-pause drags, or the loadout grows large enough to undercut earned evolution.

---

## 2026-06-01 — Core concept and design spine

**Context:** First game-design session. Needed to fix what the game fundamentally is, and its north star, before detailing systems.

**Options considered:** Which influence to make primary (Total War RTS / grand-strategy spread / deckbuilder); a single genre vs. a fusion.

**Decision:** A disease-takeover grand-strategy game fusing Total War (campaign + battles), deckbuilder, Spore (evolution), and Plague Inc (world dread). The spine and north star is "the world falling" — the player should feel the planet tipping, region by region.

**Why:** The most distinctive and most achievable framing, and it gives every system a test: does it serve the world-falling feeling?

**Reversibility:** Hard — this is the game's identity.

**Revisit if:** Prototyping shows the world-falling fantasy doesn't land, or another pillar proves more fun.

---

## 2026-06-01 — The body-dive battle IS the evolution mechanic, and is the MVP core

**Context:** Mid-session pivot. The earlier lean was a geoscape/card game with auto-resolved battles and the RTS deferred to a later phase. Brian proposed a radically different core.

**Options considered:** (a) Auto-resolve battles in the MVP, build the RTS later (earlier lean); (b) make the RTS battle the core, where how you play it determines how you evolve.

**Decision:** The RTS "dive" into a host body IS how you evolve — survive and spread, harvest cells, reach organs to earn transmission vectors, and escape before you're caught. The dive is the MVP core; it is not auto-resolved.

**Why:** Mechanic equals fantasy; gives the RTS a novel purpose (extraction, not base-race); links the body (micro) to the world (macro) diegetically; and resolves the kill-vs-spread tension through the dual win. Judged stronger than the earlier framing.

**Reversibility:** Hard — reshapes the entire MVP and build order.

**Revisit if:** A cheap prototype of the dive loop proves un-fun or infeasible for a solo + Claude team; fall back to the auto-resolve framing.

---

## 2026-06-01 — Dive form: directed-spread hybrid

**Context:** Needed to fix what the player controls moment-to-moment inside a dive.

**Options considered:** (1) directed infection-spread (you ARE the infection); (2) reverse-tower-defense route push; (3) unit-command RTS (StarCraft-like).

**Decision:** A directed-spread hybrid — a spread/territory core where you guide a growing infection front, plus asymmetric strains (semi-units) and colonies (buildings). Chose 1 while absorbing the wanted parts of 3 (strains and colonies) without full unit micro.

**Why:** Truest to the survive-and-spread pitch; novel (avoids "germ StarCraft"); tractable for solo + Claude; and it delivers Zerg/Terran-style asymmetry cheaply. Brian chose "distinct types + structures" over hands-on squad micro.

**Reversibility:** Medium — controls and feel can shift, but the spread foundation is load-bearing.

**Revisit if:** The spread core feels passive in prototype and needs more direct unit agency.

---

## 2026-06-01 — Two scales connected by pause-with-time-cost

**Context:** Needed to define how the body-scale dive and the planet-scale geoscape relate, including whether the world clock runs during a dive.

**Options considered:** world fully paused during a dive (no cost); concurrent real-time (two live sims); paused, but a dive costs a fixed chunk of world-time.

**Decision:** Two separate pressure systems — body-wide **Heat** inside a dive, planet-wide **Herd Immunity** on the geoscape. The world pauses in real-time during a dive, but finishing a dive advances the world clock a fixed chunk.

**Why:** Keeps each scale focused and buildable (no two live sims at once) while making diving strategically costly — "time is never free." Total War's rhythm.

**Reversibility:** Medium.

**Revisit if:** The fixed time-cost feels arbitrary or drains urgency; concurrent time could be revisited later.

---

## 2026-06-01 — World opposition model and win conditions

**Context:** Needed the geoscape antagonist and the victory/defeat definitions.

**Options considered:** humanity as a strategic AI vs. a reactive/auto system; "Cure" vs. "Herd Immunity"/"Eradication" framing; win by domination vs. saturation vs. living-coverage; a single vs. a dual win.

**Decision:** Humanity is an **accelerating auto-played clock** (generic Response cards on a shrinking interval — no AI). The doom clock is **Herd Immunity** (an SIR model under the hood), not a "Cure"; **Eradication** is its local, per-region face. Win = a **saturation race** (control ~80% before herd immunity locks you out), with **dual win paths**: Extinction (virulent) and Endemic (uneradicable, "common cold").

**Why:** No-AI keeps humanity buildable; SIR/herd-immunity is authentic and legible; saturation avoids the boring victory lap; the dual win gives two playstyles and answers the kill-vs-spread question.

**Reversibility:** Medium.

**Revisit if:** Pacing or snowball problems emerge, or the dual win proves confusing in play.

---

## 2026-06-01 — MVP scope: Bacteria only, prototype the dive first

**Context:** Needed an honest, small first build target consistent with the sustainable-scope and build-play-iterate principles.

**Options considered:** ship multiple classes; build geoscape and dive together; prototype the dive in isolation first.

**Decision:** The MVP ships one class (Bacteria). Build order: prototype the **dive loop alone** first (Colonizer + Breacher + Biofilm, innate-only immunity, a single global Heat meter, near-full visibility — the harvest → breach → escape loop), prove it is fun, then wrap it in a minimal world.

**Why:** The dive's fun is unproven and load-bearing; prove it cheaply before building outward. One class keeps the loop legible to tune.

**Reversibility:** Easy.

**Revisit if:** The dive prototype validates and we expand scope, or it fails and we re-scope.

---

## 2026-06-01 — Decision log format: single running file

**Context:** Need a convention for how decisions get captured ongoing.

**Options considered:**
- Single running log (this file).
- One file per decision, ADR-style (common in engineering).
- Hybrid: running log plus dedicated files for major decisions.

**Decision:** Single running log.

**Why:** Lowest friction for a solo non-developer project. Searchability is fine within one file at the volume we expect. Format can be promoted later.

**Reversibility:** Easy. If volume or search needs grow, split into a hybrid format.

**Revisit if:** This file exceeds ~50 entries, or specific decisions need their own permanent home for linking and referencing.

---

## 2026-06-01 — Team scope: Brian + Claude + future humans

**Context:** Setting up RACI requires knowing who exists or might plausibly exist on the project.

**Options considered:**
- Solo (Brian + Claude only).
- Plus future humans (artist, composer, playtesters).
- Plus future AI specialists (art generation, music, level design).
- All of the above.

**Decision:** Brian + Claude as active. Visual Artist, Audio Designer, and Playtester reserved as planned/vacant slots in `AGENTS.md`. AI specialists not reserved.

**Why:** A solo coder with Claude can ship a small game, but a video game generally needs a human eye and ear at some point for art and audio. Reserving slots now avoids retrofitting RACI when the roles get filled. AI specialists can be added later if specific needs emerge.

**Reversibility:** Easy. Add or remove planned roles in `AGENTS.md`.

**Revisit if:** Direction makes any of these roles unnecessary (e.g., the game is text-only) or new roles emerge (level designer, narrative designer, community manager).

---

## 2026-06-01 — Project scaffolded with standard governance structure

**Context:** Starting a new video game project. Brian is non-developer. Wants best-practice scaffolding aligned before game design begins.

**Options considered:**
- Lightweight (governance files only).
- Standard (governance + `assets/`, `code/`, `docs/` folders).
- Comprehensive (governance + templates + playbooks).

**Decision:** Standard scaffolding — `CONSTITUTION.md`, `AGENTS.md`, `DECISIONS.md`, `CLAUDE.md`, `README.md`, plus `assets/`, `code/`, `docs/` folders with per-folder READMEs.

**Why:** Lightweight defers structure that's known to be needed. Comprehensive imposes templates before knowing the workflow. Standard sets a known floor without committing to formats we haven't validated.

**Reversibility:** Easy. Restructure as the project's actual shape becomes clear.

**Revisit if:** Folder structure friction emerges as we start building, or new collaborators have different conventions.
