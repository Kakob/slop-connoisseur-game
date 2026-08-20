# SPEC.md — chatdex-game v1: the round engine

*This spec is Phase 0 of ROADMAP.md. Later phases (playtest, web MVP, Chatdex adapter, portfolio layer) are context for humans, not tasking for the agent.*

## Mission
Build the event-sourced engine for the Chatdex party game: a match runs modes drawn from the mode registry, players (simulated in v1) forge and detect AI text, and every match emits a valid `game.round.v1` JSONL trace. v1 is **engine + terminal demo + simulated players**. No networking, no UI, no persistence beyond trace files.

## Architecture (already decided — do not relitigate)
- **Event sourcing**: the JSONL event stream is the only truth; `MatchState` is a pure fold (`applyEvent`). Snapshots may be added later as optimization only.
- **Projections**: `perSeatView(stream, seat)` filters what a seat may see (pre-reveal: no provenance, no bot identity anywhere). `blind(stream)` drops `round.revealed` for analysis. Same mechanism.
- **Registries** (`registries/`, `decks/`, `bot/`): versioned content, loaded and validated at startup. Modes are `ModeSpec` data; the engine is a generic round-runner possessing three verbs (forge, detect, steer — steer may be stubbed) and one judge family in v1 (peer).
- **Determinism**: match seed drives all shuffles, bot timing jitter, and simulated-player scripts. Same seed + same inputs = byte-identical trace (excluding wall-clock `at` fields, which come from the injected clock — in tests, a fixed logical clock, so traces ARE byte-identical).

## Mode inventory (complete)
v1 engine must run: **classic, slop, human_detector, temperature, finale** (trigger: bot escaped ≥2 rounds; listening context policy; finale deck).
Schema-present but v1-rejected (`mode_extension` — loader recognizes, engine refuses with a clear error): **jailbreak, does_it_run, prompt_battle, spot_the_bug**. Their events (`exchange.message`, `judge.result`) must round-trip through validators and the fold as opaque-but-valid records.

## Milestones and gates
**M0 — scaffold.** TS strict, Vitest, lint, fixed-clock and seeded-RNG utilities. *Gate: `npm test` green on a trivial fold test.*

**M1 — contract.** Runtime validators for every event type; registry loaders (modes, chips, decks, bot). *Gates: `fixtures/sample-round.jsonl` parses and validates; a stream with an unknown mode/genre/judge id fails loudly; `blind()` of the sample contains zero provenance fields (assert by deep scan for the keys).*

**M2 — fold + projections.** `applyEvent`, `MatchState`, `perSeatView`, `blind`. *Gates: folding the sample round yields the expected state snapshot (checked into fixtures); property test — for all seats, no pre-reveal per-seat view ever contains `provenance`, `bot_harness`, or any structural marker distinguishing the bot's seat.*

**M3 — round state machine.** Phases forge → lineup → vote → reveal → score against the injected clock; AFK auto-submit at deadline. *Gate: a full classic round with 4 simulated players emits a valid, correctly ordered event stream.*

**M4 — scoring.** Config-driven; reasons from the points table. *Gates (property tests): every point delta has a `score.awarded` with reason + refs; `found_bot` fires iff the picked lineup entry's provenance has `author: "bot"`; evidence bonus fires only when the pick was correct AND ≥2 voters' spans overlap; totals equal the sum of awards (conservation).*

**M5 — bot player.** `BotPlayer` interface; `MockBotPlayer` with fixture responses; timing simulator emitting `composition.event`s for both profiles in `bot/bot-v0.json`; decoy vote; live `AnthropicBotPlayer` behind `RUN_SMOKE=1`. *Gates: a metadata-only classifier test (all text stripped) must identify the bot's seat at chance rate across 200 seeded matches; humanized-profile composition summaries fall within human simulated-player ranges.*

**M6 — modes.** ModeSpec loader wired to the round-runner; slop (funniest tally), temperature (persona assignment, sealed hash, attribution scoring), human_detector (provenance intents flip), finale (trigger check, listening context assembled from match transcript, finale deck, house pot). *Gate: the golden scenario below runs end-to-end.*

**M7 — golden fixture + demo.** Encode the golden scenario as `fixtures/golden-match.jsonl` + expected final-state snapshot; human blesses; both freeze. Terminal demo: `demo:match` replays it with narration; `demo:interactive` seats a human at the keyboard among simulated players. Finished matches finalize their trace into `traces/outbox/{match_id}.jsonl` (INTEGRATION.md v1 contract). *Gates: seeded re-run reproduces the golden trace byte-identically; demo plays a full 5-round match without error and leaves a valid trace in the outbox.*

## Golden scenario — "Apology Night" (seed 42)
Seats: S1 Maya (`code: pro`), S2 Dev (`some`), S3 = bot, S4 Priya (`none`). Simulated players are scripted, not clever: each has fixture texts and fixed votes per round.
- **R1 classic**, one_liner, `apology-leftovers-01`. Bot escapes (S1→S4's entry, S2→S1's, S4→S2's; bot decoy→S1's). House 1.
- **R2 slop**, one_liner, `hype-linkedin-01` variant tier. Funniest tally: S4 wins. No ground truth.
- **R3 classic**, medium, `condolence-plant-01`. Bot escapes again (votes scripted, one vote hits a human paster: S2's `method: pasted` entry catches `materialized` spans from two voters — evidence bonus denied, pick wrong). House 2 → **finale armed**.
- **R4 temperature**, medium, `toast-coworker-01`; personas corporate/genz/passive-aggressive/pirate. S1 attributes 3/4 correctly.
- **R5 finale**, `finale-bedroom-01`, listening context, humanized timing. S4 finds the bot (evidence span on its one too-tidy sentence, S1 overlaps → bonus paid). Humanity holds; match ends `it_got_in: false`.

## Out of scope for v1 — do not build
Websockets/lobbies/rooms · any web or mobile UI · auth or accounts · deployment · jailbreak engine support (events validate only) · code-mode harness or sandboxing · corpus export/scrubbing pipeline · Bouncer solo mode · matchmaking · spectator streams · bucket sync worker and push webhooks (pipeline decisions live in INTEGRATION.md; v1's only pipeline duty is writing finalized traces to `traces/outbox/`). If tempted, see CLAUDE.md hard rules.

## Definition of done
All gates green, QUESTIONS.md answered or empty, golden fixture blessed and frozen, `demo:interactive` playable start to finish, and the session's own Claude Code JSONL saved to `traces/` — the run that builds the game is Chatdex ingestion sample #1.
