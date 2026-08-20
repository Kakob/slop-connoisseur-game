/** Derives the live ModelProvider from a configured provider name (D48). */

import { AnthropicProvider } from "./anthropic.js";
import { ClaudeAgentProvider } from "./claudeAgent.js";
import type { ModelProvider } from "./provider.js";

export type ProviderName = "anthropic" | "claude-agent";

/** Constructs the named live provider, failing loudly on unknown names. */
export function makeProvider(name: string, model: string): ModelProvider {
  switch (name as ProviderName) {
    case "anthropic":
      return new AnthropicProvider(model);
    case "claude-agent":
      return new ClaudeAgentProvider(model);
    default:
      throw new Error(`Unknown provider name: ${name}`);
  }
}
