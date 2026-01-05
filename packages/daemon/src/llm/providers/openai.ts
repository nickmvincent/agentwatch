/**
 * OpenAI LLM Provider
 *
 * Uses the OpenAI API for LLM evaluation.
 */

import type { LLMEvaluationOptions, LLMProvider, LLMResponse } from "../types";
import { parseLLMResponse } from "../utils";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

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
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: options.maxTokens,
            messages: [
              {
                role: "system",
                content:
                  options.systemPrompt ??
                  "You are a security evaluator. Respond with JSON."
              },
              {
                role: "user",
                content: prompt
              }
            ]
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          decision: "abstain",
          reason: `OpenAI API error: ${response.status} - ${error}`,
          confidence: 0
        };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content ?? "";

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
