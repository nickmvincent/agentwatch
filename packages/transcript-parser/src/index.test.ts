import { describe, expect, test } from "bun:test";
import {
  discoverTranscripts,
  detectAgent,
  parseTranscriptId,
  estimateCost,
  formatCost,
  formatTokens,
  AGENT_CONFIGS
} from "./index";

describe("transcript-parser", () => {
  describe("AGENT_CONFIGS", () => {
    test("has correct config for claude", () => {
      expect(AGENT_CONFIGS.claude).toEqual({
        base: ".claude/projects",
        extension: ".jsonl",
        format: "jsonl"
      });
    });

    test("has correct config for codex", () => {
      expect(AGENT_CONFIGS.codex).toEqual({
        base: ".codex/sessions",
        extension: ".jsonl",
        format: "jsonl"
      });
    });

    test("has correct config for gemini", () => {
      expect(AGENT_CONFIGS.gemini).toEqual({
        base: ".gemini/tmp",
        extension: ".json",
        format: "json"
      });
    });
  });

  describe("detectAgent", () => {
    test("detects claude from path", () => {
      expect(detectAgent("/Users/test/.claude/projects/foo/bar.jsonl")).toBe(
        "claude"
      );
    });

    test("detects codex from path", () => {
      expect(
        detectAgent("/Users/test/.codex/sessions/2024/01/01/file.jsonl")
      ).toBe("codex");
    });

    test("detects gemini from path", () => {
      expect(
        detectAgent("/Users/test/.gemini/tmp/abc/chats/session.json")
      ).toBe("gemini");
    });

    test("returns null for unknown path", () => {
      expect(detectAgent("/Users/test/random/path.txt")).toBeNull();
    });
  });

  describe("parseTranscriptId", () => {
    test("parses simple ID", () => {
      expect(parseTranscriptId("claude:session-123")).toEqual({
        agent: "claude",
        fileName: "session-123"
      });
    });

    test("parses gemini ID with hash", () => {
      expect(parseTranscriptId("gemini:abc123:session-456")).toEqual({
        agent: "gemini",
        hash: "abc123",
        fileName: "session-456"
      });
    });

    test("throws for invalid ID", () => {
      expect(() => parseTranscriptId("invalid")).toThrow();
    });

    test("throws for unknown agent", () => {
      expect(() => parseTranscriptId("unknown:file")).toThrow();
    });
  });

  describe("estimateCost", () => {
    test("calculates claude cost", () => {
      const cost = estimateCost(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        "claude"
      );
      expect(cost).toBe(18); // $3 input + $15 output
    });

    test("calculates codex cost", () => {
      const cost = estimateCost(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        "codex"
      );
      expect(cost).toBe(12.5); // $2.5 input + $10 output
    });

    test("calculates gemini cost", () => {
      const cost = estimateCost(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        "gemini"
      );
      expect(cost).toBe(0.5); // $0.1 input + $0.4 output
    });
  });

  describe("formatCost", () => {
    test("formats small costs in cents", () => {
      expect(formatCost(0.005)).toBe("$0.50¢");
    });

    test("formats larger costs in dollars", () => {
      expect(formatCost(1.5)).toBe("$1.50");
    });
  });

  describe("formatTokens", () => {
    test("formats small numbers as-is", () => {
      expect(formatTokens(500)).toBe("500");
    });

    test("formats thousands with K", () => {
      expect(formatTokens(5000)).toBe("5.0K");
    });

    test("formats millions with M", () => {
      expect(formatTokens(5_000_000)).toBe("5.0M");
    });
  });

  describe("discoverTranscripts", () => {
    test(
      "returns array of transcripts",
      async () => {
        const transcripts = await discoverTranscripts({ limit: 5 });
        expect(Array.isArray(transcripts)).toBe(true);
      },
      { timeout: 30000 }
    );

    test(
      "filters by agent",
      async () => {
        const transcripts = await discoverTranscripts({
          agents: ["claude"],
          limit: 5
        });
        for (const t of transcripts) {
          expect(t.agent).toBe("claude");
        }
      },
      { timeout: 30000 }
    );
  });
});
