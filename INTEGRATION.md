# INTEGRATION.md — getting game traces into Chatdex

Status: decided 2026-07. Companion to SPEC.md (which governs the v1 engine build; nothing in this file is agent work unless a milestone says so). Governing principle: **the game and Chatdex integrate through the trace format, never through code or state.** `game.round.v1` is the seam; both sides validate the same pinned conformance fixture (`fixtures/sample-round.jsonl`), so drift fails loudly in CI on the stale side. Chatdex itself changes exactly once — an ingestion adapter that recognizes `game.round.v1` alongside Claude Code traces — and that adapter is a separate, later effort with its own milestones.

## v1 — local file drop (now)

The engine's `match.ended` handling finalizes each trace into `traces/outbox/{match_id}.jsonl`. A small watcher (chokidar script or a manual `just export`) pushes new files through Chatdex's existing JSONL upload path and moves them to `traces/exported/`. Ingestion is idempotent by `match_id`, so re-running the watcher is always safe. Because upload happens in the operator's own Chatdex client session, traces are encrypted client-side under the operator key — the existing privacy model holds with zero new machinery.

## v2 — object storage handshake (when the game has a server)

On `match.ended`, the game server runs the consent filter and PII scrub **before anything leaves the box** — non-donating players' data never reaches storage — then writes two immutable objects to the bucket (R2/S3):

- `traces/{YYYY-MM}/{match_id}.jsonl` — the trace, write-once, never overwritten
- `traces/{YYYY-MM}/{match_id}._meta.json` — schema version, config hash, event count, checksum

and appends the match to a manifest under the same date prefix, so readers never list the whole bucket.

Chatdex runs a **sync worker** — interval-scheduled, plus a "sync now" button — that reads the manifest from a saved cursor, downloads new traces, verifies checksums, validates against the conformance fixture, encrypts under the operator key, ingests, and advances the cursor. Traces failing validation move to a `quarantine/` prefix with the error attached: never dropped, never silently ingested. Replay after an analyzer or ingestion bug is "reset cursor, rerun" — the bucket is a durable replay buffer.

Why this carrier: neither system's uptime depends on the other's; storage is the cheapest, most boring interface available; and immutable-object-plus-cursor gives idempotency and replay for free. IAM is least-privilege — the game server can write its prefix and nothing else; Chatdex can read and nothing else.

Key custody note, stated so it's a decision and not an accident: v2's server-to-server path means game traces are encrypted *on arrival at Chatdex* under an operator key, not end-to-end under a player key. Game traces are multi-player artifacts owned by the operator; this is a deliberate, documented departure from Chatdex's per-user client-side model, scoped to the game corpus only.

## Deferred — push webhooks

Not built until a live audience feature validates the need. When one does, the shape is **claim-check**: the game server POSTs a thin notification (`match_id` + bucket key, HMAC-signed, retried with backoff from an outbox table) and the receiver pulls the trace from the bucket. The webhook accelerates; the bucket remains the source of truth, so a down, slow, or replayed webhook loses nothing.

Features that would earn it, in likely order of arrival: tonight's live house scoreboard ("Humanity 3, The Machine 2"); the "IT GOT IN" rare-event siren to Discord; post-match recap cards pushed to a stream; league-night cross-table state (the one that structurally *forces* push, since bracket seeding blocks on results); live model-release detection counters; sub-minute trace freshness in Chatdex dashboards. First candidate if validated: the scoreboard — one evening of work on the claim-check skeleton, demoable at a playtest. Corpus science never needs any of this; batch sync serves analysis forever.

## Rejected — shared database

The game server will never write to Chatdex's store directly. A table layout is an implementation detail; a second writer turns it into an unversioned public API, bypasses the ingestion path where validation, dedup, and the consent filter live, entangles migrations and blast radius across two products — and, fatally for Chatdex, direct writes into an AES-GCM client-side-encrypted store would require sharing keys, dissolving the privacy architecture as a side effect. Coupling goes through the narrowest, most stable thing available: the versioned trace file.

## Package extraction rule

`schema.ts` and the conformance fixture are vendored and pinned into Chatdex when the adapter is built. A shared `@chatdex/schemas` package gets extracted only on the second real consumer — copying one frozen file beats maintaining a package while the ground is still moving.
