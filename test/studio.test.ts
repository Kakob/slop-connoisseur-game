/**
 * Studio curation tests (D51): authored prompts are real prompts, curation is
 * append-only promptStatus events, edits create descendant prompts, and all
 * of it flows through the existing round prompt selection.
 */

import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { seededRng, testClock, testIdGen } from "../src/domain/runtime.js";
import { ensureSeeded } from "../src/engine/setup.js";
import { isPromptActive, selectPrompt } from "../src/engine/promptSelection.js";
import { createPrompt, editPrompt, listStudioPrompts, setPromptActive } from "../src/lab/studio.js";
import { GameStore } from "../src/store/store.js";

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
