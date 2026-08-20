/**
 * Claude Agent SDK implementation of ModelProvider, billed to the developer's
 * Claude subscription via the Claude Code login instead of an API key.
 *
 * Every call is structurally tool-less and context-isolated (D49): no built-in
 * tools, no settings/CLAUDE.md injection, a plain-string system prompt, one
 * turn, neutral cwd. This is the SPEC §16/§33 boundary applied to a harness
 * that defaults to filesystem access.
 */

import * as os from "node:os";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ModelCallRequest, ModelCallResult, ModelProvider } from "./provider.js";

/** Injectable query seam so tests never spawn a Claude Code subprocess. */
export type AgentQueryFn = (params: {
  prompt: string;
  options?: Options;
}) => AsyncIterable<SDKMessage>;

/**
 * Derives a subprocess environment that cannot bill an API key: a set
 * ANTHROPIC_API_KEY (or AUTH_TOKEN) silently overrides subscription login in
 * non-interactive mode, so both are stripped (D48).
 */
export function subscriptionEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export class ClaudeAgentProvider implements ModelProvider {
  constructor(
    private readonly model: string,
    private readonly queryFn: AgentQueryFn = query,
  ) {}

  async complete(request: ModelCallRequest): Promise<ModelCallResult> {
    const startedAt = Date.now();
    // maxTokens is unenforceable here — the Agent SDK exposes no per-call
    // output cap; word-cap and choice-parse checks above the provider are the
    // real guards (D48).
    const options: Options = {
      model: this.model,
      systemPrompt: request.system,
      tools: [],
      settingSources: [],
      maxTurns: 1,
      cwd: os.tmpdir(),
      env: subscriptionEnv(),
    };

    let result: (SDKMessage & { type: "result" }) | undefined;
    for await (const message of this.queryFn({ prompt: request.user, options })) {
      if (message.type === "result") result = message;
    }
    const latencyMs = Date.now() - startedAt;

    if (!result) {
      throw new Error("Claude Agent SDK query ended without a result message");
    }
    if (result.subtype !== "success") {
      throw new Error(
        `Claude Agent SDK error (${result.subtype}): ${result.errors.join("; ") || "no detail"}`,
      );
    }
    if (result.is_error) {
      throw new Error(`Claude Agent SDK call failed: ${result.result}`);
    }
    if (result.stop_reason === "refusal") {
      throw new Error("Model refused: stop_reason refusal");
    }

    const text = result.result.trim();
    if (text.length === 0) {
      throw new Error(`Empty model response (stop_reason: ${result.stop_reason})`);
    }

    return {
      text,
      provider: "claude-agent",
      model: Object.keys(result.modelUsage)[0] ?? this.model,
      latencyMs,
    };
  }
}
