/** Durable blind replay: choices and provenance cross separate server boundaries. */
import { randomUUID } from "node:crypto";
import type { GameEnv } from "./session.js";
import { computeResults } from "../scoring/scoring.js";
import { positionLabel } from "../engine/machines.js";

/** Expected HTTP failure that is safe to show to players. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Manages replay without modifying original specimens, ballots, or scores. */
export class Challenges {
  constructor(private env: GameEnv) {}

  /** Records an idempotent funnel event without raw answer text. */
  event(type: string, challengeId: string, playerId: string, key: string, extra: {
    attemptId?: string; roundId?: string; count?: number; newestAttemptId?: string;
  } = {}) {
    const id = JSON.stringify([type, challengeId, playerId, key]);
    if (!this.env.store.has("sharingEvent", id)) this.env.store.insert("sharingEvent", {
      id, type, challengeId, playerId, at: new Date(this.env.clock()).toISOString(), ...extra,
    });
  }

  /** Creates one stable link for a completed round, requiring its owner. */
  create(roundId: string, playerId: string) {
    const { store } = this.env;
    if (!store.has("round", roundId)) throw new HttpError(404, "Round not found.");
    const round = store.get("round", roundId);
    if (round.humanContestantId !== playerId) throw new HttpError(404, "Round not found.");
    if (round.phase !== "RESULTS") throw new HttpError(409, "Finish the round before sharing.");
    let challenge = store.where("challenge", c => c.roundId === roundId)[0];
    if (!challenge) challenge = store.insert("challenge", {
      id: randomUUID(), roundId, ownerId: playerId, createdAt: new Date(this.env.clock()).toISOString(),
    });
    this.event("challenge_created", challenge.id, playerId, roundId);
    return { challengeId: challenge.id, url: `/challenge/${challenge.id}`, ownerUrl: `/results/${challenge.id}` };
  }

  /** Validates a public link without leaking private round information. */
  get(id: string) {
    if (!this.env.store.has("challenge", id)) throw new HttpError(404, "This challenge is unavailable. Try hiding yourself.");
    const challenge = this.env.store.get("challenge", id);
    if (this.env.store.get("round", challenge.roundId).phase !== "RESULTS") throw new HttpError(404, "This challenge is unavailable.");
    return challenge;
  }

  private attempt(id: string, playerId: string) {
    const challenge = this.get(id);
    if (challenge.ownerId === playerId) throw new HttpError(409, "This is your creator preview; it does not count as a guess.");
    let attempt = this.env.store.where("challengeAttempt", a => a.challengeId === id && a.playerId === playerId)[0];
    if (!attempt) attempt = this.env.store.insert("challengeAttempt", {
      id: randomUUID(), challengeId: id, playerId, createdAt: new Date(this.env.clock()).toISOString(),
    });
    this.event("challenge_opened", id, playerId, attempt.id, { attemptId: attempt.id });
    return attempt;
  }

  private lineup(id: string) {
    const { store } = this.env;
    const challenge = this.get(id);
    return store.where("appearance", a => a.roundId === challenge.roundId)
      .sort((a, b) => a.anonymousPosition - b.anonymousPosition).map(a => ({
        label: positionLabel(a.anonymousPosition), text: store.get("specimen", a.specimenId).text,
      }));
  }

  /** Returns an explicit anonymous projection, never a redacted result object. */
  open(id: string, playerId: string) {
    const { store } = this.env;
    const challenge = this.get(id);
    const round = store.get("round", challenge.roundId);
    const preview = challenge.ownerId === playerId;
    const attempt = preview ? null : this.attempt(id, playerId);
    const locked = attempt && store.has("attemptLock", attempt.id) ? store.get("attemptLock", attempt.id) : null;
    const revealed = attempt ? store.has("attemptReveal", attempt.id) : false;
    return {
      challengeId: id, promptText: store.get("prompt", round.promptId).text,
      candidates: this.lineup(id), preview, state: revealed ? "revealed" : locked ? "locked" : "choosing",
      choices: locked ? { detection: locked.detection, taste: locked.taste } : null,
      ...(revealed ? { results: this.results(id) } : {}),
    };
  }

  /** Locks one guess and optional preference; conflicting retries cannot rewrite it. */
  lock(id: string, playerId: string, detection: unknown, taste: unknown) {
    const { store } = this.env;
    const attempt = this.attempt(id, playerId);
    if (typeof detection !== "string" || !this.lineup(id).some(c => c.label === detection)) throw new HttpError(400, "Choose an answer before locking.");
    if (taste !== null && taste !== undefined && typeof taste !== "string") throw new HttpError(400, "Invalid favorite.");
    const favorite = taste == null ? null : taste as string;
    if (favorite !== null) {
      const eligible = store.where("appearance", a => a.roundId === this.get(id).roundId && a.eligibleForTaste)
        .some(a => positionLabel(a.anonymousPosition) === favorite);
      if (!eligible) throw new HttpError(400, "Choose a nonblank answer as your favorite, or skip it.");
    }
    if (store.has("attemptLock", attempt.id)) {
      const locked = store.get("attemptLock", attempt.id);
      if (locked.detection !== detection || locked.taste !== favorite) throw new HttpError(409, "Your choices are already locked.");
    } else store.insert("attemptLock", {
      id: attempt.id, detection, taste: favorite, createdAt: new Date(this.env.clock()).toISOString(),
    });
    this.event("guess_locked", id, playerId, attempt.id, { attemptId: attempt.id });
    return this.open(id, playerId);
  }

  private results(id: string) {
    const round = this.env.store.get("round", this.get(id).roundId);
    const results = round.results ?? computeResults(this.env.store, round.id, this.env.tunables);
    // Public results need authorship and votes, never internal player identifiers.
    return {
      promptText: results.promptText, blank: results.blank, humanLabel: results.humanLabel,
      machineJudgeCount: results.machineJudgeCount, machinesFound: results.machinesFound,
      machinesFooled: results.machinesFooled, machineTasteVotesForHuman: results.machineTasteVotesForHuman,
      humanTasteLabel: results.humanTasteLabel, tasteRate: results.tasteRate,
      table: results.table.map(r => ({ label: r.label, text: r.text, isBlank: r.isBlank, creatorKind: r.creatorKind, creatorDisplayName: r.creatorKind === "human" ? "Your friend" : r.creatorDisplayName })),
      detectionBallots: results.detectionBallots.map(b => ({ judgeDisplayName: b.judgeDisplayName, chosenLabel: b.chosenLabel })),
      machineTasteBallots: results.machineTasteBallots.map(b => ({ judgeDisplayName: b.judgeDisplayName, chosenLabel: b.chosenLabel })),
    };
  }

  /** Reveals only after the caller's own choices have locked. */
  reveal(id: string, playerId: string) {
    if (this.get(id).ownerId === playerId) return { ...this.open(id, playerId), state: "revealed", results: this.results(id) };
    const attempt = this.attempt(id, playerId);
    if (!this.env.store.has("attemptLock", attempt.id)) throw new HttpError(409, "Lock your guess before revealing.");
    if (!this.env.store.has("attemptReveal", attempt.id)) this.env.store.insert("attemptReveal", { id: attempt.id, createdAt: new Date(this.env.clock()).toISOString() });
    this.event("reveal_viewed", id, playerId, attempt.id, { attemptId: attempt.id });
    return this.open(id, playerId);
  }

  /** Lists only revealed attempts to the original creator and counts newly seen results. */
  owner(id: string, playerId: string) {
    const challenge = this.get(id);
    if (challenge.ownerId !== playerId) throw new HttpError(404, "Results not found in this browser. Return using the browser where you wrote the round.");
    const { store } = this.env;
    const humanLabel = this.results(id).humanLabel;
    const attempts = store.where("challengeAttempt", a => a.challengeId === id && store.has("attemptReveal", a.id))
      .map(a => ({ attemptId: a.id, ...store.get("attemptLock", a.id), revealedAt: store.get("attemptReveal", a.id).createdAt }))
      .sort((a, b) => a.revealedAt.localeCompare(b.revealedAt));
    this.event("owner_results_viewed", id, playerId, JSON.stringify(attempts.map(a => a.attemptId).sort()), {
      count: attempts.length, ...(attempts.at(-1) ? { newestAttemptId: attempts.at(-1)!.attemptId } : {}),
    });
    return { challengeId: id, humanLabel, attempts: attempts.map(a => ({ detection: a.detection, taste: a.taste, correct: a.detection === humanLabel, revealedAt: a.revealedAt })) };
  }
}
