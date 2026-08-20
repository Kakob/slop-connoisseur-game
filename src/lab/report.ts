/**
 * Slop Lab report assembly (SPEC §28, M0.5): everything a developer needs to
 * diagnose a round without querying the store by hand. Developer-only —
 * never reachable from contestant-facing payloads before reveal.
 */

import type { Tunables } from "../config/tunables.js";
import type {
  FailedJudgment,
  GameEvent,
  GamePrompt,
  Judgment,
  Round,
  SpecimenModelMetadata,
} from "../domain/types.js";
import { positionLabel } from "../engine/machines.js";
import { computeResults, type RoundResults } from "../scoring/scoring.js";
import type { GameStore } from "../store/store.js";

export type LabRoundSummary = {
  id: string;
  createdAt: string;
  phase: Round["phase"];
  promptId: string;
  promptText: string;
};

export type LabTableRow = {
  anonymousPosition: number;
  label: string;
  appearanceId: string;
  specimenId: string;
  text: string;
  wordCount: number;
  isBlank: boolean;
  eligibleForDetection: boolean;
  eligibleForTaste: boolean;
  creator: {
    contestantId: string;
    kind: "human" | "machine";
    displayName: string;
    personaId?: string;
    personaVersion?: number;
  };
  modelMetadata?: SpecimenModelMetadata;
};

export type LabJudgmentRow = Judgment & { chosenLabel: string };

export type LabRoundReport = {
  round: Round;
  prompt: GamePrompt;
  table: LabTableRow[];
  detectionJudgments: LabJudgmentRow[];
  tasteJudgments: LabJudgmentRow[];
  failedJudgments: FailedJudgment[];
  /** Retry/failure events extracted for quick scanning (§28 errors/retries). */
  retriesAndErrors: GameEvent[];
  events: GameEvent[];
  /** Computed scores; null until a table exists. */
  results: RoundResults | null;
};

/** Lists rounds newest-first for the lab index. */
export function listRounds(store: GameStore): LabRoundSummary[] {
  return store
    .all("round")
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      phase: r.phase,
      promptId: r.promptId,
      promptText: store.get("prompt", r.promptId).text,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Assembles the full diagnostic report for one round. */
export function roundReport(store: GameStore, roundId: string, tunables: Tunables): LabRoundReport {
  const round = store.get("round", roundId);
  const prompt = store.get("prompt", round.promptId);

  const appearances = store
    .where("appearance", (a) => a.roundId === roundId)
    .sort((a, b) => a.anonymousPosition - b.anonymousPosition);

  const table: LabTableRow[] = appearances.map((a) => {
    const specimen = store.get("specimen", a.specimenId);
    const creator = store.get("contestant", specimen.creatorContestantId);
    return {
      anonymousPosition: a.anonymousPosition,
      label: positionLabel(a.anonymousPosition),
      appearanceId: a.id,
      specimenId: specimen.id,
      text: specimen.text,
      wordCount: specimen.wordCount,
      isBlank: specimen.isBlank,
      eligibleForDetection: a.eligibleForDetection,
      eligibleForTaste: a.eligibleForTaste,
      creator: {
        contestantId: creator.id,
        kind: creator.kind,
        displayName: creator.displayName,
        ...(creator.personaId !== undefined ? { personaId: creator.personaId } : {}),
        ...(creator.personaVersion !== undefined ? { personaVersion: creator.personaVersion } : {}),
      },
      ...(specimen.modelMetadata !== undefined ? { modelMetadata: specimen.modelMetadata } : {}),
    };
  });

  const withLabel = (j: Judgment): LabJudgmentRow => ({
    ...j,
    chosenLabel: positionLabel(store.get("appearance", j.chosenAppearanceId).anonymousPosition),
  });

  const judgments = store.where("judgment", (j) => j.roundId === roundId);
  const events = store.where("event", (e) => e.roundId === roundId);

  let results: RoundResults | null = null;
  if (appearances.length > 0) {
    results = computeResults(store, roundId, tunables);
  }

  return {
    round,
    prompt,
    table,
    detectionJudgments: judgments.filter((j) => j.type !== "taste").map(withLabel),
    tasteJudgments: judgments.filter((j) => j.type === "taste").map(withLabel),
    failedJudgments: store.where("failedJudgment", (f) => f.roundId === roundId),
    retriesAndErrors: events.filter((e) =>
      ["machine_generation_retried", "machine_generation_failed", "judgment_failed"].includes(e.type),
    ),
    events,
    results,
  };
}
