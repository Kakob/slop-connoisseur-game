# CLAUDE.md — Slop Connoisseur

Standing conventions for agent sessions in this repo. The specs define *what* to build; this file defines *how to behave while building it*.

## Source of truth
Read in this order — later documents never override earlier ones:

1. `DIRECTION-RESET.md` — current product direction
2. `SPEC-prototype.md` — prototype requirements, milestones, acceptance criteria
3. `README.md` — orientation and vocabulary

Everything under `/archive/` (including `archive/chatdex-era/`) is **historical material only**. Never infer requirements, architecture, terminology, schemas, or assumptions from it unless a current root-level document explicitly references it. There is no Chatdex dependency.

## What this is
A standalone prototype game about humans and machines recognizing, imitating, and preferring one another's writing. Two mirrored modes: **M0 Hide From Machines** (solo human hides among five machine contestants) then **M1 Find The Machine** (machines hide among humans). The goal is a playable laboratory for learning whether the game is fun — not production polish.

## Hard rules
- **Laws vs. tunables (SPEC §4).** Game laws — judge blindness, no provenance before reveal, judgment locking before reveal, specimen immutability, machines as untrusted participants — are enforced by game state and code structure, never by prompting or configuration. Tunables (timers, risk tiers, scoring constants, retry limits, model choices, personas) live centralized in config, never scattered through UI/components.
- **Information boundaries are structural.** Context builders for writer/detection/taste calls accept only the data those roles are allowed to see (SPEC §16). If a function could pass hidden provenance to a model payload, the design is wrong — stop and restructure.
- **Specimens are immutable.** Transformations create descendant specimens with recorded derivations. Appearances, not specimens, represent in-round use.
- **Preserve raw data.** Every individual judgment, every round event, and full model/persona/strategy metadata is persisted (SPEC §15, §21, §22). Displayed scores must be recomputable from stored raw records.
- **No red-test advancement.** A failing test is a wall, not a speed bump. Fix it or write QUESTIONS.md; never comment out, skip, or weaken a test to proceed.
- **Commit at every green milestone** with message `M{x.y}: {description}` matching SPEC §36 milestones. Never batch multiple milestones into one commit.
- **Timebox**: if a single milestone exceeds ~45 minutes of effort, stop, commit WIP on a branch, and write QUESTIONS.md.
- **The real API is smoke-only.** All tests use the deterministic `MockModelProvider`. Exactly one smoke test hits the live Anthropic API, gated behind `RUN_SMOKE=1`, skipped otherwise.
- **No new dependencies** beyond package.json without noting the reason in the commit message. No frameworks. This is a library + minimal local web app (vanilla HTML/JS served by `node:http`).
- **Never modify `SPEC-prototype.md` or `DIRECTION-RESET.md`** without an explicit human instruction in this session. If implementation pressure suggests a spec change, STOP and write the case in QUESTIONS.md instead.

## Stack and layout
- TypeScript strict, Node 22, Vitest, ESM. No frontend framework — the M0 surface is a minimal local web app (vanilla HTML/JS, `node:http` server, no build step for the client).
- `src/config/` tunables · `src/domain/` entity types + ids · `src/store/` append-only persistence · `src/engine/` round state machine, anonymization · `src/scoring/` · `src/providers/` ModelProvider interface, Anthropic impl, deterministic mock, offline demo · `src/contestants/` personas + strategy versions + context builders · `src/content/` seed prompts · `src/web/` GameSession + HTTP server + static client (`src/web/public/`), including the `/lab` Slop Lab debug surface · `test/`
- Commands: `npm test` · `npm run play` (serves the game at http://localhost:8787; `npm run play -- --mock` for offline canned play) · `RUN_SMOKE=1 npm test` (includes live-API smoke)
- API payloads to the browser are contestant-facing until reveal: pre-reveal endpoints return labels + texts only (§33); full provenance flows only through the post-reveal results and `/lab`.

## Style
- Small pure functions over classes wherever possible. Scoring, anonymization, and state transitions are pure and take injected clock/randomness; I/O lives at the edges (providers, store, terminal).
- Every exported function gets a one-line doc comment saying what it derives or enforces, not how.
- Property tests (fast-check) for scoring and eligibility invariants; example tests for everything else.
- Loading fails loudly: an unknown persona id, strategy id, prompt id, or malformed stored record is a startup error, never a silent skip.

## Escape hatch
QUESTIONS.md at repo root: append the question, the two best options as you see them, your recommendation, and continue with the *smallest reversible choice* if truly blocked — flagged with `// PROVISIONAL(Q{n})` at the site.
