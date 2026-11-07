# Table play — presentation direction

Added November 3, 2026, at the developer's direction. This is a presentation layer over Blind Tasting / Hide From Machines. It changes no game law, server payload, scoring rule, or persisted record. Scope tension with SPEC §3 is recorded as [Q1](../QUESTIONS.md).

## Idea

The dinner party in the artwork becomes the game board. Every answer is a covered dish on a shared table. Five masked guests sit around it; a sixth seat belongs to the human. The reveal is something you watch rather than read: each guest, in turn, plants a suspicion pick in the dish they think the human cooked; the maître d' lifts the human's cloche; picks on the wrong dishes flip and a **Fooled** meter fills; then forks land on favorites.

## Phases

| Phase | At the table |
| --- | --- |
| Write | The prompt is an order ticket; the countdown burns down as a candle ring. |
| Waiting | Masked guests "cook". When candidates arrive, plates are served one at a time. |
| Taste (creator) | Tap a plate to lift its lid and read it; choose a favorite machine dish. The creator's own plate sits in front of their seat and is not selectable. |
| Guess (recipient) | Tap a plate to read it; place your suspicion pick (click or drag) and optionally your fork; lock. |
| Ready (creator) | The table is set; guests hold their picks behind their backs until you reveal. |
| Reveal | unmask → suspect (one per AI detection ballot; recipient's own pick first) → lift → fooled (one per missed ballot, meter k/N) → favorite (AI forks, then creator/recipient favorites) → summary and detailed cards. |

## Creatures under the cloches

Each plate hides a creature that shows what that dish is at stake for. Its **species is the length risk tier**: a sleepy blob for SAFE, a horned critter for BOLD, a spiky beast for DANGEROUS whose tentacle escapes even a closed lid, and a single dust mote for an empty plate. Its rim tag shows the most it could earn if it fooled every judge (`deceptionBase × multiplier`, e.g. `BOLD · up to 125`). Colour, eyes, crest, pattern and tilt come from a hash of the text, so every plate looks different and the same text always gives the same creature.

- **Write:** your own creature sits beside the word counter and changes species as you cross a tier boundary.
- **Taste / Guess:** lifting a lid shows the creature, and the reading panel states its stakes.
- **Reveal:** the human's creature appears at full size on the lift, then shrinks with each judge who found it. It ends at the round's actual deception points.

The creature is a pure function of `{text}` plus the public tunables served by `GET /api/stakes`, implemented in `src/web/public/creature.js`. Every plate is drawn the same way whoever wrote it, so a creature can say nothing about authorship that the word count doesn't already say. Answer text is never put into creature markup.

## Rules the scene must keep

- **Pre-reveal the scene receives only `{label, text}`.** Plates sit in the centre in label order, never in front of a seat, so position carries no authorship hint.
- **Guests are anonymous masks until reveal.** Pre-reveal payloads carry no persona data (SPEC §33); guests unmask only from post-reveal ballots (`judgeDisplayName`). The client hardcodes no persona roster.
- **Locking and explicit reveal are unchanged.** Picks and forks are submitted through the existing lock endpoint.
- **Answers stay readable.** Opening a plate shows its full text; a "Read all" list remains as the keyboard and screen-reader fallback; the final reveal keeps the detailed cards.
- **Missing votes are abstentions,** shown as a shrug, never as found or fooled. Denominators are real counts.
- **Motion is optional.** `prefers-reduced-motion` renders the final state directly; Skip and Replay are always available.
- Animation durations live in one `TIMING` object in `src/web/public/table.js`.
