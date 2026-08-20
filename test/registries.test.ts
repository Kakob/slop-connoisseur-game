import { describe, expect, it } from "vitest";
import { seedPrompts } from "../src/content/prompts.js";
import { getPersona, seedPersonas } from "../src/contestants/personas.js";
import { getStrategy, DETECTION_STRATEGY, TASTE_STRATEGY, WRITER_STRATEGY } from "../src/contestants/strategies.js";
import { defaultTunables } from "../src/config/tunables.js";

describe("seed prompts", () => {
  it("seeds ~30 unique, active, curated prompts", () => {
    const prompts = seedPrompts();
    expect(prompts.length).toBeGreaterThanOrEqual(28);
    expect(prompts.length).toBeLessThanOrEqual(35);
    expect(new Set(prompts.map((p) => p.id)).size).toBe(prompts.length);
    expect(new Set(prompts.map((p) => p.text)).size).toBe(prompts.length);
    for (const p of prompts) {
      expect(p.active).toBe(true);
      expect(p.source).toBe("curated");
      expect(p.hypotheses.length).toBeGreaterThan(0);
      expect(p.tags.length).toBeGreaterThan(0);
    }
  });
});

describe("personas", () => {
  it("seeds five meaningfully distinct personas at version 1", () => {
    const personas = seedPersonas();
    expect(personas.size).toBe(5);
    for (const p of personas.values()) {
      expect(p.version).toBe(1);
      expect(p.voice.length).toBeGreaterThan(50);
      expect(p.tastePreferences.length).toBeGreaterThan(0);
    }
    const verbosities = [...personas.values()].map((p) => p.tendencies.verbosity);
    expect(new Set(verbosities).size).toBeGreaterThan(2);
  });

  it("fails loudly on unknown persona id", () => {
    expect(() => getPersona("nonexistent")).toThrow(/Unknown persona id/);
  });
});

describe("strategies", () => {
  it("registers writer/detection/taste strategies at version 1", () => {
    expect(WRITER_STRATEGY).toMatchObject({ id: "base-impostor", version: 1, role: "writer" });
    expect(DETECTION_STRATEGY).toMatchObject({ id: "find-human", version: 1, role: "detection" });
    expect(TASTE_STRATEGY).toMatchObject({ id: "want-to-have-written", version: 1, role: "taste" });
  });

  it("fails loudly on unknown strategy id", () => {
    expect(() => getStrategy("nonexistent")).toThrow(/Unknown strategy id/);
  });
});

describe("tunables", () => {
  it("matches SPEC §4 defaults", () => {
    expect(defaultTunables.humanWritingSeconds).toBe(45);
    expect(defaultTunables.maxResponseWords).toBe(70);
    expect(defaultTunables.machineContestantCount).toBe(5);
    expect(defaultTunables.riskTiers).toEqual([
      { name: "SAFE", min: 1, max: 15, multiplier: 1.0 },
      { name: "BOLD", min: 16, max: 35, multiplier: 1.25 },
      { name: "DANGEROUS", min: 36, max: 70, multiplier: 1.6 },
    ]);
  });
});
