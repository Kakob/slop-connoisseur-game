/**
 * Studio: developer-facing prompt authoring and curation (D51). Authored
 * prompts are real store-backed prompts; curation is append-only promptStatus
 * events; text edits create descendant prompts with recorded derivations.
 * Round records are never created here — only playing rounds creates rounds.
 */

import type { Clock, IdGen } from "../domain/runtime.js";
import { isoNow } from "../domain/runtime.js";
import type { GamePrompt, PromptDerivation, PromptStatus } from "../domain/types.js";
import { isPromptActive } from "../engine/promptSelection.js";
import type { GameStore } from "../store/store.js";

export type StudioPromptRow = {
  id: string;
  text: string;
  source: GamePrompt["source"];
  active: boolean;
  playedRoundCount: number;
  parentPromptId?: string;
  createdAt: string;
};

/** Derives the curation view of every prompt: effective active flag plus play count. */
export function listStudioPrompts(store: GameStore): StudioPromptRow[] {
  const rounds = store.all("round");
  return store.all("prompt").map((p) => ({
    id: p.id,
    text: p.text,
    source: p.source,
    active: isPromptActive(store, p),
    playedRoundCount: rounds.filter((r) => r.promptId === p.id).length,
    ...(p.parentPromptId !== undefined && { parentPromptId: p.parentPromptId }),
    createdAt: p.createdAt,
  }));
}

/** Creates an authored prompt (source "user", active); blank text fails loudly. */
export function createPrompt(store: GameStore, clock: Clock, idGen: IdGen, text: string): GamePrompt {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Prompt text must not be empty");
  return store.insert("prompt", {
    id: idGen(),
    text: trimmed,
    source: "user",
    tags: [],
    hypotheses: [],
    active: true,
    createdAt: isoNow(clock),
  });
}

/**
 * Edits a prompt by descent (D51): inserts a child prompt with the new text,
 * records the derivation, and deactivates the parent. The parent is untouched.
 */
export function editPrompt(
  store: GameStore,
  clock: Clock,
  idGen: IdGen,
  parentPromptId: string,
  newText: string,
): { prompt: GamePrompt; derivation: PromptDerivation } {
  const parent = store.get("prompt", parentPromptId);
  const trimmed = newText.trim();
  if (trimmed.length === 0) throw new Error("Prompt text must not be empty");

  const prompt = store.insert("prompt", {
    id: idGen(),
    text: trimmed,
    source: "user",
    parentPromptId: parent.id,
    tags: [...parent.tags],
    hypotheses: [...parent.hypotheses],
    active: true,
    createdAt: isoNow(clock),
  });
  const derivation = store.insert("promptDerivation", {
    id: idGen(),
    parentPromptId: parent.id,
    childPromptId: prompt.id,
    operation: "edit",
    createdAt: isoNow(clock),
  });
  setPromptActive(store, clock, idGen, parent.id, false);
  return { prompt, derivation };
}

/** Appends a curation event toggling a prompt's effective active flag; unknown ids fail loudly. */
export function setPromptActive(
  store: GameStore,
  clock: Clock,
  idGen: IdGen,
  promptId: string,
  active: boolean,
): PromptStatus {
  store.get("prompt", promptId);
  return store.insert("promptStatus", {
    id: idGen(),
    promptId,
    active,
    createdAt: isoNow(clock),
  });
}
