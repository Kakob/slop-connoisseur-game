/**
 * Live smoke tests, each behind its own env gate and skipped by default (D50):
 * RUN_SMOKE=1 for the API-key AnthropicProvider, RUN_AGENT_SMOKE=1 for the
 * subscription-billed ClaudeAgentProvider (requires a Claude Code login).
 * Everything else uses deterministic mocks.
 */

import { describe, expect, it } from "vitest";
import { defaultTunables } from "../src/config/tunables.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { ClaudeAgentProvider } from "../src/providers/claudeAgent.js";

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

describe.skipIf(process.env.RUN_AGENT_SMOKE !== "1")("live Claude Agent SDK smoke", () => {
  it("completes a writer-shaped call on the subscription", { timeout: 120_000 }, async () => {
    const provider = new ClaudeAgentProvider(defaultTunables.provider.model);
    const result = await provider.complete({
      system:
        "You are a contestant in a party game. Reply with ONLY your answer text, at most 20 words.",
      user: "What's something people pretend to enjoy?",
      maxTokens: defaultTunables.provider.maxTokens,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.provider).toBe("claude-agent");
    expect(result.latencyMs).toBeGreaterThan(0);
  });
});
