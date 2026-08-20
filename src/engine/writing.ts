/**
 * Human writing phase (SPEC §5, §20, M0.1): reveal → typing → submit or
 * blank timeout. Always produces exactly one immutable human specimen.
 */

import type { Tunables } from "../config/tunables.js";
import type { Clock, IdGen } from "../domain/runtime.js";
import { isoNow } from "../domain/runtime.js";
import type { Round, Specimen } from "../domain/types.js";
import { countWords } from "./text.js";
import type { GameStore } from "../store/store.js";
import { advancePhase } from "./setup.js";
import type { EventLogger } from "./events.js";

export const BLANK_TEXT = "[no response]";

export type WritingDeps = {
  store: GameStore;
  clock: Clock;
  idGen: IdGen;
  tunables: Tunables;
  events: EventLogger;
};

/** Reveals the prompt: READY → PROMPT_REVEALED → WRITING; the timer starts now. */
export function revealPrompt(deps: WritingDeps, roundId: string): Round {
  const { store, clock, events } = deps;
  advancePhase(store, roundId, "READY", "PROMPT_REVEALED");
  events("prompt_shown", { promptId: store.get("round", roundId).promptId });
  const revealed = store.get("round", roundId);
  store.update("round", {
    ...revealed,
    timings: { ...revealed.timings, promptShownAt: isoNow(clock) },
  });
  return advancePhase(store, roundId, "PROMPT_REVEALED", "WRITING");
}

/** Records the human's first keypress (§20); idempotent after the first call. */
export function recordTypingStarted(deps: WritingDeps, roundId: string): void {
  const { store, clock, events } = deps;
  const round = store.get("round", roundId);
  if (round.phase !== "WRITING") throw new Error(`Cannot type in phase ${round.phase}`);
  if (round.timings.humanStartedTypingAt) return;
  events("typing_started", {});
  store.update("round", {
    ...round,
    timings: { ...round.timings, humanStartedTypingAt: isoNow(clock) },
  });
}

function createHumanSpecimen(
  deps: WritingDeps,
  round: Round,
  text: string,
  isBlank: boolean,
): Specimen {
  const { store, clock, idGen } = deps;
  return store.insert("specimen", {
    id: idGen(),
    text,
    creatorType: "human",
    creatorContestantId: round.humanContestantId,
    promptId: round.promptId,
    createdAt: isoNow(clock),
    wordCount: isBlank ? 0 : countWords(text),
    isBlank,
    reuseAllowed: true,
  });
}

function finishWriting(deps: WritingDeps, roundId: string, submittedAt: string): Round {
  const { store, events } = deps;
  const round = store.get("round", roundId);
  const shownAtMs = round.timings.promptShownAt
    ? Date.parse(round.timings.promptShownAt)
    : Date.parse(submittedAt);
  store.update("round", {
    ...round,
    timings: {
      ...round.timings,
      humanSubmittedAt: submittedAt,
      humanResponseMilliseconds: Date.parse(submittedAt) - shownAtMs,
    },
  });
  const locked = advancePhase(store, roundId, "WRITING", "SUBMISSIONS_LOCKED");
  events("submissions_locked", {});
  return locked;
}

/**
 * Submits the human's non-empty response (early or at the bell), enforcing
 * the word cap and locking submissions.
 */
export function submitHuman(deps: WritingDeps, roundId: string, text: string): Specimen {
  const { store, clock, tunables, events } = deps;
  const round = store.get("round", roundId);
  if (round.phase !== "WRITING") throw new Error(`Cannot submit in phase ${round.phase}`);

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Empty submission: use timeoutBlank for an empty timer expiry");
  }
  const words = countWords(trimmed);
  if (words > tunables.maxResponseWords) {
    throw new Error(`Response has ${words} words; the cap is ${tunables.maxResponseWords}`);
  }

  const specimen = createHumanSpecimen(deps, round, trimmed, false);
  events("human_submitted", { specimenId: specimen.id, wordCount: specimen.wordCount });
  finishWriting(deps, roundId, specimen.createdAt);
  return specimen;
}

/**
 * Handles an empty timer expiry: creates the Blank Specimen (§5) — a failed
 * submission, not a skipped round — and locks submissions.
 */
export function timeoutBlank(deps: WritingDeps, roundId: string): Specimen {
  const { store, events } = deps;
  const round = store.get("round", roundId);
  if (round.phase !== "WRITING") throw new Error(`Cannot time out in phase ${round.phase}`);

  const specimen = createHumanSpecimen(deps, round, BLANK_TEXT, true);
  events("human_timed_out_blank", { specimenId: specimen.id });
  finishWriting(deps, roundId, specimen.createdAt);
  return specimen;
}
