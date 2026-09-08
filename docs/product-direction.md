# Slop Connoisseur: product direction

Updated September 7, 2026. This document records the product decisions agreed in conversation after the repository audit. It describes intended behavior, not shipped functionality.

## Shared premise

> I made one of these. I knew you'd be looking. Find me.

Your friend is at a costume party and knows you are trying to recognize them. They can imitate a machine, conceal their usual habits, or exaggerate those habits as a double bluff. Machines supply the camouflage; a real person supplies the reason to care.

Creators contribute their own work before seeing competing submissions. Recipients can participate without writing anything or creating an account. The creator knows before writing that the result can become a friend challenge: deliberate misdirection is part of the game.

Recognition and preference are independent. Immediately recognizing a friend's excellent answer is a satisfying outcome, just as failing to recognize it can be. Do not reduce these outcomes to one authoritative winner or imply that AI authorship means poor quality.

## Modes and naming

| Mode | Invitation | Evidence at reveal |
| --- | --- | --- |
| **Blind Tasting** | Can you recognize me when I'm trying to fool you? | Authorship and separately attributed human/AI preferences |
| **Code Tasting** | Can you recognize me—and should you trust what I wrote? | Authorship, preferences, behavior predictions, and execution evidence |

**Slop Connoisseur** remains the product name. **Blind Tasting** is the agreed name for ordinary writing: jokes, opinions, awkward situations, and tiny stories. **Code Tasting** is the agreed name for the separate code-writing mode. “Questionable taste” is optional editorial language for sharing and results, not another mode.

**Hide From Machines** remains the current engine/scenario and existing internal mode identifier. Blind Tasting extends that experience with friend challenges. A public name change does not require renaming persisted identifiers or implying the new experience has already shipped.

## Shared experience rules

- Announce the friend challenge before creation; share only at the creator's initiative.
- Lock original submissions before exposing rivals. Preserve the submitted artifacts and anonymous positions for replay.
- Ask recipients who wrote the work and what they prefer as separate choices. Creators never guess which submission is their own.
- Let choices remain editable until explicitly locked. Reveal provenance only through the appropriate post-lock server response.
- Keep the prompt and artifacts readable through judgment and reveal. Give the viewer explicit reveal control.
- Attribute human votes, AI votes, and personal choices separately, with real counts and denominators. Missing votes are not negative votes.
- Use accurate language: preference does not establish dislike; passing a test suite does not prove correctness; a detection vote does not measure humanity.
- Allow camouflage within the task's rules. Do not require deliberately bad writing or broken code to succeed.
- End with a satisfying result and a next action: share, write a challenge back, or start a new prompt.

The anonymous challenge is a game boundary, not a guarantee that a person cannot learn an answer elsewhere and return. Do not claim cheating-proof identity or globally unique humans from anonymous browser sessions.

## Distinctions to preserve

Blind Tasting needs no objective correctness test. Disagreement over humor and preference is itself meaningful. Do not add an artificial execution-equivalent phase to ordinary prompts.

Code Tasting adds behavioral consequences. “Looks AI-written,” “would merge,” and “predicts correctly” are independent observations, not opposing categories. Do not label someone inconsistent simply for preferring code they think is AI-written.

Code Tasting's promise is social code review with behavioral consequences, not a coding benchmark or a general AI detector. Its learning hypothesis is that repeatedly committing predictions and seeing counterexamples can improve code-reading judgment. Validate transfer on fresh problems before claiming broad improvement.

## Scope and sequence

1. Deliver the [Blind Tasting spec](./spec-blind-tasting.md) through the existing [blind-challenge milestone](./next-milestone-blind-challenges.md), including public-play fixes and the 20–30-person pilot.
2. Prototype the [Code Tasting spec](./spec-code-tasting.md) over the shared challenge foundation. This is a proposed follow-on experiment, not extra scope for the immediate milestone.
3. Decide later work from results. Find The Machine multiplayer, dedicated audience infrastructure, full accounts, and deeper lineage remain deferred; no fixed order among those later projects is committed here.

Chatdex and Cortex Lattice are outside this product scope.

## Status of decisions

The mode names, friend-focused premise, and separation of recognition, preference, and behavior are agreed direction. The mode specs mark small-prototype defaults and unresolved implementation choices explicitly. No implementation or evidence of virality/learning is implied by these documents.
