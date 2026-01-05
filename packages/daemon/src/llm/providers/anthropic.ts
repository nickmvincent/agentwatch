/**
 * Anthropic LLM Provider
 *
 * Uses the Anthropic API for LLM evaluation.
 */

import type { LLMEvaluationOptions, LLMProvider, LLMResponse } from "../types";
import { parseLLMResponse } from "../utils";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private readonly model: string;
  private readonly apiKeyEnvVar: string;

  constructor(config: { model: string; apiKeyEnvVar: string }) {
    this.model = config.model;
    this.apiKeyEnvVar = config.apiKeyEnvVar;
  }

  isAvailable(): boolean {
    return Boolean(process.env[this.apiKeyEnvVar]);
  }

  async evaluate(
    prompt: string,
    options: LLMEvaluationOptions
  ): Promise<LLMResponse> {
    const apiKey = process.env[this.apiKeyEnvVar];
    if (!apiKey) {
      return {
        decision: "abstain",
        reason: `API key not found in ${this.apiKeyEnvVar}`,
        confidence: 0
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens,
          system:
            options.systemPrompt ??
            "You are a security evaluator. Respond with JSON.",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          decision: "abstain",
          reason: `Anthropic API error: ${response.status} - ${error}`,
          confidence: 0
        };
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.[0]?.text ?? "";

      return parseLLMResponse(text);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return {
          decision: "abstain",
          reason: "Request timeout",
          confidence: 0
        };
      }

      return {
        decision: "abstain",
        reason: error instanceof Error ? error.message : "Unknown error",
        confidence: 0
      };
    }
  }
}
