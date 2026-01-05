import { describe, expect, test } from "bun:test";
import { parseTranscriptContent } from "../src/parsers/transcript";

describe("parseTranscriptContent", () => {
  test("parses single assistant message with usage", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-20250514",
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      },
      timestamp: "2025-12-29T15:00:00.000Z"
    });

    const result = parseTranscriptContent("test-session", content);

    expect(result.sessionId).toBe("test-session");
    expect(result.totalInputTokens).toBe(1000);
    expect(result.totalOutputTokens).toBe(200);
    expect(result.messageCount).toBe(1);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });

  test("aggregates tokens from multiple messages", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 800,
            output_tokens: 150,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      })
    ];
    const content = lines.join("\n");

    const result = parseTranscriptContent("test-session", content);

    expect(result.totalInputTokens).toBe(1300);
    expect(result.totalOutputTokens).toBe(250);
    expect(result.messageCount).toBe(2);
  });

  test("handles cache tokens", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-20250514",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 500
        }
      }
    });

    const result = parseTranscriptContent("test-session", content);

    expect(result.totalCacheCreationTokens).toBe(1000);
    expect(result.totalCacheReadTokens).toBe(500);
  });

  test("tracks model breakdown", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-5-20251101",
          usage: {
            input_tokens: 200,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      })
    ];
    const content = lines.join("\n");

    const result = parseTranscriptContent("test-session", content);

    expect(Object.keys(result.modelBreakdown)).toHaveLength(2);
    expect(result.modelBreakdown["claude-sonnet-4-20250514"]).toBeDefined();
    expect(result.modelBreakdown["claude-opus-4-5-20251101"]).toBeDefined();
  });

  test("ignores non-assistant messages", () => {
    const lines = [
      JSON.stringify({ type: "user", content: "Hello" }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      }),
      JSON.stringify({ type: "system", content: "Context" })
    ];
    const content = lines.join("\n");

    const result = parseTranscriptContent("test-session", content);

    expect(result.messageCount).toBe(1);
    expect(result.totalInputTokens).toBe(100);
  });

  test("skips malformed JSON lines", () => {
    const lines = [
      "not valid json",
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0
          }
        }
      }),
      "{ incomplete json"
    ];
    const content = lines.join("\n");

    const result = parseTranscriptContent("test-session", content);

    // Should only count the valid message
    expect(result.messageCount).toBe(1);
  });

  test("handles empty content", () => {
    const result = parseTranscriptContent("test-session", "");

    expect(result.messageCount).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
  });

  test("handles messages without usage", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-20250514"
        // No usage field
      }
    });

    const result = parseTranscriptContent("test-session", content);

    expect(result.messageCount).toBe(0);
    expect(result.totalInputTokens).toBe(0);
  });

  test("calculates realistic cost for sonnet", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-20250514",
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 100_000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      }
    });

    const result = parseTranscriptContent("test-session", content);

    // Sonnet: $3/M input, $15/M output
    // 1M * 3 + 100k * 15 = 3 + 1.5 = $4.50
    expect(result.estimatedCostUsd).toBeCloseTo(4.5, 2);
  });

  test("calculates realistic cost for opus", () => {
    const content = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-opus-4-5-20251101",
        usage: {
          input_tokens: 100_000,
          output_tokens: 10_000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      }
    });

    const result = parseTranscriptContent("test-session", content);

    // Opus: $15/M input, $75/M output
    // 100k * 15/1M + 10k * 75/1M = 1.5 + 0.75 = $2.25
    expect(result.estimatedCostUsd).toBeCloseTo(2.25, 2);
  });
});
