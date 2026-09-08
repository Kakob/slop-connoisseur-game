/**
 * GameSession (SPEC §5, M0.4): drives Hide From Machines rounds for the web
 * surface. HTTP-agnostic and fully testable. Everything returned by pre-reveal
 * methods is contestant-facing: labels and texts only, never provenance (§33).
 */

import { defaultWebLimits } from "../config/tunables.js";
import { makeEventLogger } from "../engine/events.js";
import { computeResults } from "../scoring/scoring.js";
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
  deadlineGraceMs?: number;
};

export type StartedRound = {
  roundId: string;
  promptText: string;
  seconds: number;
  deadline: number;
  serverNow: number;
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
  submission?: { text: string; promise: Promise<SubmitResult> };
  completion?: { label: string; promise: Promise<RoundResults> };
};

export class GameSession {
  private readonly active = new Map<string, ActiveRound>();

  constructor(private readonly env: GameEnv) {}

  /** Starts a round: reveals the prompt and kicks machine generation immediately (§5). */
  startRound(humanId = "human-player", sourceChallengeId?: string, startRequestId?: string): StartedRound {
    const { store, clock, idGen, tunables, provider, rng } = this.env;
    const { human, machines } = ensureSeeded(store, tunables, clock, humanId);
    const prompt = selectPrompt(store, rng, tunables, humanId);
    const { round, events } = createRound(store, prompt.id, human, machines, clock, idGen);
    const deps: MachineDeps = { store, clock, idGen, tunables, events, provider };

    store.update("round", { ...round, ...(sourceChallengeId ? { sourceChallengeId } : {}), ...(startRequestId ? { startRequestId } : {}) });
    revealPrompt(deps, round.id);
    const machinePromise = generateMachineSpecimens(deps, store.get("round", round.id));
    machinePromise.catch(() => {
      const current = store.get("round", round.id);
      store.update("round", { ...current, failure: "Machine writing failed. Start a fresh round." });
    }); // observed in submit(); avoid unhandled rejection

    this.active.set(round.id, { deps, machinePromise, humanContestantId: human.id });
    return {
      roundId: round.id,
      promptText: prompt.text,
      seconds: tunables.humanWritingSeconds,
      deadline: Date.parse(store.get("round", round.id).timings.promptShownAt!) + tunables.humanWritingSeconds * 1000,
      serverNow: clock(),
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
    const input = text?.trim() ?? "";
    const active = this.round(roundId);
    if (active.submission) {
      if (active.submission.text !== input) throw new Error("Submission is already locked");
      return active.submission.promise;
    }
    const round = this.env.store.get("round", roundId);
    if (round.phase !== "WRITING") {
      const specimen = this.env.store.where("appearance", a => a.roundId === roundId)
        .map(a => this.env.store.get("specimen", a.specimenId)).find(s => s.creatorContestantId === round.humanContestantId);
      if (!specimen || (specimen.isBlank ? input !== "" : specimen.text !== input)) throw new Error("Submission is already locked");
      return this.candidates(roundId);
    }
    const promise = this.submitOnce(roundId, text);
    active.submission = { text: input, promise };
    promise.catch(() => {
      if (this.env.store.get("round", roundId).phase === "WRITING") delete active.submission;
    });
    return promise;
  }

  private async submitOnce(roundId: string, text: string | null): Promise<SubmitResult> {
    const activeRound = this.round(roundId);
    const { deps } = activeRound;
    const current = deps.store.get("round", roundId);
    const deadline = Date.parse(current.timings.promptShownAt!) + deps.tunables.humanWritingSeconds * 1000;
    const trimmed = deps.clock() > deadline + (this.env.deadlineGraceMs ?? defaultWebLimits.deadlineGraceMs) ? "" : text?.trim() ?? "";
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
    label = label.trim().toUpperCase();
    const round = this.env.store.get("round", roundId);
    if (round.phase === "RESULTS") {
      const results = round.results ?? computeResults(this.env.store, roundId, this.env.tunables);
      if (results.humanTasteLabel !== label) throw new Error("Taste vote is already locked");
      return results;
    }
    const active = this.round(roundId);
    if (active.completion) {
      if (active.completion.label !== label) throw new Error("Taste vote is already locked");
      return active.completion.promise;
    }
    const promise = this.completeOnce(roundId, label);
    active.completion = { label, promise };
    promise.catch(() => { delete active.completion; });
    return promise;
  }

  private async completeOnce(roundId: string, label: string): Promise<RoundResults> {
    const activeRound = this.round(roundId);
    const { deps } = activeRound;
    castHumanTaste(deps, roundId, label);
    if (!activeRound.judgingPromise) activeRound.judgingPromise = runMachineJudging(deps, roundId);
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

  /** Returns only the creator-facing state appropriate to the current phase. */
  read(roundId: string) {
    const round = this.env.store.get("round", roundId);
    const base = {
      roundId, promptText: this.env.store.get("prompt", round.promptId).text,
      phase: round.phase, maxWords: this.env.tunables.maxResponseWords,
      riskTiers: this.env.tunables.riskTiers, serverNow: this.env.clock(),
      deadline: Date.parse(round.timings.promptShownAt!) + this.env.tunables.humanWritingSeconds * 1000,
    };
    if (round.phase === "RESULTS") return { ...base, results: round.results ?? computeResults(this.env.store, roundId, this.env.tunables) };
    if (round.failure) return { ...base, failure: round.failure };
    if (!this.active.has(roundId) && round.phase !== "JUDGING") {
      return { ...base, failure: "This round was interrupted by a server restart. Start a fresh round." };
    }
    if (round.phase === "JUDGING") {
      const vote = this.env.store.where("judgment", j => j.roundId === roundId && j.judgeContestantId === round.humanContestantId && j.type === "taste")[0];
      return { ...base, ...this.candidates(roundId), selectedTaste: vote ? this.candidates(roundId).candidates.find(c =>
        this.env.store.get("appearance", vote.chosenAppearanceId).anonymousPosition === c.label.charCodeAt(0) - 65)?.label : null };
    }
    return base;
  }

  private candidates(roundId: string): SubmitResult {
    const active = this.round(roundId);
    const specimen = this.env.store.where("appearance", a => a.roundId === roundId)
      .map(a => this.env.store.get("specimen", a.specimenId)).find(s => s.creatorContestantId === active.humanContestantId)!;
    return { blank: specimen.isBlank, candidates: tasteCandidatesFor(active.deps, roundId, active.humanContestantId).map(c => ({ label: c.label, text: c.text })) };
  }

  private round(roundId: string): ActiveRound {
    if (!this.active.has(roundId)) {
      const round = this.env.store.get("round", roundId);
      if (round.phase === "JUDGING" && !round.failure) {
        const deps = { ...this.env, events: makeEventLogger(this.env.store, roundId, this.env.clock, this.env.idGen) };
        this.active.set(roundId, { deps, humanContestantId: round.humanContestantId, machinePromise: Promise.resolve([]) });
      }
    }
    const activeRound = this.active.get(roundId);
    if (!activeRound) throw new Error(`No active round ${roundId}`);
    return activeRound;
  }
}
