# Agents & RACI

Who's on the project and who's accountable for what.

## Roster

### Active

- **Brian Winter** — Founder, Game Designer, Product Owner. Non-developer. Final decision authority. Email: bwin@hihank.com.
- **Claude** — Technical Lead, Implementer, Researcher, Reviewer. Operates per `CLAUDE.md` and this RACI.

### Planned / Vacant

These roles are reserved. RACI rows reference them so we don't have to retrofit when they fill.

- **Visual Artist** — Concept, character, environment, UI art. (TBD)
- **Audio Designer / Composer** — Music, SFX, voice. (TBD)
- **Playtester(s)** — Structured feedback during iteration. (TBD)

New roles get added here when needed; their RACI gets added below.

**Current phase:** Brian + Claude only (design / prototype). The reserved roles activate once there's a build to playtest — Playtester first, then Artist / Audio as the prototype proves out.

**Player archetypes:** audience segments and design review lenses live in `docs/player-archetypes.md` — use them to pressure-test decisions ("does this land for the strategy super fan? the deckbuilder fan?"). Those are the *player-facing* agents; the roster below is the *build-facing* one.

## RACI

**Legend:**
- **A** — Accountable (owns outcome, has final approval)
- **R** — Responsible (does the work)
- **C** — Consulted (input invited before decision)
- **I** — Informed (kept in the loop)

Every activity has exactly one A. Multiple roles can be R, C, or I.

| Activity | Brian | Claude | Artist | Composer | Playtester |
|---|---|---|---|---|---|
| Game vision & direction | A,R | C | I | I | I |
| Design decisions (mechanics, scope) | A | R,C | C | C | C |
| Constitution amendments | A,R | C | I | I | I |
| Decision logging | A | R | I | I | I |
| Engine / tool selection | A | R,C | C | C | I |
| Code implementation | A | R | — | — | — |
| Code review | A | R | — | — | — |
| Bug fixes | A | R | — | — | — |
| Visual art direction | A,R | C | C | I | I |
| Visual art production | A | C | R | — | I |
| Audio direction | A,R | C | I | C | I |
| Audio production | A | C | I | R | I |
| Playtesting & feedback | A | C | I | I | R |
| Documentation | A | R | C | C | C |
| Research (market, references, tech) | A | R | C | C | I |
| Publishing & marketing | A,R | C | I | I | I |

### Notes

- Brian is **Accountable** on everything. That doesn't mean he does the work — it means he owns the outcome.
- "Claude as R,C" on design decisions means Claude can help structure the thinking and surface tradeoffs, but Brian decides.
- When a vacant role gets filled, return here and confirm or revise the row before the new collaborator starts work.
- This RACI is itself amendable. Log changes in `DECISIONS.md`.
