/**
 * Round results (SPEC §18, §19): every displayed number derives here, purely,
 * from stored raw judgments — never from destructive counters.
 */

import type { RiskTier, Tunables } from "../config/tunables.js";
import type { Judgment, Round } from "../domain/types.js";
import { positionLabel } from "../engine/machines.js";
import type { GameStore } from "../store/store.js";
import { riskTierFor } from "./risk.js";

export type TableRow = {
  label: string;
  text: string;
  isBlank: boolean;
  wordCount: number;
  specimenId: string;
  creatorContestantId: string;
  creatorDisplayName: string;
  creatorKind: "human" | "machine";
};

export type Ballot = {
  judgeContestantId: string;
  judgeDisplayName: string;
  chosenLabel: string;
};

export type Distinction =
  | "CLEAN_GETAWAY"
  | "HIDDEN_GEM"
  | "SAFE_SLOP"
  | "DANGEROUS_GOODS"
  | "GHOST_STREAK"
  | "PALATE_STREAK";

export type RoundResults = {
  roundId: string;
  promptText: string;
  blank: boolean;
  table: TableRow[];
  humanLabel: string;

  detectionBallots: Ballot[];
  machineJudgeCount: number;
  machinesFound: number;
  machinesFooled: number;
  deceptionRate: number;
  riskTier: RiskTier | null;
  deceptionPoints: number;

  machineTasteBallots: Ballot[];
  machineTasteVotesForHuman: number;
  tasteRate: number;
  humanTasteLabel: string | null;

  distinctions: Distinction[];
};

/** Derives the anonymized-plus-provenance table for a round with a built table. */
function tableFor(store: GameStore, round: Round): TableRow[] {
  return store
    .where("appearance", (a) => a.roundId === round.id)
    .sort((a, b) => a.anonymousPosition - b.anonymousPosition)
    .map((a) => {
      const specimen = store.get("specimen", a.specimenId);
      const creator = store.get("contestant", specimen.creatorContestantId);
      return {
        label: positionLabel(a.anonymousPosition),
        text: specimen.text,
        isBlank: specimen.isBlank,
        wordCount: specimen.wordCount,
        specimenId: specimen.id,
        creatorContestantId: creator.id,
        creatorDisplayName: creator.displayName,
        creatorKind: creator.kind,
      };
    });
}

function ballotFor(store: GameStore, round: Round, judgment: Judgment): Ballot {
  const appearance = store.get("appearance", judgment.chosenAppearanceId);
  return {
    judgeContestantId: judgment.judgeContestantId,
    judgeDisplayName: store.get("contestant", judgment.judgeContestantId).displayName,
    chosenLabel: positionLabel(appearance.anonymousPosition),
  };
}

/** Core per-round rates, reusable for streak lookback without full assembly. */
function coreRates(store: GameStore, round: Round): {
  blank: boolean;
  deceptionRate: number;
  tasteRate: number;
  machinesFound: number;
  machineJudgeCount: number;
} {
  const humanAppearance = store
    .where("appearance", (a) => a.roundId === round.id)
    .find((a) => store.get("specimen", a.specimenId).creatorContestantId === round.humanContestantId);
  if (!humanAppearance) throw new Error(`Round ${round.id} has no human appearance`);
  const blank = store.get("specimen", humanAppearance.specimenId).isBlank;

  const detection = store.where(
    "judgment",
    (j) => j.roundId === round.id && j.type === "human-detection",
  );
  const machinesFound = detection.filter((j) => j.chosenAppearanceId === humanAppearance.id).length;
  const machineJudgeCount = detection.length;
  const machinesFooled = machineJudgeCount - machinesFound;
  // A blank scores zero deception regardless of ballots (§18).
  const deceptionRate = blank || machineJudgeCount === 0 ? 0 : machinesFooled / machineJudgeCount;

  const machineTaste = store.where(
    "judgment",
    (j) =>
      j.roundId === round.id &&
      j.type === "taste" &&
      j.judgeContestantId !== round.humanContestantId,
  );
  const votesForHuman = machineTaste.filter((j) => j.chosenAppearanceId === humanAppearance.id).length;
  const tasteRate = blank || machineTaste.length === 0 ? 0 : votesForHuman / machineTaste.length;

  return { blank, deceptionRate, tasteRate, machinesFound, machineJudgeCount };
}

/** Derives streak distinctions by recomputing rates for prior completed rounds (§19). */
function streaks(store: GameStore, round: Round, tunables: Tunables): Distinction[] {
  const history = store
    .where("round", (r) => r.mode === round.mode && (r.phase === "RESULTS" || r.id === round.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const upToCurrent = history.slice(0, history.findIndex((r) => r.id === round.id) + 1);

  const lookback = upToCurrent.slice(-tunables.combos.streakLength);
  if (lookback.length < tunables.combos.streakLength) return [];

  const rates = lookback.map((r) => coreRates(store, r));
  const out: Distinction[] = [];
  if (rates.every((r) => !r.blank && r.deceptionRate >= tunables.combos.highDeceptionRate)) {
    out.push("GHOST_STREAK");
  }
  if (rates.every((r) => !r.blank && r.tasteRate >= tunables.combos.meaningfulTasteRate)) {
    out.push("PALATE_STREAK");
  }
  return out;
}

/** Derives a round's complete displayable results from stored raw records. */
export function computeResults(store: GameStore, roundId: string, tunables: Tunables): RoundResults {
  const round = store.get("round", roundId);
  const table = tableFor(store, round);
  const humanRow = table.find((r) => r.creatorKind === "human");
  if (!humanRow) throw new Error(`Round ${roundId} has no human appearance`);

  const { blank, deceptionRate, tasteRate, machinesFound, machineJudgeCount } = coreRates(store, round);
  const machinesFooled = machineJudgeCount - machinesFound;
  const riskTier = blank ? null : riskTierFor(humanRow.wordCount, tunables.riskTiers);
  const deceptionPoints = blank
    ? 0
    : Math.round(tunables.scoring.deceptionBase * deceptionRate * (riskTier?.multiplier ?? 1));

  const detectionBallots = store
    .where("judgment", (j) => j.roundId === roundId && j.type === "human-detection")
    .map((j) => ballotFor(store, round, j));
  const machineTasteBallots = store
    .where(
      "judgment",
      (j) => j.roundId === roundId && j.type === "taste" && j.judgeContestantId !== round.humanContestantId,
    )
    .map((j) => ballotFor(store, round, j));
  const humanTasteJudgment = store
    .where(
      "judgment",
      (j) => j.roundId === roundId && j.type === "taste" && j.judgeContestantId === round.humanContestantId,
    )
    .at(0);

  const machineTasteVotesForHuman = machineTasteBallots.filter(
    (b) => b.chosenLabel === humanRow.label,
  ).length;

  // Distinctions (§19). Blanks qualify for none of them.
  const distinctions: Distinction[] = [];
  if (!blank) {
    const tasteVotesByLabel = new Map<string, number>();
    for (const b of machineTasteBallots) {
      tasteVotesByLabel.set(b.chosenLabel, (tasteVotesByLabel.get(b.chosenLabel) ?? 0) + 1);
    }
    const maxOtherTaste = Math.max(
      0,
      ...[...tasteVotesByLabel.entries()].filter(([l]) => l !== humanRow.label).map(([, n]) => n),
    );
    const wonMachineTaste =
      machineTasteVotesForHuman > 0 && machineTasteVotesForHuman > maxOtherTaste;

    if (machineJudgeCount > 0 && machinesFound === 0) distinctions.push("CLEAN_GETAWAY");
    if (machineJudgeCount > 0 && machinesFound === 0 && wonMachineTaste) distinctions.push("HIDDEN_GEM");
    if (
      deceptionRate >= tunables.combos.highDeceptionRate &&
      tasteRate <= tunables.combos.lowTasteRate &&
      riskTier?.name === "SAFE"
    ) {
      distinctions.push("SAFE_SLOP");
    }
    if (
      riskTier?.name === "DANGEROUS" &&
      deceptionRate >= tunables.combos.highDeceptionRate &&
      tasteRate >= tunables.combos.meaningfulTasteRate
    ) {
      distinctions.push("DANGEROUS_GOODS");
    }
    distinctions.push(...streaks(store, round, tunables));
  }

  return {
    roundId,
    promptText: store.get("prompt", round.promptId).text,
    blank,
    table,
    humanLabel: humanRow.label,
    detectionBallots,
    machineJudgeCount,
    machinesFound,
    machinesFooled,
    deceptionRate,
    riskTier,
    deceptionPoints,
    machineTasteBallots,
    machineTasteVotesForHuman,
    tasteRate,
    humanTasteLabel: humanTasteJudgment ? ballotFor(store, round, humanTasteJudgment).chosenLabel : null,
    distinctions,
  };
}
