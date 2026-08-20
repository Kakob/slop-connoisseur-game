/**
 * GameSession (SPEC §5, M0.4): drives Hide From Machines rounds for the web
 * surface. HTTP-agnostic and fully testable. Everything returned by pre-reveal
 * methods is contestant-facing: labels and texts only, never provenance (§33).
 */

import type { Tunables, RiskTier } from "../config/tunables.js";
import type { Clock, IdGen, Rng } from "../domain/runtime.js";
import type { Specimen } from "../domain/types.js";
import type { ModelProvider } from "../providers/provider.js";
import type { GameStore } from "../store/store.js";
import { selectPrompt } from "../engine/promptSelection.js";
import { advancePhase, createRound, ensureSeeded } from "../engine/setup.js";
import { recordTypingStarted, revealPrompt, submitHuman, timeoutBlank } from "../engine/writing.js";
import { buildAppearances, generateMachineSpecimens, type MachineDeps } from "../engine/machines.js";
import {
  castHumanTaste,
  JudgingBelowMinimumError,
  lockJudgments,
  runMachineJudging,
  startJudging,
  tasteCandidatesFor,
  type MachineJudgingResult,
} from "../engine/judging.js";
import { completeRound, revealProvenance } from "../engine/reveal.js";
import type { RoundResults } from "../scoring/scoring.js";

export type GameEnv = {
  store: GameStore;
  clock: Clock;
  idGen: IdGen;
  tunables: Tunables;
  provider: ModelProvider;
  rng: Rng;
};

export type StartedRound = {
  roundId: string;
  promptText: string;
  seconds: number;
  maxWords: number;
  riskTiers: RiskTier[];
};

export type SubmitResult = {
  blank: boolean;
  /** The human's taste candidates: anonymized labels + texts only. */
  candidates: { label: string; text: string }[];
};

const JUDGING_ATTEMPTS = 2;

type ActiveRound = {
  deps: MachineDeps;
  machinePromise: Promise<Specimen[]>;
  judgingPromise?: Promise<MachineJudgingResult>;
  humanContestantId: string;
};

export class GameSession {
  private readonly active = new Map<string, ActiveRound>();

  constructor(private readonly env: GameEnv) {}

  /** Starts a round: reveals the prompt and kicks machine generation immediately (§5). */
  startRound(): StartedRound {
    const { store, clock, idGen, tunables, provider, rng } = this.env;
    const { human, machines } = ensureSeeded(store, tunables, clock);
    const prompt = selectPrompt(store, rng, tunables);
    const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
    const deps: MachineDeps = { store, clock, idGen, tunables, events, provider };

    revealPrompt(deps, round.id);
    const machinePromise = generateMachineSpecimens(deps, store.get("round", round.id));
    machinePromise.catch(() => {}); // observed in submit(); avoid unhandled rejection

    this.active.set(round.id, { deps, machinePromise, humanContestantId: human.id });
    return {
      roundId: round.id,
      promptText: prompt.text,
      seconds: tunables.humanWritingSeconds,
      maxWords: tunables.maxResponseWords,
      riskTiers: tunables.riskTiers,
    };
  }

  /** Records the human's first keypress (§20). */
  typingStarted(roundId: string): void {
    recordTypingStarted(this.round(roundId).deps, roundId);
  }

  /**
   * Submits the human response (null/empty → Blank Specimen), waits for the
   * machine table, and returns the human's taste candidates.
   */
  async submit(roundId: string, text: string | null): Promise<SubmitResult> {
    const activeRound = this.round(roundId);
    const { deps } = activeRound;
    const trimmed = text?.trim() ?? "";
    const humanSpecimen =
      trimmed.length === 0 ? timeoutBlank(deps, roundId) : submitHuman(deps, roundId, trimmed);

    advancePhase(deps.store, roundId, "SUBMISSIONS_LOCKED", "WAITING_FOR_MACHINE_RESPONSES");
    const machineSpecimens = await activeRound.machinePromise;

    buildAppearances(deps, deps.store.get("round", roundId), humanSpecimen, machineSpecimens, this.env.rng);
    startJudging(deps, roundId);
    activeRound.judgingPromise = runMachineJudging(deps, roundId);
    activeRound.judgingPromise.catch(() => {});

    return {
      blank: humanSpecimen.isBlank,
      candidates: tasteCandidatesFor(deps, roundId, activeRound.humanContestantId).map((c) => ({
        label: c.label,
        text: c.text,
      })),
    };
  }

  /**
   * Casts the human taste vote, waits for machine judging, locks, reveals,
   * and completes the round, returning full post-reveal results.
   */
  async castTaste(roundId: string, label: string): Promise<RoundResults> {
    const activeRound = this.round(roundId);
    const { deps } = activeRound;
    castHumanTaste(deps, roundId, label);
    await activeRound.judgingPromise;

    for (let attempt = 1; ; attempt++) {
      try {
        lockJudgments(deps, roundId);
        break;
      } catch (error) {
        // Restart re-runs only judges without persisted ballots (§27).
        if (error instanceof JudgingBelowMinimumError && attempt < JUDGING_ATTEMPTS) {
          await runMachineJudging(deps, roundId);
          continue;
        }
        throw error;
      }
    }

    const results = revealProvenance(deps, roundId);
    completeRound(deps, roundId, this.env.tunables);
    this.active.delete(roundId);
    return results;
  }

  private round(roundId: string): ActiveRound {
    const activeRound = this.active.get(roundId);
    if (!activeRound) throw new Error(`No active round ${roundId}`);
    return activeRound;
  }
}
