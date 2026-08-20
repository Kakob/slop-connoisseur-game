/**
 * ClaudeAgentProvider unit tests. The query seam is faked — no subprocess, no
 * network — and the assertions pin the D49 isolation options: tool-less,
 * settings-less, single-turn, neutral cwd, API key stripped from the env.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAgentProvider, subscriptionEnv } from "../src/providers/claudeAgent.js";

type Captured = { prompt: string; options?: Options };

function successResult(overrides: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 42,
    duration_api_ms: 40,
    is_error: false,
    num_turns: 1,
    result: "a perfectly human answer",
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {} as never,
    modelUsage: { "claude-opus-5-20260115": {} as never },
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000000",
    session_id: "test-session",
    ...overrides,
  } as SDKMessage;
}

function fakeQuery(messages: SDKMessage[], captured: Captured[]) {
  return (params: { prompt: string; options?: Options }): AsyncIterable<SDKMessage> => {
    captured.push(params);
    return (async function* () {
      yield* messages;
    })();
  };
}

const request = {
  system: "You are a contestant in a party game.",
  user: "What's something people pretend to enjoy?",
  maxTokens: 4000,
};

describe("ClaudeAgentProvider", () => {
  const SENTINEL_KEY = "SECRET-api-key-sentinel";
  let savedKey: string | undefined;
  let savedToken: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = SENTINEL_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = SENTINEL_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
  });

  it("returns text and provenance from a successful result", async () => {
    const captured: Captured[] = [];
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([successResult()], captured));

    const result = await provider.complete(request);

    expect(result.text).toBe("a perfectly human answer");
    expect(result.provider).toBe("claude-agent");
    expect(result.model).toBe("claude-opus-5-20260115");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("passes system as systemPrompt, user as prompt, and the configured model", async () => {
    const captured: Captured[] = [];
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([successResult()], captured));

    await provider.complete(request);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.prompt).toBe(request.user);
    expect(captured[0]!.options?.systemPrompt).toBe(request.system);
    expect(captured[0]!.options?.model).toBe("claude-opus-5");
  });

  it("isolates every call: no tools, no settings, one turn, neutral cwd", async () => {
    const captured: Captured[] = [];
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([successResult()], captured));

    await provider.complete(request);

    const options = captured[0]!.options!;
    expect(options.tools).toEqual([]);
    expect(options.settingSources).toEqual([]);
    expect(options.maxTurns).toBe(1);
    expect(options.cwd).toBeTruthy();
    expect(options.cwd).not.toBe(process.cwd());
  });

  it("strips API credentials from the subprocess env so calls bill the subscription", async () => {
    const captured: Captured[] = [];
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([successResult()], captured));

    await provider.complete(request);

    const env = captured[0]!.options!.env!;
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(JSON.stringify(env)).not.toContain(SENTINEL_KEY);
    expect(env.PATH).toBe(process.env.PATH); // rest of the env is inherited
  });

  it("throws on an error-subtype result, including the error detail", async () => {
    const errorResult = {
      ...(successResult() as Record<string, unknown>),
      subtype: "error_during_execution",
      is_error: true,
      errors: ["subprocess exploded"],
    } as unknown as SDKMessage;
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([errorResult], []));

    await expect(provider.complete(request)).rejects.toThrow(/error_during_execution.*subprocess exploded/);
  });

  it("throws when a success result carries an API error (is_error)", async () => {
    const provider = new ClaudeAgentProvider(
      "claude-opus-5",
      fakeQuery([successResult({ is_error: true, result: "overloaded_error" })], []),
    );

    await expect(provider.complete(request)).rejects.toThrow(/overloaded_error/);
  });

  it("throws on refusal stop_reason", async () => {
    const provider = new ClaudeAgentProvider(
      "claude-opus-5",
      fakeQuery([successResult({ stop_reason: "refusal" })], []),
    );

    await expect(provider.complete(request)).rejects.toThrow(/refused/i);
  });

  it("throws on empty text", async () => {
    const provider = new ClaudeAgentProvider(
      "claude-opus-5",
      fakeQuery([successResult({ result: "   " })], []),
    );

    await expect(provider.complete(request)).rejects.toThrow(/Empty model response/);
  });

  it("throws when the stream ends without a result message", async () => {
    const provider = new ClaudeAgentProvider("claude-opus-5", fakeQuery([], []));

    await expect(provider.complete(request)).rejects.toThrow(/without a result message/);
  });
});

describe("subscriptionEnv", () => {
  it("removes only the API credential variables", () => {
    const env = subscriptionEnv({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t", HOME: "/home/x" });
    expect(env).toEqual({ HOME: "/home/x" });
  });
});
