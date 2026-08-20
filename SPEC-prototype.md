# Slop Connoisseur — Prototype Specification

**Status:** Prototype / Claude Code handoff
**Primary goal:** Build a playable laboratory for testing whether human/machine linguistic deception + taste is fun.
**Implementation order:** M0 Hide From Machines → M1 Find The Machine
**Core principle:** Humans and machines compete not merely to pass as one another, but to produce responses worth reading.

---

# 1. Product thesis

Slop Connoisseur is a game about the increasingly blurry boundary between human and machine writing.

Its central tension has two dimensions:

1. **Identity:** Can humans and machines recognize one another?
2. **Taste:** Regardless of provenance, which responses do judges actually prefer?

The game should create situations such as:

* a human successfully passing as AI;
* an AI successfully passing as human;
* a human being mistaken for AI while winning the taste vote;
* an AI being immediately detected but nevertheless winning taste;
* players deliberately manipulating linguistic signals associated with AI;
* machine contestants developing different recognizable writing tendencies;
* the same pieces of writing becoming useful material for future rounds.

The prototype exists to determine whether these interactions are actually fun before building the larger multiplayer product.

---

# 2. Initial game modes

## 2.1 M0 — Hide From Machines

This is the first mode to implement end-to-end.

There is:

* 1 human contestant;
* 5 machine contestants.

All six receive the same prompt.

The human has a limited amount of time to answer.

The five machine contestants independently generate answers.

The six answers are shuffled and anonymized.

Each machine contestant then independently judges the anonymous table on two dimensions:

### Detection

> Which response do you believe was written by the human?

### Taste

> Which response would you most want to have written?

The human also casts a Taste vote among the machine responses.

After all judgments are locked, provenance is revealed.

The player sees:

* how many machines found them;
* how many machines they fooled;
* machine Human votes;
* machine Taste votes;
* their own Taste vote;
* response lengths;
* risk tiers;
* deception result;
* taste result;
* applicable combos/distinctions.

The human cannot lose merely because one machine identifies them. Deception is proportional.

---

## 2.2 M1 — Find The Machine

This is the mirror mode and represents the original multiplayer party-game concept.

There are:

* multiple human contestants;
* at least 1 machine contestant.

All contestants answer the same prompt.

Responses are anonymized and shuffled.

Human contestants independently cast:

### Detection

> Which response do you believe was written by the machine?

### Taste

> Which response would you most want to have written?

After judgments lock, provenance is revealed.

Humans can earn:

* detection success for finding the machine;
* taste success;
* decoy credit when other humans incorrectly accuse their response of being AI.

Machines can earn:

* deception success for escaping detection;
* taste success.

M1 should reuse M0's round, prompt, specimen, appearance, judgment, scoring, and lineage infrastructure.

Do not implement Find The Machine as an unrelated second game engine.

---

# 3. Prototype philosophy

The prototype should be intentionally utilitarian.

Do not spend substantial implementation time on:

* polished branding;
* elaborate animations;
* production authentication;
* matchmaking;
* social profiles;
* public leaderboards;
* monetization;
* sophisticated moderation;
* production-scale infrastructure.

The prototype should optimize for:

> Can the developer sit down alone, play repeated rounds against machine contestants, and learn whether the game is fun?

However, the underlying data architecture should preserve enough information to support later:

* multiplayer;
* asynchronous solo rounds;
* response reuse;
* personalized impostors;
* persistent machine contestants;
* prompt evolution;
* specimen lineage;
* strategy adaptation;
* multi-armed bandits;
* fine-tuning;
* preference optimization;
* reinforcement learning;
* research/analysis.

---

# 4. Laws vs. tunables

The implementation must distinguish **game laws** from **game tunables**.

## Laws

These should not be casually configurable:

* A judge must not receive hidden provenance before voting.
* Writer models must not receive the human response before producing their own response.
* Detection judgments must be locked before provenance reveal.
* Taste judgments must be locked before provenance reveal.
* Raw outcomes must be preserved.
* Specimens must not be mutated after creation.
* Derivations create new specimens.
* Model contestants must be treated as untrusted participants.
* Model contestants receive only information necessary for their current role.
* Judges must not have database/tool access that could reveal hidden state.
* Game state, not prompting, enforces blindness.

## Tunables

Centralize these in configuration:

```ts
humanWritingSeconds = 45

maxResponseWords = 70

riskTiers = [
  { min: 1, max: 15, multiplier: 1.0 },
  { min: 16, max: 35, multiplier: 1.25 },
  { min: 36, max: 70, multiplier: 1.6 }
]

machineContestantCount = 5
```

Also centralize:

* scoring constants;
* combo thresholds;
* retry limits;
* model/provider choices;
* prompt-selection strategy;
* persona assignments.

Do not scatter these values through UI/components.

---

# 5. Round lifecycle — Hide From Machines

Implement an explicit state machine.

Suggested states:

```text
READY
↓
PROMPT_REVEALED
↓
WRITING
↓
SUBMISSIONS_LOCKED
↓
WAITING_FOR_MACHINE_RESPONSES
↓
JUDGING
↓
JUDGMENTS_LOCKED
↓
REVEAL
↓
RESULTS
↓
READY
```

Machine response generation should begin as soon as the prompt is revealed.

This lets the human's writing timer mask inference latency.

## Writing phase

When the prompt appears:

* 45-second countdown begins immediately;
* human text input becomes active;
* machine contestants generate concurrently;
* human may submit early;
* at zero, current human response autosubmits;
* input hard-caps at 70 words.

Display live:

```text
12 words
SAFE · ×1
```

When crossing 15 words:

```text
16 words
BOLD · ×1.25
```

When crossing 35:

```text
36 words
DANGEROUS · ×1.6
```

The player does not explicitly select a difficulty.

**Their final word count determines risk.**

### Blank submissions

If the human response is empty when the timer expires, create a **Blank Specimen** rather than invalidating or discarding the round.

A Blank Specimen:

```ts
{
  text: "[no response]",
  wordCount: 0
}
```

is a valid round artifact, but it automatically:

* receives **zero deception**;
* receives **zero taste score**;
* is **ineligible to receive Taste votes**;
* receives no length-risk multiplier;
* does not qualify for positive deception/taste combos.

The round otherwise continues normally.

A blank should therefore represent a failed submission rather than a neutral skip. This preserves the timer as a meaningful constraint and prevents strategic skipping of undesirable prompts.

The blank remains stored as a specimen/event so the system can distinguish timeout/non-response behavior from missing or corrupted data.

**Intentional silence as a strategic mechanic is out of scope for M0.** If explored later, it should be designed explicitly rather than emerging accidentally from timeout behavior.

---

# 6. Machine contestants

Each machine contestant must be independently instantiated for generation and judging.

Do not implement:

> "Generate five contestants and simulate five judges."

as the production prototype architecture.

Instead:

```text
Contestant A → generation call
Contestant B → generation call
Contestant C → generation call
Contestant D → generation call
Contestant E → generation call
```

Later:

```text
Contestant A → judgment call
Contestant B → judgment call
Contestant C → judgment call
Contestant D → judgment call
Contestant E → judgment call
```

Calls may initially use the same underlying provider/model.

The architecture must allow different models/providers later.

---

# 7. Persona vs. tactics

Machine contestants should have persistent **personas** while remaining free to choose round-specific **tactics**.

## Persona

A persona represents relatively persistent tendencies.

Example conceptual fields:

```ts
type Persona = {
  id: string
  version: number

  name?: string

  tendencies: {
    verbosity: number
    humor: number
    formality: number
    confidence: number
    selfDisclosure: number
    specificity: number
    tendencyToExplain: number
    editingIntensity: number
  }

  tastePreferences: string[]

  persistentFacts?: string[]
}
```

The exact representation may evolve.

Seed five meaningfully different personas.

Example starting archetypes:

### Minimalist

* terse;
* blunt;
* low explanation;
* dry humor;
* relatively low self-disclosure.

### Anecdotal

* frequently grounds answers in experiences;
* comfortable with incidental details;
* moderate verbosity.

### Messy Thinker

* willing to leave thoughts partially unresolved;
* lighter editing;
* conversational;
* may reason while writing.

### Comedian

* prioritizes memorable premises and punchlines;
* comfortable sacrificing completeness.

### Earnest

* engages directly;
* relatively sincere;
* less motivated to turn everything into a joke.

These are starting points, not permanent game classes.

---

# 8. Machine tactical freedom

Do **not** prohibit machine contestants from using stylistic tactics associated with humans.

Models may strategically choose:

* lowercase;
* slang;
* fragments;
* typos;
* unusual punctuation;
* polished prose;
* terse answers;
* long answers;
* anecdotes;
* jokes;
* hedging;
* certainty;
* informal phrasing;
* unconventional structure.

Humans must not be forced to write formally simply because machines are prohibited from informal language.

Avoid hardcoded rules such as:

> "Insert exactly two typos."

The contestant should choose tactics based on its persona, prompt, strategy, and game objective.

---

# 9. Persistent machine history

Architecture should allow personas to accumulate history.

This does not need a sophisticated UI in M0.

Possible history includes:

* previous responses;
* previous stated preferences;
* recurring invented facts;
* prior prompt interactions;
* deception performance;
* taste performance.

A future contestant might consistently refer to:

* a dog it previously mentioned;
* a food it previously claimed to hate;
* an opinion established several rounds ago.

This allows machine specificity to emerge from continuity rather than random fabricated anecdotes.

History must remain scoped so it cannot expose hidden game provenance.

---

# 10. Prompt system

Prompts are first-class entities.

Suggested shape:

```ts
type GamePrompt = {
  id: string
  text: string

  source: "curated" | "user" | "generated"

  parentPromptId?: string

  tags: string[]
  hypotheses: string[]

  active: boolean

  createdAt: string
}
```

Seed approximately **30 prompts**.

Do not generate hundreds of generic prompts initially.

Seed prompts should deliberately vary in mechanical properties.

Examples:

### Personality revealing

> What's a completely unreasonable opinion you have about something that doesn't matter?

### Micro-comedy

> What's the worst possible response to "we need to talk"?

### AI-voice invitation

> Explain a minor inconvenience as though it were a profound life lesson.

### Specificity

> What's something that immediately makes a restaurant suspicious?

### Persuasion

> Convince someone that naps are productive.

### Observation

> What's a social rule everyone follows even though it makes no sense?

### Imagination

> Add one completely unnecessary feature to a refrigerator.

Record prompt hypotheses such as:

```text
reveals_personality
rewards_specificity
rewards_comedic_timing
invites_ai_voice
encourages_anecdote
supports_micro_response
supports_long_response
```

These hypotheses are analysis metadata, not player-facing categories.

---

# 11. Prompt lineage

Generated or modified prompts should not overwrite ancestors.

Example:

```text
P1
"What's the worst thing to hear after a haircut?"
    ↓ mutate-setting
P2
"What's the worst thing to hear after a dentist appointment?"
    ↓ increase-specificity
P3
"What's the worst sentence your dentist could begin with 'Interesting...'?"
```

Store the derivation.

Prompt lineage allows future analysis of:

> Which prompt families consistently produce difficult, entertaining rounds?

No prompt-evolution system needs to be implemented in M0 beyond supporting the data model.

---

# 12. Specimens

A **Specimen** is an immutable piece of submitted/generated text.

Suggested conceptual shape:

```ts
type Specimen = {
  id: string

  text: string

  creatorType: "human" | "model"

  createdAt: string

  wordCount: number

  reuseAllowed: boolean

  modelMetadata?: {
    provider: string
    model: string
    modelVersion?: string
    strategyId: string
    strategyVersion: number
    personaId: string
    personaVersion: number
  }
}
```

For Blank Specimens, `wordCount` may be `0`.

Do not edit specimens after creation.

If a specimen is transformed, create a descendant.

---

# 13. Derivations and lineage

A derivation describes how one specimen produced another.

```ts
type Derivation = {
  id: string

  parentSpecimenId: string
  childSpecimenId: string

  operation:
    | "imitate"
    | "humanize"
    | "slopify"
    | "rewrite"
    | "style-transfer"
    | "other"

  strategyId?: string
  strategyVersion?: number

  createdAt: string
}
```

M0 does not need to actively create complicated derivation chains.

The architecture must simply support them.

Future example:

```text
Human H17
   ├── imitate → Model A42
   ├── slopify → Model A43
   └── humanize → Model A44
```

This supports future content-generation and archaeological mechanics.

---

# 14. Appearances

Do not confuse a specimen with its use in a round.

A specimen can appear multiple times.

```ts
type Appearance = {
  id: string

  roundId: string
  specimenId: string

  anonymousPosition: number

  eligibleForDetection: boolean
  eligibleForTaste: boolean

  createdAt: string
}
```

This allows a historically difficult specimen to appear in future consented rounds without duplicating its provenance.

A Blank Specimen remains an Appearance in its originating round but has `eligibleForTaste: false`.

---

# 15. Judgments

Every individual judgment should be stored.

Do not store only aggregate totals.

```ts
type Judgment = {
  id: string

  roundId: string
  judgeContestantId: string

  type: "human-detection" | "machine-detection" | "taste"

  chosenAppearanceId: string

  createdAt: string

  judgeMetadata?: {
    model?: string
    personaId?: string
    personaVersion?: number
    promptVersion?: number
  }
}
```

Future versions may add:

* confidence;
* rankings;
* pairwise preference;
* explanation;
* response time.

Do not require those for M0.

---

# 16. Information boundaries

This is a critical architectural requirement.

## Writer context may receive

* current game prompt;
* its persona;
* allowed history;
* game objective;
* response constraints;
* strategy instructions.

## Writer context must NOT receive

* human response;
* other current-round responses;
* hidden provenance;
* judge results;
* answer keys.

## Detection judge receives

* current prompt;
* six anonymized responses;
* detection instruction;
* its judging persona/context.

It does not receive:

* provenance;
* creator IDs;
* specimen metadata;
* model metadata;
* risk labels;
* lineage;
* database access.

## Taste judge

A contestant cannot vote for its own response.

Avoid leaking its own response identity into detection.

Preferred implementation:

**Detection and Taste are separate calls.**

Detection call receives all anonymous responses with no knowledge of which is its own.

Taste call receives only the responses eligible for that contestant's vote.

For a machine judge, its own response is excluded.

For the human in Hide From Machines, the human's own response is excluded.

Blank Specimens are also excluded from Taste candidates.

This preserves detection blindness while enforcing Taste eligibility.

---

# 17. Taste

Taste is intentionally underdefined.

Use:

> **Which response would you most want to have written?**

Do not initially provide a rubric involving:

* humor;
* originality;
* clarity;
* relevance;
* usefulness.

The purpose is to measure preference, not rubric compliance.

Different personas may have different taste tendencies.

Taste votes must occur before provenance reveal.

Blank Specimens cannot receive Taste votes.

---

# 18. Scoring — M0

Keep underlying dimensions separate.

## Deception

For Hide From Machines:

```text
deceptionRate =
machinesFooled / machineJudges
```

Example:

2 of 5 machines identify the human.

```text
machinesFooled = 3
deceptionRate = 0.60
```

For a Blank Specimen:

```text
deceptionRate = 0
```

regardless of detection ballots.

This prevents timeout/non-response from accidentally becoming an optimal hiding strategy.

## Length risk

Derived mechanically:

```text
1–15 words   → 1.0×
16–35 words  → 1.25×
36–70 words  → 1.6×
```

Length multiplier applies only to deception.

Suggested:

```text
deceptionPoints =
100 * deceptionRate * lengthMultiplier
```

A Blank Specimen receives no multiplier and zero deception points.

Do not apply length multiplier to Taste.

## Taste

Track:

```text
machineTasteVotes
humanTasteVote
totalEligibleTasteVotes
tasteRate
```

For M0, display machine taste separately from the human's own selection where useful.

Do not prematurely assume machine and human Taste votes are equivalent for future research.

For prototype scoring, machine Taste votes can determine the player's Taste score.

A Blank Specimen has:

```text
tasteRate = 0
```

and is not included among eligible Taste candidates.

## Overall score

An overall numeric score may be displayed, but do not discard the underlying dimensions.

Avoid over-optimizing the formula before playtesting.

The results screen should emphasize:

```text
DECEPTION
TASTE
RISK
COMBOS
```

rather than only one total.

---

# 19. Initial distinctions / combos

Implement only a small set.

Suggested M0 distinctions:

## Clean Getaway

No machine identifies the human.

## Hidden Gem

No machine identifies the human AND human wins machine Taste.

## Safe Slop

High deception + low Taste + Safe response.

Thresholds should be configurable.

## Dangerous Goods

Human succeeds at deception while in Dangerous length tier and receives meaningful Taste support.

## Ghost Streak

Multiple consecutive rounds above configured deception threshold.

## Palate Streak

Multiple consecutive rounds with strong Taste performance.

Blank Specimens do not qualify for positive deception/taste distinctions and should break relevant success streaks.

Do not build a large achievement system yet.

Combo detection should derive from stored events/outcomes rather than destructive counters where practical.

---

# 20. Response time

Record:

```text
promptShownAt
humanStartedTypingAt
humanSubmittedAt
humanResponseMilliseconds
```

Response time does not initially affect score.

The prototype should allow experimentation with:

* 30 seconds;
* 45 seconds;
* 60 seconds.

Default:

**45 seconds.**

The purpose of the timer is to encourage commitment and natural writing, not polished essay composition.

A timeout resulting in no text creates a Blank Specimen as defined above.

---

# 21. Raw event logging

Store raw outcomes sufficient to recompute future rewards.

Potential events:

```text
round_started
prompt_shown
typing_started
human_submitted
human_timed_out_blank
machine_generation_started
machine_generated
submissions_locked
judging_started
judgment_cast
judgments_locked
provenance_revealed
round_completed
```

Each should include appropriate IDs and timestamps.

Do not make current scoring formulas the only historical record.

A blank timeout must be distinguishable from:

* an ordinary human submission;
* a provider/model failure;
* corrupted/missing data.

---

# 22. RL/adaptation readiness

**Do not implement reinforcement learning in M0 or M1.**

Instead, preserve data that could support it.

For model-generated specimens retain:

* prompt;
* prompt version;
* persona;
* persona version;
* strategy;
* strategy version;
* provider;
* model;
* model version where available;
* generation configuration;
* generated text;
* response length;
* latency;
* historical appearances;
* detection outcomes;
* Taste outcomes.

Store raw judgments.

Future reward functions might consider:

```text
deception
taste
relevance
diversity
novelty
```

Do not store only a single permanent reward number.

Future systems should be able to recompute rewards from historical observations.

---

# 23. Strategy versioning

Writer and judge prompts must have stable versions.

Example:

```text
writerStrategy:
  id: "base-impostor"
  version: 1

detectionStrategy:
  id: "find-human"
  version: 1

tasteStrategy:
  id: "want-to-have-written"
  version: 1
```

When instructions materially change, increment the version.

This is required for meaningful future comparisons.

---

# 24. Future adaptive progression

The architecture should permit, but not implement:

### Strategy analytics

Compare deception/Taste performance across strategies.

### Multi-armed bandits

Preferentially select strategies that perform well while preserving exploration.

### Strategy mutation

Generate descendants of successful strategies.

### Fine-tuning / preference optimization

Train from accumulated human/machine judgments.

### Adversarial reinforcement learning

Potential future loop:

```text
impersonators improve
        ↓
detectors improve
        ↓
humans adapt
        ↓
impersonators adapt
        ↓
...
```

The desired optimization target should never be deception alone.

Taste exists partly to discourage degenerate strategies such as maximally generic, extremely short responses.

---

# 25. Content reuse

Responses may become future game content only when:

```text
reuseAllowed = true
```

This should exist even in prototype data.

Potential future use:

A human response that fooled 5/5 machine judges may later become a difficult human specimen in Find The Machine.

An AI response that fooled most humans in Find The Machine may later appear in asynchronous challenges.

Reuse should create new **Appearances**, not new fake provenance.

Blank Specimens should not be eligible for content reuse unless a future explicit silence mechanic changes this rule.

---

# 26. Prompt performance

Architecture should permit future prompt statistics such as:

```text
timesPlayed
averageHumanDetectionRate
averageMachineDetectionRate
tasteVoteDistribution
responseLengthDistribution
abandonmentRate
blankSubmissionRate
```

This allows the game to discover which prompts actually produce interesting rounds.

Future generated prompts may descend preferentially from strong prompt families.

Do not implement automatic prompt evolution in M0.

---

# 27. Failures

Prototype must handle model failures explicitly.

## Generation failure

Retry up to configurable limit.

If still unsuccessful:

* mark contestant generation failed;
* do not silently fabricate provenance;
* allow round restart.

## Judge failure

Retry.

If permanently failed:

* record failed judgment;
* calculate results from successful judges if configured minimum judge count is met;
* otherwise invalidate/restart judging.

## Invalid model output

Validate all structured responses.

Retry malformed outputs.

## Duplicate responses

Exact duplicates should be detected and logged.

For M0, retry a machine generation producing an exact duplicate of another current response.

Do not implement semantic duplicate detection yet.

## Empty human response

This is **not** a system failure and does **not** invalidate the round.

At timeout:

* create a Blank Specimen;
* record `human_timed_out_blank`;
* assign zero deception;
* assign zero Taste;
* mark it ineligible for Taste voting;
* continue through judging and reveal.

---

# 28. Debug / Slop Lab surface

Provide a developer-only/debug surface.

It should expose:

* round ID;
* prompt ID;
* prompt metadata;
* actual provenance;
* anonymous ordering;
* specimen IDs;
* machine model/provider;
* persona IDs + versions;
* strategy IDs + versions;
* raw generated responses;
* word counts;
* generation latency;
* individual detection judgments;
* individual Taste judgments;
* calculated scores;
* events;
* errors/retries;
* blank-submission status.

This surface may be ugly.

Its purpose is to make hidden-state experimentation inspectable.

Never expose this information to a contestant before reveal.

---

# 29. M0 UI

Keep UI minimal.

## Start

```text
SLOP CONNOISSEUR

HIDE FROM MACHINES

Five machines know a human is hiding among them.

Blend in.
```

Button:

**Start Round**

## Writing

Show:

* prompt;
* countdown;
* textarea;
* live word count;
* current risk tier;
* current multiplier.

Example:

```text
What's something people pretend to enjoy?

00:31

[ response ]

27 words
BOLD · ×1.25
```

## Blank timeout

If the timer reaches zero with no response, lock the input and create the Blank Specimen.

The player should see a brief state such as:

```text
TIME.

No response submitted.
```

Do not present this as a technical error or offer a retroactive submission.

The round proceeds.

## Waiting

If necessary:

```text
The machines are writing...
```

## Taste

Display eligible responses anonymously.

Ask:

> **Which response would you most want to have written?**

Do not show Blank Specimens as Taste candidates.

## Judging

```text
THE MACHINES ARE LOOKING FOR YOU...
```

## Reveal

Reveal machine detection votes progressively or simultaneously.

Example:

```text
BOT 1 → C
BOT 2 → F
BOT 3 → C
BOT 4 → A
BOT 5 → C

YOU WERE C.

3 MACHINES FOUND YOU.
2 LET YOU THROUGH.
```

Then Taste:

```text
TASTE

BOT 1 → D
BOT 2 → C 👑
BOT 3 → F
BOT 4 → C 👑
BOT 5 → B

2/5 machines chose you.
```

Then:

```text
DECEPTION     40%
TASTE         40%
RISK          DANGEROUS ×1.6

[applicable distinction]
```

For a Blank Specimen, show clearly:

```text
NO RESPONSE

DECEPTION     0%
TASTE         0%
RISK          —

The round still counts.
```

Button:

**Next Round**

---

# 30. M1 architecture — Find The Machine

After M0 is playable and stable, implement M1 over the same primitives.

M1 requires real human participants.

For prototype purposes, use simple room/link mechanics.

No matchmaking.

Basic flow:

```text
create room
↓
join via link/code
↓
prompt
↓
timed responses
↓
machine response inserted
↓
shuffle
↓
human detection + Taste votes
↓
lock
↓
reveal
↓
score
↓
next round
```

Initial room target:

**3–8 humans + 1 machine.**

Future variants may use multiple machines.

Do not require accounts for prototype multiplayer unless technically necessary.

---

# 31. Find The Machine scoring

Machine:

```text
deceptionRate =
humansFooled / humanJudges
```

Human:

```text
detectionSuccess =
correctlyIdentifiedMachine ? 1 : 0
```

Humans also receive **decoy credit** when other humans falsely identify their response as the machine.

Taste remains independent.

Interesting outcomes should be preserved rather than flattened:

### Perfect Infiltration

Machine escapes detection and wins Taste.

### Too Good To Be Human

Machine is widely detected but wins Taste.

### False Positive

Human attracts substantial machine accusations.

### Artificial Excellence

Human is the most suspected machine while also winning Taste.

Exact thresholds remain configurable.

Blank-submission semantics for multiplayer should reuse the M0 concept where applicable: a timed-out human remains represented in the round rather than silently disappearing.

---

# 32. Data model boundaries

The implementation does not need to use these exact table names, but preserve these conceptual entities:

```text
Prompt
PromptDerivation

Contestant
Persona
PersonaVersion

Round

Specimen
SpecimenDerivation
Appearance

Judgment

Strategy
StrategyVersion

Event
```

Avoid one enormous `rounds` JSON blob as the sole source of truth.

JSON payloads may be stored for raw model request/response records, but important relationships should remain queryable.

---

# 33. Security / anti-cheating principle

Treat every model contestant as an untrusted player.

A model should not be asked:

> "Here is the answer key. Pretend you don't know it."

It should receive a context from which the answer key is absent.

Server-side provenance is authoritative.

Do not encode provenance into anonymous IDs or ordering in a predictable way.

Shuffle using server-side randomness.

Do not expose model metadata in contestant-facing API payloads before reveal.

This principle should survive future agentic models with tools.

---

# 34. Questions the prototype should answer

The prototype is successful if it helps answer questions such as:

## Core fun

* Do repeated rounds make the player want to play again?
* Is the reveal funny/surprising?
* Does the player develop strategies?
* Does losing make the player want another attempt?

## Deception

* Is hiding from machines actually difficult?
* Does response length meaningfully affect detection?
* Do machine personas reduce obvious house style?
* Do certain personas consistently detect humans better?

## Taste

* Does having heterogeneous judges make Taste unpredictable enough to be interesting?
* Can a player deliberately improve at Taste?
* Does Taste discourage low-effort deception strategies?
* How correlated are detection and Taste?

## Timer

* Is 45 seconds enough?
* Does time pressure encourage natural writing?
* Does it make longer risk tiers meaningfully harder?
* How often do players time out blank?
* Are blank submissions mostly accidental, prompt-related, or indicative of excessive timer pressure?

## Prompts

* Which prompt families create close detection votes?
* Which produce interesting Taste disagreement?
* Which encourage boring/generic answers?
* Which support different length strategies?

## Machine population

* Do personas become recognizable?
* Does persistent history make machine writing more convincing?
* Do models naturally choose useful tactical variation?
* Do different models/providers behave meaningfully differently?

---

# 35. Explicitly out of scope

For M0:

* production authentication;
* public profiles;
* matchmaking;
* public chat;
* social graph;
* public leaderboards;
* monetization;
* RL;
* fine-tuning;
* automatic prompt evolution;
* personalized human impostors;
* archive browsing;
* research dashboard;
* elaborate achievements;
* sophisticated semantic duplicate detection;
* intentional-silence strategy mechanics;
* production moderation system.

For M1, add only the multiplayer functionality necessary to test Find The Machine.

---

# 36. Milestones

## M0.0 — Foundation

Implement:

* core data model;
* configuration/tunables;
* prompt seeds;
* personas;
* strategy versioning;
* model-provider abstraction;
* event logging;
* provenance boundaries.

Acceptance:

Hidden provenance can be stored server-side while contestant/judge payloads contain no answer-key information.

---

## M0.1 — Human writing loop

Implement:

* prompt selection;
* 45-second timer;
* textarea;
* autosubmit;
* Blank Specimen timeout behavior;
* 70-word cap;
* live risk tier;
* human specimen creation.

Acceptance:

A human can complete the writing phase and always produce an immutable round artifact: either a normal submitted specimen or a Blank Specimen on empty timeout.

---

## M0.2 — Machine table

Implement:

* five independent machine contestants;
* five personas;
* concurrent generation;
* machine specimen creation;
* shuffled appearances.

Acceptance:

A completed table contains exactly one human-origin Appearance and five independently generated machine specimens, anonymized for judging. The human-origin Appearance may reference a Blank Specimen.

---

## M0.3 — Independent judging

Implement:

* one independent detection call per machine contestant;
* one independent Taste call per machine contestant;
* human Taste vote;
* no self-Taste voting;
* Blank Specimen Taste exclusion;
* strict detection blindness;
* raw judgment persistence.

Acceptance:

No judging request contains hidden provenance, and each machine produces its own persisted ballots.

---

## M0.4 — Reveal and scoring

Implement:

* provenance reveal;
* individual ballots;
* deception rate;
* risk multiplier;
* Taste result;
* Blank Specimen zero-score behavior;
* initial distinctions;
* results UI.

Acceptance:

Developer can inspect how every displayed result derives from stored raw judgments.

---

## M0.5 — Slop Lab

Implement:

* debug surface;
* raw event inspection;
* model/persona/strategy metadata;
* timing;
* errors;
* prompt metadata;
* provenance graph basics.

Acceptance:

A developer can diagnose a suspicious or surprising round without querying the database manually.

---

## M0.6 — Playtest pass

Play enough rounds to evaluate:

* timer;
* risk thresholds;
* scoring;
* persona diversity;
* prompt quality;
* Taste behavior;
* replay desire;
* blank timeout frequency.

Change tunables before expanding scope.

---

## M1 — Find The Machine

Implement:

* lightweight rooms;
* multiple humans;
* timed shared prompt;
* machine insertion;
* human Detection vote;
* human Taste vote;
* decoy scoring;
* reveal;
* match scoring;
* cross-round combos.

Reuse M0 primitives.

---

# 37. Definition of prototype success

Do not judge success primarily by visual polish or feature count.

The most important success condition is behavioral:

> **The developer finishes a round and voluntarily starts another because they want to beat the machines, win Taste, preserve a combo, or understand why they were detected.**

Secondary evidence includes:

* surprising reveals;
* memorable machine contestants;
* strategic use of response length;
* disagreement among Taste judges;
* changes in player strategy across rounds;
* interesting human/machine false positives;
* reusable specimens accumulating naturally.

If repeated play does not produce these behaviors, investigate the core game before expanding the product.

---

# 38. Product direction after validation

If the prototype validates the loop, likely next directions include:

1. public Find The Machine rooms;
2. asynchronous rounds using consented historical specimens;
3. richer persistent machine contestants;
4. cross-round and cross-mode combos;
5. prompt-family selection based on performance;
6. personalized impostors;
7. specimen lineage games;
8. adaptive machine strategies;
9. bandit-based strategy selection;
10. eventually preference optimization / RL experiments.

The game should remain understandable even as the underlying system becomes sophisticated.

The player-facing fantasy remains simple:

> **Machines are learning how humans write.**
>
> **Humans are learning how machines write.**
>
> **Everyone is trying to fool everyone.**
>
> **And being convincing doesn't count for much if nobody likes what you said.**
