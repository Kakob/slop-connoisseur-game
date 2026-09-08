# Three Code Tasting problem sketches

September 8, 2026. Paper design exercises for the [Code Tasting prototype](./spec-code-tasting.md), not implemented tasks or a committed launch pack.

Purpose: compare three small problems that support authorship guessing, meaningful merge preferences, one behavior prediction, and both passing and failing reveals. Choose one before building the runner; no additional catalog is necessary yet.

Example verification: all seven authored JavaScript snippets were checked locally against 28 case combinations on September 8, 2026, including the stated returned values, input mutations/non-mutations, and new-object requirements for the passing merge/topScores examples. This checks the paper examples, not an application runner, live model performance, or an exhaustive reference suite.

## Shared rules for these sketches

- A creator and two machines independently respond to the same published contract. Nobody sees competing submissions before locking.
- Creators self-report no generative assistance. These examples are authored design fixtures, not real human/model submissions, and must not be planted into a live lineup as authentic outputs.
- Recipients guess the creator and select a merge choice or **None as written** before seeing the assigned diagnostic. A correct prediction of buggy behavior is still a correct prediction.
- Each draft bank below includes ordinary and edge inputs. If a problem is selected, review and freeze its bank before collecting submissions; assign using the spec's persisted ordinal rule, without choosing cases because a submission fails them.
- Show the code and exact input before asking what it does, not merely what the specification says it should do. Distinguish actual output, expected output, input changes, exceptions, and unavailable execution.
- JSON object property order is not scored. Array order is. Use fresh inputs for every execution and inspect mutation inside the runner.
- No performance competition is implied. Freeze accepted input-size bounds and execution limits before publication; limits must not change silently after a challenge is shared.
- The illustrative passing implementations below are useful for checking the examples but are not production-hardened reference checkers. A selected task still needs an independently validated checker and input validator.

## 1. dedupeById — which duplicate survives?

### Player prompt and contract

> Keep the first item for each ID, in the order it appeared. Don't change the input. Number IDs and string IDs are different.

```ts
type Item = { id: string | number; value: string };
function dedupeById(items: Item[]): Item[];
```

Input is a JSON array of objects with exactly `id` and `value`; `id` is a finite number or string and `value` is a string. Empty input is valid. Retain the complete first object for each ID, including its value. Compare strings exactly, distinguish numbers from strings, and treat `0` and `-0` as the same numeric ID. Do not mutate input. Returned object reference identity is not scored.

The value field makes first-versus-last retention observable. It is specific to this task, not a mode-wide schema requirement.

### Illustrative prediction

Consider this plausible implementation:

```js
function dedupeById(items) {
  return [...new Map(items.map(item => [item.id, item])).values()];
}
```

Assigned input:

```json
[{"id":1,"value":"first"},{"id":1,"value":"second"}]
```

What does it return?

- A: `[{"id":1,"value":"first"}]`
- B: `[{"id":1,"value":"second"}]`
- C: both input elements, unchanged
- D: throws
- E: another outcome

**Actual: B. Required: A.** Setting the same Map key again replaces its value. A recipient who chose B predicted correctly even though the implementation violates the contract.

### A passing approach and a satisfying passing reveal

```js
function dedupeById(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
```

On `[{"id":1,"value":"numeric"},{"id":"1","value":"string"}]`, both implementations shown return both objects and leave the input unchanged. That successful case is legitimate; the game must not quietly replace it with the duplicate case to create a failure.

If the live lineup contains three implementations that all pass the original suite, show the correct prediction and the relevant membership check, then reveal authorship and merge preferences. Readers may prefer an explicit loop, a filter with a Set, or a more declarative equivalent. Style differences are hypotheses to observe, not guaranteed diversity from models.

### Draft ordered diagnostic bank

| ID | Input | Required output / behavior |
| --- | --- | --- |
| D0 | `[]` | `[]`, input unchanged |
| D1 | `[{"id":"a","value":"one"},{"id":"b","value":"two"}]` | Both objects in input order |
| D2 | `[{"id":1,"value":"first"},{"id":1,"value":"second"}]` | First object only |
| D3 | `[{"id":1,"value":"numeric"},{"id":"1","value":"string"}]` | Both objects, numeric first |
| D4 | `[{"id":"b","value":"one"},{"id":"a","value":"two"},{"id":"b","value":"three"}]` | `[{"id":"b","value":"one"},{"id":"a","value":"two"}]` |

Every case also requires unchanged input. The complete checker should additionally cover valid special string IDs and numeric equality; this small prediction bank is not an exhaustive correctness suite.

### Counterexample and conversation

The D2 input breaks the Map implementation's first-occurrence rule. A key-coercing object-based implementation might instead fail D3; do not imply the Map implementation fails that case.

Possible conversation: “I liked the one-liner. I correctly traced what it does, but missed that it keeps the wrong object when I voted to merge it.”

**Design risk:** some developers immediately recognize the Map pattern. Good opening readability, but repeated rounds on this task alone would mostly teach one familiar trap.

## 2. mergePreferences — does ‘off’ count as a choice?

### Player prompt and contract

> Merge a user's preferences over defaults. An omitted setting keeps its default. An explicitly supplied setting wins—even `false`, `0`, or an empty string. Don't change either input.

```ts
type Preferences = { sound: boolean; volume: number; label: string };
function mergePreferences(
  defaults: Preferences,
  overrides: Partial<Preferences>
): Preferences;
```

Inputs are JSON objects. Defaults contain exactly all three fields. Overrides contain any subset of those fields and no others. `sound` is boolean; `volume` is an integer from 0 through 100; `label` is a string, including empty. Values retain their field's type. `null`, `undefined`, inherited fields, and arbitrary keys are outside this input domain. An omitted field is distinct from a present falsy value. Return a new object containing all three fields; inputs remain unchanged. There are no nested objects or deep-merge rules.

### Illustrative prediction

```js
function mergePreferences(defaults, overrides) {
  return {
    sound: overrides.sound || defaults.sound,
    volume: overrides.volume || defaults.volume,
    label: overrides.label || defaults.label,
  };
}
```

Assigned arguments:

```json
{
  "defaults":{"sound":true,"volume":50,"label":"Guest"},
  "overrides":{"sound":false,"volume":0,"label":""}
}
```

What does it return?

- A: `{"sound":false,"volume":0,"label":""}`
- B: `{"sound":true,"volume":50,"label":"Guest"}`
- C: `{"sound":false,"volume":50,"label":"Guest"}`
- D: throws
- E: another outcome

**Actual: B. Required: A.** The fallback operator replaces explicit falsy choices with defaults. The result silently restores sound and volume the user turned off.

### A passing approach and a satisfying passing reveal

```js
function mergePreferences(defaults, overrides) {
  return { ...defaults, ...overrides };
}
```

This is sufficient for the deliberately shallow, validated JSON contract. Do not generalize it to a deep merge or to inputs allowing explicit `undefined`.

With overrides `{"volume":80}`, both implementations shown return `{"sound":true,"volume":80,"label":"Guest"}` and do not mutate inputs. A passing prediction can confirm how missing fields differ from present values.

For an all-pass lineup, contrast an explicit per-field implementation with spreading or a fresh-target assignment. Readers can disagree about schema clarity and concision without the reveal declaring a subjective winner. A concise trace should show which object supplies each output field.

### Draft ordered diagnostic bank

Use defaults `{"sound":true,"volume":50,"label":"Guest"}` for each case.

| ID | Overrides | Required output |
| --- | --- | --- |
| M0 | `{}` | `{"sound":true,"volume":50,"label":"Guest"}` |
| M1 | `{"volume":80}` | `{"sound":true,"volume":80,"label":"Guest"}` |
| M2 | `{"sound":false}` | `{"sound":false,"volume":50,"label":"Guest"}` |
| M3 | `{"volume":0}` | `{"sound":true,"volume":0,"label":"Guest"}` |
| M4 | `{"label":""}` | `{"sound":true,"volume":50,"label":""}` |
| M5 | `{"sound":false,"volume":0,"label":""}` | `{"sound":false,"volume":0,"label":""}` |

Every case requires a new result object and unchanged inputs. Reference identity and input changes must be observed inside the harness, not inferred solely from serialized return values.

### Counterexample and conversation

M2 is a smaller counterexample than the combined M5 diagnostic for the illustrative faulty code. Another candidate, `Object.assign(defaults, overrides)`, can produce the correct returned fields while violating the no-mutation/new-object contract; its reveal would need input-state evidence rather than a false claim about its returned JSON.

Possible conversation: “You merged the code that turns my sound back on.”

**Design risk:** the correct implementation may be so short that all three submissions are nearly identical. That would limit authorship guessing even if the behavior lesson is clear. Observe natural variation; do not add artificial complexity or planted bugs to force a tournament.

## 3. topScores — right answer, changed input

### Player prompt and contract

> This helper returns the highest scores, but it changes the caller's score list. Fix it. Return at most `limit` scores, highest first, without changing the input.

Starter supplied equally to the human and both machines:

```js
function topScores(scores, limit) {
  return scores.sort((a, b) => b - a).slice(0, limit);
}
```

```ts
function topScores(scores: number[], limit: number): number[];
```

Input is a JSON array of integers from -1,000,000 through 1,000,000 and a nonnegative safe integer `limit`. Return a new array of the largest `min(limit, scores.length)` elements in descending numeric order. Preserve duplicate scores. Empty input and zero limit return a new empty array. If the limit exceeds the length, return all scores descending. The original array must be unchanged after the call. No sorting algorithm or complexity target is required.

This is explicitly a bug-fix task. A supplied faulty starter is part of the prompt, not a fake AI submission. All contestants submit their complete repaired function; recipients see that full function rather than a context-free diff.

### Illustrative prediction

A plausible incomplete repair copies the result after sorting:

```js
function topScores(scores, limit) {
  const sorted = scores.sort((a, b) => b - a);
  return [...sorted].slice(0, limit);
}
```

Assigned arguments: `scores = [3, 9, 5]`, `limit = 2`.

Ask **“What is returned, and what is `scores` immediately after the call?”**

- A: returns `[9,5]`; input remains `[3,9,5]`
- B: returns `[9,5]`; input becomes `[9,5,3]`
- C: returns `[3,9]`; input remains `[3,9,5]`
- D: throws
- E: another outcome

**Actual: B. Required: A.** Copying after the sort cannot undo its mutation. The return value alone is correct; the observable side effect violates the contract.

### A passing approach and a satisfying passing reveal

```js
function topScores(scores, limit) {
  return [...scores].sort((a, b) => b - a).slice(0, limit);
}
```

For `[3,9,5]` and limit 2, the repaired version returns `[9,5]` and leaves `[3,9,5]` intact. The relevant trace is the placement of the copy before sorting.

For `[9,5,3]` and limit 2, the incomplete repair also leaves the observed input contents unchanged. The checker scores the published observable contract, not an unsupported inference from merely seeing `.sort` in the source. Other inputs still expose the bug.

An all-pass lineup might use spreading, an initial `slice()`, or a non-mutating sort available in the chosen runtime. Confirm that runtime before admitting language features. The reveal can confirm accurate state tracing and compare clarity, even when all three are correct.

### Draft ordered diagnostic bank

| ID | Scores; limit | Required return | Required post-call scores |
| --- | --- | --- | --- |
| T0 | `[]`; `2` | `[]` | `[]` |
| T1 | `[9,5,3]`; `2` | `[9,5]` | `[9,5,3]` |
| T2 | `[3,9,5]`; `2` | `[9,5]` | `[3,9,5]` |
| T3 | `[3,9,5]`; `0` | `[]` | `[3,9,5]` |
| T4 | `[2,10,1]`; `2` | `[10,2]` | `[2,10,1]` |
| T5 | `[-1,7,7]`; `5` | `[7,7,-1]` | `[-1,7,7]` |

Every return must be a new array. T4 also catches accidental default lexicographic sorting; T5 checks duplicates and an oversized limit. These are separate failure hypotheses, not claims that a given model will make them.

### Counterexample and conversation

`{"scores":[1,2],"limit":1}` is a small counterexample to the incomplete repair: it returns `[2]` but leaves the input as `[2,1]`. If all repairs pass, allow attacks against any candidate while honestly reporting “Passed your test.”

Possible conversation: “I checked the returned scores. You checked what happened to the caller.”

**Design risk:** the starter already names mutation as the problem, so experienced players may solve and identify the fix immediately. The paired return/input prediction increases reading burden, and tiny fixes may yield identical submissions. This is a useful format test, not a promise of a harder or more viral challenge.

## Comparison and provisional choice

| Problem | What the recipient traces | Social opening | Main uncertainty |
| --- | --- | --- | --- |
| dedupeById | Retention, order, and ID equality | “That elegant version kept the wrong person's value.” | Familiarity with the pattern; model solution variety |
| mergePreferences | Missing values versus explicit choices | “Your favorite code turned sound back on.” | Correct submissions may all be the same one-liner |
| topScores repair | Return value versus caller-visible state | “You got the answer right and changed my data.” | Prompt gives away the bug class; more evidence to read |

**Provisional recommendation:** retain dedupeById as the first implementation candidate. Its payload now makes the disputed behavior visible, its outputs fit a small screen, and it admits several short approaches. Preference merging is the simplest behavioral story; topScores is the strongest test of reviewing effects beyond the return value. This is a paper-design judgment, not playtest evidence.

Before selecting a task, walk through one passing and one failing reveal with actual readers, using these clearly labeled fixtures. Ask what they thought they were predicting and whether they want to try another input or write an alternative. Check whether knowing the task leaves enough uncertainty for authorship guessing. If all three authentic submissions converge to near-identical code, record that as a product finding rather than manufacturing differences.

The planning stopping rule is met when one candidate supports a comprehensible passing round and a failing round with a natural next action. That is enough to prototype Code Tasting after the Blind Tasting social loop; do not turn these sketches into a requirement to build three tasks or a general execution platform first.
