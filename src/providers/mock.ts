/**
 * Deterministic mock provider for all tests (CLAUDE.md: the real API is
 * smoke-only). Responses are scripted per matcher; unmatched calls fail
 * loudly rather than fabricating output.
 */

import type { ModelCallRequest, ModelCallResult, ModelProvider } from "./provider.js";

export type MockRule = {
  /** Matches against the assembled system+user text of a call. */
  match: (request: ModelCallRequest) => boolean;
  /** Scripted replies, consumed in order; the last one repeats. Errors throw. */
  replies: (string | Error)[];
};

export class MockModelProvider implements ModelProvider {
  readonly calls: ModelCallRequest[] = [];
  private readonly consumed = new Map<MockRule, number>();

  constructor(private readonly rules: MockRule[]) {}

  async complete(request: ModelCallRequest): Promise<ModelCallResult> {
    this.calls.push(request);
    const rule = this.rules.find((r) => r.match(request));
    if (!rule) {
      throw new Error(
        `MockModelProvider: no rule matches call.\nsystem: ${request.system.slice(0, 120)}\nuser: ${request.user.slice(0, 120)}`,
      );
    }
    const index = this.consumed.get(rule) ?? 0;
    this.consumed.set(rule, index + 1);
    const reply = rule.replies[Math.min(index, rule.replies.length - 1)];
    if (reply === undefined) throw new Error("MockModelProvider: rule has no replies");
    if (reply instanceof Error) throw reply;
    return {
      text: reply,
      provider: "mock",
      model: "mock-model",
      latencyMs: 1,
    };
  }
}

/** Convenience matcher: does the call's user or system text contain `needle`? */
export function contains(needle: string): (request: ModelCallRequest) => boolean {
  return (request) => request.system.includes(needle) || request.user.includes(needle);
}
