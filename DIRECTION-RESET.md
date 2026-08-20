# Slop Connoisseur — Direction Reset

## Status

This document defines the current product direction.

All prior Slop Connoisseur work connected to Chatdex has been moved under `/archive/chatdex-era/`.

That material is preserved as historical design research only.

It is **not authoritative implementation guidance**.

Do not carry requirements, architecture, terminology, or assumptions from `/archive/` into the current implementation unless a current root-level document explicitly references them.

## Current product

Slop Connoisseur is a standalone game about humans and machines judging, imitating, and preferring one another’s language.

The initial product centers on two mirrored modes:

1. **Hide From Machines**
   - one human hides among machine-written responses;
   - independent machine contestants attempt to identify the human;
   - contestants also vote on Taste.

2. **Find The Machine**
   - one or more machines hide among human responses;
   - humans attempt to identify the machine;
   - humans also vote on Taste.

The game measures two separate dimensions:

- **Deception / detection**
- **Taste / preference**

The current prototype also preserves prompt/specimen lineage, contestant histories, raw judgments, and model/strategy metadata so future adaptive systems, content reuse, and learning experiments remain possible.

## Relationship to Chatdex

There is currently **no required dependency on Chatdex**.

Slop Connoisseur should be designed and implemented as a standalone product.

Future optional integration with Chatdex may be explored, but it must not shape the current architecture unless explicitly added to a current specification.

## Source of truth

Read documents in this order:

1. `DIRECTION-RESET.md`
2. `SPEC-prototype.md`
3. `README.md`

Current root-level documents override archived material.

Anything under `/archive/` should be treated as historical context only.