import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, systemClock, testIdGen } from "../src/domain/runtime.js";
import { listRounds, roundReport } from "../src/lab/report.js";
import { DemoProvider } from "../src/providers/demo.js";
import { GameSession, type GameEnv } from "../src/web/session.js";
import { GameStore } from "../src/store/store.js";

async function playedRound() {
  const env: GameEnv = {
    store: GameStore.open(),
    clock: systemClock,
    idGen: testIdGen("lab"),
    tunables: defaultTunables,
    provider: new DemoProvider(seededRng(3)),
    rng: seededRng(23),
  };
  const session = new GameSession(env);
  const started = session.startRound();
  session.typingStarted(started.roundId);
  const submitted = await session.submit(started.roundId, "a suspiciously human answer");
  await session.castTaste(started.roundId, submitted.candidates[0]!.label);
  return { env, roundId: started.roundId };
}

describe("Slop Lab (M0.5)", () => {
  it("diagnoses a round without manual store queries (§28 acceptance)", async () => {
    const { env, roundId } = await playedRound();
    const report = roundReport(env.store, roundId, defaultTunables);

    // Round + prompt metadata.
    expect(report.round.id).toBe(roundId);
    expect(report.prompt.hypotheses.length).toBeGreaterThan(0);

    // Actual provenance + anonymous ordering.
    expect(report.table).toHaveLength(6);
    expect(report.table.map((r) => r.anonymousPosition)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(report.table.filter((r) => r.creator.kind === "human")).toHaveLength(1);

    // Model/persona/strategy metadata and latency for every machine row.
    for (const row of report.table.filter((r) => r.creator.kind === "machine")) {
      expect(row.modelMetadata).toMatchObject({
        provider: "demo",
        strategyId: "base-impostor",
        strategyVersion: 1,
      });
      expect(row.modelMetadata!.personaId).toBe(row.creator.personaId);
      expect(row.modelMetadata!.latencyMs).toBeDefined();
      expect(row.specimenId.length).toBeGreaterThan(0);
      expect(row.wordCount).toBeGreaterThan(0);
    }

    // Individual raw judgments with chosen labels.
    expect(report.detectionJudgments).toHaveLength(5);
    expect(report.tasteJudgments).toHaveLength(6); // 5 machines + human
    for (const j of report.detectionJudgments) {
      expect(j.chosenLabel).toMatch(/^[A-F]$/);
      expect(j.judgeMetadata).toMatchObject({ strategyId: "find-human" });
    }

    // Calculated scores derive from those judgments.
    expect(report.results).not.toBeNull();
    const found = report.detectionJudgments.filter(
      (j) => report.table.find((r) => r.label === j.chosenLabel)!.creator.kind === "human",
    ).length;
    expect(report.results!.machinesFound).toBe(found);

    // Full event log, blank status, error extraction.
    expect(report.events.map((e) => e.type)).toContain("round_completed");
    expect(report.failedJudgments).toEqual([]);
    expect(report.retriesAndErrors).toEqual([]);
    expect(report.table.every((r) => r.isBlank === false)).toBe(true);
  });

  it("lists rounds newest-first with prompt text", async () => {
    const { env, roundId } = await playedRound();
    const rounds = listRounds(env.store);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!).toMatchObject({ id: roundId, phase: "RESULTS" });
    expect(rounds[0]!.promptText.length).toBeGreaterThan(10);
  });

  it("reports a pre-table round without results", async () => {
    const env: GameEnv = {
      store: GameStore.open(),
      clock: systemClock,
      idGen: testIdGen("lab2"),
      tunables: defaultTunables,
      provider: new DemoProvider(seededRng(3)),
      rng: seededRng(23),
    };
    const session = new GameSession(env);
    const started = session.startRound();
    const report = roundReport(env.store, started.roundId, defaultTunables);
    expect(report.results).toBeNull();
    expect(report.table).toEqual([]);
    expect(report.events.map((e) => e.type)).toContain("prompt_shown");
  });
});
