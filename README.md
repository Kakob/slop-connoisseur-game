# Slop Connoisseur

A game about humans and machines trying to recognize, imitate, and impress one another through writing.

## Current status

Slop Connoisseur is currently an experimental prototype.

The first playable mode is **Hide From Machines**:

- one human answers a prompt;
- five machine contestants independently answer the same prompt;
- the responses are anonymized;
- each machine tries to identify the human;
- contestants also vote on which response they most wish they had written;
- the reveal scores both **deception** and **taste**.

The next mode is **Find The Machine**, which reverses the game for multiplayer play.

The immediate goal is not production polish. It is to determine whether repeated rounds create interesting strategy, surprising reveals, and a desire to play again.

## Start here

Before making implementation decisions, read:

1. [`DIRECTION-RESET.md`](./DIRECTION-RESET.md)
2. [`SPEC-prototype.md`](./SPEC-prototype.md)

These documents define the current product direction and prototype requirements.

## Important: archived work

Earlier versions of Slop Connoisseur were designed in connection with Chatdex.

That work is preserved under:

`/archive/chatdex-era/`

It is historical material, **not current implementation guidance**.

Do not infer requirements from archived files unless a current root-level document explicitly references them.

## Core concepts

### Prompt

The question or challenge all contestants respond to.

### Contestant

A human or machine participating in a round.

Machine contestants may have persistent personas and histories.

### Specimen

An immutable piece of human- or machine-generated writing.

### Appearance

A specimen's anonymous appearance within a particular round.

### Judgment

An independent Detection or Taste vote.

### Detection / Deception

Can judges correctly determine which contestant is human or machine?

### Taste

Which response would the judge most want to have written?

### Lineage

Prompts and specimens may eventually be transformed, reused, or evolved while retaining their provenance.

## Prototype principles

- Preserve genuine information boundaries rather than asking models to pretend they do not know hidden information.
- Keep Detection and Taste separate.
- Give machine contestants independent generation and judging contexts.
- Preserve raw judgments and provenance.
- Treat specimens as immutable.
- Keep game parameters such as timers, risk tiers, and scoring configurable.
- Optimize for learning whether the game is fun before optimizing for production scale.
- Preserve data needed for future adaptive machine strategies without implementing RL prematurely.

## Running the game

```
npm test                          # full offline suite (mock providers only)
npm run play                      # live play at http://localhost:8787
npm run play -- --mock            # offline canned play, no model calls
npm run play -- --provider anthropic   # live play billed to an API key instead
```

Developer surfaces (linked from nowhere in the game, by design):

- `http://localhost:8787/lab` — Slop Lab: hidden state, raw ballots, events for played rounds.
- `http://localhost:8787/studio` — Slop Studio: author/curate prompts and run machine generations without editing code. Each "generate" click is five live model calls.

### Playing on your Claude subscription (default)

By default, `npm run play` bills all model calls (~15 per round: 5 writers +
~10 judges) to your Claude Pro/Max subscription via the Claude Agent SDK,
which rides your Claude Code login. One-time setup:

1. **Log into Claude Code on this machine** (`claude` then `/login`, if you
   aren't already). No `ANTHROPIC_API_KEY` is needed — the provider
   deliberately strips it from its subprocess env, because a set key would
   silently override subscription login (D48).
2. **Run the gated smoke test once:** `RUN_AGENT_SMOKE=1 npm test`.
3. **Confirm the billing path:** after the smoke test, check your
   [Console usage](https://platform.claude.com/) consumed **zero** API
   credits. That's the proof calls are hitting the subscription, not a key.

Then `npm run play` and play a round. Expect rounds to be slower than the
API provider — every call spawns a Claude Code subprocess (~1–3s startup).

Caveats:

- Subscription usage draws from your **regular plan limits** (same pool as
  interactive Claude Code and claude.ai chats).
- Anthropic has signaled the Agent SDK subscription-billing arrangement may
  change. If it does, `npm run play -- --provider anthropic` with an
  `ANTHROPIC_API_KEY` exported is the one-flag fallback.
- The regular test suite never hits a live model; only the two env-gated
  smoke tests do (`RUN_SMOKE=1` for the API-key provider, `RUN_AGENT_SMOKE=1`
  for the subscription provider).

## Current milestones

**M0 — Hide From Machines**

Build the complete solo human-vs-machine laboratory.

**M1 — Find The Machine**

Reuse the same game primitives for lightweight multiplayer.

See `SPEC-prototype.md` for detailed requirements and acceptance criteria.

## Repository structure

```text
/
├── README.md
├── DIRECTION-RESET.md
├── SPEC-prototype.md
├── archive/
│   └── chatdex-era/
└── src/