# Blind Tasting specification

Status: next-milestone product specification; unimplemented friend flow. Updated September 8, 2026 with spec-review decisions.

Read with [product direction](./product-direction.md) and the [implementation milestone](./next-milestone-blind-challenges.md). Existing Hide From Machines generation, judging, and scoring laws remain in effect unless a change is explicitly recorded here.

## Promise

> Your friend wrote one. They're hoping you pick wrong.

A creator answers an ordinary prompt alongside five machines, knowing a friend will try to find their answer. A recipient samples the exact anonymous lineup, guesses the creator, chooses a favorite if desired, and explicitly reveals the outcome.

Prompts may be funny, revealing, strange, or opinionated. They need no coding knowledge and do not all have to be comedy.

## Creator flow

1. Before writing, explain: “Write your answer. Then see whether the machines—and your friends—can find you.”
2. Show the prompt and existing configurable writing constraints. Machines write independently; competing text is unavailable to the creator until submission locks.
3. Let the creator choose a favorite eligible machine response. Preserve the existing no-self-vote rule and independent AI Detection/Taste calls.
4. Present the prompt and table with attributed votes, identity, and existing game results. Support explicit reveal pacing.
5. Offer a share action for the stable challenge link. Completing a round does not send anyone a message automatically.
6. Allow a clearly labeled creator preview that does not count as a recipient attempt in the funnel.
7. Provide an owner-only results page, reachable from the creator's session, where they can return to see completed recipient attempts. This is required for the first sharing milestone.

Every completed round should have a result worth viewing. A blank remains an honestly labeled failed submission with the existing zero-score treatment; do not call it successful hiding. Whether blank challenges appear in curated distribution is a curation choice.

## Recipient flow

1. Open the challenge without an account. See the prompt and six original responses, preserving original positions and hiding provenance and prior ballots.
2. Ask “Which answer did your friend write?” Use a creator-provided display name when available; it is not a verified real-world identity.
3. Separately offer “Which is your favorite?” Keep this optional for the first playtest. “Which is funniest?” may be used for a clearly comedic prompt, but do not change the meaning of the original stored Taste question retroactively.
4. Lock the Detection pick and any Taste pick explicitly. The choices may point to the same response. A recipient can favor any nonblank response, including the creator's.
5. Wait for the recipient's explicit reveal action. A host can hold this point indefinitely for an ordinary audience poll.
6. Reveal authorship and the recipient's choices alongside original human/AI ballots. Keep responses readable rather than showing unexplained letters first.
7. Offer **Share this challenge**, **Your turn**, and a way to start another prompt.

Recipients who skip Taste can still complete the challenge. Do not require them to submit writing before reaching the reveal.

## Challenge back

“Your turn. Make your friend find you” can open a new round on the same prompt, with new independent submissions and a new challenge ID. Preserve source-challenge attribution without modifying the original challenge.

Use **Now make me find you** as the role-reversal invitation. The first release must let a recipient start their own round with source attribution and share it manually. A same-prompt shortcut is the first enhancement after that basic loop, ahead of unrelated mode expansion. No notifications or friend graph are required.

The returning writer has seen the original answers. This continuity is intentional, but it is not a controlled comparison of independent attempts. Keep the new challenge separate; do not award a head-to-head score on the assumption that both writers had identical information.

## Creator-visible recipient results

For each completed recipient attempt, show the guessed label, whether it matched the creator, and the optional Taste choice. Example: “A player guessed D. You were B. They chose B as their favorite.” Use “No favorite selected” when Taste was skipped. Do not expose unfinished selections or count a locked-but-unrevealed attempt as completed.

The owner page also needs an honest empty state: no completed attempts yet. Refreshing it retrieves persisted results without new model calls. Access requires creator ownership; knowing the public challenge URL alone must not grant access to the owner page or its API. Session-based access is sufficient; cross-device account recovery is outside this pilot.

An optional recipient nickname may label an attempt, but it is self-reported. Without one, say “a player” or “an attempt,” not a named friend or a verified unique person. Notify recipients before they lock that the creator can see their completed picks. Do not add notifications, automatic messages, or a friend graph.

Correct guesses establish recognition, not which stylistic habit caused it. Reasons can emerge in conversation. An optional post-reveal explanation is later work, not an extra required step.

## Reading burden and inherited scoring

Six responses at the inherited 70-word cap can total 420 words. Curate the first prompts for short, distinctive answers and observe phone users reading the entire lineup. Record total lineup length, time to lock, abandonment, and whether people report skimming or losing track of labels; time alone does not prove they read every answer.

Treat the length-based risk multiplier as an open playtest hypothesis, not a proven incentive. Preserve the existing formula initially, but make recognition counts and separate preferences the main reveal facts; any legacy length-adjusted score is secondary. Observe whether the bonus encourages padding or competes with shareability. Record an evidence-based keep/change/remove recommendation after the pilot. Do not silently change scoring or retroactively recompute published results under new tunables.

## Emotional payoff

| Person | Discovery | Reason to care | Invitation back |
| --- | --- | --- | --- |
| Creator | Whether someone recognized their work and liked it without knowing it was theirs | Personal recognition and a preference expressed before provenance | “You found me. Can you fool me?” |
| Recipient | Whether they recognize their friend and whether their favorite belongs to that friend | A judgment about someone they know becomes a concrete conversational opening | “Now make me find you.” |

Let factual results invite the teasing rather than having the interface insult someone. A liked-but-misidentified answer, a recognized answer that lost Taste, and machines outperforming a friend at recognition can all be satisfying outcomes. None is required to happen for a round to count.

## Reveal contract

Use separate facts, for example: “You recognized your friend. You preferred C. Four of five AI judges missed them.” Example copy is illustrative; actual results must derive from stored votes.

- Report AI Detection, AI Taste, original creator Taste, and the current recipient's picks separately.
- If aggregate recipient results are shown, give their own denominator and describe anonymous attempts honestly. Do not merge them into original scores or claim verified unique people.
- Favor concrete counts over unsupported percentages or psychological interpretations.
- Keep wins, losses, and recognizable personal style enjoyable. No single combined social score is required.
- Provide copy/share behavior with success/failure feedback; a share action is not evidence of message delivery.

## State and persistence requirements

Proposed logical attempt progression: **choosing → locked → revealed**. Names and storage schema are implementation choices.

Each challenge references a completed original round. Each recipient attempt has separate ownership and immutable locked choices. Refresh resumes the appropriate state; repeated lock/reveal requests are idempotent. A repeated request with conflicting choices cannot rewrite a locked attempt.

Pre-reveal reads must not include creator-to-answer mappings, machine metadata, ballots, or answer-revealing results. Public Lab/Studio access must not bypass this boundary. Standard sharing metadata and link previews must remain spoiler-free. Result reads require the appropriate locked recipient attempt or creator ownership.

Opening and finishing a replay require no new model calls. Stable links, artifacts, and choices survive restart. Treat untrusted response text and display names as text, not executable markup.

## Acceptance and measurement

- A creator understands before writing that a friend can try to identify them.
- A separate browser can open, choose, lock, and reveal the exact original lineup.
- Creator preview and recipient attempts cannot alter original judgments or scores.
- Recipient Taste is optional and is stored separately from original contestant Taste.
- The creator can revisit an owner-only page showing completed guesses and optional Taste picks, including correct empty/skipped states. A different session cannot read it using the public challenge link.
- Recipients know their completed picks are visible to the creator; nicknames and attempt counts are not represented as verified identities.
- Phone and desktop flows keep the prompt and answers readable; keyboard users can complete the flow.
- A host can pause before reveal without a timer exposing the answer.
- Unknown links, failed requests, refreshes, and partial judging have understandable outcomes.
- All public-play integrity and verification criteria in the milestone remain required.

Primary signal: a recipient locks a guess and views the reveal. Stronger signals: onward sharing and attributed creation/completion of another round. Also measure creators returning after at least one recipient has completed, and whether they view newly available results rather than merely reload an empty page. Run the planned 20–30-person pilot; inspect reading burden, score incentives, and drop-off between opening, choosing, and revealing before adding phases or multiplayer.

Listen for unprompted “I need to send you one” from recipients and “Did they guess yet?” from creators. Note whether creators ask their friends about results during observed play; do not infer off-platform conversations from page views.

## Deferred choices

Choose the optional display-name UI and exact sharing copy during implementation. Same-prompt challenge-back is the first enhancement after the basic loop. Aggregate audience dashboards, post-reveal explanations, and named friend histories are not required for the first release.
