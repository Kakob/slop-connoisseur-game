/**
 * Independent judging (SPEC §15–§17, M0.3): one detection call and one taste
 * call per machine contestant, plus the human's taste vote. Blindness is
 * enforced by construction — payloads are assembled from appearances only —
 * and taste eligibility (no self-votes, no blanks) is applied server-side
 * before the candidate list is ever built.
 */

import type { Appearance, Contestant, Judgment, Round } from "../domain/types.js";
import { getPersona } from "../contestants/personas.js";
import {
  buildDetectionContext,
  buildTasteContext,
  DETECTION_STRATEGY,
  parseChoice,
  TASTE_STRATEGY,
  type AnonymousResponse,
} from "../contestants/strategies.js";
import { isoNow } from "../domain/runtime.js";
import { withRetries } from "../providers/provider.js";
import { positionLabel } from "./machines.js";
import { advancePhase } from "./setup.js";
import type { MachineDeps } from "./machines.js";

export type JudgingDeps = MachineDeps;

export class JudgingBelowMinimumError extends Error {}

/** Derives the round's anonymous table, sorted by position, as judges see it. */
export function anonymousTable(deps: JudgingDeps, roundId: string): {
  appearance: Appearance;
  label: string;
  text: string;
}[] {
  const appearances = deps.store
    .where("appearance", (a) => a.roundId === roundId)
    .sort((a, b) => a.anonymousPosition - b.anonymousPosition);
  if (appearances.length === 0) throw new Error(`Round ${roundId} has no table yet`);
  return appearances.map((appearance) => ({
    appearance,
    label: positionLabel(appearance.anonymousPosition),
    text: deps.store.get("specimen", appearance.specimenId).text,
  }));
}

/** Derives the taste candidates for one judge: no own response, no blanks (§16, §17). */
export function tasteCandidatesFor(
  deps: JudgingDeps,
  roundId: string,
  judgeContestantId: string,
): { appearance: Appearance; label: string; text: string }[] {
  return anonymousTable(deps, roundId).filter((row) => {
    if (!row.appearance.eligibleForTaste) return false;
    const specimen = deps.store.get("specimen", row.appearance.specimenId);
    return specimen.creatorContestantId !== judgeContestantId;
  });
}

/** Advances WAITING_FOR_MACHINE_RESPONSES → JUDGING and logs judging_started. */
export function startJudging(deps: JudgingDeps, roundId: string): Round {
  const round = advancePhase(deps.store, roundId, "WAITING_FOR_MACHINE_RESPONSES", "JUDGING");
  deps.events("judging_started", {});
  return round;
}

function persistJudgment(
  deps: JudgingDeps,
  round: Round,
  judge: Contestant,
  type: Judgment["type"],
  chosenAppearanceId: string,
  judgeMetadata?: Judgment["judgeMetadata"],
): Judgment {
  const judgment = deps.store.insert("judgment", {
    id: deps.idGen(),
    roundId: round.id,
    judgeContestantId: judge.id,
    type,
    chosenAppearanceId,
    createdAt: isoNow(deps.clock),
    ...(judgeMetadata !== undefined ? { judgeMetadata } : {}),
  });
  deps.events("judgment_cast", {
    judgmentId: judgment.id,
    judgeContestantId: judge.id,
    type,
    chosenAppearanceId,
  });
  return judgment;
}

function recordJudgeFailure(
  deps: JudgingDeps,
  round: Round,
  judge: Contestant,
  type: Judgment["type"],
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  deps.store.insert("failedJudgment", {
    id: deps.idGen(),
    roundId: round.id,
    judgeContestantId: judge.id,
    type,
    error: message,
    createdAt: isoNow(deps.clock),
  });
  deps.events("judgment_failed", { judgeContestantId: judge.id, type, error: message });
}

async function judgeOnce(
  deps: JudgingDeps,
  round: Round,
  judge: Contestant,
  type: "human-detection" | "taste",
): Promise<Judgment | null> {
  const persona = getPersona(judge.personaId!);
  const prompt = deps.store.get("prompt", round.promptId);
  const rows =
    type === "human-detection"
      ? anonymousTable(deps, round.id)
      : tasteCandidatesFor(deps, round.id, judge.id);
  const responses: AnonymousResponse[] = rows.map((r) => ({ label: r.label, text: r.text }));
  const labels = rows.map((r) => r.label);
  const context =
    type === "human-detection"
      ? buildDetectionContext(prompt, responses, persona)
      : buildTasteContext(prompt, responses, persona);
  const strategy = type === "human-detection" ? DETECTION_STRATEGY : TASTE_STRATEGY;

  try {
    const { label, model } = await withRetries(
      async () => {
        const result = await deps.provider.complete({
          system: context.system,
          user: context.user,
          maxTokens: deps.tunables.provider.maxTokens,
        });
        return { label: parseChoice(result.text, labels), model: result.model };
      },
      deps.tunables.retries.judgment,
      (attempt, error) =>
        deps.events("judgment_failed", {
          judgeContestantId: judge.id,
          type,
          transient: true,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    const chosen = rows.find((r) => r.label === label)!;
    return persistJudgment(deps, round, judge, type, chosen.appearance.id, {
      model,
      personaId: persona.id,
      personaVersion: persona.version,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
    });
  } catch (error) {
    recordJudgeFailure(deps, round, judge, type, error);
    return null;
  }
}

export type MachineJudgingResult = {
  detectionJudgments: Judgment[];
  tasteJudgments: Judgment[];
};

/**
 * Runs every machine's detection and taste calls concurrently and
 * independently; permanent failures are recorded, never fabricated (§27).
 */
export async function runMachineJudging(deps: JudgingDeps, roundId: string): Promise<MachineJudgingResult> {
  const round = deps.store.get("round", roundId);
  if (round.phase !== "JUDGING") throw new Error(`Cannot judge in phase ${round.phase}`);
  const judges = round.machineContestantIds.map((id) => deps.store.get("contestant", id));

  const detection = await Promise.all(judges.map((j) => judgeOnce(deps, round, j, "human-detection")));
  const taste = await Promise.all(judges.map((j) => judgeOnce(deps, round, j, "taste")));

  return {
    detectionJudgments: detection.filter((j): j is Judgment => j !== null),
    tasteJudgments: taste.filter((j): j is Judgment => j !== null),
  };
}

/** Persists the human's taste vote for one of their eligible candidates. */
export function castHumanTaste(deps: JudgingDeps, roundId: string, label: string): Judgment {
  const round = deps.store.get("round", roundId);
  if (round.phase !== "JUDGING") throw new Error(`Cannot vote in phase ${round.phase}`);
  const human = deps.store.get("contestant", round.humanContestantId);
  const candidates = tasteCandidatesFor(deps, roundId, human.id);
  const chosen = candidates.find((c) => c.label === label.trim().toUpperCase());
  if (!chosen) {
    throw new Error(
      `Label ${label} is not an eligible taste candidate (eligible: ${candidates.map((c) => c.label).join(", ")})`,
    );
  }
  return persistJudgment(deps, round, human, "taste", chosen.appearance.id);
}

/**
 * Locks judgments (JUDGING → JUDGMENTS_LOCKED). Throws JudgingBelowMinimumError
 * when fewer detection ballots than tunables.scoring.minJudgeCount succeeded,
 * so the caller can restart judging instead of scoring an invalid round (§27).
 */
export function lockJudgments(deps: JudgingDeps, roundId: string): Round {
  const detectionCount = deps.store.where(
    "judgment",
    (j) => j.roundId === roundId && j.type === "human-detection",
  ).length;
  if (detectionCount < deps.tunables.scoring.minJudgeCount) {
    throw new JudgingBelowMinimumError(
      `Only ${detectionCount} detection ballots; minimum is ${deps.tunables.scoring.minJudgeCount}`,
    );
  }
  const round = advancePhase(deps.store, roundId, "JUDGING", "JUDGMENTS_LOCKED");
  deps.events("judgments_locked", { detectionBallots: detectionCount });
  return round;
}
