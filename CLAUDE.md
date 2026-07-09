# CLAUDE.md — chatdex-game

Standing conventions for agent sessions in this repo. SPEC.md defines *what* to build; this file defines *how to behave while building it*.

## What this is
Chatdex's game surface: an event-sourced party game engine ("forge AI slop, find the real bot") whose traces (`game.round.v1`) are Chatdex ingestion data and, with consent, a human–AI discrimination corpus. The schema in `schema/` is **approved and frozen** (decisions D1–D14 in schema/SCHEMA.md). How traces reach Chatdex is decided in INTEGRATION.md; the phase plan to MVP is ROADMAP.md — v1's only pipeline duty is the `traces/outbox/` write; everything else in those two files is future context, not tasking.

## Hard rules
- **Never modify `schema/` or `registries/` without an explicit human instruction in this session.** They are the contract. If implementation pressure suggests a schema change, STOP and write the case in QUESTIONS.md instead.
- **State is a pure fold.** `applyEvent(state, event) → state` does no I/O, no `Date.now()`, no `Math.random()`. All randomness flows from the match seed; all time flows from the injected clock. If you find yourself reaching for either inside the fold, the design is wrong — stop.
- **No red-test advancement.** A failing test is a wall, not a speed bump. Fix it or write QUESTIONS.md; never comment out, skip, or weaken a test to proceed.
- **Commit at every green gate** with message `M{n}: {gate description}`. Never batch multiple milestones into one commit.
- **Timebox**: if a single milestone exceeds ~45 minutes of effort, stop, commit WIP on a branch, and write QUESTIONS.md.
- **The real API is smoke-only.** All tests use `MockBotPlayer` (deterministic fixtures). Exactly one smoke test hits the Anthropic API, gated behind `RUN_SMOKE=1`, skipped otherwise.
- **No new dependencies** beyond package.json without noting the reason in the commit message. No frameworks. This is a library + terminal demo.

## Stack and layout
- TypeScript strict, Node 22, Vitest. ESM.
- `schema/` contract (frozen) · `registries/` + `decks/` + `bot/` content (frozen) · `src/engine/` fold, projections, round state machine · `src/scoring/` · `src/bot/` BotPlayer interface, mock, timing simulator · `src/modes/` ModeSpec loader · `src/demo/` terminal runner · `test/` · `fixtures/`
- Commands: `npm test` · `npm run demo:match` (scripted golden scenario) · `npm run demo:interactive` (you + simulated players in the terminal) · `RUN_SMOKE=1 npm test` (includes live-API smoke)

## Style
- Small pure functions over classes wherever possible. The fold, projections, and scoring are pure; the state machine and I/O live at the edges.
- Every exported function gets a one-line doc comment saying what it folds/derives, not how.
- Property tests (fast-check) for scoring and projection invariants; example tests for everything else.
- Registry loading fails loudly: an unknown mode id, genre, judge, or a ModeSpec referencing a verb the engine lacks is a startup error, never a silent skip.

## Escape hatch
QUESTIONS.md at repo root: append the question, the two best options as you see them, your recommendation, and continue with the *smallest reversible choice* if truly blocked — flagged with `// PROVISIONAL(Q{n})` at the site.
