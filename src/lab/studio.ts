/**
 * Studio: developer-facing prompt authoring and curation (D51). Authored
 * prompts are real store-backed prompts; curation is append-only promptStatus
 * events; text edits create descendant prompts with recorded derivations.
 * Round records are never created here — only playing rounds creates rounds.
 */

import type { Tunables } from "../config/tunables.js";
import { getPersona } from "../contestants/personas.js";
import { buildWriterContext, WRITER_STRATEGY } from "../contestants/strategies.js";
import type { Clock, IdGen } from "../domain/runtime.js";
import { isoNow } from "../domain/runtime.js";
import type { GamePrompt, PromptDerivation, PromptStatus, Specimen, StudioRun } from "../domain/types.js";
import { ensureSeeded } from "../engine/setup.js";
import { isPromptActive } from "../engine/promptSelection.js";
import { writerHistoryFor } from "../engine/machines.js";
import { countWords } from "../engine/text.js";
import type { ModelProvider } from "../providers/provider.js";
import { withRetries } from "../providers/provider.js";
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

export type StudioDeps = {
  store: GameStore;
  provider: ModelProvider;
  tunables: Tunables;
  clock: Clock;
  idGen: IdGen;
};

export type StudioRunReport = {
  run: StudioRun;
  specimens: Specimen[];
};

/**
 * Runs the five seeded machine personas against one prompt, persisting real
 * specimens with full modelMetadata and zero appearances (D52). Payloads come
 * only from buildWriterContext; no round or event records are created; the
 * run record is written only when every persona succeeds.
 */
export async function runStudioGeneration(deps: StudioDeps, promptId: string): Promise<StudioRunReport> {
  const { store, provider, tunables, clock, idGen } = deps;
  const prompt = store.get("prompt", promptId);
  const { machines } = ensureSeeded(store, tunables, clock);

  const settled = await Promise.allSettled(
    machines.map(async (contestant) => {
      const persona = getPersona(contestant.personaId!);
      const context = buildWriterContext(
        prompt,
        persona,
        writerHistoryFor(store, contestant),
        tunables.maxResponseWords,
      );
      const result = await withRetries(async () => {
        const r = await provider.complete({
          system: context.system,
          user: context.user,
          maxTokens: tunables.provider.maxTokens,
        });
        const words = countWords(r.text);
        if (words > tunables.maxResponseWords) {
          throw new Error(`over word cap (${words} > ${tunables.maxResponseWords})`);
        }
        return r;
      }, tunables.retries.generation);
      return { contestant, persona, result };
    }),
  );

  const failures = settled.flatMap((s, i) =>
    s.status === "rejected"
      ? [`${machines[i]!.id} (${s.reason instanceof Error ? s.reason.message : String(s.reason)})`]
      : [],
  );
  if (failures.length > 0) {
    throw new Error(`Studio generation failed for: ${failures.join("; ")}`);
  }

  const generated = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const specimens = generated.map(({ contestant, persona, result }) => {
    return store.insert("specimen", {
      id: idGen(),
      text: result.text.trim(),
      creatorType: "model",
      creatorContestantId: contestant.id,
      promptId: prompt.id,
      createdAt: isoNow(clock),
      wordCount: countWords(result.text),
      isBlank: false,
      reuseAllowed: true,
      modelMetadata: {
        provider: result.provider,
        model: result.model,
        ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
        strategyId: WRITER_STRATEGY.id,
        strategyVersion: WRITER_STRATEGY.version,
        personaId: persona.id,
        personaVersion: persona.version,
        latencyMs: result.latencyMs,
      },
    });
  });

  const run = store.insert("studioRun", {
    id: idGen(),
    promptId: prompt.id,
    specimenIds: specimens.map((s) => s.id),
    provider: specimens[0]!.modelMetadata!.provider,
    model: specimens[0]!.modelMetadata!.model,
    createdAt: isoNow(clock),
  });
  return { run, specimens };
}

/** Derives past studio runs with their specimens, newest first. */
export function listStudioRuns(store: GameStore): StudioRunReport[] {
  return store
    .all("studioRun")
    .map((run) => ({ run, specimens: run.specimenIds.map((id) => store.get("specimen", id)) }))
    .reverse();
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
