# Repository audit — September 7, 2026

## Assessment

Slop has a working solo-game prototype with a solid engine. It does not yet have the shareable challenge experience required by the proposed growth strategy: **“Can you hide from the machines?”**

The next step is a focused extension of Hide From Machines. The existing data model supports replay without live matchmaking or a new generation of bot answers for each visitor.

## Verification and limits

The audit reviewed the current implementation, ran the offline test suite and TypeScript check, exercised a complete round over HTTP with the offline provider and an in-memory store, and reproduced two data-integrity issues directly.

- 96 tests passed; two gated live-provider smoke tests were skipped.
- `npm run typecheck` passed.
- HTTP round start, submission, and Taste/reveal requests succeeded; the final table contained six answers.
- An unauthenticated Lab request exposed the human label while the round was still in `JUDGING`.
- A player-facing `GET /api/round/:id` request returned 404.
- Duplicate human Taste ballots were accepted; results displayed the first choice rather than the later choice.
- Mutating a retrieved specimen changed the in-memory stored answer.

No repository files were changed during the audit. Existing edits to `SPEC-prototype.md` were left untouched. Findings describe this checkout, not an externally deployed service. Live model quality, latency, mobile usability, provider billing behavior, and public-hosting readiness were not validated. There are no recorded playtest results in the repo; the specification marks the playtest milestone unstarted.

## Alignment with the target experience

| Target | Current state |
| --- | --- |
| One human writes alongside five bots | Implemented: timer, word cap, personas, retries, and anonymous answers |
| Independent Detection and Taste | Implemented as separate model calls and stored ballots |
| Actual votes with human and AI judges distinguished | Implemented for the solo round |
| Friend opens the exact lineup and guesses the human | Missing |
| Every completed round becomes a challenge link | Missing |
| Spectator chooses before reveal; host controls timing | Missing |
| Phone-friendly prompt–guess–reveal presentation | Basic responsive styling exists; spectator presentation needs work |
| Measure recipients completing, sharing, or starting rounds | Missing |
| Evidence of repeated enjoyment | No recorded playtest results |

## Foundations worth retaining

### Replay data

The separation of specimens, appearances, judgments, and results is appropriate for replay. Answers and anonymous positions are stored, and scores derive from individual ballots. A friend's challenge can reuse those records without generating new bots. See [domain types](../src/domain/types.ts) and [scoring](../src/scoring/scoring.ts).

### Independent identity and preference judgments

Judge contexts receive anonymous text. Taste excludes self-votes, and the reveal separates machine preferences from the player's pick. `HIDDEN_GEM` already recognizes a human who fools every machine and wins machine Taste. See [judge contexts](../src/contestants/strategies.ts), [judging](../src/engine/judging.ts), and [scoring](../src/scoring/scoring.ts).

### Content and curation

The 29 seed prompts include ordinary opinions, awkward situations, and micro-comedy. Studio supports prompt authoring, curation, and generation experiments. These are useful tools for finding rounds worth sharing. See [seed prompts](../src/content/prompts.ts) and [Studio](../src/lab/studio.ts).

## Product gaps

The current loop is **start → write → choose a favorite bot answer → watch results → next round**. There is no share button, permanent player-facing round page, recipient guess, or recipient-to-new-player conversion path. Lab can inspect persisted rounds but exposes the answer.

The reveal displays votes against letters before showing the full answer table, hides the original prompt, and advances through fixed delays. Spectators must remember what the letters mean. There is no pause or explicit reveal control. See [client](../src/web/public/app.js).

Keep the prompt and all six responses available throughout the reveal. Show identity and preference on the responses themselves, with concrete counts such as “4 of 5 AI judges missed you; 3 preferred your answer.” Keep human audience votes separately identified.

Taste ballots establish a preference, not dislike of every other response. The data supports “thought you were human, preferred B,” not “thought you were human and hated your answer.” Present judgments as this game's votes, never as a scientific measurement of humanity or writing quality. Both successful hiding and amusing misidentification should produce a useful shareable result.

## Issues to resolve before public play

| Priority | Finding and evidence | Required direction |
| --- | --- | --- |
| Before public access | Lab exposes provenance before reveal; verified through unauthenticated HTTP. Studio permits prompt changes and model generation without authentication. [Routes](../src/web/server.ts) | Disable developer surfaces in public operation or protect their pages and APIs. Hiding links is insufficient. |
| Before multiple-player testing | Every round uses `human-player`; streaks aggregate globally. There is no round ownership. [Setup](../src/engine/setup.ts), [scoring](../src/scoring/scoring.ts) | Establish separate anonymous player sessions and ownership; scope histories and streaks appropriately. Full accounts can wait. |
| Before challenge launch | Active rounds depend on an in-memory map, and no resume endpoint exists. Duplicate human Taste votes are accepted; reproduced with two votes and a reveal showing the first. [Session](../src/web/session.ts), [judging](../src/engine/judging.ts) | Add resumable reads and clear restart behavior, idempotent submissions/votes, and protection against concurrent completion. |
| Before durable replay | Explicit specimen updates are rejected, but reads return mutable references; mutation was reproduced. [Store](../src/store/store.ts) | Protect stored records from mutation through references and preserve stable replay content. |
| Before public generation | Starting a round immediately launches five model generations. There are no application-level request limits or concurrency controls. [Server](../src/web/server.ts), [session](../src/web/session.ts) | Bound public generation requests and concurrent work, with understandable failure and retry behavior. |
| Before shared public play | The writing deadline is enforced only by the browser. [Writing](../src/engine/writing.ts), [client](../src/web/public/app.js) | Enforce the writing deadline server-side and keep browser countdown behavior consistent with it. |
| Before publishing results | Completion requires sufficient Detection ballots but no minimum Taste ballots. Zero successful Taste ballots can display as 0% Taste. [Judgment locking](../src/engine/judging.ts), [scoring](../src/scoring/scoring.ts) | Distinguish missing evidence from zero preference; show successful judge counts and incomplete results explicitly. |

Passing tests support the existing engine paths. They do not cover all of these public-use conditions.

## Recommended milestone

**Complete a round, send it to a friend, and have that friend finish the challenge.**

1. Add a permanent challenge URL over a completed round's existing six answers and positions.
2. Return only prompt, labels, and text before the recipient locks a guess; allow a separate optional Taste pick.
3. Store recipient attempts separately from original ballots, preserving the original round's result.
4. Reveal identity, original AI votes, and recipient picks together. Offer **Share this challenge** and **Try hiding yourself**.
5. Add manual reveal control and a legible phone layout.
6. Track challenge opens, locked guesses, reveal views, share actions, and attributed new rounds.

Protect public routes and fix vote/retry integrity as part of that milestone. Put blind replay and a 20–30-person sharing playtest ahead of Find The Machine multiplayer. Full accounts, live matchmaking, dedicated audience infrastructure, and deeper lineage views can wait.

The first signal is that recipients finish the linked challenge. The stronger signal is that they then share or write their own round. A funny video with few challenge completions is a distribution-to-play conversion problem to diagnose.

See the [accepted milestone plan](./next-milestone-blind-challenges.md) for implementation and acceptance criteria.
