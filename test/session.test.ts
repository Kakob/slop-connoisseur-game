import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, systemClock, testIdGen } from "../src/domain/runtime.js";
import { DemoProvider } from "../src/providers/demo.js";
import { GameSession, type GameEnv } from "../src/web/session.js";
import { GameStore } from "../src/store/store.js";

function makeEnv(): GameEnv {
  return {
    store: GameStore.open(),
    clock: systemClock,
    idGen: testIdGen("web"),
    tunables: defaultTunables,
    provider: new DemoProvider(seededRng(5)),
    rng: seededRng(17),
  };
}

describe("GameSession end-to-end (M0.4)", () => {
  it("plays a full round: start → submit → taste → results", async () => {
    const env = makeEnv();
    const session = new GameSession(env);

    const started = session.startRound();
    expect(started.promptText.length).toBeGreaterThan(10);
    expect(started.seconds).toBe(45);
    expect(started.maxWords).toBe(70);

    session.typingStarted(started.roundId);
    const submitted = await session.submit(started.roundId, "honestly just vibes and spite");
    expect(submitted.blank).toBe(false);
    expect(submitted.candidates).toHaveLength(5);
    // Contestant-facing payload: labels + texts only (§33).
    for (const c of submitted.candidates) {
      expect(Object.keys(c).sort()).toEqual(["label", "text"]);
    }

    const results = await session.castTaste(started.roundId, submitted.candidates[0]!.label);
    expect(env.store.get("round", started.roundId).phase).toBe("RESULTS");
    expect(results.table).toHaveLength(6);
    expect(results.detectionBallots).toHaveLength(5);
    expect(results.machineTasteBallots).toHaveLength(5);
    expect(results.humanTasteLabel).toBe(submitted.candidates[0]!.label);
    expect(results.deceptionRate).toBeGreaterThanOrEqual(0);
    expect(results.deceptionRate).toBeLessThanOrEqual(1);

    const eventTypes = env.store
      .where("event", (e) => e.roundId === started.roundId)
      .map((e) => e.type);
    for (const expected of [
      "round_started",
      "prompt_shown",
      "typing_started",
      "human_submitted",
      "submissions_locked",
      "judging_started",
      "judgment_cast",
      "judgments_locked",
      "provenance_revealed",
      "round_completed",
    ]) {
      expect(eventTypes).toContain(expected);
    }
  });

  it("plays a blank round to completion with zero scores (§27)", async () => {
    const env = makeEnv();
    const session = new GameSession(env);
    const started = session.startRound();
    const submitted = await session.submit(started.roundId, null);

    expect(submitted.blank).toBe(true);
    expect(submitted.candidates).toHaveLength(5); // human still taste-votes on machines

    const results = await session.castTaste(started.roundId, submitted.candidates[0]!.label);
    expect(results.blank).toBe(true);
    expect(results.deceptionPoints).toBe(0);
    expect(results.riskTier).toBeNull();
    expect(results.distinctions).toEqual([]);
    const eventTypes = env.store
      .where("event", (e) => e.roundId === started.roundId)
      .map((e) => e.type);
    expect(eventTypes).toContain("human_timed_out_blank");
  });

  it("supports consecutive rounds against the same persistent contestants", async () => {
    const env = makeEnv();
    const session = new GameSession(env);
    for (let i = 0; i < 2; i++) {
      const started = session.startRound();
      const submitted = await session.submit(started.roundId, `round ${i} answer with feeling`);
      await session.castTaste(started.roundId, submitted.candidates[0]!.label);
    }
    expect(env.store.all("contestant")).toHaveLength(6);
    expect(env.store.all("round")).toHaveLength(2);
    expect(env.store.where("judgment", () => true)).toHaveLength(22);
  });

  it("rejects taste votes for unknown labels", async () => {
    const env = makeEnv();
    const session = new GameSession(env);
    const started = session.startRound();
    await session.submit(started.roundId, "a perfectly fine answer");
    await expect(session.castTaste(started.roundId, "Z")).rejects.toThrow(/not an eligible/);
  });
});
