/**
 * LLM Evaluation Types
 */

import type { HookEventType } from "@agentwatch/core";

/**
 * LLM evaluation configuration.
 */
export interface LLMConfig {
  /** Whether LLM evaluation is enabled */
  enabled: boolean;
  /** Provider to use */
  provider: "anthropic" | "openai" | "ollama";
  /** Model identifier */
  model: string;
  /** Environment variable containing API key */
  apiKeyEnvVar: string;
  /** Maximum tokens in response */
  maxTokens: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Hooks that can trigger LLM evaluation */
  triggerHooks: HookEventType[];
  /** Ollama-specific: base URL */
  ollamaBaseUrl?: string;
}

/**
 * Options for LLM evaluation call.
 */
export interface LLMEvaluationOptions {
  /** Maximum tokens in response */
  maxTokens: number;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** System prompt (optional) */
  systemPrompt?: string;
}

/**
 * Response from LLM evaluation.
 */
export interface LLMResponse {
  /** Decision from the LLM */
  decision: "allow" | "deny" | "block" | "continue" | "abstain";
  /** Reason/explanation */
  reason: string;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Raw response text */
  rawResponse?: string;
}

/**
 * Interface for LLM provider implementations.
 */
export interface LLMProvider {
  /** Provider name */
  readonly name: string;
  /** Check if provider is available (API key set, etc.) */
  isAvailable(): boolean;
  /** Evaluate a prompt and return a decision */
  evaluate(prompt: string, options: LLMEvaluationOptions): Promise<LLMResponse>;
}
