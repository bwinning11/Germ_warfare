# Germ Warfare — Game Contours & MVP Vision

**Version:** 0.1 (2026-06-01) · **Status:** Vision/contours doc. *Not* an implementation spec. We are deliberately not building yet.

This captures the shape of the game as brainstormed on 2026-06-01. It is a reference, not a contract — everything here is revisable, and open threads are listed at the end. Major calls are proposed as `DECISIONS.md` entries separately.

---

## 1. One-line concept

A grand-strategy game where you are a disease taking over the world — but **how you evolve is decided by how you play the battles inside a host body.** You fight your way through organs to earn transmission vectors, escape before the immune system catches you, and spread across a living planet that races to make itself immune to you.

Genre DNA: Total War (campaign + battles), Spore (evolution), Plague Inc (creeping world dread), with a light card/event layer.

## 2. Design pillars (the north star)

1. **The world falling.** The player should *feel the planet tipping*, region by region. Every system earns its place by serving that feeling.
2. **The mechanic is the fantasy.** You don't buy "transmissibility +1" from a menu — you claw to the lungs and *earn* coughing. Evolution is something you *do*.
3. **Survive and spread, not kill.** Fitness = reproduction + persistence, not body count. The game teaches this; killing is a strategic *choice*, not the default verb — though an aggressive **Extinction** playstyle deliberately weaponizes lethality (the Burst lane; see §7).
4. **Sustainable scope.** Solo (Brian + Claude). Prove the fun in a tiny prototype before building outward. (See `CONSTITUTION.md`.)

## 3. The two scales

| Scale | What it is | Core pressure |
|---|---|---|
| **The Dive** (one body) | Real-time battle where you evolve | **Heat** — the immune response; maxes out → you're caught |
| **The Geoscape** (the planet) | Live world map where you spread | **Herd Immunity** — the world racing to make itself immune |

These never conflate — and they should *feel* different: **Heat** is urgent and tactical (a fast meter inside one fight), **Herd Immunity** is creeping and strategic (a slow planet-scale clock). They connect through one rule: **finishing a dive advances the world clock a fixed chunk** (diving is never "free").

---

## 4. The Dive — the MVP core

### Form
**Directed-spread hybrid.** You don't micro squads — you *are* the infection, guiding a growing front of infected cells. On top of that spread core sit:
- **Strains** = semi-units (mobile, spend Biomass to spawn).
- **Colonies** = buildings (static nodes you plant).

Chosen over both full unit-command RTS (scope cliff, "germ StarCraft," fights the survive-not-kill thesis) and auto-resolve (gives up the heart). Delivers Zerg/Terran-style asymmetry cheaply.

### The loop
Seed in as one infected cell → **harvest** cells (grow your economy/territory) → **push toward organs** (each unlocks a transmission vector) → **escape/extract** before Heat maxes. Banked over and over, this *is* your evolution.

**Heartbeat:** greed vs. escape — stay longer to harvest and reach more organs vs. get out before the immune system catches you.

### Economy — one resource: Biomass
Harvesting (converting healthy cells) is your income. Spend Biomass on strains, colonies, and abilities. **You don't carry Biomass out — that's your in-dive body.** You bank **evolution**: vectors (from organs), virality (from spread/survival), resistances (from defenses beaten), and any strains/colonies you proved out.

**Pickups (treasure, not a second currency):** discrete boons scattered in the body that reward exploring *beyond* the organs — nutrient/iron pools (biomass caches), **mutagens** (a free relic or temp power), scavenged remnants of a prior infection (a card), or a gland you pop to **cut Heat**.

### Organs = vectors + exits
Reaching an organ does double duty: it **unlocks its transmission vector** (evolution) *and* **opens it as an escape**. Lungs → cough/airborne; gut → diarrhea/fecal-oral; etc. Your **entry portal is always a way out** — you can bail any time — so reaching *new* organs is greedy upside (new vectors + new exits), never required. The vector you leave through shapes how you spread on the geoscape.

### Heat (detection)
A **single body-wide meter** (prototype; per-organ "localized Heat" is a later option). **Continuous value** (smooth feedback/control) crossing **stepped thresholds** that change immune behavior:
- **Calm → Alerted** — innate immunity only.
- **Active → Overwhelming** — adaptive immunity engages; escape now or be cleared.

Heat rises with loud/fast/lethal/large play; falls when you go quiet. **Dormancy** is a general action (not a unit): go latent to cool Heat — safe but slow, and time costs you (the world clock advances per dive).

### The immune system — two tiers (real immunology)
- **Innate (first-line):** generic, fast, always-on — patrolling white cells, inflammation, fever. Doesn't learn. Your early-dive pressure.
- **Adaptive (second-line):** specific, slow to spin up, *learns* — antibodies tailored to your strain, plus memory. Your late-dive pressure. Loud/fast play summons it; going quiet starves it.

**Adaptation is a targeted counter, not a flat multiplier.** The adaptive system builds antibodies against your *most-used strain specifically* (e.g., lean on Brutes too long → antibodies melt Brutes, while Colonizers stay fine). You respond by diversifying, switching tactics, going dormant to let antibody levels decay, or (later) mutating your signature. It changes *which strategy wins*, live.

**Fractal insight:** adaptive *memory* = herd immunity at two scales. One host remembering you = a faster re-clear (secondary response); a population remembering you = herd immunity on the geoscape.

### How a dive ends — two intentional exits + a failure
- **Escape** (Endemic-leaning, the default): bail out a portal and bank your evolution — vectors, plus a **virality/resistance floor** from however much you spread and survived (*every* escaped dive pays; organs are upside). Crucially, the host **stays alive as a compounding asset** — an Endemic region keeps spreading and generating for you — and you stayed *quiet* (low alarm). Escape is the **long game**: a compounding, low-Heat engine.
- **Burst** (Extinction-leaning): go maximally lethal and *kill the host* — death triggers an **explosive super-spread** + a **lethality-spike** evolution. But it **consumes** the host (one-time, now Abandoned) *and* **spikes global alarm**, accelerating herd immunity. High-risk (mistime it, strand yourself with nothing), loud, and fast — the Extinction **sprint** that races its own doom clock. (Real biology — hemorrhagic burst transmission.)
- **Caught** (failure): body-wide Heat maxes before you exit — lose un-banked evolution; the host goes immune (herd immunity ticks up). A bust, not a run-killer.

Killing is a *committed playstyle*, not a mistake — the only bad kill is an accidental one mid-persist. (Unit level: a strain caught = lose that unit + Biomass + a Heat bump that can cascade; the *dive* is lost only when Heat maxes globally.)

### Starter roster (Bacteria — the MVP class)
**Strains:** **Colonizer** (harvester/economy, low Heat) · **Breacher** (opens barriers & organs, medium Heat) · **Brute** (tanky, holds a zone, high/loud Heat).
**Colonies:** **Biofilm** (production + spawn point — your "base").
**Vision:** a free margin around your infection (no scout unit or vision building in the prototype).

*Prototype-minimal set:* **Colonizer + Breacher + Biofilm.** Add the rest once the core loop is proven fun.

The roster doubles as the greed/escape dial (loud Brutes vs. quiet play) and the dual-win selector (aggression → Extinction; persistence → Endemic).

### Spatial layout (the board)
A dive plays out on a **regional zone-map** — one body region (thorax, abdomen, head, …) as discrete connected zones: **portal zones** (organs carrying vectors), **connective zones** (local vasculature), and **barriers** (hardened borders the Breacher cracks). No physics or pathfinding.

**Regions are the variety engine.** Body regions are our distinct "maps" (the XCOM-tileset equivalent), and the **bloodstream is the highway between them** — so a greedy **deep-run** can push into an adjacent region mid-dive at higher Heat. On top of the fixed macro-anatomy sit variable **layers** — host state (smoker, immunocompromised, vaccinated, elderly…), entry point, mission/objective, procedural micro-layout — so the same anatomy plays as a fresh puzzle every time. (A continuous "blob" look, and **non-human / zoonotic hosts**, are later expansions.)

### Entry = exit (vectors do triple duty)
How you escape host N is how you *enter* host N+1 — and *where you spawn* in that dive (lungs → airway, gut → digestive tract, blood → bloodstream, skin → surface). So an evolved vector governs (1) geoscape reach, (2) dive spawn, and (3) available exits. Builds naturally specialize around their dominant vector.

### Campaign setup (patient zero)
The campaign opens on a setup screen (our "Civ setup"). You pick a small **starting loadout** — **class** (Bacteria for MVP), **entry vector** (sets first spawn + initial spread), and **1–2 starting traits** (Hardy / Virulent / Latent / Resilient) — kept deliberately small so earned-by-diving evolution stays the heart (the pool grows later via roguelite unlocks).

Alongside the loadout sit **player-set dials**. The headline is **Game Speed** — Civ-style length *tiers* (Blitz ↔ Standard ↔ Marathon) that scale the whole clock proportionally (herd-immunity rate, world-time per dive, auto-spread, humanity's cadence). Beyond length, speed *tilts playstyle*: long favors the patient **Endemic** / reservoir game, short favors the aggressive **Extinction** sprint. Plus **Map size** (region count). **Difficulty** (how hard humanity fights) is a separate, secondary axis, **deferred** — meantime, challenge comes from meta-unlocks + achievements (§13). All dials ride on **tuned defaults**; the **prototype ships a single default**.

### Control scheme
**Active-pause, zone-command.** Touchstone: *They Are Billions*, theme inverted — you're the infection, the immune system is the escalating swarm. Real-time, but pause/slow anytime to assess and issue orders. You click zones and borders — push the front, plant a Biofilm, spawn/station a strain, breach a barrier, go dormant — never microing individual cells. Tension is decisions under rising Heat, not APM. TAB's signature cascade-failure is already in our Heat model: a strain caught bumps Heat, which can tip a threshold and cascade.

### The network model (v2 — playtest-driven enrichment)
*The minimal prototype's single-verb (expand-only) loop tested **too thin**: with nothing to trade against, Dormancy was a non-decision and the linear map gave no real choices. This deepens the dive into a **network/territory game**. Where it conflicts with the minimal descriptions above (global dormancy, all-owned-zones raise Heat, near-linear map), **this section governs.***

- **Map = a graph, not a line.** Multiple **organ** nodes (each a vector/exit), **connective** zones, **pickup/special** nodes, **many routes** between them, and barrier-gated edges. Chokepoints, loops, and deep-but-rich nodes make topology a real decision.
- **Chains + multiplier.** Owned nodes connected back to your **core** form a network that channels a **resource multiplier** — the larger your connected network, the more biomass per node. The immune system's signature threat becomes **severing** you: cut-off nodes still function and stay yours but drop the multiplier (base only). **Protecting your arteries is the strategic heart** — which is *why* defense matters.
- **Defense (the second verb).** Spend biomass to hold ground: a **Brute** strain actively fights/absorbs responders in a node; a **Cyst** colony fortifies a node (harder to clear or sever). Defense is the alternative to going quiet — keep producing (hot) by investing in holding.
- **Selective dormancy (per node).** Each owned node runs **hot** (produces, feeds the chain, raises Heat, draws immunity) or **dormant** (safe, idle, off the multiplier). Heat comes from your **hot** nodes — so going *selectively* dormant is a live spatial/economic lever (and how you weather a probe without abandoning a node), not a global pause.
- **Pickups & relics in a dive.** **Pickups** sit in specific nodes — a biomass cache, a mutagen, a Heat-purge, a one-shot power — giving reasons to *route toward* particular (often hot/deep) nodes: risk vs. reward. **Relics** are the permanent evolutions you **bank on escape**; some pickups can be carried out as relics.

Net — the dive's verbs become **expand · defend · run hot/dormant · route to pickups · escape**, against an immune system that probes, clears, *and severs*. Every choice a real tradeoff. (Exact multiplier formula, sever rules, and organ/path counts are prototype-tunable.)

---

## 5. The Geoscape — the world layer

A **live, ticking world map** (XCOM-2 geoscape feel). You never click "infect France" — you shape conditions and chance spreads you.

### Regions & lifecycle (disease language)
**Susceptible → Outbreak → Epidemic → Endemic** (entrenched, yours) **→ Pandemic.**
- **Abandoned** — burned out / no hosts left. Inert, removed *in your favor* (narrows your front). No local penalty. Endemic regions are live spread vectors + income; Abandoned ones are done.
- Humanity can force regions to **Contained / Quarantined / Eradicated.**

### Auto-spread
Probabilistic, shaped by the vectors and traits you earned in dives (airborne, fecal-oral, virality, resistances). Routine spread is automatic; **dives are the contested punctuation.**

### Humanity — an accelerating clock (no AI)
Humanity auto-plays one **generic Response card every X minutes**. The interval **accelerates** (X → 0.9X → 0.8X…) driven by your alarm/severity. Events modulate it (pull the next card sooner; **bursts** of double-plays in the endgame). Cards: lockdowns, travel bans, vaccine research, counter-traits, region reclaims.

### Herd Immunity & the SIR model
**Herd Immunity** is the global clock rising against you (not a "Cure"). Under the hood it's the real **SIR** model: **Susceptible → Infected (yours) → Immune (theirs) → Dead (Abandoned).** You push S→I; humanity pushes S→R; lethality pushes I→D. Shown simply: regions changing color + one world-immunity gauge. **Eradication** is the local face of herd immunity (a region flipped back).

### World-events deck
A neutral deck firing environmental events (floods, heatwaves, travel surges) on its own tick, helping whoever they help — to make the planet feel alive.

### Board & player role
A **stylized world map** — a recognizable silhouette abstracted into ~12–20 regions (fewer for the prototype), linked by air/sea/land routes. Your role is **selector + react** (real-time-with-pause): the world runs itself (auto-spread + humanity's clock), and you **choose which dives to take** from surfacing pop-ups — **Beachhead** (break into a new region), **Opportunity** (exploit a superspreader, flood, or vaccine lab), **Defense** (hold a region humanity is eradicating). Each dive costs world-time, so you can't take them all: the game is a constant triage of **expand vs. exploit vs. defend**, racing the herd-immunity clock.

### Build layer: cards + relics (Slay the Spire's two tiers)
- **Relics = your evolutions.** Permanent passives earned by diving (vectors, virality, resistances), spanning common incremental traits up to rare, run-defining mutations. Always-on; they reshape auto-spread and blunt humanity's measures.
- **Cards = a light reactive hand.** Active world plays — Lay Low (cool alarm), Surge, ride a flood, counter a lockdown — drawn and played in the moment; earned from dives, loadout, and world-events.

Dives feed both. Relics and evolutions are **one system** (relics = the rare end of the spectrum), keeping everything flowing from the dive — the deckbuilder pillar, at world scale.

### Macro pacing (light — numbers are prototype-tuning)
The **herd-immunity clock** is the master timer, and the dominant lever is the per-dive cost: **every dive advances the clock a fixed chunk** — *dive = power, time = doom*, the dive's greed/escape one scale up. The arc, one sitting (~a dozen dives): **Opening** (slow burn — beachhead, first relics) → **Mid** (vectors open the map, pop-ups multiply, first Defenses, triage) → **Late** (Endgame trigger fires; humanity bursts; the mirrored final confrontation). Exact pacing/challenge is **player-set** (Game Speed / Difficulty — see §4) on tuned defaults; the prototype runs one default.

---

## 6. Dive ↔ Geoscape integration

- **Dives are triggered as map pop-ups** you choose among (limited actions — "pick your battles"):
  - **Beachhead** — break into a new region/continent.
  - **Opportunity** — exploit a superspreader event, sabotage a vaccine lab, hit a weakened region.
  - **Defense** — humanity is pushing eradication in one of your regions; dive in to hold it.
- **Banked evolution rewires the map:** lungs → airborne (air-travel jumps), gut → fecal-oral (water/low-sanitation), virality → faster spread, resistances → countermeasures bite less. A dive doesn't just *take* a region — it *opens a new way the world falls.*
- **World clock during a dive:** the world **pauses** in real-time so you focus, but **finishing a dive advances the clock a fixed chunk** (humanity acts, herd immunity ticks, auto-spread resolves). Total War's rhythm: the campaign pauses for the battle, but the battle costs a turn.

---

## 7. Win / Lose

- **Win — saturation race:** control ~80% of regions (Endemic + Abandoned both count) before herd immunity locks you out. Skips the tedious mop-up; the cure clock is what you're racing.
- **Dual win (two playstyles):**
  - **Extinction** — go virulent, loud, lethal; burn humanity down.
  - **Endemic** — become the common cold: persistent, low-Heat, *uneradicable*. Win by surviving humanity's total eradication push.
- **Lose:** herd immunity completes / you're eradicated everywhere.

*(Tuning watch: Abandoned counts toward saturation, so make sure a lethal **Burst** build can't trivially "win by depopulation" — Extinction should still demand global reach, not just torching a few dense regions.)*

## 8. End game (avoiding the genre's anticlimax)

1. **Endgame trigger + crescendo.** When the lead meter crosses a line (herd immunity 60% *or* your control 70%), humanity accelerates hard and plays in bursts; UI/sound signal "this is it." Kills the long tail.
2. **Mirrored final confrontation** (the heart):
   - *Your win:* hitting saturation triggers humanity's **Global Eradication Effort** — you must **survive a final onslaught** to seal it (a last stand, not a victory lap).
   - *Humanity's win:* herd immunity completing deploys as a **vaccine rollout** that telegraphs — you get a **window to disrupt it** (sabotage/mutate via pop-up dives). A comeback path.
3. **Anti-snowball valves** (debatable, cuttable): light rubber-banding so both sides reach the climax in contention. Flagged divisive — prototype and feel it out.

## 9. Classes

All four eventually; the same strain/colony framework, retuned per class.
- **Bacteria** (MVP) — resilient generalist; sturdy Biofilms, strong Brutes, drug resistance.
- **Virus** — fast mutator; cheap Colonizers, almost no colonies (hijacks, doesn't build), fragile.
- **Fungus** — patient creeper; dominant colony/mycelium game, slow, stealthy, environmental.
- **Parasite** — hidden manipulator; stealth-led, keeps the host alive, near-zero Heat.

---

## 10. The MVP slice

**The smallest thing that proves the game is fun.** Order matters:

**Step 1 — prototype the dive, first and alone.** Tiny, ugly, one body: Colonizer + Breacher + Biofilm, innate-only immune system, single global Heat meter, near-full visibility. Just the **harvest → breach → escape** loop. *If this core isn't fun, nothing above it matters.*
  - *What Step 1 proves:* the dive is **mechanically satisfying** moment-to-moment — the harvest/breach/escape rhythm and the greed-vs-escape read under a rising Heat meter.
  - *What it does NOT prove* (so don't over-read a "fun" result): **strategic depth** (adaptive immunity + fog of war, both deferred), **run variety** (one region only), and **Escape/Burst balance**.
  - *Success criteria:* (1) the greed-vs-escape decision feels genuinely tense; (2) a new player can **read the Heat curve within ~2 dives** — the core skill is teachable, not punishing-by-surprise.

**Step 1.5 — add adaptive immunity.** Before wrapping a world, layer in the adaptive/antibody system to test whether the dive is *strategically deep*, not merely satisfying — the other half of the dive bet.

**Playtest update (v1 → v2 → enrich):** v1 was illegible and unfair; a fix pass (onboarding, start-paused, telegraphed Heat, loud feedback) made it legible (v2). v2 then exposed the deeper problem — the loop is **too thin** to be fun. So the **next prototype targets the enriched network dive** (§4 *network model*: chains/multiplier + a defense verb + selective dormancy), *then* adaptive immunity. See `docs/plans/2026-06-01-dive-prototype-findings.md`.

**Step 2 — wrap it in a minimal world.** One class (Bacteria), a reduced map (~a dozen regions), auto-spread, humanity-as-clock, herd immunity, world-events, pop-up dives, the saturation-race win and herd-immunity loss. Winnable/losable in a single sitting.
  - *Success criterion:* the **expand / exploit / defend triage** is a genuinely hard recurring choice — that, not the Game Speed slider, is the geoscape's strategic depth.

## 11. Deferred (the roadmap, not the MVP)

- More classes (Virus → Fungus → Parasite)
- Full-planet map + more content
- The **adaptive** immune layer (prototype is innate-only)
- **Fog of war** (prototype starts near-full visibility)
- **Localized (per-organ) Heat**
- Fuller roster: Brute/Creeper(mobile scout)/Cyst/Mutagen colony, etc.
- Deeper RTS feel + a C&C-style **skirmish/mission mode**
- Strategic humanity **AI** + head-to-head play
- **The third faction = a rival** (a competing pathogen as a third force — you vs. humanity vs. rival — *not* just a playable class). Breaks the "you vs. the house" binary; antagonist *or* opportunity (let it soak humanity's heat, co-infect to recombine). Needs opponent AI → post-MVP; build cheap-to-rich: **NPC force** (a second auto-spread presence, almost no AI) → **smart AI rival** → **PvP** (the natural bridge).
- Multi-session long campaign
- **Zoonotic / non-human hosts** (bat, pig, bird, mosquito reservoirs) — more maps, plus the species-jump as a strategic, eradication-resistant layer. Potential signature feature.
- Anti-snowball valves (prototype, then decide)

## 12. Open threads (next to resolve)

- The default **world-time cost** of a dive (the Game Speed baseline — now a player setting, but still needs a tuned default).
- **Map representation** for the geoscape (geographic regions vs. node map; count; transmission routes).
- Whether the geoscape keeps a literal "deck" or becomes a simpler event system.
- **Session-length** targets (dive length; campaign length).
- Third-faction design.

*(Resolved 2026-06-01: dive spatial layout → zone map; control scheme → active-pause zone-command; entry = exit vectors; patient-zero loadout. See §4.)*

## 13. Meta-progression (post-MVP)

A **horizontal-unlock** roguelite (Slay the Spire model): a *run* = one campaign; in-run evolutions, relics, cards, and map all reset. Between runs you unlock new **options, never raw power** — the in-run evolution already *is* the power fantasy.

- **Unlocks:** classes (Virus → Fungus → Parasite), loadout options (entry vectors, starting traits), cards & relics (enter the pool as encountered), hosts & regions (eventually the zoonotic animals — reservoirs + the species-jump), and setup options (Game Speeds, map sizes).
- **Triggers:** achievement/milestone-based, not currency — win with a class, reach a tough organ, win via Extinction *and* Endemic, win at faster Game Speeds. Each win hands you a new toy.
- **Challenge/mastery** comes from those achievements (across Game Speeds), not a separate ascension ladder or grindable power.

## 14. Tone & aesthetic

**Clinical-sinister — elegant menace** (stylized, never photoreal). Played straight: you're *evolution*, indifferent — the unease and the thrill come from how satisfying it is to watch a calm, clean world destabilize.

- **Signature image:** the disease's signature color creeping across a cold, clean world map — "the world falling," refined.
- **Two scales, one cold elegance:** the **world** is detached and clinical (data-viz, sparse UI, measured newsfeeds, death tolls as *data*); the **dive** is intimate and alive (glowing, semi-abstract microscopy turned ominous; your infection as mesmerizing crystalline-organic growth). The dispassionate-planet vs. teeming-body contrast is the signature.
- **Palette:** cold clinical base (whites, surgical blues/teals, negative space) pierced by the disease's striking signature hue; clean medical typography.
- **Audio:** cold ambient and clinical hums; sparse ominous swells tightening as Heat / herd-immunity climb; the world's response sliding from detached reportage into controlled panic.
- **Touchstones:** *Contagion* (cold dread), *Annihilation* (beautiful-wrong biology), *Alien: Isolation* (elegant-sinister UI), Plague Inc's map dressed up.

---

*Logged decisions for this session are proposed separately for `DECISIONS.md`. See `CONSTITUTION.md` for governing principles.*
