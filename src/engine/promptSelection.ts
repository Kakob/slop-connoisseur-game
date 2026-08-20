/** Prompt selection strategy (SPEC §4 tunable): which prompt the next round uses. */

import type { Tunables } from "../config/tunables.js";
import type { Rng } from "../domain/runtime.js";
import type { GamePrompt } from "../domain/types.js";
import type { GameStore } from "../store/store.js";

/** Derives the next round's prompt from active prompts, preferring unplayed ones. */
export function selectPrompt(store: GameStore, rng: Rng, tunables: Tunables): GamePrompt {
  const active = store.where("prompt", (p) => p.active);
  if (active.length === 0) throw new Error("No active prompts available");

  let pool = active;
  if (tunables.promptSelection === "random-unplayed-first") {
    const playedPromptIds = new Set(store.all("round").map((r) => r.promptId));
    const unplayed = active.filter((p) => !playedPromptIds.has(p.id));
    if (unplayed.length > 0) pool = unplayed;
  }

  return pool[Math.floor(rng() * pool.length)]!;
}
