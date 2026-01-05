/**
 * Ollama LLM Provider
 *
 * Uses a local Ollama instance for LLM evaluation.
 */

import type { LLMEvaluationOptions, LLMProvider, LLMResponse } from "../types";
import { parseLLMResponse } from "../utils";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: { model: string; baseUrl?: string }) {
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
  }

  isAvailable(): boolean {
    // Ollama doesn't require an API key
    return true;
  }

  async evaluate(
    prompt: string,
    options: LLMEvaluationOptions
  ): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          prompt: options.systemPrompt
            ? `${options.systemPrompt}\n\n${prompt}`
            : prompt,
          stream: false,
          options: {
            num_predict: options.maxTokens
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          decision: "abstain",
          reason: `Ollama API error: ${response.status} - ${error}`,
          confidence: 0
        };
      }

      const data = (await response.json()) as { response?: string };
      const text = data.response ?? "";

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

      // Check if Ollama is not running
      if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
        return {
          decision: "abstain",
          reason: "Ollama not running. Start with: ollama serve",
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
