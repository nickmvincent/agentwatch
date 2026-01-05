import { describe, expect, test } from "bun:test";
import {
  MODEL_PRICING,
  type TokenUsage,
  calculateCost,
  emptyTokenUsage,
  getModelPricing
} from "../src/types/cost";

describe("MODEL_PRICING", () => {
  test("has pricing for Claude 4 family", () => {
    expect(MODEL_PRICING["claude-opus-4"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-4"]).toBeDefined();
  });

  test("has pricing for Claude 4.5 family", () => {
    expect(MODEL_PRICING["claude-opus-4-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-4-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5"]).toBeDefined();
  });

  test("has pricing for Claude 3.5 family", () => {
    expect(MODEL_PRICING["claude-sonnet-3-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-3-5"]).toBeDefined();
  });

  test("opus pricing is higher than sonnet", () => {
    const opus = MODEL_PRICING["claude-opus-4"];
    const sonnet = MODEL_PRICING["claude-sonnet-4"];
    expect(opus.inputPerMillion).toBeGreaterThan(sonnet.inputPerMillion);
    expect(opus.outputPerMillion).toBeGreaterThan(sonnet.outputPerMillion);
  });
});

describe("getModelPricing", () => {
  test("returns exact match for known models", () => {
    const pricing = getModelPricing("claude-sonnet-4");
    expect(pricing.inputPerMillion).toBe(3);
    expect(pricing.outputPerMillion).toBe(15);
  });

  test("strips date suffix from model name", () => {
    const pricing = getModelPricing("claude-sonnet-4-20250514");
    expect(pricing.inputPerMillion).toBe(3);
    expect(pricing.outputPerMillion).toBe(15);
  });

  test("handles opus with date suffix", () => {
    const pricing = getModelPricing("claude-opus-4-5-20251101");
    expect(pricing.inputPerMillion).toBe(15);
    expect(pricing.outputPerMillion).toBe(75);
  });

  test("returns default sonnet pricing for unknown models", () => {
    const pricing = getModelPricing("unknown-model-xyz");
    expect(pricing.inputPerMillion).toBe(3);
    expect(pricing.outputPerMillion).toBe(15);
  });

  test("handles partial matches", () => {
    // Should match claude-haiku-4-5
    const pricing = getModelPricing("claude-haiku-4-5-20251201");
    expect(pricing.inputPerMillion).toBe(0.8);
    expect(pricing.outputPerMillion).toBe(4);
  });
});

describe("calculateCost", () => {
  test("calculates cost for input tokens only", () => {
    const tokens: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0
    };
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    expect(cost).toBe(3);
  });

  test("calculates cost for output tokens only", () => {
    const tokens: TokenUsage = {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0
    };
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    expect(cost).toBe(15);
  });

  test("calculates combined input and output cost", () => {
    const tokens: TokenUsage = {
      inputTokens: 500_000,
      outputTokens: 100_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0
    };
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    // (500k/1M * 3) + (100k/1M * 15) = 1.5 + 1.5 = 3.0
    expect(cost).toBe(3.0);
  });

  test("includes cache tokens at discounted rate", () => {
    const tokens: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 1_000_000,
      cacheReadTokens: 0
    };
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    // Cache at 25% of input rate: 1M * 3 * 0.25 = 0.75
    expect(cost).toBe(0.75);
  });

  test("handles realistic usage scenario", () => {
    const tokens: TokenUsage = {
      inputTokens: 10_000,
      outputTokens: 2_000,
      cacheCreationTokens: 5_000,
      cacheReadTokens: 3_000
    };
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    // Input: 10k/1M * 3 = 0.03
    // Output: 2k/1M * 15 = 0.03
    // Cache: (5k+3k)/1M * 3 * 0.25 = 0.006
    // Total: 0.066
    expect(cost).toBeCloseTo(0.066, 4);
  });

  test("returns 0 for empty usage", () => {
    const tokens = emptyTokenUsage();
    const pricing = { inputPerMillion: 3, outputPerMillion: 15 };

    const cost = calculateCost(tokens, pricing);
    expect(cost).toBe(0);
  });
});

describe("emptyTokenUsage", () => {
  test("returns all zeros", () => {
    const usage = emptyTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheCreationTokens).toBe(0);
    expect(usage.cacheReadTokens).toBe(0);
  });
});
