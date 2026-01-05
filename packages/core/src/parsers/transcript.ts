/**
 * Claude Code transcript parser for cost estimation
 *
 * Parses JSONL transcript files to extract token usage and calculate costs.
 */

import { existsSync, readFileSync } from "fs";
import type {
  CostEstimate,
  SessionCostSummary,
  TokenUsage
} from "../types/cost";
import { calculateCost, emptyTokenUsage, getModelPricing } from "../types/cost";

/** Structure of a message entry in Claude Code transcripts */
interface TranscriptMessage {
  type: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  timestamp?: string;
}

/**
 * Parse a Claude Code transcript file and extract cost data
 * @param filePath - Path to the JSONL transcript file
 * @returns Cost summary or null if file doesn't exist/can't be parsed
 */
export function parseTranscriptFile(
  filePath: string
): SessionCostSummary | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    // Extract session ID from file path
    const sessionId =
      filePath.split("/").pop()?.replace(".jsonl", "") || "unknown";
    return parseTranscriptContent(sessionId, content);
  } catch {
    return null;
  }
}

/**
 * Parse transcript content string and extract cost data
 * @param sessionId - Session identifier
 * @param content - JSONL content as string
 * @returns Cost summary for the session
 */
export function parseTranscriptContent(
  sessionId: string,
  content: string
): SessionCostSummary {
  const lines = content.split("\n").filter((line) => line.trim());
  const modelUsage: Record<
    string,
    { tokens: TokenUsage; messageCount: number }
  > = {};

  for (const line of lines) {
    try {
      const entry: TranscriptMessage = JSON.parse(line);

      // Only process assistant messages with usage data
      if (entry.type !== "assistant" || !entry.message?.usage) {
        continue;
      }

      const model = entry.message.model || "unknown";
      const usage = entry.message.usage;

      if (!modelUsage[model]) {
        modelUsage[model] = {
          tokens: emptyTokenUsage(),
          messageCount: 0
        };
      }

      modelUsage[model].tokens.inputTokens += usage.input_tokens || 0;
      modelUsage[model].tokens.outputTokens += usage.output_tokens || 0;
      modelUsage[model].tokens.cacheCreationTokens +=
        usage.cache_creation_input_tokens || 0;
      modelUsage[model].tokens.cacheReadTokens +=
        usage.cache_read_input_tokens || 0;
      modelUsage[model].messageCount++;
    } catch {
      // Skip invalid JSON lines
      continue;
    }
  }

  // Build cost breakdown by model
  const modelBreakdown: Record<string, CostEstimate> = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let totalCost = 0;
  let totalMessages = 0;

  for (const [model, data] of Object.entries(modelUsage)) {
    const pricing = getModelPricing(model);
    const cost = calculateCost(data.tokens, pricing);

    modelBreakdown[model] = {
      sessionId,
      modelName: model,
      tokens: data.tokens,
      estimatedCostUsd: cost,
      messageCount: data.messageCount,
      calculatedAt: Date.now()
    };

    totalInput += data.tokens.inputTokens;
    totalOutput += data.tokens.outputTokens;
    totalCacheCreation += data.tokens.cacheCreationTokens;
    totalCacheRead += data.tokens.cacheReadTokens;
    totalCost += cost;
    totalMessages += data.messageCount;
  }

  return {
    sessionId,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheCreationTokens: totalCacheCreation,
    totalCacheReadTokens: totalCacheRead,
    estimatedCostUsd: totalCost,
    modelBreakdown,
    messageCount: totalMessages
  };
}

/**
 * Format cost as USD string
 * @param costUsd - Cost in USD
 * @returns Formatted string (e.g., "$1.23")
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format token count with K/M suffix
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "1.2K", "3.5M")
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}
