/** Round and contestant setup: seeds the store and opens a new round record. */

import type { Tunables } from "../config/tunables.js";
import type { Clock, IdGen } from "../domain/runtime.js";
import { isoNow } from "../domain/runtime.js";
import type { Contestant, Round } from "../domain/types.js";
import { seedPersonas } from "../contestants/personas.js";
import { seedPrompts } from "../content/prompts.js";
import type { GameStore } from "../store/store.js";
import { makeEventLogger, type EventLogger } from "./events.js";

/** Idempotently seeds prompts and the persistent human + machine contestants. */
export function ensureSeeded(store: GameStore, tunables: Tunables, clock: Clock): {
  human: Contestant;
  machines: Contestant[];
} {
  for (const prompt of seedPrompts()) {
    if (!store.has("prompt", prompt.id)) store.insert("prompt", prompt);
  }

  const personas = [...seedPersonas().values()];
  if (personas.length < tunables.machineContestantCount) {
    throw new Error(
      `Need ${tunables.machineContestantCount} personas but only ${personas.length} are seeded`,
    );
  }

  const humanId = "human-player";
  if (!store.has("contestant", humanId)) {
    store.insert("contestant", {
      id: humanId,
      kind: "human",
      displayName: "You",
      createdAt: isoNow(clock),
    });
  }

  const machines: Contestant[] = [];
  for (const persona of personas.slice(0, tunables.machineContestantCount)) {
    const id = `machine-${persona.id}`;
    if (!store.has("contestant", id)) {
      store.insert("contestant", {
        id,
        kind: "machine",
        personaId: persona.id,
        personaVersion: persona.version,
        displayName: persona.name,
        createdAt: isoNow(clock),
      });
    }
    machines.push(store.get("contestant", id));
  }

  return { human: store.get("contestant", humanId), machines };
}

/** Creates a READY round for the given prompt and contestants, logging round_started. */
export function createRound(
  store: GameStore,
  promptId: string,
  human: Contestant,
  machines: Contestant[],
  clock: Clock,
  idGen: IdGen,
): { round: Round; events: EventLogger } {
  const round = store.insert("round", {
    id: idGen(),
    mode: "hide-from-machines",
    promptId,
    phase: "READY",
    humanContestantId: human.id,
    machineContestantIds: machines.map((m) => m.id),
    timings: {},
    createdAt: isoNow(clock),
  });
  const events = makeEventLogger(store, round.id, clock, idGen);
  events("round_started", {
    promptId,
    humanContestantId: human.id,
    machineContestantIds: round.machineContestantIds,
  });
  return { round, events };
}

/** Advances a round's phase, enforcing the SPEC §5 state machine order. */
export function advancePhase(store: GameStore, roundId: string, from: Round["phase"], to: Round["phase"]): Round {
  const round = store.get("round", roundId);
  if (round.phase !== from) {
    throw new Error(`Illegal phase transition for round ${roundId}: expected ${from}, was ${round.phase}`);
  }
  return store.update("round", { ...round, phase: to });
}
