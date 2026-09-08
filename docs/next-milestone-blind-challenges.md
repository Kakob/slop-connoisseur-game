# Next milestone: blind challenges

Public mode name: **Blind Tasting**. Read the [product direction](./product-direction.md) and [Blind Tasting specification](./spec-blind-tasting.md) alongside this implementation plan. Code Tasting is a separate follow-on prototype, not added scope here.

**Status:** Accepted for next implementation; not yet implemented.

**Decision date:** September 7, 2026.

**Basis:** The user accepted all recommendations in the [repository audit](./repo-audit-2026-09-07.md).

**Priority:** Before Find The Machine multiplayer. Preserve the existing game's Detection/Taste separation and information boundaries.

## Outcome

Build one polished Hide From Machines round that becomes a blind challenge a friend can finish.

The opening promise is **“Can you hide from the machines?”** The shared social premise is **“I made one of these. I knew you'd be looking. Find me.”** Tell the creator before writing that friends can try to recognize them, allowing deliberate camouflage and double bluffs. The recipient opens the same anonymous lineup, finds their friend's response, and sees how their judgment compares with the machines.

This milestone includes the public-play fixes, replay interaction, reveal improvements, measurement, and small playtest recommended by the audit. It does not include Chatdex work.

## Player journey

1. A player learns about the friend challenge, then answers an ordinary prompt alongside five bots. Prompts can include humor, opinions, awkward situations, or tiny stories.
2. The player casts their Taste vote and receives independent Detection and Taste results.
3. The completed round offers a shareable challenge link.
4. A friend opens the link without signing up and sees the original prompt and all six original answers in the original anonymous positions.
5. The friend chooses the human and may separately choose a favorite answer before locking the attempt.
6. The friend explicitly reveals the result. Identity, original AI ballots, and the friend's choices are easy to compare.
7. The friend can share that challenge or start their own Hide From Machines round.

Reopening or refreshing a challenge must not regenerate answers or silently change the lineup. Recipient attempts must not alter the original round's ballots, scores, or distinctions.

## Implementation sequence

### 1. Make the existing round safe and reliable for public use

- Disable or authenticate Lab and Studio pages and APIs in public operation. No public debug route may bypass the reveal boundary.
- Introduce anonymous player sessions and round ownership; isolate player histories and streaks. Full accounts are unnecessary for this milestone.
- Make submission, Taste voting, and completion safe to retry. Prevent duplicate ballots and competing completion requests.
- Provide player-facing reads for resume/recovery. Completed rounds and locked attempts must survive a server restart; interrupted generation must have an explicit recovery or restart outcome.
- Enforce the writing deadline on the server, using the same timing contract as the browser.
- Bound request body sizes, generation requests, and concurrent model work. Choose small-playtest limits and keep them configurable.
- Prevent mutation of stored specimens through returned references; preserve stable original answers and positions.
- Represent unavailable Taste results separately from zero votes. Show how many judges successfully voted, including partial failures.

**Acceptance:** Two independent players cannot operate each other's writing rounds or share streak history. Public visitors cannot retrieve hidden provenance through developer APIs. Retries cannot add votes or change a completed result. Missing Taste evidence is never labeled 0% preference.

### 2. Add durable blind challenge replay

- Create a stable challenge identifier and URL referencing a completed round.
- Reuse the stored specimens and appearances. Opening, guessing, and revealing a replay require no model calls.
- Serve an explicit pre-reveal projection containing the prompt and anonymous labels/texts, without creator identifiers, human labels, original ballots, or other answer-revealing metadata.
- Store recipient attempts separately from original contestant judgments. Record a Detection pick and an optional Taste pick, with an explicit locked state.
- Gate the result response on a locked attempt. Hiding already-downloaded provenance in the UI is insufficient.
- Give completed rounds a share action and a useful result even when the human was easily identified. Blank rounds should be labeled honestly rather than presented as successful hiding.
- Provide an actionable response for unknown or unavailable challenge links.

**Acceptance:** A fresh visitor sees the same six answers and positions, cannot receive the answer through the normal pre-reveal payload, can lock a guess and reveal, and can refresh without losing the locked attempt. Original ballots and results remain unchanged after any number of recipient attempts. Shared links remain valid after restart.

### 3. Make the reveal work for players and spectators

- Keep the prompt and all six responses available; associate votes and identity with the actual answer cards.
- Show Detection and Taste separately, using concrete counts with their denominators.
- Distinguish original AI judges, the original human's Taste pick, and recipient choices. Do not pool them into one ambiguous score.
- Surface surprising combinations, including hiding successfully while winning Taste and being recognized as human while another answer wins preference.
- Use accurate wording: a judge preferring another response does not establish dislike of this response. Avoid scientific claims about humanity or objective writing quality.
- Add an explicit reveal button and manual pacing so a host can pause for an ordinary audience poll. Do not build a room or audience-voting service for this experiment.
- Make prompt and answers legible on a phone and in a screen recording. Support accessible labels, keyboard operation, and a flow that does not depend on animation timing.
- End with **Share this challenge** and **Try hiding yourself**.
- Use **Your turn** to invite the recipient to create a challenge back. A same-prompt shortcut is optional follow-on work; attributed new-round creation and manual sharing are sufficient for this milestone.

**Acceptance:** A viewer can read the prompt and lineup before revealing, commit a choice, and understand both who wrote each answer and who preferred it. A host can hold the reveal indefinitely. Verify the flow in an actual browser at phone and desktop widths.

### 4. Instrument the sharing loop

Record events with stable challenge and anonymous attempt/session identifiers, sufficient to attribute a new round to its source challenge. Analytics should not need raw answer text.

| Event | Purpose |
| --- | --- |
| Challenge created | Identify rounds offered for sharing |
| Share action | Record copy/share initiation; do not claim a message was delivered |
| Challenge opened | Count recipient visits, excluding known creator previews where possible |
| Guess locked | Measure actual participation |
| Reveal viewed | Measure completion of the recipient experience |
| New round started from challenge | Measure recipient conversion into a writer |
| New round completed from challenge | Separate curiosity from completed play |
| Recipient share action | Measure onward distribution |

Define deduplication and creator-preview handling before interpreting conversion rates. Use unique recipient attempts for the main funnel; document the limits of anonymous browser identity.

**Acceptance:** A small report can connect a challenge open to a locked guess, reveal, and downstream round or share action. Retries do not inflate these steps. Existing round-completion events alone are insufficient evidence of recipient completion.

### 5. Run the first playtest and distribution experiment

- Recruit 20–30 people who enjoy social or guessing games.
- Curate ordinary, funny prompts with no coding knowledge required. Any developer-themed prose pack should be tested separately; the code-writing and execution experience belongs to the separate Code Tasting prototype.
- Observe whether players understand the opening, enjoy the reveal, and voluntarily send the link to someone.
- Make a repeatable **prompt → guess → reveal** screen-recorded video format. Link each video to that exact round, preserving a blind opening for visitors.
- Test spectator participation with an ordinary audience poll and manual reveal. Build dedicated audience infrastructure only if participation warrants it.
- Inspect the recipient funnel and record qualitative feedback about reading effort, model wait time, confusing results, and motivation to share.

**First success signal:** A recipient completes a shared challenge by locking a guess and viewing the reveal.

**Stronger signal:** That recipient shares a challenge or starts and completes their own round.

**Main failure to diagnose:** People enjoy the clip but few play the linked round. Compare opens, locked guesses, and reveals to locate the drop-off before adding more modes.

No numerical conversion target has been validated yet. Record the pilot's counts, denominators, and feedback before setting a larger launch target.

## Verification plan

Keep the existing offline suite and TypeScript check green. Add focused tests for the new boundaries and failure cases:

- HTTP-level pre-reveal payloads and protected developer routes.
- Player ownership and isolated streaks.
- Duplicate/concurrent submissions, votes, and reveals.
- Server-enforced deadline behavior.
- Immutable specimen reads and stable replay after store reload.
- Recipient attempts leaving original judgments and scores unchanged.
- Partial and absent Taste ballots.
- Challenge and attempt persistence across restart.
- Analytics deduplication and source attribution.

Run a complete offline HTTP challenge flow and browser checks on phone and desktop layouts. Before inviting the playtest group, run a controlled live round to validate the configured provider, answer quality, waiting time, and failure behavior; the audit did not establish these.

## Definition of done

- A writer completes a round and obtains a working challenge link.
- A separate visitor finishes the same blind lineup without an account or new model calls.
- Reveal responses preserve the distinction between identity and preference, human and AI votes, and absent and negative evidence.
- Public routes protect hidden information and bound generation usage.
- Retries, refreshes, and restarts do not silently change published content or duplicate votes.
- The phone and host-controlled reveal flows are verified.
- The recipient funnel is measurable.
- The 20–30-person pilot and initial video/poll experiment produce a written findings report and an evidence-based next decision.

## Deferred work

Find The Machine multiplayer, live matchmaking, full accounts, dedicated audience infrastructure, deeper lineage/provenance views, adaptive learning, and extensive coding-themed features remain later work. Existing Lab and Studio remain useful for internal curation and diagnosis behind appropriate access controls.
