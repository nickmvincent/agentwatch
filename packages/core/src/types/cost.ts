/**
 * Cost estimation types for Claude API usage tracking
 */

/** Token usage breakdown from a Claude API response */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** Pricing rates per million tokens */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Cost estimate for a single model within a session */
export interface CostEstimate {
  sessionId: string;
  modelName: string;
  tokens: TokenUsage;
  estimatedCostUsd: number;
  messageCount: number;
  calculatedAt: number;
}

/** Aggregated cost summary for a session */
export interface SessionCostSummary {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  estimatedCostUsd: number;
  modelBreakdown: Record<string, CostEstimate>;
  messageCount: number;
}

/** Aggregate cost data across multiple sessions */
export interface AggregateCostData {
  periodDays: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionCount: number;
  modelBreakdown: Record<
    string,
    { cost: number; input: number; output: number }
  >;
  dailyCosts: Record<string, number>;
}

/**
 * Anthropic model pricing (as of December 2025)
 * Prices in USD per million tokens
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude 4 family
  "claude-opus-4": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-sonnet-4": { inputPerMillion: 3, outputPerMillion: 15 },
  // Claude 4.5 family
  "claude-opus-4-5": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5": { inputPerMillion: 0.8, outputPerMillion: 4 },
  // Claude 3.5 family
  "claude-sonnet-3-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-3-5": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  // Claude 3 family (legacy)
  "claude-opus-3": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-sonnet-3": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-3": { inputPerMillion: 0.25, outputPerMillion: 1.25 }
};

/**
 * Get pricing for a model, normalizing version suffixes
 * @param modelName - Full model name (e.g., "claude-sonnet-4-20250514")
 * @returns Pricing rates for the model
 */
export function getModelPricing(modelName: string): ModelPricing {
  // Strip date suffix (e.g., -20250514)
  const normalized = modelName.replace(/-\d{8}$/, "");

  // Try exact match first
  if (MODEL_PRICING[normalized]) {
    return MODEL_PRICING[normalized];
  }

  // Try partial matches
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return pricing;
    }
  }

  // Default to Sonnet pricing if unknown
  return { inputPerMillion: 3, outputPerMillion: 15 };
}

/**
 * Calculate cost in USD from token usage and pricing
 * @param tokens - Token usage breakdown
 * @param pricing - Model pricing rates
 * @returns Estimated cost in USD
 */
export function calculateCost(
  tokens: TokenUsage,
  pricing: ModelPricing
): number {
  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost =
    (tokens.outputTokens / 1_000_000) * pricing.outputPerMillion;
  // Cache tokens are typically discounted - using 25% of input rate
  const cacheCost =
    ((tokens.cacheCreationTokens + tokens.cacheReadTokens) / 1_000_000) *
    pricing.inputPerMillion *
    0.25;
  return inputCost + outputCost + cacheCost;
}

/** Create empty token usage */
export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0
  };
}
