# DECISIONS.md — Implicit implementation decisions (M0)

Every judgment call made during the M0 build that `SPEC-prototype.md` left open
or unspecified. Recorded so they can be reviewed, ratified, or reversed rather
than silently hardening into architecture. Spec section references in
parentheses. Items marked **⚠ review** are the opinionated ones most worth a
second look during the M0.6 playtest.

One decision was explicitly ratified mid-build and is recorded first; everything
after it was decided silently.

---

## 0. Ratified during the build

### D0. The M0 surface is a local web app, not a terminal game
The spec never names a surface. I initially built a terminal UI (carrying the
"terminal demo" convention from the archived chatdex-era CLAUDE.md — exactly the
assumption-carryover DIRECTION-RESET warns about). When flagged, you chose the
web app: it matches the spec's "textarea" (§5), makes the live timer/word-count
UI trivial, and M1's rooms/links (§30) reuse the surface. Vanilla HTML/JS +
`node:http`, no framework, no client build step.

---

## 1. Toolchain and process

### D1. Runtime/toolchain: Node 22 + TypeScript strict + Vitest + tsx, ESM, no build step
`tsx` added as a dev dependency so `npm run play` runs TS directly
(`tsconfig` is `noEmit`; nothing is ever compiled to disk). Strict extras
enabled: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

### D2. fast-check for property tests
Used for scoring/risk-tier invariants. Carried from the old CLAUDE.md's style
rules into the rewritten one — a convention I chose to preserve, not a spec
requirement.

### D3. Conventions carried from the archived-era CLAUDE.md
Commit-per-milestone (`M{x.y}: ...`), ~45-minute timebox, QUESTIONS.md escape
hatch, mock-first testing with exactly one `RUN_SMOKE=1`-gated live API test.
These are process rules I judged still-good and kept in the rewrite; none come
from the current spec.

---

## 2. Persistence

### D4. Storage is append-only JSONL per entity kind, not a database
(§32 asks for queryable relationships and no single JSON blob, but names no
storage tech.) One `data/<kind>.jsonl` file per entity, loaded into an
in-memory index at startup; queries are code-level predicates. Chosen over
SQLite to keep zero native dependencies for a prototype. Malformed stored
records fail loudly at load.

### D5. Only `round` records are mutable; everything else is insert-only
The spec makes specimens immutable (§12) but says nothing about other entities.
I extended immutability to appearances, judgments, and events at the store
level (`update()` throws), and modeled round phase/timing progression as
re-appended records with last-write-wins on reload.

### D6. `data/` is gitignored
Play data is local and disposable; nothing in the spec addresses this.

---

## 3. Domain modeling

### D7. Specimens carry `creatorContestantId`, `promptId`, and `isBlank`
The spec's conceptual Specimen shape (§12) has none of these. I added
`creatorContestantId` as the server-side provenance link (§33 requires
authoritative server-side provenance *somewhere*; I chose the specimen),
`promptId` for history assembly, and an explicit `isBlank` flag rather than
inferring blankness from `text === "[no response]"`.

### D8. Anonymous positions are integers 0–5, rendered as letters A–F
The spec's UI examples use letters; the data model choice (int position +
derived label) is mine.

### D9. Event vocabulary extended beyond §21
Added `machine_generation_retried` (also used for duplicate retries, with a
`reason` field) and reused `judgment_failed` with a `transient: true` flag for
judge retry attempts vs. permanent failures. §21's list was labeled
"potential events", so I treated it as extensible.

### D10. Contestants are persistent singletons with fixed ids
`human-player` plus `machine-<personaId>` (e.g. `machine-comedian`), created
once and reused across every round. One anonymous human identity, no accounts
(§35 excludes auth). Machine contestant ↔ persona binding is 1:1 and permanent.

### D11. `PROMPT_REVEALED` and `WRITING` are distinct states chained immediately
§5 lists both; since the countdown starts "immediately" they could have been
merged. I kept both for spec fidelity; the transition is atomic in practice.

### D12. `humanResponseMilliseconds` = submission time − `promptShownAt`
§20 names the field but not its definition (could have been measured from
first keystroke). Thinking time counts against the clock.

---

## 4. Words, caps, and blanks

### D13. A "word" is a whitespace-separated token
The spec caps responses at 70 words without defining a word. Punctuation,
emoji, URLs — anything between whitespace is one word.

### D14. Only the timer can create a Blank Specimen — **⚠ review**
An empty *early* submit is rejected by the engine, and the web client's Submit
button is inert while the box is empty. Rationale: §5 says intentional silence
must not emerge accidentally, so the blank path is reachable exclusively via
timeout. Consequence: a player who wants to skip must sit out the full 45s.

### D15. Machine over-cap output is invalid output, not truncated
A machine response over 70 words triggers the §27 invalid-output retry path
rather than being silently truncated (truncation would both mutate "immutable"
text and produce a mid-sentence tell). Persistent over-cap after retries fails
that contestant's generation.

### D16. A machine duplicate that survives all retries is kept and logged — **⚠ review**
§27 says to retry exact duplicates but not what to do if retries are
exhausted. I keep the duplicate (round stays playable) with a
`duplicate retained after exhausting retries` event, instead of failing the
round. Duplicate comparison is exact trimmed-text match among the current
machine set (the human response may not exist yet at generation time, so
human-vs-machine duplicates are not prevented).

### D17. Retried generations leave orphaned specimens behind
Because specimens are immutable and undeletable, a duplicate-retry inserts a
*new* specimen; the superseded one remains in the store with no appearance.
Visible in the lab; harmless; a data-model consequence I accepted.

---

## 5. Model provider

### D18. One low-level provider seam: `complete({system, user, maxTokens}) → text`
(§6 requires independent instantiation and future multi-provider support but no
interface.) All role knowledge lives in the boundary-typed context builders;
the provider knows nothing about the game. Different contestants can get
different providers later by swapping the injected instance.

### D19. Default model `claude-opus-5`, `maxTokens: 4000`, adaptive thinking — **⚠ review**
The spec says model choice is a tunable but names nothing. Both live in
`src/config/tunables.ts`. 4000 tokens is headroom for ≤70-word answers plus
the model's always-on adaptive thinking. A model refusal
(`stop_reason: "refusal"`) is surfaced as a provider error and flows into the
normal retry path; no server-side fallback model is configured. Cost note:
each live round ≈ 15 Opus calls (5 generations + 10 judgments).

### D20. Judge output contract: `{"choice": "X"}` JSON
The spec requires validated structured output (§27) but no format. Judges must
reply with a one-key JSON object; parsing extracts the first `{...}` block
(tolerating prose wrappers), normalizes case, and rejects labels outside the
valid set — rejection triggers the retry path. Chosen over the API's
structured-output feature for simplicity and mock-testability.

### D21. Retry counts: 2 retries (3 attempts) for both generation and judgment
§27 says "configurable limit"; the defaults are mine, in tunables.

### D22. An offline DemoProvider exists (`npm run play -- --mock`)
Not in the spec. Canned persona-flavored answers and label-parsing judges so
the full game loop runs with zero credentials. Engine-law tests never use it
(they script `MockModelProvider` exactly); it powers manual play and the
end-to-end session/lab tests.

---

## 6. Judging

### D23. `minJudgeCount` default is 3 of 5 — **⚠ review**
§27 requires a "configured minimum judge count" but no value. Below 3
successful detection ballots, judgment locking refuses and judging restarts.

### D24. The minimum applies to detection ballots only — **⚠ review**
Taste-judge failures never block locking; taste rate is computed over however
many taste ballots exist. Deception (the core score) gets the quorum
protection; taste degrades gracefully.

### D25. Judging is idempotent per (round, judge, type); restarts re-run only failures
A judging restart after partial failure would otherwise double-ballot the
judges that succeeded. One automatic restart attempt before giving up.

### D26. All 10 machine judging calls run concurrently; the human votes in parallel
The spec requires detection and taste to be *separate calls* with different
candidate sets but says nothing about ordering. Detection does not finish
before taste begins, and the human's taste vote is collected while machine
judging runs.

### D27. Failed judgments are first-class records (`FailedJudgment`)
§27 says "record failed judgment"; I gave failures their own entity (with the
error message) rather than a judgment row with a null choice.

---

## 7. Scoring and distinctions

### D28. Combo threshold values — **⚠ review**
§19 says thresholds are configurable but names none. Defaults chosen:
`highDeceptionRate: 0.8` (4+ of 5 fooled), `lowTasteRate: 0.2`,
`meaningfulTasteRate: 0.4` (2+ of 5), `streakLength: 3`. These are pure
guesses pending playtest.

### D29. "Wins machine Taste" (Hidden Gem) = strict plurality with ≥1 vote — **⚠ review**
The spec doesn't define winning. Ties don't count; the human must strictly
out-vote every other single response.

### D30. Taste rate denominator = machine taste ballots cast
`tasteRate = machine taste votes for human / machine taste ballots`. The
human's own vote is displayed separately and never scored (§18 permits machine
votes to determine the taste score; the denominator choice — ballots cast, not
5 — is mine, and matters when a taste judge fails).

### D31. `deceptionPoints` is rounded to an integer; failed judges shrink the denominator
`round(100 × deceptionRate × multiplier)`. `deceptionRate` divides by
*successful* detection ballots, so a failed judge neither helps nor hurts.

### D32. Streaks recompute from stored rounds; window = exactly the last N rounds
No counters (§19 suggests deriving from stored outcomes "where practical").
A streak needs `streakLength` *consecutive* qualifying rounds including the
current one; blanks break both streaks; fewer than N rounds played = no streak.
Streak lookback counts rounds that reached `RESULTS` (plus the round being
scored).

### D33. Clean Getaway requires a non-blank response
Technically a blank that no machine "finds" would qualify by the letter of
§19; the blank-earns-nothing rule (§5) wins.

### D34. `round_completed` events carry a score snapshot
Raw judgments remain the canonical record (recomputability is tested); the
snapshot is a convenience for the lab and future streak queries, permitted by
§21's "not the only historical record" framing.

---

## 8. Web surface implementation (within ratified D0)

### D35. Three-endpoint round flow with long-held requests
`POST /api/round` (start; machine generation kicks off immediately so the
writing timer masks latency, §5) → `POST .../submit` (blocks until the machine
table is ready, returns taste candidates) → `POST .../taste` (blocks until
judging locks, returns full results). No websockets/polling; fine locally.

### D36. The writing timer is client-enforced — **⚠ review**
The browser counts down and autosubmits at zero; the server trusts the
client's timing and records its own timestamps. Acceptable for a solo
prototype where the player and the operator are the same person; must be
server-enforced for M1 multiplayer (§30/§33).

### D37. Pre-reveal API payload discipline: labels + texts only
§33's anti-cheating rules target model contestants, but I applied the same
discipline to the browser: pre-reveal endpoints return `{label, text}` and
nothing else; provenance flows only through post-reveal results and `/lab`.

### D38. `/lab` is unauthenticated
§28 says developer-only; on a localhost solo prototype I enforce that by
convention (it's linked from nowhere in the game flow), not by auth (§35
excludes production auth).

### D39. A round killed by permanent generation failure is abandoned, not resumed
§27 says "allow round restart". The failed round stays in the store (phase
frozen, no fabricated provenance) and the player starts a *fresh* round — no
resume-in-place. Same for an unrecoverable judging quorum failure.

### D40. Port 8787; store rooted at `./data`
Arbitrary defaults; `--port` and `--mock` flags exist.

---

## 9. Personas, history, and prompts

### D41. Persona content authored by me
§7 gives archetype sketches; the five voices, tendency numbers, and taste
preferences (`src/contestants/personas.ts`) are my authorship. Tendency
numbers are currently *stored but not prompt-injected* — only the prose
`voice` and `tastePreferences` reach the model. The numbers are metadata for
future strategy work.

### D42. Writer history = the contestant's own past responses, last 5 injected
§9 lists possible history kinds; I implemented only own-past-responses
(prompt text + what it wrote), injecting the most recent 5 for voice
consistency, with `persistentFacts` plumbed but empty at seed. History can
never contain other contestants' material, satisfying §9's scoping rule
structurally.

### D43. Writers are told the full game setup — **⚠ review**
The writer system prompt explains the whole game: five AIs + one hiding human,
judges will hunt the human, write to pass as human *and* to be envied
(both objectives, §2.1). The spec doesn't dictate how much game context
writers get; full transparency seemed the honest reading of §8's tactical
freedom, but it is a prompting choice that shapes machine behavior.

### D44. 29 seed prompts, authored by me
§10 asks for ~30 with mechanical variety; the deck (`src/content/prompts.ts`)
includes the spec's seven examples plus 22 more across the same categories,
each tagged with hypotheses from the spec's vocabulary.

### D45. Prompt selection: `random-unplayed-first`
§4 lists "prompt-selection strategy" as a tunable without defining any. Default
plays every seed prompt once before repeating; plain `random` also available.

---

## 10. Testing

### D46. The smoke test is a single writer-shaped completion call
CLAUDE.md (mine) mandates exactly one live test; its scope — one
`AnthropicProvider.complete` round-trip asserting non-empty text — is a
minimal-cost choice. It does not exercise a full live round.

### D47. Boundary enforcement is tested with sentinel strings
The "no hidden provenance in payloads" acceptance (M0.0/M0.3) is verified by
planting sentinel values in every hidden field and asserting they never appear
in any assembled payload, plus structural checks on builder signatures. This
is a testing strategy choice; the spec only states the boundary requirement.
