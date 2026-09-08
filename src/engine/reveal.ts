/** Provenance reveal and round completion (SPEC §5, M0.4). */

import type { Tunables } from "../config/tunables.js";
import type { Round } from "../domain/types.js";
import { computeResults, type RoundResults } from "../scoring/scoring.js";
import { advancePhase } from "./setup.js";
import type { JudgingDeps } from "./judging.js";

/** Reveals provenance (JUDGMENTS_LOCKED → REVEAL) and derives displayable results. */
export function revealProvenance(deps: JudgingDeps, roundId: string): RoundResults {
  advancePhase(deps.store, roundId, "JUDGMENTS_LOCKED", "REVEAL");
  const results = computeResults(deps.store, roundId, deps.tunables);
  deps.events("provenance_revealed", { humanLabel: results.humanLabel });
  return results;
}

/** Completes the round (REVEAL → RESULTS), snapshotting the summary alongside raw records. */
export function completeRound(deps: JudgingDeps, roundId: string, tunables: Tunables): Round {
  const results = computeResults(deps.store, roundId, tunables);
  const current = deps.store.get("round", roundId);
  if (current.phase !== "REVEAL") throw new Error(`Cannot complete in phase ${current.phase}`);
  const round = deps.store.update("round", { ...current, phase: "RESULTS", results });
  deps.events("round_completed", {
    deceptionRate: results.deceptionRate,
    deceptionPoints: results.deceptionPoints,
    tasteRate: results.tasteRate,
    riskTier: results.riskTier?.name ?? null,
    machinesFound: results.machinesFound,
    machineJudgeCount: results.machineJudgeCount,
    distinctions: results.distinctions,
    blank: results.blank,
  });
  return round;
}
