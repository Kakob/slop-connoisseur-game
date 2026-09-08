# Code Tasting prototype specification

Status: proposed follow-on prototype under the agreed product direction; not implementation scope for the immediate Blind Tasting milestone. Updated September 7, 2026.

## Promise

> Write code you're willing to defend. Your friend will try to find it—and decide whether they'd ship it.

Code Tasting is a social code-review game. A human contributes a real implementation alongside independently generated machine solutions. Recipients judge authorship and preference, predict concrete behavior, then see which judgments survive execution.

There is no required single winner. A memorable round may involve excellent human code, excellent AI code, recognizable style, successful camouflage, a mistaken prediction, or a useful counterexample. Do not deliberately inject bugs to guarantee drama.

## Four independent dimensions

| Dimension | Question | Evidence |
| --- | --- | --- |
| Authorship | Which did your friend write? | Stored provenance |
| Taste | Which would you merge for this stated task? | Attributed choices |
| Confidence | How sure are you about the behavior prediction? | Player's pre-execution commitment |
| Behavior | What does this implementation actually do? | Versioned test and execution results |

AI-looking code can be preferred and behave correctly. Human-looking code can fail. No quadrant should equate AI with bad quality, or preference with correctness.

## Proposed smallest experiment

- One human and two machine contestants: three short implementations rather than six long reading assignments.
- One language, one curated problem, and one fixed runtime. A JavaScript function with a typed contract is the proposed starting point; exact editor/transpilation choices remain open.
- A starter function, explicit input domain, visible examples, and configurable writing time. The existing prose 45-second timer and word cap do not automatically apply.
- Independently generated bot code from recorded provider/model configurations. Multiple providers are an experiment option, not an infrastructure prerequisite. Never label two same-model personas as different model families.
- One behavior prediction per attempt, with lightweight confidence: guessing / fairly sure / very sure.
- Optional counterexample submission after completion.

Use one problem to validate the interaction, then a few fresh problems to test learning transfer. Short bug-fix patches are a later format option.

## First problem candidate: dedupeById

```ts
function dedupeById(items: Array<{ id: string | number }>): Array<{ id: string | number }>
```

Proposed contract:

- Accept a JSON array of objects, each with an `id` that is a string or finite number. Additional fields are outside this first problem's input schema.
- Keep the first occurrence of each ID and preserve input order.
- Treat numeric and string IDs as distinct: `1` and `"1"` are different.
- Compare strings exactly; do not normalize case or whitespace. Numerically equal IDs count as duplicates; `0` and `-0` count as equal.
- Do not mutate the input array or its elements.
- Return an array containing the retained objects; object identity in the returned array is not scored. Do not require an efficiency target unless stated in the contract.

Freeze the input validator, expected behavior, test suite, and runtime version before publishing a challenge. The execution harness must inspect input mutation inside the execution context; comparing returned JSON alone cannot establish non-mutation.

Example diagnostic input:

```json
[{"id":1},{"id":"1"}]
```

For a selected snippet, ask whether it returns both elements, only the first, only the second, throws, or has another outcome. Options must match meaningful possibilities for that snippet; distinguish an infrastructure failure or execution limit from a language-level thrown exception.

## Creator flow

1. See the task contract and the friend-challenge invitation before writing.
2. Write and run allowed visible examples without seeing rival code. Lock the submission before comparing implementations.
3. Choose another implementation to merge and predict a rival's behavior, with confidence.
4. Explicitly reveal behavior and any collected judgments, with source attribution.
5. Share the fixed lineup; optionally try a counterexample against a rival.

The creator knows their own submission and must not be asked to identify it. Whether the first prototype also collects automated AI Detection/Taste ballots is an open scope choice; if included, reuse the separate blind judging design and record the actual model. Do not fabricate such votes if omitted.

## Recipient flow

1. Open a friend's three-snippet challenge without writing code or creating an account.
2. Guess the friend's implementation and choose which implementation to merge. Lock these first impressions before displaying the diagnostic input or execution evidence.
3. Show one snippet and a diagnostic input. Default to the merge choice when an appropriate diagnostic is available; otherwise select a target using a recorded deterministic rule.
4. Commit an expected outcome and confidence before execution evidence is returned. Do not reveal model identity first.
5. Explicitly reveal behavior, then authorship and attributed votes. Keep the contract, code, input, expected result, and actual result inspectable.
6. Present the result and actions: share, write your own, or **Find the counterexample**.

Default flow: **find → choose → predict → reveal**. Counterexample play is optional after the result, never a gate before completion. Prediction explanations should be short and grounded in the actual code and observed behavior.

## Optional counterexample phase

Allow a small JSON input targeting any implementation, human or machine. Use **Break the machine** as contextual copy for an AI target; humans can be challenged too.

Validate the input against the published contract, execute within limits, and compare with a trusted reference/checker, not an AI judgment. Establish these distinct outcomes:

- **Counterexample found:** valid input demonstrates a specific contract violation; show expected and actual behavior.
- **Passed your test:** this input did not reveal a violation. Do not imply general correctness.
- **Invalid input:** outside the published problem contract.
- **Execution unavailable/limited:** report infrastructure failures separately. A resource limit only proves a task violation if that limit was part of the published task contract.

Store successful counterexamples and later evidence as separate records. Do not overwrite the original specimen, original predictions, or original test-run snapshot. Distinguish “passed the original tests” from “a later counterexample was found.”

## Data and execution requirements

Reuse challenge ownership, stable appearances, immutable specimens, separate recipient attempts, and reveal gating from Blind Tasting. Do not force Code Tasting's three-contestant prototype through existing six-contestant assumptions without auditing them.

New records should capture problem/contract version, source text and language, actual generation provenance, runtime and harness versions, test-suite version, execution results, prediction target/input/options, locked picks/confidence, and counterexample attempts. Exact schema is a design choice.

Persist or deterministically reproduce the assigned prediction on refresh. Use separate locks for first impressions and prediction: **choosing → impressions locked → prediction locked → revealed**. All mutations are retry-safe; recipient actions leave original ballots and artifacts unchanged.

Source code is untrusted. Execute neither human nor model submissions in the web-server process. Choose an isolated runner with no application secrets or network access, bounded CPU/wall time/memory/output, and fresh execution state. Test escape/timeout/failure handling before public execution. Arbitrary packages, arbitrary file access, multiple languages, and general agent environments are out of scope.

Standardize presentation without silently rewriting submitted logic. Exclude direct provider signatures from publishable machine outputs through validation/retry, while preserving generation records. Do not remove legitimate comments or stylistic choices just because they help recognition. Failed generation or invalid code must have an explicit outcome rather than a secretly repaired replacement.

Replay of stored snippets and fixed test evidence requires no new model generation. Running a new submitted counterexample does require bounded execution. Keep test evidence and provenance out of pre-prediction API responses and link previews.

## Results and learning claims

Display separate authorship guesses, merge choices, prediction correctness/confidence, and test outcomes. Identify human versus AI votes and use observed counts. “Passed these tests” is evidence, not proof of correctness.

Start with a tasting history: actual attempts and specific error categories. Do not initially claim an “AI intuition score,” model-family expertise, or bias against verbosity from a few unmatched examples. Comparing model families requires recorded versions and comparable tasks/exposure.

Measure social participation and learning separately:

- Social: challenge open → first impressions locked → prediction locked → reveal viewed → onward share or new writing round.
- Depth: counterexample attempts and validated counterexamples, tracked separately from mandatory completion.
- Learning: prediction accuracy and confidence on fresh problems, with counts and task categories. Improvement on repeated exposure to one trap does not establish general code-review improvement.

## Prototype acceptance criteria

- A human writes one actual implementation; two independently generated rivals form a stable challenge.
- A fresh recipient completes the required flow without writing code.
- Creator and recipient paths differ appropriately; first impressions lock before diagnostic evidence and prediction locks before behavior/provenance.
- Reference behavior and adversarial inputs are tested against the explicit problem contract.
- Executed failures, missing evidence, resource limits, and invalid attack inputs are distinguishable.
- Refresh/retry/restart preserve assigned predictions, locked choices, original artifacts, and original results.
- A recipient can inspect a concrete input/output discrepancy and opt into counterexample play after completion.
- Public execution passes isolation and resource-limit checks; browser code remains displayed text.
- A small observed prototype test records reading burden, time to payoff, sharing behavior, and prediction comprehension before broader build-out.

## Decisions still open before implementation

Exact runtime/isolation technology; writing time and editor; provider/model lineup; whether initial AI ballots justify their latency; diagnostic selection and option generation; result-card layout; and the developer pilot size. These are prototype design choices, not validated product facts.
