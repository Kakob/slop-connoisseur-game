# ROADMAP.md — chatdex-game: engine → MVP

Two audiences, one build. **Users**: a friend group plays a full night on their phones without the developer present. **Employers**: a live URL, a clean repo, a documented decision trail, and one real chart proving the corpus thesis. Each phase ends with something demonstrable; no phase starts before the prior phase's exit gate.

## Phase 0 — Engine (SPEC.md governs; agent-built)
The event-sourced round engine, five text modes, bot player, golden fixture, terminal demo, outbox traces. **Exit gate:** all M0–M7 gates green; `demo:interactive` playable end to end.
*Portfolio artifact:* the repo itself + the agent session trace saved to `traces/` (Chatdex ingestion sample #1).

## Phase 1 — MVP web (2–3 agent sessions + human polish)
Authoritative Node/ws server owning the event log per room; thin phone-first web client rendering per-seat projections. Built before any human playtesting, because this game's core loop — private simultaneous composition, the blur pane, secret votes — cannot be tested pass-the-laptop. Scope, deliberately thin:
- Join by 4-letter room code; nickname only — **no accounts, no auth** (device token for reconnection). Private rooms only; no public matchmaking.
- Three modes at launch: classic, slop, finale. Temperature and human_detector ship dark behind a config flag until the core loop is proven.
- Blur pane (composition deltas over the wire), lineup, tap-to-vote with span highlighting, reveal, scoreboard, recap screen with consent-to-donate toggle.
- **Seat-filling simulated players**, so a match runs with as few as 2 humans, and a **solo practice room** (one human among simulated players) as the recruiting demo.
- Server-authoritative timers; AFK auto-submit; reconnection = replay (literal test: kill a tab mid-vote, rejoin, correct state).
- Deploy: single Fly/Railway app + static client; traces finalize to the bucket per INTEGRATION.md v2 (sync worker not required yet — bucket write is).
**Exit gate:** two devices, one match, reconnection test green in CI; solo practice room playable by a stranger from a bare link.
*Portfolio artifact:* the live URL. Nothing signals like a link that works.

## Phase 2 — Online playtest + tuning program (~2–3 weeks, overlaps Phase 1 polish)
The relocated playtest phase: recruit remote humans into hosted rooms and tune against their behavior. Rings of recruitment, in order: existing remote friends and group chats; playtest communities (r/playmygame, gamedev Discord playtest channels, itch.io) with a browser link and a 15-minute ask; later, the Slop-or-Not content funnel. Sessions are 15 minutes, host present and observing, bots absorbing no-shows — schedule twice as many sessions as you need. Tune `config` only between sessions: timers, points, round ladder. Watch for: which prompts land, does anyone find the bot, is 90s forge time right, where do strangers silently quit.
**Exit gate:** five sessions with at least one stranger-majority table; a tuning commit exists with PLAYTEST.md noting what changed and why; one full match with 4+ real humans on their own phones, developer hosting but not coaching.
*Portfolio artifact:* PLAYTEST.md plus stranger-sourced traces — evidence you operate what you build, on users you recruited yourself.

## Phase 3 — Chatdex adapter + first analysis (the differentiator)
Chatdex-side: `game.round.v1` ingestion adapter (parse, validate against the pinned conformance fixture, encrypt, store), bucket sync worker with cursor + quarantine per INTEGRATION.md. Then the first real analysis over accumulated playtest traces: **detection rate vs. round length tier**, plus per-player accuracy. One honest chart.
**Exit gate:** a trace played on a phone Friday night appears, analyzed, in Chatdex — screenshot-able end to end.
*Portfolio artifact:* the chart + a short writeup ("what 40 matches taught us about spotting AI text"). This is the piece that turns "party game" into "evaluation instrument" in an interviewer's head.

## Phase 4 — Portfolio layer (1 week, mostly writing)
- README that leads with the 15-second pitch, the architecture diagram (fold, projections, provenance seal/reveal), and the live link.
- DECISIONS.md: D1–D14 plus the integration decisions, presented as an ADR log — the senior-smelling artifact.
- 90-second screen recording: join on two phones, play a round, bot revealed, trace lands in Chatdex.
- The demo script for interviews: seeded replay, blind-view one-liner, kill-the-sync-worker-and-recover.
**Exit gate:** a stranger can understand the project from the README alone in two minutes; a friendly senior engineer reviews it and finds no unexplained magic.

## Explicitly beyond MVP (do not drift)
Jailbreak and all code modes · accounts/auth · native apps · public corpus release and datasheets · detector leaderboard · Bouncer solo mode · spectator/streamer overlay · webhooks (INTEGRATION.md holds the earning criteria) · matchmaking with strangers · monetization.

## Honest sequencing notes
Phase 2 cannot be compressed — the point economy will be wrong in ways only real laughter (and silent stranger quits) reveals, and it's config-tuning by design so that no UI rework is needed. Phase 1 is where scope death lives; the mode flag, no-accounts, and private-rooms-only rules are the fence. Phase 3 can overlap Phase 2. Rough total from engine-done to portfolio-ready: 4–6 weeks part-time, dominated by playtests and writing, not code.
