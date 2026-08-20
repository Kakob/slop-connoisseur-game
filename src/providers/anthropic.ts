/** Anthropic implementation of ModelProvider. Used live; tests use MockModelProvider. */

import Anthropic from "@anthropic-ai/sdk";
import type { ModelCallRequest, ModelCallResult, ModelProvider } from "./provider.js";

export class AnthropicProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(
    private readonly model: string,
    client?: Anthropic,
  ) {
    // Zero-arg client resolves ANTHROPIC_API_KEY or an `ant auth login` profile.
    this.client = client ?? new Anthropic();
  }

  async complete(request: ModelCallRequest): Promise<ModelCallResult> {
    const startedAt = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    });
    const latencyMs = Date.now() - startedAt;

    if (response.stop_reason === "refusal") {
      throw new Error(
        `Model refused: ${response.stop_details?.explanation ?? "no explanation provided"}`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (text.length === 0) {
      throw new Error(`Empty model response (stop_reason: ${response.stop_reason})`);
    }

    return {
      text,
      provider: "anthropic",
      model: response.model,
      latencyMs,
    };
  }
}
