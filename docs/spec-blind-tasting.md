# Blind Tasting specification

Status: next-milestone product specification; unimplemented friend flow. Updated September 7, 2026.

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

An automated same-prompt challenge-back action is a follow-on enhancement if it expands the immediate milestone. The first release must at least let a recipient start their own round and share it manually. No notifications or friend graph are required.

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
- Phone and desktop flows keep the prompt and answers readable; keyboard users can complete the flow.
- A host can pause before reveal without a timer exposing the answer.
- Unknown links, failed requests, refreshes, and partial judging have understandable outcomes.
- All public-play integrity and verification criteria in the milestone remain required.

Primary signal: a recipient locks a guess and views the reveal. Stronger signals: onward sharing and attributed creation/completion of another round. Run the planned 20–30-person pilot; inspect drop-off between opening, choosing, and revealing before adding phases or multiplayer.

## Deferred choices

Choose the optional display-name UI, exact sharing copy, and same-prompt challenge-back timing during implementation. Aggregate audience dashboards and named friend histories are not required for the first release.
