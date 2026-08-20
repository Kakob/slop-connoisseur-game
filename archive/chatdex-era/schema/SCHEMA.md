# game.round.v1 — Trace Schema

One match = one append-only JSONL event stream. Game state is a fold over this stream; there is no other state. The same stream serves three consumers:

1. **Engine replay** — reconnection, spectator view, and the v2 server are all replays of the log.
2. **Chatdex ingestion** — the stream is a first-class Chatdex trace type alongside agent traces.
3. **Corpus export** — a scrub-and-strip pass over donated streams yields the human–AI discrimination corpus.

Design rule: anything a mode needs is **data in the event stream**, never engine logic. A mode is a `round_type` + `vote_rubric` + deck references.

---

## Event catalog

| event type | emitted when | key payload |
|---|---|---|
| `match.created` | room opens | `match_id`, `config` (timers, points, decks, `config_hash`), `players[]` (seat + hashed player id) |
| `consent.recorded` | player toggles donation | `seat`, `donate` |
| `round.started` | round begins | `round_no`, `round_type`, `vote_rubric`, `prompt_card`, optional `trigger` (finale), sealed `persona_assignments` (temperature mode) |
| `composition.event` | during forge phase | `seat`, quantized `t_ms`, `kind` (insert/delete/paste/idle), `size` bucket — this is the blur-pane feed |
| `response.submitted` | player locks in | `seat`, `response_id`, `text`, `char_count`, `composition` summary (duration, keystrokes, deletions, pastes, longest pause) |
| `lineup.revealed` | forge closes | shuffled `lineup_id → response_id` order |
| `vote.cast` | voting | `seat`, `picked` (required), optional `evidence_spans[]`, `chips[]` (max 2), `other_tell`; mode extras (`persona_matches`, `bet`) |
| `exchange.message` | jailbreak mode only | `seat`, `role` (steer/model), `text`, `turn` |
| `judge.result` | code modes (mode_extension) | `lineup_id`, `judge` (harness/model_narrator), `verdict`, `detail` |
| `round.revealed` | reveal | per-lineup ground truth: `seat`, `provenance`, `bot_harness` if bot |
| `score.awarded` | scoring | `seat` or `"house"`, `amount`, `reason` code, refs |
| `round.ended` / `match.ended` | — | totals, `house_score`, finale outcome (`triggered`, `it_got_in`) |

**Blind analysis** = drop all `round.revealed` events. Nothing outside them links a seat to the bot.

---

## Provenance (structured, three axes)

```
author:  human | bot
intent:  forge_ai | authentic | bot_self | bot_pass_human
method:  typed | pasted | mixed | generated
```

The four corpus classes are derived views: forged slop (human/forge_ai), laundered slop (human/forge_ai/pasted or mixed), live model (bot/bot_self), authentic human (human/authentic). The finale's disguised bot (bot/bot_pass_human) is a fifth, rare, precious class.

## Composition sampling & privacy

Clients emit deltas only, never content: timestamps quantized to 250 ms, sizes bucketed (`xs` 1–5, `s` 6–20, `m` 21–80, `l` 81+ chars). No raw keystroke timings anywhere. A paste event of bucket `l` into an empty pane is the "Materialized" moment — public theater by design, since all players see the blur pane anyway.

Player identity: per-match seats (`S1…S8`) plus a salted cross-match `player_hash` for longitudinal curves. Free-text fields pass a PII scrub before corpus admission; `consent.recorded` gates everything.

## Evidence model (v0)

The pick is the only required act in a vote. Optional evidence comes in three forms, all frictionless: **spans** (tap the stretch of text that felt off — the primary signal, and phrase-level annotation is richer than any label set), **chips** (one-tap reactions with plain-word player-facing labels like "comes in threes" or "too polite"; ids and wording live in the versioned chip registry, never in code), and **free text**. Evidence bonuses are confirmed by consensus overlap — independent voters highlighting the same phrase — not by a pre-baked truth table. The taxonomy is emergent: recurring highlights and free-text phrases get promoted into the next registry version, so the game discovers the tells rather than prescribing them.

## Bot harness metadata

`model_id`, `temperature`, `system_prompt_id`, `timing_profile` (`naive` | `humanized`), `context_policy` (`fresh` | `listening`). These are the longitudinal keys for the "is it getting harder?" curve; `listening` is finale-only.

---

## Defaulted decisions — veto list

- **D1** Provenance is structured (3 axes) rather than a flat enum, so new modes don't mint new classes ad hoc.
- **D2** No confidence slider on votes in v1 — chips carry the evidence signal; a slider adds friction for marginal data.
- **D3** Composition quantization at 250 ms / 4 size buckets — coarse enough for privacy, fine enough for pacing tells.
- **D4** Max 2 chips per vote, forcing prioritization; `other` free text always available.
- **D5** Stable salted `player_hash` across matches — buys learning curves at a small linkability cost, gated on consent.
- **D6** The bot occupies a normal seat and emits composition events via its timing simulator; nothing pre-reveal marks it.
- **D7** Finale trigger encoded on `round.started` as `trigger: {kind:"bot_escaped", rounds:[…]}` — auditable, not implicit.
- **D8** Jailbreak's `exchange.message` is in the schema now but flagged `mode_extension`; v1 engine may reject it.
- **D9** Points/timers live in `config` (with `config_hash` on every match), never in code — playtest tuning without schema bumps.
- **D10** Trace text stays raw in the private store; scrubbing happens at export, so donated corpus and gameplay replay never conflict.
- **D11** Skill self-declaration is a three-tier per-domain field on `PlayerRef` (`code: none|some|pro`), snapshotted at match time; the lobby's derived `deck_tier` is recorded on config so deck-gating is auditable from the trace alone. Self-report bias goes in the datasheet — and declared-vs-revealed skill (bet accuracy) is itself a measurable gap, same family as the Platonic round.
- **D12** Registry rule: anything that grows with *content* (genres, personas, decks, modes, chips) is an open string validated at runtime against a versioned registry; only *structural* concepts (event types, provenance axes) are compile-time enums. `Genre` and `TellChipId` both live on the registry side.
- **D13** Modes are registry data: a `ModeSpec` (verbs × domain × rubric × judges × deck-tier floor) describes each mode; `RoundType` and `VoteRubric` accept well-known ids plus registry strings. Code modes (does_it_run, prompt_battle, spot_the_bug) therefore ship without a schema bump — the only structural addition they need, non-peer judgment, exists now as the `judge.result` event, flagged mode_extension like `exchange.message`.
- **D14** Evidence is optional and gestural: the pick is the only required vote field; spans ("tap what felt off") are the primary evidence signal, chips are optional registry-defined quick reactions, and confirmation is consensus overlap between voters rather than a predefined truth table. The tell taxonomy is emergent — promoted from highlights and free text into registry versions — not prescribed.

## Versioning

Additive changes bump a `minor` field inside `config`; breaking changes mint `game.round.v2`. Every exported corpus release cites the schema version and chip-registry version it was collected under (datasheet requirement).
