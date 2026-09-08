# Blind Tasting build — September 8, 2026

Status: local implementation and offline verification complete. Live-provider validation, hosting, and the 20–30-person pilot remain pending. This is a build report, not a playtest findings report.

## What is available

- A creator completes the existing human-plus-five-machines round, explicitly reveals the votes, and receives a stable challenge link.
- A separate anonymous browser opens the original prompt and six original answers, chooses the human and optionally a favorite, locks, and explicitly reveals. Refresh preserves locked and revealed states. Replays make no model calls.
- The creator returns through the start page to owner-only completed recipient results. Unfinished and locked-but-unrevealed choices are excluded. Recipient visibility is disclosed before locking.
- A recipient can share the link or start and complete an attributed new round. The same-prompt shortcut remains the first follow-up enhancement.
- Prompt, answer text, identities, AI guesses, AI preferences, creator preference, and recipient choices remain readable together. Reveal uses manual pacing and concrete denominators. Missing AI Taste ballots are distinct from zero preference.
- Local reporting connects attempts to lock, reveal, sharing, downstream round creation/completion, and creator return after completed attempts.

## Integrity and operational choices

Anonymous sessions use independent opaque cookie credentials and contestant IDs. The HttpOnly, SameSite=Lax cookie lasts 30 days. Ownership does not transfer through public URLs; full accounts and cross-device recovery remain out of scope. Histories, unplayed-prompt selection, and streaks are scoped to each human.

The JSONL store now copies records on input and output, including predicate reads. Completed rounds snapshot the original result alongside raw ballots; future tunable changes do not alter new published results. Historical rounds without a snapshot retain the prior compute-on-read behavior and are not automatically assigned to a new browser.

Submission and Taste completion are serialized per active round. Identical retries reuse the result; conflicting votes fail. The client supplies a round-start request ID to prevent duplicate generation after a lost response. Locked recipient choices and reveal are separate immutable records.

The authoritative writing deadline begins at server prompt reveal. The browser receives that deadline plus server time. A configurable 1,500 ms transport grace permits autosubmission at the bell; later submissions become blank artifacts. After a server restart, writing or incomplete table generation has an explicit start-fresh outcome. Completed tables in judging can resume and retry only missing machine ballots. Completed rounds and recipient attempts survive restart.

Developer pages and APIs are disabled by default. Local `--dev-tools` opt-in restores Lab and Studio. Public responses use no-store caching, a restrictive Content Security Policy, and cross-site write rejection. The command-line server binds to loopback. `createGameServer` exposes a `secureCookies` option for an eventual HTTPS deployment behind a proxy; no hosting has been configured.

Pilot defaults are centralized in `defaultWebLimits`: 16 KiB request bodies, five concurrent model calls, 100 queued calls, five new rounds per player per hour, and 30 new rounds globally per hour. Model slots remain occupied until the underlying request settles. Public Studio access is disabled; developer mode is for local curation only.

Run one server process against one `data/` directory. This remains a small JSONL prototype, with in-memory indexes and process-local work serialization. It is not configured for multiple server workers or production-scale traffic. Retain the data directory for link durability.

## Verification

- `npm test`: 105 passed; two existing gated live-provider smoke tests skipped.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- New checks cover HTTP ownership, protected debug routes, pre-reveal projections, conflicting and concurrent retries, start deduplication, restart persistence, owner empty/skipped states, hidden locked attempts, stable original ballots/specimens, zero replay model calls, source attribution, sharing/report deduplication, blank Taste rejection, model concurrency/queue limits, deadlines, defensive store copies, separate streak histories, and absent/partial Taste results.
- Browser: an offline creator round, explicit creator reveal, second-host browser identity, recipient guess/favorite, locked refresh, keyboard-triggered reveal, creator return, and recipient-to-writer completion succeeded. Checked 390 × 844 phone and 1280 × 900 desktop layouts. The console showed no errors during the inspected flow; the viewport override was reset.
- `npm run report:sharing` derives the pilot report from local data. The local browser exercise is test data and must not be represented as human pilot evidence.

The HTTP test suite requires permission to bind localhost ports; the first sandboxed run was blocked by EPERM, then passed outside that restriction. No live models were called during this build.

## Next user-facing checkpoint

Review the local flow with `npm run play -- --mock`. After that, validate one controlled live round with the configured provider, select a hosting destination, and recruit the pilot group. Before interpreting results, curate short ordinary prompts and observe reading effort, wait time, reveal comprehension, voluntary sharing, and possible padding for the inherited length multiplier. Keep the scoring formula unchanged until the pilot produces evidence.
