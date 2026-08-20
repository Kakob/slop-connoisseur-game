import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, testClock, testIdGen } from "../src/domain/runtime.js";
import { selectPrompt } from "../src/engine/promptSelection.js";
import { ensureSeeded, createRound } from "../src/engine/setup.js";
import { countWords, capWords } from "../src/engine/text.js";
import {
  BLANK_TEXT,
  revealPrompt,
  recordTypingStarted,
  submitHuman,
  timeoutBlank,
  type WritingDeps,
} from "../src/engine/writing.js";
import { riskTierFor } from "../src/scoring/risk.js";
import { GameStore } from "../src/store/store.js";

function makeRound() {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("t");
  const { human, machines } = ensureSeeded(store, defaultTunables, clock);
  const prompt = selectPrompt(store, seededRng(42), defaultTunables);
  const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
  const deps: WritingDeps = { store, clock, idGen, tunables: defaultTunables, events };
  return { store, clock, deps, round };
}

describe("word counting", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("  two\n words \t here ")).toBe(3);
  });

  it("caps to the first N words", () => {
    expect(capWords("a b c d", 2)).toBe("a b");
    expect(capWords("a b", 5)).toBe("a b");
  });
});

describe("risk tiers (§18)", () => {
  it("maps every legal word count to exactly one tier with monotonic multiplier", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 70 }), (wc) => {
        const tier = riskTierFor(wc, defaultTunables.riskTiers);
        expect(tier).not.toBeNull();
        const covering = defaultTunables.riskTiers.filter((t) => wc >= t.min && wc <= t.max);
        expect(covering).toHaveLength(1);
      }),
    );
    const m = (wc: number) => riskTierFor(wc, defaultTunables.riskTiers)!.multiplier;
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 69 }), (wc) => {
        expect(m(wc + 1)).toBeGreaterThanOrEqual(m(wc));
      }),
    );
  });

  it("gives blanks no tier", () => {
    expect(riskTierFor(0, defaultTunables.riskTiers)).toBeNull();
  });

  it("hits the SPEC boundary examples", () => {
    expect(riskTierFor(15, defaultTunables.riskTiers)!.name).toBe("SAFE");
    expect(riskTierFor(16, defaultTunables.riskTiers)!.name).toBe("BOLD");
    expect(riskTierFor(35, defaultTunables.riskTiers)!.name).toBe("BOLD");
    expect(riskTierFor(36, defaultTunables.riskTiers)!.name).toBe("DANGEROUS");
  });
});

describe("prompt selection", () => {
  it("prefers unplayed prompts", () => {
    const store = GameStore.open();
    const clock = testClock();
    const { human, machines } = ensureSeeded(store, defaultTunables, clock);
    const rng = seededRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const prompt = selectPrompt(store, rng, defaultTunables);
      expect(seen.has(prompt.id)).toBe(false);
      seen.add(prompt.id);
      createRound(store, prompt.id, human, machines, clock, testIdGen(`r${i}`));
    }
  });
});

describe("writing phase (M0.1)", () => {
  it("reveal starts the round and records promptShownAt", () => {
    const { store, deps, round } = makeRound();
    const inWriting = revealPrompt(deps, round.id);
    expect(inWriting.phase).toBe("WRITING");
    expect(store.get("round", round.id).timings.promptShownAt).toBeDefined();
    const types = store.where("event", (e) => e.roundId === round.id).map((e) => e.type);
    expect(types).toEqual(["round_started", "prompt_shown"]);
  });

  it("a normal submission produces an immutable human specimen with timings", () => {
    const { store, clock, deps, round } = makeRound();
    revealPrompt(deps, round.id);
    clock.advance(3000);
    recordTypingStarted(deps, round.id);
    clock.advance(20000);
    const specimen = submitHuman(deps, round.id, "networking events, obviously");

    expect(specimen.creatorType).toBe("human");
    expect(specimen.isBlank).toBe(false);
    expect(specimen.wordCount).toBe(3);
    const after = store.get("round", round.id);
    expect(after.phase).toBe("SUBMISSIONS_LOCKED");
    expect(after.timings.humanResponseMilliseconds).toBe(23000);
    expect(() => store.update("specimen", { ...specimen, text: "edited" })).toThrow(/immutable/);
    const types = store.where("event", (e) => e.roundId === round.id).map((e) => e.type);
    expect(types).toContain("human_submitted");
    expect(types).toContain("submissions_locked");
  });

  it("an empty timeout produces a Blank Specimen and the round continues (§5, §27)", () => {
    const { store, deps, round } = makeRound();
    revealPrompt(deps, round.id);
    const specimen = timeoutBlank(deps, round.id);

    expect(specimen.text).toBe(BLANK_TEXT);
    expect(specimen.wordCount).toBe(0);
    expect(specimen.isBlank).toBe(true);
    expect(store.get("round", round.id).phase).toBe("SUBMISSIONS_LOCKED");
    const types = store.where("event", (e) => e.roundId === round.id).map((e) => e.type);
    expect(types).toContain("human_timed_out_blank");
    expect(types).not.toContain("human_submitted");
  });

  it("enforces the word cap", () => {
    const { deps, round } = makeRound();
    revealPrompt(deps, round.id);
    const tooLong = Array.from({ length: 71 }, (_, i) => `w${i}`).join(" ");
    expect(() => submitHuman(deps, round.id, tooLong)).toThrow(/cap is 70/);
  });

  it("rejects empty submissions through the submit path", () => {
    const { deps, round } = makeRound();
    revealPrompt(deps, round.id);
    expect(() => submitHuman(deps, round.id, "   ")).toThrow(/Empty submission/);
  });

  it("rejects out-of-phase actions", () => {
    const { deps, round } = makeRound();
    expect(() => submitHuman(deps, round.id, "hi")).toThrow(/Cannot submit in phase READY/);
    revealPrompt(deps, round.id);
    submitHuman(deps, round.id, "hi there");
    expect(() => submitHuman(deps, round.id, "again")).toThrow(/Cannot submit/);
    expect(() => timeoutBlank(deps, round.id)).toThrow(/Cannot time out/);
  });

  it("blank timeout is distinguishable from an ordinary submission (§21)", () => {
    const a = makeRound();
    revealPrompt(a.deps, a.round.id);
    submitHuman(a.deps, a.round.id, "real answer");
    const b = makeRound();
    revealPrompt(b.deps, b.round.id);
    timeoutBlank(b.deps, b.round.id);

    const aTypes = a.store.where("event", (e) => e.roundId === a.round.id).map((e) => e.type);
    const bTypes = b.store.where("event", (e) => e.roundId === b.round.id).map((e) => e.type);
    expect(aTypes).toContain("human_submitted");
    expect(bTypes).toContain("human_timed_out_blank");
    expect(bTypes).not.toContain("human_submitted");
  });
});
