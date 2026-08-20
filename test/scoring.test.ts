import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { defaultTunables } from "../src/config/tunables.js";
import { testClock, testIdGen, isoNow } from "../src/domain/runtime.js";
import { ensureSeeded } from "../src/engine/setup.js";
import { makeEventLogger } from "../src/engine/events.js";
import { revealProvenance, completeRound } from "../src/engine/reveal.js";
import { computeResults } from "../src/scoring/scoring.js";
import { GameStore } from "../src/store/store.js";
import type { JudgingDeps } from "../src/engine/judging.js";
import { MockModelProvider } from "../src/providers/mock.js";

const MACHINE_IDS = [
  "machine-minimalist",
  "machine-anecdotal",
  "machine-messy-thinker",
  "machine-comedian",
  "machine-earnest",
];

type ScenarioOpts = {
  humanWords?: number;
  blank?: boolean;
  /** Five labels chosen by the five detection judges (human sits at label C). */
  detection?: string[];
  /** Labels chosen by machine taste judges (judges in MACHINE_IDS order). */
  machineTaste?: string[];
  humanTaste?: string;
  phase?: "JUDGMENTS_LOCKED" | "RESULTS";
};

/** Builds one round's raw records directly; human is always label C. */
function addRound(store: GameStore, clock: ReturnType<typeof testClock>, idGen: () => string, opts: ScenarioOpts = {}) {
  const promptId = store.all("prompt")[0]!.id;
  const roundId = idGen();
  const createdAt = isoNow(clock);
  clock.advance(1000);
  store.insert("round", {
    id: roundId,
    mode: "hide-from-machines",
    promptId,
    phase: opts.phase ?? "JUDGMENTS_LOCKED",
    humanContestantId: "human-player",
    machineContestantIds: MACHINE_IDS,
    timings: {},
    createdAt,
  });

  const blank = opts.blank ?? false;
  const words = blank ? 0 : (opts.humanWords ?? 10);
  const humanSpecimen = store.insert("specimen", {
    id: idGen(),
    text: blank ? "[no response]" : Array.from({ length: words }, (_, i) => `w${i}`).join(" "),
    creatorType: "human",
    creatorContestantId: "human-player",
    promptId,
    createdAt,
    wordCount: words,
    isBlank: blank,
    reuseAllowed: true,
  });
  const machineSpecimens = MACHINE_IDS.map((id) =>
    store.insert("specimen", {
      id: idGen(),
      text: `answer from ${id} in round ${roundId}`,
      creatorType: "model",
      creatorContestantId: id,
      promptId,
      createdAt,
      wordCount: 5,
      isBlank: false,
      reuseAllowed: true,
    }),
  );

  // Fixed table order: m0, m1, HUMAN, m2, m3, m4 → human label C.
  const ordered = [machineSpecimens[0]!, machineSpecimens[1]!, humanSpecimen, machineSpecimens[2]!, machineSpecimens[3]!, machineSpecimens[4]!];
  const appearanceByLabel = new Map<string, string>();
  ordered.forEach((specimen, position) => {
    const a = store.insert("appearance", {
      id: idGen(),
      roundId,
      specimenId: specimen.id,
      anonymousPosition: position,
      eligibleForDetection: true,
      eligibleForTaste: !specimen.isBlank,
      createdAt,
    });
    appearanceByLabel.set(String.fromCharCode(65 + position), a.id);
  });

  for (const [i, label] of (opts.detection ?? []).entries()) {
    store.insert("judgment", {
      id: idGen(),
      roundId,
      judgeContestantId: MACHINE_IDS[i]!,
      type: "human-detection",
      chosenAppearanceId: appearanceByLabel.get(label)!,
      createdAt,
    });
  }
  for (const [i, label] of (opts.machineTaste ?? []).entries()) {
    store.insert("judgment", {
      id: idGen(),
      roundId,
      judgeContestantId: MACHINE_IDS[i]!,
      type: "taste",
      chosenAppearanceId: appearanceByLabel.get(label)!,
      createdAt,
    });
  }
  if (opts.humanTaste) {
    store.insert("judgment", {
      id: idGen(),
      roundId,
      judgeContestantId: "human-player",
      type: "taste",
      chosenAppearanceId: appearanceByLabel.get(opts.humanTaste)!,
      createdAt,
    });
  }
  return roundId;
}

function scenario() {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("s");
  ensureSeeded(store, defaultTunables, clock);
  return { store, clock, idGen };
}

const HUMAN = "C";

describe("scoring (§18)", () => {
  it("matches the SPEC worked example: 2/5 found, 27 words → 60% deception, BOLD ×1.25, 75 points", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      humanWords: 27,
      detection: [HUMAN, HUMAN, "A", "B", "D"],
      machineTaste: ["A", HUMAN, "A", "B", HUMAN],
      humanTaste: "A",
    });
    const r = computeResults(store, roundId, defaultTunables);

    expect(r.machineJudgeCount).toBe(5);
    expect(r.machinesFound).toBe(2);
    expect(r.machinesFooled).toBe(3);
    expect(r.deceptionRate).toBeCloseTo(0.6);
    expect(r.riskTier?.name).toBe("BOLD");
    expect(r.deceptionPoints).toBe(75);
    expect(r.machineTasteVotesForHuman).toBe(2);
    expect(r.tasteRate).toBeCloseTo(0.4);
    expect(r.humanTasteLabel).toBe("A");
    expect(r.humanLabel).toBe(HUMAN);
  });

  it("a blank scores zero everything regardless of ballots and earns no distinctions (§18, §19)", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      blank: true,
      detection: ["A", "B", "D", "E", "F"], // nobody found the blank
      machineTaste: ["A", "A", "B", "B", "D"],
    });
    const r = computeResults(store, roundId, defaultTunables);

    expect(r.blank).toBe(true);
    expect(r.deceptionRate).toBe(0);
    expect(r.deceptionPoints).toBe(0);
    expect(r.riskTier).toBeNull();
    expect(r.tasteRate).toBe(0);
    expect(r.distinctions).toEqual([]);
  });

  it("derives results purely from stored judgments (M0.4 acceptance)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("A", "B", "C", "D", "E", "F"), { minLength: 3, maxLength: 5 }),
        fc.integer({ min: 1, max: 70 }),
        (votes, words) => {
          const { store, clock, idGen } = scenario();
          const roundId = addRound(store, clock, idGen, { humanWords: words, detection: votes });
          const r = computeResults(store, roundId, defaultTunables);
          const found = votes.filter((v) => v === HUMAN).length;
          expect(r.machinesFound).toBe(found);
          expect(r.machinesFound + r.machinesFooled).toBe(votes.length);
          expect(r.deceptionRate).toBeCloseTo((votes.length - found) / votes.length);
          expect(r.deceptionPoints).toBe(
            Math.round(100 * r.deceptionRate * (r.riskTier?.multiplier ?? 1)),
          );
          expect(r.deceptionRate).toBeGreaterThanOrEqual(0);
          expect(r.deceptionRate).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe("distinctions (§19)", () => {
  it("Clean Getaway: no machine identifies the human", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      detection: ["A", "B", "D", "E", "F"],
      machineTaste: ["A", "B", "A", "B", "A"],
    });
    const r = computeResults(store, roundId, defaultTunables);
    expect(r.distinctions).toContain("CLEAN_GETAWAY");
    expect(r.distinctions).not.toContain("HIDDEN_GEM");
  });

  it("Hidden Gem: clean getaway AND winning machine taste", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      humanWords: 30,
      detection: ["A", "B", "D", "E", "F"],
      machineTaste: [HUMAN, HUMAN, HUMAN, "A", "B"],
    });
    const r = computeResults(store, roundId, defaultTunables);
    expect(r.distinctions).toContain("CLEAN_GETAWAY");
    expect(r.distinctions).toContain("HIDDEN_GEM");
  });

  it("Safe Slop: high deception + low taste + SAFE tier", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      humanWords: 8,
      detection: ["A", "B", "D", "E", HUMAN], // 0.8 deception
      machineTaste: ["A", "A", "B", "B", "D"], // 0 taste
    });
    const r = computeResults(store, roundId, defaultTunables);
    expect(r.distinctions).toContain("SAFE_SLOP");
    expect(r.distinctions).not.toContain("DANGEROUS_GOODS");
  });

  it("Dangerous Goods: deception in DANGEROUS tier with meaningful taste support", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      humanWords: 50,
      detection: ["A", "B", "D", "E", HUMAN], // 0.8
      machineTaste: [HUMAN, HUMAN, "A", "B", "D"], // 0.4
    });
    const r = computeResults(store, roundId, defaultTunables);
    expect(r.distinctions).toContain("DANGEROUS_GOODS");
    expect(r.distinctions).not.toContain("SAFE_SLOP");
  });

  it("Ghost Streak after three consecutive high-deception rounds; a blank breaks it", () => {
    const { store, clock, idGen } = scenario();
    const ghost = { detection: ["A", "B", "D", "E", "F"], machineTaste: ["A", "B", "A", "B", "A"] };
    addRound(store, clock, idGen, { ...ghost, phase: "RESULTS" });
    addRound(store, clock, idGen, { ...ghost, phase: "RESULTS" });
    const third = addRound(store, clock, idGen, ghost);
    expect(computeResults(store, third, defaultTunables).distinctions).toContain("GHOST_STREAK");

    addRound(store, clock, idGen, { blank: true, detection: ["A", "B", "D", "E", "F"], phase: "RESULTS" });
    const afterBlank = addRound(store, clock, idGen, ghost);
    expect(computeResults(store, afterBlank, defaultTunables).distinctions).not.toContain("GHOST_STREAK");
  });

  it("Palate Streak after three consecutive strong-taste rounds", () => {
    const { store, clock, idGen } = scenario();
    const tasty = {
      detection: [HUMAN, HUMAN, HUMAN, HUMAN, HUMAN], // deception low: taste-only streak
      machineTaste: [HUMAN, HUMAN, "A", "B", "D"], // 0.4 = meaningful
    };
    addRound(store, clock, idGen, { ...tasty, phase: "RESULTS" });
    addRound(store, clock, idGen, { ...tasty, phase: "RESULTS" });
    const third = addRound(store, clock, idGen, tasty);
    const r = computeResults(store, third, defaultTunables);
    expect(r.distinctions).toContain("PALATE_STREAK");
    expect(r.distinctions).not.toContain("GHOST_STREAK");
  });
});

describe("reveal flow (M0.4)", () => {
  it("reveals only from JUDGMENTS_LOCKED, then completes with a summary snapshot", () => {
    const { store, clock, idGen } = scenario();
    const roundId = addRound(store, clock, idGen, {
      humanWords: 27,
      detection: [HUMAN, HUMAN, "A", "B", "D"],
      machineTaste: ["A", HUMAN, "A", "B", HUMAN],
      humanTaste: "A",
    });
    const deps: JudgingDeps = {
      store,
      clock,
      idGen,
      tunables: defaultTunables,
      events: makeEventLogger(store, roundId, clock, idGen),
      provider: new MockModelProvider([]),
    };

    const results = revealProvenance(deps, roundId);
    expect(store.get("round", roundId).phase).toBe("REVEAL");
    expect(results.deceptionPoints).toBe(75);
    expect(() => revealProvenance(deps, roundId)).toThrow(/Illegal phase transition/);

    completeRound(deps, roundId, defaultTunables);
    expect(store.get("round", roundId).phase).toBe("RESULTS");
    const completed = store.where("event", (e) => e.roundId === roundId && e.type === "round_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]!.data).toMatchObject({
      deceptionRate: 0.6,
      deceptionPoints: 75,
      tasteRate: 0.4,
      riskTier: "BOLD",
      machinesFound: 2,
    });
  });
});
