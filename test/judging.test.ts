import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, testClock, testIdGen } from "../src/domain/runtime.js";
import { advancePhase, createRound, ensureSeeded } from "../src/engine/setup.js";
import { revealPrompt, submitHuman, timeoutBlank } from "../src/engine/writing.js";
import { buildAppearances, generateMachineSpecimens, positionLabel, type MachineDeps } from "../src/engine/machines.js";
import {
  anonymousTable,
  castHumanTaste,
  JudgingBelowMinimumError,
  lockJudgments,
  runMachineJudging,
  startJudging,
  tasteCandidatesFor,
} from "../src/engine/judging.js";
import { MockModelProvider, type MockRule } from "../src/providers/mock.js";
import { GameStore } from "../src/store/store.js";

const PERSONAS: { name: string; contestantId: string }[] = [
  { name: "The Minimalist", contestantId: "machine-minimalist" },
  { name: "The Anecdotalist", contestantId: "machine-anecdotal" },
  { name: "The Messy Thinker", contestantId: "machine-messy-thinker" },
  { name: "The Comedian", contestantId: "machine-comedian" },
  { name: "The Earnest One", contestantId: "machine-earnest" },
];

/** Drives a round to a built table, returning label lookups for scripting judges. */
async function tableRound(opts?: { blank?: boolean }) {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("m");
  const { human, machines } = ensureSeeded(store, defaultTunables, clock);
  const prompt = store.all("prompt")[0]!;
  const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
  const genProvider = new MockModelProvider(
    PERSONAS.map((p) => ({
      match: (r) => r.system.includes(p.name) && r.system.includes("Reply with ONLY your answer"),
      replies: [`${p.name} wrote this distinctive answer`],
    })),
  );
  const genDeps: MachineDeps = { store, clock, idGen, tunables: defaultTunables, events, provider: genProvider };
  revealPrompt(genDeps, round.id);
  const humanSpecimen = opts?.blank
    ? timeoutBlank(genDeps, round.id)
    : submitHuman(genDeps, round.id, "SENTINEL my real human answer");
  const machineSpecimens = await generateMachineSpecimens(genDeps, store.get("round", round.id));
  advancePhase(store, round.id, "SUBMISSIONS_LOCKED", "WAITING_FOR_MACHINE_RESPONSES");
  buildAppearances(genDeps, store.get("round", round.id), humanSpecimen, machineSpecimens, seededRng(11));

  const labelOf = (specimenId: string) => {
    const appearance = store
      .where("appearance", (a) => a.roundId === round.id)
      .find((a) => a.specimenId === specimenId)!;
    return positionLabel(appearance.anonymousPosition);
  };
  const labelOfContestant = (contestantId: string) => {
    const specimen = store.where("specimen", (s) => s.creatorContestantId === contestantId)[0]!;
    return labelOf(specimen.id);
  };
  const humanLabel = labelOf(humanSpecimen.id);

  const makeJudgingDeps = (rules: MockRule[]) => {
    const provider = new MockModelProvider(rules);
    const deps: MachineDeps = { store, clock, idGen, tunables: defaultTunables, events, provider };
    return { deps, provider };
  };

  return { store, round, humanSpecimen, machineSpecimens, humanLabel, labelOf, labelOfContestant, makeJudgingDeps };
}

function detectionRule(name: string, replies: (string | Error)[]): MockRule {
  return { match: (r) => r.system.includes(name) && r.system.includes("written by the HUMAN"), replies };
}
function tasteRule(name: string, replies: (string | Error)[]): MockRule {
  return { match: (r) => r.system.includes(name) && r.system.includes("most want to have written"), replies };
}

/** Default judge script: everyone detects `detect`, taste-votes `tasteOf(contestantId)`. */
function judgeRules(detect: string, tasteOf: (contestantId: string) => string): MockRule[] {
  return PERSONAS.flatMap((p) => [
    detectionRule(p.name, [`{"choice": "${detect}"}`]),
    tasteRule(p.name, [`{"choice": "${tasteOf(p.contestantId)}"}`]),
  ]);
}

describe("independent judging (M0.3)", () => {
  it("each machine casts its own persisted detection and taste ballots", async () => {
    const t = await tableRound();
    const otherLabel = (id: string) =>
      id === "machine-minimalist"
        ? t.labelOfContestant("machine-comedian")
        : t.labelOfContestant("machine-minimalist");
    const { deps, provider } = t.makeJudgingDeps(judgeRules(t.humanLabel, otherLabel));
    startJudging(deps, t.round.id);
    const result = await runMachineJudging(deps, t.round.id);
    castHumanTaste(deps, t.round.id, t.labelOfContestant("machine-earnest"));

    expect(provider.calls).toHaveLength(10);
    expect(result.detectionJudgments).toHaveLength(5);
    expect(result.tasteJudgments).toHaveLength(5);
    const stored = t.store.where("judgment", (j) => j.roundId === t.round.id);
    expect(stored).toHaveLength(11);
    expect(new Set(stored.map((j) => j.judgeContestantId)).size).toBe(6);
    for (const j of result.detectionJudgments) {
      expect(j.judgeMetadata).toMatchObject({ strategyId: "find-human", strategyVersion: 1 });
    }
  });

  it("no judging payload contains hidden provenance (M0.3 acceptance)", async () => {
    const t = await tableRound();
    const { deps, provider } = t.makeJudgingDeps(
      judgeRules(t.humanLabel, () => t.labelOfContestant("machine-comedian")),
    );
    startJudging(deps, t.round.id);
    await runMachineJudging(deps, t.round.id);

    const forbidden = [
      "human-player",
      "machine-", // contestant ids
      ...t.machineSpecimens.map((s) => s.id),
      t.humanSpecimen.id,
      "creatorType",
      "personaId",
      "strategyId",
      "multiplier",
      "mock-model",
    ];
    for (const call of provider.calls) {
      const text = call.system + "\n" + call.user;
      for (const f of forbidden) expect(text).not.toContain(f);
    }
  });

  it("detection sees all six responses; taste excludes own response and is a separate call (§16)", async () => {
    const t = await tableRound();
    const { deps, provider } = t.makeJudgingDeps(
      judgeRules(t.humanLabel, () => t.labelOfContestant("machine-comedian")),
    );
    startJudging(deps, t.round.id);
    await runMachineJudging(deps, t.round.id);

    for (const p of PERSONAS) {
      const own = `${p.name} wrote this distinctive answer`;
      const detection = provider.calls.find(
        (c) => c.system.includes(p.name) && c.system.includes("written by the HUMAN"),
      )!;
      expect(detection.user).toContain(own);
      expect(detection.user).toContain("SENTINEL my real human answer");
      const taste = provider.calls.find(
        (c) => c.system.includes(p.name) && c.system.includes("most want to have written"),
      )!;
      expect(taste.user).not.toContain(own);
      expect(taste.user).toContain("SENTINEL my real human answer");
    }
  });

  it("blank specimens appear for detection but are never taste candidates (§16, §17)", async () => {
    const t = await tableRound({ blank: true });
    const { deps, provider } = t.makeJudgingDeps(
      judgeRules(t.humanLabel, (id) =>
        id === "machine-minimalist"
          ? t.labelOfContestant("machine-comedian")
          : t.labelOfContestant("machine-minimalist"),
      ),
    );
    startJudging(deps, t.round.id);
    await runMachineJudging(deps, t.round.id);

    for (const call of provider.calls) {
      if (call.system.includes("most want to have written")) {
        expect(call.user).not.toContain("[no response]");
      } else {
        expect(call.user).toContain("[no response]");
      }
    }
    const humanCandidates = tasteCandidatesFor(deps, t.round.id, "human-player");
    expect(humanCandidates).toHaveLength(5);
    expect(() => castHumanTaste(deps, t.round.id, t.humanLabel)).toThrow(/not an eligible/);
  });

  it("a self-taste attempt is invalid output and gets retried (§16)", async () => {
    const t = await tableRound();
    const ownLabel = t.labelOfContestant("machine-comedian");
    const okLabel = t.labelOfContestant("machine-earnest");
    const rules = PERSONAS.flatMap((p) => [
      detectionRule(p.name, [`{"choice": "${t.humanLabel}"}`]),
      tasteRule(
        p.name,
        p.contestantId === "machine-comedian"
          ? [`{"choice": "${ownLabel}"}`, `{"choice": "${okLabel}"}`]
          : [`{"choice": "${p.contestantId === "machine-earnest" ? t.labelOfContestant("machine-minimalist") : okLabel}"}`],
      ),
    ]);
    const { deps } = t.makeJudgingDeps(rules);
    startJudging(deps, t.round.id);
    const result = await runMachineJudging(deps, t.round.id);

    const comedianTaste = result.tasteJudgments.find((j) => j.judgeContestantId === "machine-comedian")!;
    const chosen = t.store.get("appearance", comedianTaste.chosenAppearanceId);
    const chosenSpecimen = t.store.get("specimen", chosen.specimenId);
    expect(chosenSpecimen.creatorContestantId).not.toBe("machine-comedian");
  });

  it("records permanently failed judges and still locks when the minimum is met (§27)", async () => {
    const t = await tableRound();
    const boom = new Error("judge offline");
    const rules = PERSONAS.flatMap((p) => [
      detectionRule(p.name, p.contestantId === "machine-messy-thinker" ? [boom, boom, boom, boom] : [`{"choice": "${t.humanLabel}"}`]),
      tasteRule(p.name, [`{"choice": "${t.labelOfContestant(p.contestantId === "machine-comedian" ? "machine-earnest" : "machine-comedian")}"}`]),
    ]);
    const { deps } = t.makeJudgingDeps(rules);
    startJudging(deps, t.round.id);
    const result = await runMachineJudging(deps, t.round.id);

    expect(result.detectionJudgments).toHaveLength(4);
    const failed = t.store.where("failedJudgment", (f) => f.roundId === t.round.id);
    expect(failed).toHaveLength(1);
    expect(failed[0]!).toMatchObject({ judgeContestantId: "machine-messy-thinker", type: "human-detection" });
    expect(lockJudgments(deps, t.round.id).phase).toBe("JUDGMENTS_LOCKED");
  });

  it("refuses to lock below the minimum judge count (§27)", async () => {
    const t = await tableRound();
    const boom = new Error("judge offline");
    const failing = new Set(["machine-messy-thinker", "machine-comedian", "machine-earnest"]);
    const rules = PERSONAS.flatMap((p) => [
      detectionRule(p.name, failing.has(p.contestantId) ? [boom, boom, boom, boom] : [`{"choice": "${t.humanLabel}"}`]),
      tasteRule(p.name, [`{"choice": "${t.labelOfContestant(p.contestantId === "machine-comedian" ? "machine-earnest" : "machine-comedian")}"}`]),
    ]);
    const { deps } = t.makeJudgingDeps(rules);
    startJudging(deps, t.round.id);
    const result = await runMachineJudging(deps, t.round.id);

    expect(result.detectionJudgments).toHaveLength(2);
    expect(() => lockJudgments(deps, t.round.id)).toThrow(JudgingBelowMinimumError);
    expect(t.store.get("round", t.round.id).phase).toBe("JUDGING");
  });

  it("locks judgments before any reveal can happen and blocks further voting", async () => {
    const t = await tableRound();
    const { deps } = t.makeJudgingDeps(
      judgeRules(t.humanLabel, (id) =>
        id === "machine-minimalist"
          ? t.labelOfContestant("machine-comedian")
          : t.labelOfContestant("machine-minimalist"),
      ),
    );
    startJudging(deps, t.round.id);
    await runMachineJudging(deps, t.round.id);
    castHumanTaste(deps, t.round.id, t.labelOfContestant("machine-earnest"));
    lockJudgments(deps, t.round.id);

    await expect(runMachineJudging(deps, t.round.id)).rejects.toThrow(/Cannot judge/);
    expect(() => castHumanTaste(deps, t.round.id, t.labelOfContestant("machine-earnest"))).toThrow(
      /Cannot vote/,
    );
    const table = anonymousTable(deps, t.round.id);
    expect(table).toHaveLength(6);
  });
});
