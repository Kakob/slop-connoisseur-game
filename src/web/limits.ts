/** Shared provider queue bounds live model concurrency for rounds and Studio. */
import type { ModelProvider, ModelCallRequest } from "../providers/provider.js";
import { HttpError } from "./challenges.js";

/** Wraps a provider with a bounded FIFO; occupied slots remain held until calls settle. */
export function limitedProvider(provider: ModelProvider, concurrency: number, maxQueue: number): ModelProvider {
  let active = 0;
  const queue: (() => void)[] = [];
  return {
    async complete(request: ModelCallRequest) {
      if (active >= concurrency) {
        if (queue.length >= maxQueue) throw new HttpError(429, "The table is busy. Please try again later.");
        await new Promise<void>(resolve => queue.push(resolve));
      } else active++;
      try { return await provider.complete(request); }
      finally {
        const next = queue.shift();
        if (next) next(); else active--;
      }
    },
  };
}
