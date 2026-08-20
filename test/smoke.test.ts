/**
 * The one live-API smoke test (CLAUDE.md): gated behind RUN_SMOKE=1, skipped
 * otherwise. Everything else uses deterministic mocks.
 */

import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";

describe.skipIf(process.env.RUN_SMOKE !== "1")("live Anthropic smoke", () => {
  it("completes a writer-shaped call", { timeout: 120_000 }, async () => {
    const provider = new AnthropicProvider(defaultTunables.provider.model);
    const result = await provider.complete({
      system:
        "You are a contestant in a party game. Reply with ONLY your answer text, at most 20 words.",
      user: "What's something people pretend to enjoy?",
      maxTokens: defaultTunables.provider.maxTokens,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.provider).toBe("anthropic");
    expect(result.latencyMs).toBeGreaterThan(0);
  });
});
