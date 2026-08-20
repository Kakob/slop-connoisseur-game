/**
 * Studio curation tests (D51): authored prompts are real prompts, curation is
 * append-only promptStatus events, edits create descendant prompts, and all
 * of it flows through the existing round prompt selection.
 */

import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, testClock, testIdGen } from "../src/domain/runtime.js";
import { createRound, ensureSeeded } from "../src/engine/setup.js";
import { buildAppearances, generateMachineSpecimens, type MachineDeps } from "../src/engine/machines.js";
import { isPromptActive, selectPrompt } from "../src/engine/promptSelection.js";
import { revealPrompt, submitHuman } from "../src/engine/writing.js";
import {
  createPrompt,
  editPrompt,
  listStudioPrompts,
  listStudioRuns,
  runStudioGeneration,
  setPromptActive,
  type StudioDeps,
} from "../src/lab/studio.js";
import { contains, MockModelProvider, type MockRule } from "../src/providers/mock.js";
import { GameStore } from "../src/store/store.js";

const PERSONA_NAMES = [
  "The Minimalist",
  "The Anecdotalist",
  "The Messy Thinker",
  "The Comedian",
  "The Earnest One",
];

function personaRules(prefix: string, overrides?: Partial<Record<string, (string | Error)[]>>): MockRule[] {
  return PERSONA_NAMES.map((name) => ({
    match: contains(name),
    replies: overrides?.[name] ?? [`${prefix} ${name} answer`],
  }));
}

function studioDeps(rules: MockRule[]) {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("studio");
  const provider = new MockModelProvider(rules);
  const deps: StudioDeps = { store, provider, tunables: defaultTunables, clock, idGen };
  return { store, clock, idGen, provider, deps };
}

function studioEnv() {
  const store = GameStore.open();
  const clock = testClock();
  const idGen = testIdGen("studio");
  return { store, clock, idGen };
}

describe("createPrompt", () => {
  it("creates a real user-sourced active prompt", () => {
    const { store, clock, idGen } = studioEnv();
    const prompt = createPrompt(store, clock, idGen, "  What's the worst soup?  ");

    expect(prompt.source).toBe("user");
    expect(prompt.text).toBe("What's the worst soup?");
    expect(prompt.active).toBe(true);
    expect(store.get("prompt", prompt.id)).toEqual(prompt);
  });

  it("rejects blank text loudly", () => {
    const { store, clock, idGen } = studioEnv();
    expect(() => createPrompt(store, clock, idGen, "   ")).toThrow(/must not be empty/);
  });

  it("is selectable for rounds alongside the seed deck", () => {
    const { store, clock, idGen } = studioEnv();
    ensureSeeded(store, defaultTunables, clock);
    const prompt = createPrompt(store, clock, idGen, "Describe a suspicious sandwich.");

    // Deactivate every seed prompt so selection must reach the authored one.
    for (const p of store.all("prompt")) {
      if (p.id !== prompt.id) setPromptActive(store, clock, idGen, p.id, false);
    }
    const selected = selectPrompt(store, seededRng(7), defaultTunables);
    expect(selected.id).toBe(prompt.id);
  });
});

describe("setPromptActive", () => {
  it("latest curation record wins over the seed active flag", () => {
    const { store, clock, idGen } = studioEnv();
    const prompt = createPrompt(store, clock, idGen, "A prompt to toggle.");

    setPromptActive(store, clock, idGen, prompt.id, false);
    expect(isPromptActive(store, store.get("prompt", prompt.id))).toBe(false);

    setPromptActive(store, clock, idGen, prompt.id, true);
    expect(isPromptActive(store, store.get("prompt", prompt.id))).toBe(true);
  });

  it("deactivated prompts leave the selection pool; reactivated ones return", () => {
    const { store, clock, idGen } = studioEnv();
    const a = createPrompt(store, clock, idGen, "Prompt A");
    const b = createPrompt(store, clock, idGen, "Prompt B");

    setPromptActive(store, clock, idGen, a.id, false);
    for (let i = 0; i < 10; i++) {
      expect(selectPrompt(store, seededRng(i), defaultTunables).id).toBe(b.id);
    }

    setPromptActive(store, clock, idGen, b.id, false);
    expect(() => selectPrompt(store, seededRng(0), defaultTunables)).toThrow(/No active prompts/);

    setPromptActive(store, clock, idGen, a.id, true);
    expect(selectPrompt(store, seededRng(0), defaultTunables).id).toBe(a.id);
  });

  it("fails loudly on unknown prompt ids", () => {
    const { store, clock, idGen } = studioEnv();
    expect(() => setPromptActive(store, clock, idGen, "nope", true)).toThrow(/Missing prompt/);
  });
});

describe("editPrompt", () => {
  it("creates a descendant with lineage and deactivates the parent", () => {
    const { store, clock, idGen } = studioEnv();
    const parent = createPrompt(store, clock, idGen, "Original text");
    const { prompt: child, derivation } = editPrompt(store, clock, idGen, parent.id, "Better text");

    expect(child.text).toBe("Better text");
    expect(child.source).toBe("user");
    expect(child.parentPromptId).toBe(parent.id);
    expect(derivation.parentPromptId).toBe(parent.id);
    expect(derivation.childPromptId).toBe(child.id);
    expect(derivation.operation).toBe("edit");

    expect(isPromptActive(store, store.get("prompt", parent.id))).toBe(false);
    expect(isPromptActive(store, child)).toBe(true);
    // The parent record itself is untouched (immutability).
    expect(store.get("prompt", parent.id).text).toBe("Original text");
  });

  it("inherits tags and hypotheses from the parent", () => {
    const { store, clock, idGen } = studioEnv();
    store.insert("prompt", {
      id: "p-tagged",
      text: "Tagged prompt",
      source: "curated",
      tags: ["comedy"],
      hypotheses: ["rewards_specificity"],
      active: true,
      createdAt: "2026-08-20T00:00:00.000Z",
    });
    const { prompt: child } = editPrompt(store, clock, idGen, "p-tagged", "Tagged prompt, sharper");
    expect(child.tags).toEqual(["comedy"]);
    expect(child.hypotheses).toEqual(["rewards_specificity"]);
  });
});

describe("listStudioPrompts", () => {
  it("reports effective active state, source, and play counts", () => {
    const { store, clock, idGen } = studioEnv();
    ensureSeeded(store, defaultTunables, clock);
    const authored = createPrompt(store, clock, idGen, "Authored prompt");
    setPromptActive(store, clock, idGen, authored.id, false);

    const rows = listStudioPrompts(store);
    const authoredRow = rows.find((r) => r.id === authored.id)!;
    expect(authoredRow.source).toBe("user");
    expect(authoredRow.active).toBe(false);
    expect(authoredRow.playedRoundCount).toBe(0);

    const seedRow = rows.find((r) => r.id !== authored.id)!;
    expect(seedRow.source).toBe("curated");
    expect(seedRow.active).toBe(true);
  });
});

describe("runStudioGeneration (D52)", () => {
  it("persists five real specimens with full provenance and one run record", async () => {
    const { store, clock, idGen, deps } = studioDeps(personaRules("studio"));
    ensureSeeded(store, defaultTunables, clock);
    const prompt = createPrompt(store, clock, idGen, "A studio prompt");

    const { run, specimens } = await runStudioGeneration(deps, prompt.id);

    expect(specimens).toHaveLength(5);
    expect(new Set(specimens.map((s) => s.modelMetadata!.personaId)).size).toBe(5);
    for (const s of specimens) {
      expect(s.creatorType).toBe("model");
      expect(s.promptId).toBe(prompt.id);
      expect(s.modelMetadata!.provider).toBe("mock");
      expect(s.modelMetadata!.strategyId).toBe("base-impostor");
      expect(store.get("specimen", s.id)).toEqual(s);
    }
    expect(run.promptId).toBe(prompt.id);
    expect(run.specimenIds).toEqual(specimens.map((s) => s.id));
    expect(store.get("studioRun", run.id)).toEqual(run);
  });

  it("creates no rounds, no appearances, and no events", async () => {
    const { store, clock, idGen, deps } = studioDeps(personaRules("studio"));
    ensureSeeded(store, defaultTunables, clock);
    const prompt = createPrompt(store, clock, idGen, "A studio prompt");

    await runStudioGeneration(deps, prompt.id);

    expect(store.all("round")).toHaveLength(0);
    expect(store.all("appearance")).toHaveLength(0);
    expect(store.all("event")).toHaveLength(0);
  });

  it("throws naming the failed contestant and records no run on permanent failure", async () => {
    const boom = new Error("provider down");
    const { store, clock, idGen, deps } = studioDeps(
      personaRules("studio", { "The Comedian": [boom, boom, boom, boom] }),
    );
    ensureSeeded(store, defaultTunables, clock);
    const prompt = createPrompt(store, clock, idGen, "A doomed prompt");

    await expect(runStudioGeneration(deps, prompt.id)).rejects.toThrow(
      /machine-comedian.*provider down/,
    );
    expect(store.all("studioRun")).toHaveLength(0);
    expect(store.all("specimen")).toHaveLength(0);
  });

  it("never leaks hidden prompt metadata or ids into provider payloads", async () => {
    const { store, clock, idGen, deps, provider } = studioDeps(personaRules("studio"));
    ensureSeeded(store, defaultTunables, clock);
    store.insert("prompt", {
      id: "SECRET-PROMPT-ID",
      text: "A perfectly visible prompt",
      source: "user",
      tags: ["SECRET-TAG"],
      hypotheses: ["SECRET-HYPOTHESIS"],
      active: true,
      createdAt: "2026-08-20T00:00:00.000Z",
    });

    await runStudioGeneration(deps, "SECRET-PROMPT-ID");

    expect(provider.calls.length).toBe(5);
    for (const call of provider.calls) {
      const payload = call.system + call.user;
      expect(payload).not.toContain("SECRET-");
      expect(payload).toContain("A perfectly visible prompt");
    }
  });

  it("lists past runs newest-first with their specimens", async () => {
    const { store, clock, idGen, deps } = studioDeps(personaRules("studio"));
    ensureSeeded(store, defaultTunables, clock);
    const a = createPrompt(store, clock, idGen, "First prompt");
    const b = createPrompt(store, clock, idGen, "Second prompt");
    const first = await runStudioGeneration(deps, a.id);
    const second = await runStudioGeneration(deps, b.id);

    const runs = listStudioRuns(store);
    expect(runs.map((r) => r.run.id)).toEqual([second.run.id, first.run.id]);
    expect(runs[0]!.specimens).toHaveLength(5);
  });
});

describe("writer history isolation (D53)", () => {
  it("keeps studio output out of round writer context; round output flows in once appeared", async () => {
    const store = GameStore.open();
    const clock = testClock();
    const idGen = testIdGen("iso");
    const { human, machines } = ensureSeeded(store, defaultTunables, clock);
    const prompt = store.all("prompt")[0]!;

    // 1. A studio run happens first.
    const studioProvider = new MockModelProvider(personaRules("STUDIO-ONLY"));
    await runStudioGeneration(
      { store, provider: studioProvider, tunables: defaultTunables, clock, idGen },
      prompt.id,
    );

    // 2. A real round generates: its writer payloads must not contain studio text.
    const roundProvider = new MockModelProvider(personaRules("ROUND-ONE"));
    const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
    const deps: MachineDeps = {
      store, clock, idGen, tunables: defaultTunables, events, provider: roundProvider,
    };
    revealPrompt({ store, clock, idGen, tunables: defaultTunables, events }, round.id);
    const humanSpecimen = submitHuman(
      { store, clock, idGen, tunables: defaultTunables, events },
      round.id,
      "my answer",
    );
    const machineSpecimens = await generateMachineSpecimens(deps, store.get("round", round.id));
    for (const call of roundProvider.calls) {
      expect(call.system + call.user).not.toContain("STUDIO-ONLY");
    }

    // 3. After the round's table exists, its responses are history for later calls.
    buildAppearances(deps, store.get("round", round.id), humanSpecimen, machineSpecimens, seededRng(3));
    const laterProvider = new MockModelProvider(personaRules("LATER"));
    await runStudioGeneration(
      { store, provider: laterProvider, tunables: defaultTunables, clock, idGen },
      prompt.id,
    );
    const laterPayloads = laterProvider.calls.map((c) => c.system + c.user).join("\n");
    expect(laterPayloads).toContain("ROUND-ONE");
    expect(laterPayloads).not.toContain("STUDIO-ONLY");
  });
});
