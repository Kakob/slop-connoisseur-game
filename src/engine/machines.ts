/**
 * Machine table (SPEC §6, §27, M0.2): one independent generation call per
 * machine contestant, run concurrently, then anonymized shuffled appearances.
 */

import type { Tunables } from "../config/tunables.js";
import type { Clock, IdGen, Rng } from "../domain/runtime.js";
import { isoNow, shuffle } from "../domain/runtime.js";
import type { Appearance, Contestant, Round, Specimen } from "../domain/types.js";
import { getPersona } from "../contestants/personas.js";
import { buildWriterContext, WRITER_STRATEGY, type WriterHistory } from "../contestants/strategies.js";
import type { ModelProvider } from "../providers/provider.js";
import { withRetries } from "../providers/provider.js";
import type { GameStore } from "../store/store.js";
import { countWords } from "./text.js";
import type { EventLogger } from "./events.js";

export type MachineDeps = {
  store: GameStore;
  clock: Clock;
  idGen: IdGen;
  tunables: Tunables;
  events: EventLogger;
  provider: ModelProvider;
};

export class MachineGenerationError extends Error {
  constructor(readonly failures: { contestantId: string; error: string }[]) {
    super(
      `Machine generation permanently failed for: ${failures
        .map((f) => `${f.contestantId} (${f.error})`)
        .join("; ")}`,
    );
  }
}

/**
 * Derives a contestant's allowed writer history: its own past responses only
 * (§9, §16). The current round's specimen does not exist yet at generation
 * time, so everything stored for this contestant is prior-round material.
 */
function historyFor(store: GameStore, contestant: Contestant): WriterHistory {
  const previousResponses = store
    .where("specimen", (s) => s.creatorContestantId === contestant.id)
    .map((s) => ({ promptText: store.get("prompt", s.promptId).text, responseText: s.text }));
  return { previousResponses };
}

async function generateOne(deps: MachineDeps, round: Round, contestant: Contestant): Promise<string> {
  const { store, tunables, events, provider } = deps;
  const persona = getPersona(contestant.personaId!);
  const prompt = store.get("prompt", round.promptId);
  const context = buildWriterContext(
    prompt,
    persona,
    historyFor(store, contestant),
    tunables.maxResponseWords,
  );
  events("machine_generation_started", { contestantId: contestant.id });

  const result = await withRetries(
    async () => {
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
    },
    tunables.retries.generation,
    (attempt, error) =>
      events("machine_generation_retried", {
        contestantId: contestant.id,
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      }),
  );

  const specimen = deps.store.insert("specimen", {
    id: deps.idGen(),
    text: result.text.trim(),
    creatorType: "model",
    creatorContestantId: contestant.id,
    promptId: round.promptId,
    createdAt: isoNow(deps.clock),
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
  events("machine_generated", {
    contestantId: contestant.id,
    specimenId: specimen.id,
    wordCount: specimen.wordCount,
    latencyMs: result.latencyMs,
  });
  return specimen.id;
}

/**
 * Runs five independent, concurrent generation calls — one per machine
 * contestant — retrying failures, over-cap output, and exact duplicates;
 * permanent failures throw MachineGenerationError (round restartable, §27).
 */
export async function generateMachineSpecimens(deps: MachineDeps, round: Round): Promise<Specimen[]> {
  const { store, events } = deps;
  const machines = round.machineContestantIds.map((id) => store.get("contestant", id));

  const settled = await Promise.allSettled(machines.map((m) => generateOne(deps, round, m)));
  const failures: { contestantId: string; error: string }[] = [];
  const specimenIds: string[] = [];
  for (const [i, s] of settled.entries()) {
    if (s.status === "fulfilled") {
      specimenIds.push(s.value);
    } else {
      const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
      events("machine_generation_failed", { contestantId: machines[i]!.id, error: message });
      failures.push({ contestantId: machines[i]!.id, error: message });
    }
  }
  if (failures.length > 0) throw new MachineGenerationError(failures);

  // Exact-duplicate pass (§27): sequential so each retry sees the full set.
  const specimens = specimenIds.map((id) => store.get("specimen", id));
  const seen = new Set<string>();
  for (let i = 0; i < specimens.length; i++) {
    let current = specimens[i]!;
    let attempts = 0;
    while (seen.has(current.text.trim()) && attempts < deps.tunables.retries.generation) {
      attempts++;
      events("machine_generation_retried", {
        contestantId: current.creatorContestantId,
        attempt: attempts,
        reason: "exact duplicate of another current response",
      });
      const contestant = store.get("contestant", current.creatorContestantId);
      const freshId = await generateOne(deps, round, contestant);
      current = store.get("specimen", freshId);
      specimens[i] = current;
    }
    if (seen.has(current.text.trim())) {
      // Still duplicated after retries: keep it, but leave the retries on record.
      events("machine_generation_retried", {
        contestantId: current.creatorContestantId,
        attempt: attempts,
        reason: "duplicate retained after exhausting retries",
      });
    }
    seen.add(current.text.trim());
  }
  return specimens;
}

/** Derives the display label (A–F) for an anonymous table position. */
export function positionLabel(position: number): string {
  return String.fromCharCode(65 + position);
}

/**
 * Builds the anonymized table (M0.2): shuffles the six specimens with
 * server-side randomness and creates one Appearance per specimen. Blank
 * Specimens stay detection-eligible but are never Taste candidates (§14).
 */
export function buildAppearances(
  deps: MachineDeps,
  round: Round,
  humanSpecimen: Specimen,
  machineSpecimens: Specimen[],
  rng: Rng,
): Appearance[] {
  const { store, clock, idGen } = deps;
  if (machineSpecimens.length !== round.machineContestantIds.length) {
    throw new Error(
      `Expected ${round.machineContestantIds.length} machine specimens, got ${machineSpecimens.length}`,
    );
  }
  if (humanSpecimen.creatorType !== "human") {
    throw new Error("humanSpecimen must be human-origin");
  }
  const existing = store.where("appearance", (a) => a.roundId === round.id);
  if (existing.length > 0) throw new Error(`Round ${round.id} already has a table`);

  const shuffled = shuffle([humanSpecimen, ...machineSpecimens], rng);
  return shuffled.map((specimen, position) =>
    store.insert("appearance", {
      id: idGen(),
      roundId: round.id,
      specimenId: specimen.id,
      anonymousPosition: position,
      eligibleForDetection: true,
      eligibleForTaste: !specimen.isBlank,
      createdAt: isoNow(clock),
    }),
  );
}
