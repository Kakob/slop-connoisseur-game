import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, testClock, testIdGen } from "../src/domain/runtime.js";
import { createRound, ensureSeeded } from "../src/engine/setup.js";
import { revealPrompt, submitHuman, timeoutBlank } from "../src/engine/writing.js";
import {
  buildAppearances,
  generateMachineSpecimens,
  MachineGenerationError,
  positionLabel,
  type MachineDeps,
} from "../src/engine/machines.js";
import { MockModelProvider, contains, type MockRule } from "../src/providers/mock.js";
import { GameStore } from "../src/store/store.js";

const PERSONA_NAMES = [
  "The Minimalist",
  "The Anecdotalist",
  "The Messy Thinker",
  "The Comedian",
  "The Earnest One",
];

function personaRules(replies?: Partial<Record<string, (string | Error)[]>>): MockRule[] {
  return PERSONA_NAMES.map((name) => ({
    match: contains(name),
    replies: replies?.[name] ?? [`${name} says something distinctive`],
  }));
}

function setup(rules: MockRule[]) {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("m");
  const { human, machines } = ensureSeeded(store, defaultTunables, clock);
  const prompt = store.all("prompt")[0]!;
  const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
  const provider = new MockModelProvider(rules);
  const deps: MachineDeps = { store, clock, idGen, tunables: defaultTunables, events, provider };
  const writingDeps = { store, clock, idGen, tunables: defaultTunables, events };
  return { store, deps, writingDeps, round, provider };
}

describe("machine generation (M0.2)", () => {
  it("makes one independent call per contestant with its own persona", async () => {
    const { deps, writingDeps, round, provider, store } = setup(personaRules());
    revealPrompt(writingDeps, round.id);
    const specimens = await generateMachineSpecimens(deps, store.get("round", round.id));

    expect(specimens).toHaveLength(5);
    expect(provider.calls).toHaveLength(5);
    for (const name of PERSONA_NAMES) {
      expect(provider.calls.filter((c) => c.system.includes(name))).toHaveLength(1);
    }
    for (const s of specimens) {
      expect(s.creatorType).toBe("model");
      expect(s.modelMetadata).toMatchObject({
        provider: "mock",
        strategyId: "base-impostor",
        strategyVersion: 1,
      });
      expect(s.modelMetadata!.latencyMs).toBeDefined();
    }
    const personaIds = new Set(specimens.map((s) => s.modelMetadata!.personaId));
    expect(personaIds.size).toBe(5);
  });

  it("never leaks the human response into any writer payload (§16)", async () => {
    const SENTINEL = "SENTINEL-HUMAN-RESPONSE-TEXT";
    const { deps, writingDeps, round, provider, store } = setup(personaRules());
    revealPrompt(writingDeps, round.id);
    submitHuman(writingDeps, round.id, SENTINEL);
    await generateMachineSpecimens(deps, store.get("round", round.id));

    for (const call of provider.calls) {
      expect(call.system + call.user).not.toContain(SENTINEL);
    }
  });

  it("retries transient failures and over-cap output, then succeeds", async () => {
    const longText = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ");
    const { deps, writingDeps, round, store } = setup(
      personaRules({
        "The Comedian": [longText, "short and funny"],
        "The Minimalist": [new Error("rate limited"), "no."],
      }),
    );
    revealPrompt(writingDeps, round.id);
    const specimens = await generateMachineSpecimens(deps, store.get("round", round.id));

    expect(specimens.map((s) => s.text)).toContain("short and funny");
    expect(specimens.map((s) => s.text)).toContain("no.");
    const retries = store.where("event", (e) => e.type === "machine_generation_retried");
    expect(retries.length).toBeGreaterThanOrEqual(2);
  });

  it("records permanent failure and throws instead of fabricating provenance (§27)", async () => {
    const boom = new Error("provider down");
    const { deps, writingDeps, round, store } = setup(
      personaRules({ "The Earnest One": [boom, boom, boom, boom] }),
    );
    revealPrompt(writingDeps, round.id);
    await expect(generateMachineSpecimens(deps, store.get("round", round.id))).rejects.toThrow(
      MachineGenerationError,
    );
    const failed = store.where("event", (e) => e.type === "machine_generation_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.data.contestantId).toBe("machine-earnest");
  });

  it("retries exact duplicates of another current response (§27)", async () => {
    const { deps, writingDeps, round, store } = setup(
      personaRules({
        "The Minimalist": ["same answer"],
        "The Comedian": ["same answer", "different answer"],
      }),
    );
    revealPrompt(writingDeps, round.id);
    const specimens = await generateMachineSpecimens(deps, store.get("round", round.id));

    const texts = specimens.map((s) => s.text);
    expect(new Set(texts).size).toBe(5);
    expect(texts).toContain("different answer");
    const dupRetries = store.where(
      "event",
      (e) => e.type === "machine_generation_retried" && String(e.data.reason).includes("duplicate"),
    );
    expect(dupRetries.length).toBeGreaterThanOrEqual(1);
  });
});

describe("appearances (M0.2)", () => {
  it("builds a shuffled table: one human appearance, five machine, positions 0–5", async () => {
    const { deps, writingDeps, round, store } = setup(personaRules());
    revealPrompt(writingDeps, round.id);
    const human = submitHuman(writingDeps, round.id, "my real answer");
    const machines = await generateMachineSpecimens(deps, store.get("round", round.id));
    const appearances = buildAppearances(deps, store.get("round", round.id), human, machines, seededRng(9));

    expect(appearances).toHaveLength(6);
    expect(new Set(appearances.map((a) => a.anonymousPosition))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    const humanAppearances = appearances.filter(
      (a) => store.get("specimen", a.specimenId).creatorType === "human",
    );
    expect(humanAppearances).toHaveLength(1);
    expect(appearances.every((a) => a.eligibleForDetection)).toBe(true);
    expect(appearances.every((a) => a.eligibleForTaste)).toBe(true);
  });

  it("keeps a Blank Specimen at the table but marks it taste-ineligible (§14)", async () => {
    const { deps, writingDeps, round, store } = setup(personaRules());
    revealPrompt(writingDeps, round.id);
    const blank = timeoutBlank(writingDeps, round.id);
    const machines = await generateMachineSpecimens(deps, store.get("round", round.id));
    const appearances = buildAppearances(deps, store.get("round", round.id), blank, machines, seededRng(9));

    const blankAppearance = appearances.find((a) => a.specimenId === blank.id)!;
    expect(blankAppearance.eligibleForDetection).toBe(true);
    expect(blankAppearance.eligibleForTaste).toBe(false);
    expect(appearances.filter((a) => a.eligibleForTaste)).toHaveLength(5);
  });

  it("shuffle order comes from the injected rng and provenance is not positional", async () => {
    const build = async (seed: number) => {
      const { deps, writingDeps, round, store } = setup(personaRules());
      revealPrompt(writingDeps, round.id);
      const human = submitHuman(writingDeps, round.id, "my real answer");
      const machines = await generateMachineSpecimens(deps, store.get("round", round.id));
      const apps = buildAppearances(deps, store.get("round", round.id), human, machines, seededRng(seed));
      const humanApp = apps.find((a) => store.get("specimen", a.specimenId).creatorType === "human")!;
      return humanApp.anonymousPosition;
    };
    const positions = new Set(await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(build)));
    expect(positions.size).toBeGreaterThan(1); // human is not pinned to a predictable slot
  });

  it("refuses to build a second table for the same round", async () => {
    const { deps, writingDeps, round, store } = setup(personaRules());
    revealPrompt(writingDeps, round.id);
    const human = submitHuman(writingDeps, round.id, "answer");
    const machines = await generateMachineSpecimens(deps, store.get("round", round.id));
    buildAppearances(deps, store.get("round", round.id), human, machines, seededRng(1));
    expect(() =>
      buildAppearances(deps, store.get("round", round.id), human, machines, seededRng(2)),
    ).toThrow(/already has a table/);
  });
});

describe("position labels", () => {
  it("maps 0–5 to A–F", () => {
    expect([0, 1, 2, 3, 4, 5].map(positionLabel)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});
