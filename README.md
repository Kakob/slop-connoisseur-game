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