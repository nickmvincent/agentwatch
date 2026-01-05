/**
 * Cost estimation for AI coding assistant transcripts.
 *
 * CAVEAT: These are rough ESTIMATES only, not actual billing.
 * Uses hardcoded pricing which may be outdated.
 * Does not account for model variants, caching, or API discounts.
 */

import type { AgentType, TokenUsage } from "./types";

/** Pricing per million tokens (input, output) */
const PRICING: Record<AgentType, { input: number; output: number }> = {
  // Claude Sonnet pricing estimate: $3/M input, $15/M output
  claude: { input: 3, output: 15 },
  // GPT-4o pricing estimate: $2.50/M input, $10/M output
  codex: { input: 2.5, output: 10 },
  // Gemini 2.0 Flash pricing estimate: $0.10/M input, $0.40/M output
  gemini: { input: 0.1, output: 0.4 }
};

/**
 * Estimate cost in USD for a given token usage and agent.
 */
export function estimateCost(usage: TokenUsage, agent: AgentType): number {
  const pricing = PRICING[agent];
  if (!pricing) return 0;

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Format a cost as a human-readable string.
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 100).toFixed(2)}¢`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format token count with K/M suffixes.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * Get pricing info for an agent.
 */
export function getPricing(
  agent: AgentType
): { input: number; output: number } | null {
  return PRICING[agent] || null;
}
