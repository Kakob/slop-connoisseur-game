/** Raw round event logging (SPEC §21): every lifecycle step is a stored event. */

import type { Clock, IdGen } from "../domain/runtime.js";
import { isoNow } from "../domain/runtime.js";
import type { GameEvent, GameEventType } from "../domain/types.js";
import type { GameStore } from "../store/store.js";

export type EventLogger = (type: GameEventType, data?: Record<string, unknown>) => GameEvent;

/** Creates a logger that persists one event per call for the given round. */
export function makeEventLogger(
  store: GameStore,
  roundId: string,
  clock: Clock,
  idGen: IdGen,
): EventLogger {
  return (type, data = {}) =>
    store.insert("event", {
      id: idGen(),
      roundId,
      type,
      at: isoNow(clock),
      data,
    });
}
