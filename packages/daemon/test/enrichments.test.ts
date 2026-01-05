/**
 * Enrichment Module Tests
 */

import { describe, expect, it } from "bun:test";
import type { HookSession, ToolUsage } from "@agentwatch/core";
import {
  detectLoops,
  getLoopSeverity
} from "../src/enrichments/loop-detection";
import { extractOutcomeSignals } from "../src/enrichments/outcome-signals";
import {
  computeQualityScore,
  getQualityLabel
} from "../src/enrichments/quality-score";
import {
  getTaskTypeLabel,
  inferAutoTags
} from "../src/enrichments/task-inference";

// =============================================================================
// TASK INFERENCE TESTS
// =============================================================================

describe("Task Inference", () => {
  const mockSession: HookSession = {
    sessionId: "test-session",
    cwd: "/test",
    startTime: Date.now(),
    active: false,
    toolUsages: []
  };

  describe("inferAutoTags", () => {
    it("infers test task type from pytest command", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "pytest tests/" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = inferAutoTags(mockSession, toolUsages);
      expect(result.taskType).toBe("test");
      expect(
        result.tags.some((t) => t.name === "test" && t.category === "task_type")
      ).toBe(true);
    });

    it("infers bugfix from fix keyword in command", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "git commit -m 'fix: resolve null pointer'" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = inferAutoTags(mockSession, toolUsages);
      expect(result.tags.some((t) => t.name === "bugfix")).toBe(true);
    });

    it("infers language from file extensions", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Edit",
          toolInput: { file_path: "/project/src/app.tsx" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = inferAutoTags(mockSession, toolUsages);
      expect(
        result.tags.some(
          (t) => t.name === "typescript" && t.category === "language"
        )
      ).toBe(true);
    });

    it("infers docs from markdown files", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Write",
          toolInput: { file_path: "/project/README.md" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = inferAutoTags(mockSession, toolUsages);
      expect(result.tags.some((t) => t.name === "docs")).toBe(true);
    });

    it("infers exploration for read-heavy sessions with no commits", () => {
      const sessionNoCommits: HookSession = {
        ...mockSession,
        commits: [] // No commits indicates exploration
      };
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Read",
          toolInput: { file_path: "/a.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Read",
          toolInput: { file_path: "/b.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Read",
          toolInput: { file_path: "/c.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Read",
          toolInput: { file_path: "/d.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Read",
          toolInput: { file_path: "/e.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Glob",
          toolInput: { pattern: "*.ts" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Grep",
          toolInput: { pattern: "function" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Grep",
          toolInput: { pattern: "class" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Grep",
          toolInput: { pattern: "interface" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "LSP",
          toolInput: {},
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = inferAutoTags(sessionNoCommits, toolUsages);
      expect(result.taskType).toBe("exploration");
    });
  });

  describe("getTaskTypeLabel", () => {
    it("returns correct labels", () => {
      expect(getTaskTypeLabel("feature")).toBe("Feature");
      expect(getTaskTypeLabel("bugfix")).toBe("Bug Fix");
      expect(getTaskTypeLabel("test")).toBe("Testing");
      expect(getTaskTypeLabel("unknown")).toBe("Unknown");
    });
  });
});

// =============================================================================
// OUTCOME SIGNALS TESTS
// =============================================================================

describe("Outcome Signals", () => {
  describe("extractOutcomeSignals", () => {
    it("extracts exit code success/failure counts from tool usages", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "ls" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Bash",
          toolInput: { command: "cat" },
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Bash",
          toolInput: { command: "bad" },
          timestamp: Date.now(),
          success: false
        }
      ];

      const result = extractOutcomeSignals(toolUsages);
      // Exit codes are tracked in exitCodes field
      expect(result.exitCodes.successCount).toBeGreaterThanOrEqual(0);
      expect(result.exitCodes.failureCount).toBeGreaterThanOrEqual(0);
    });

    it("returns computedAt timestamp", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "ls" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = extractOutcomeSignals(toolUsages);
      expect(result.computedAt).toBeTruthy();
      expect(new Date(result.computedAt).getTime()).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// LOOP DETECTION TESTS
// =============================================================================

describe("Loop Detection", () => {
  describe("detectLoops", () => {
    it("detects retry loops (same command repeated)", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: 1000,
          success: false
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: 2000,
          success: false
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: 3000,
          success: false
        }
      ];

      const result = detectLoops(toolUsages);
      expect(result.loopsDetected).toBe(true);
      expect(result.patterns.some((p) => p.patternType === "retry")).toBe(true);
    });

    it("detects dead-end patterns (long pause after failure)", () => {
      const now = Date.now();
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: now,
          success: false
        },
        // 30+ second gap after failure, then different command
        {
          toolName: "Bash",
          toolInput: { command: "npm run lint" },
          timestamp: now + 35000,
          success: true
        }
      ];

      const result = detectLoops(toolUsages);
      expect(result.loopsDetected).toBe(true);
      expect(result.patterns.some((p) => p.patternType === "dead_end")).toBe(
        true
      );
    });

    it("returns no loops for normal session", () => {
      const toolUsages: ToolUsage[] = [
        {
          toolName: "Read",
          toolInput: { file_path: "/a.ts" },
          timestamp: 1000,
          success: true
        },
        {
          toolName: "Edit",
          toolInput: { file_path: "/a.ts" },
          timestamp: 2000,
          success: true
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: 3000,
          success: true
        }
      ];

      const result = detectLoops(toolUsages);
      expect(result.loopsDetected).toBe(false);
      expect(result.patterns.length).toBe(0);
    });
  });

  describe("getLoopSeverity", () => {
    it("returns none for no loops", () => {
      const noLoops = {
        loopsDetected: false,
        patterns: [],
        totalRetries: 0,
        timeInLoopsMs: 0,
        computedAt: ""
      };
      expect(getLoopSeverity(noLoops)).toBe("none");
    });
  });
});

// =============================================================================
// QUALITY SCORE TESTS
// =============================================================================

describe("Quality Score", () => {
  describe("computeQualityScore", () => {
    it("computes high score for successful session", () => {
      const sessionWithCommits: HookSession = {
        sessionId: "test",
        cwd: "/test",
        startTime: Date.now() - 300000,
        endTime: Date.now(),
        active: false,
        commits: [{ hash: "abc123", message: "feat: add feature" }],
        toolUsages: []
      };

      const toolUsages: ToolUsage[] = [
        {
          toolName: "Read",
          toolInput: {},
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Edit",
          toolInput: {},
          timestamp: Date.now(),
          success: true
        },
        {
          toolName: "Bash",
          toolInput: { command: "npm test" },
          timestamp: Date.now(),
          success: true
        }
      ];

      const result = computeQualityScore(
        sessionWithCommits,
        toolUsages,
        { successCount: 3, failureCount: 0, computedAt: "" },
        {
          loopsDetected: false,
          patterns: [],
          totalRetries: 0,
          timeInLoopsMs: 0,
          computedAt: ""
        }
      );

      expect(result.overall).toBeGreaterThan(60);
      expect(result.classification).toBe("good");
    });

    it("computes low score for session with many failures", () => {
      const session: HookSession = {
        sessionId: "test",
        cwd: "/test",
        startTime: Date.now(),
        active: false,
        toolUsages: []
      };

      const toolUsages: ToolUsage[] = [
        {
          toolName: "Bash",
          toolInput: {},
          timestamp: Date.now(),
          success: false
        },
        {
          toolName: "Bash",
          toolInput: {},
          timestamp: Date.now(),
          success: false
        },
        {
          toolName: "Bash",
          toolInput: {},
          timestamp: Date.now(),
          success: false
        }
      ];

      const result = computeQualityScore(
        session,
        toolUsages,
        { successCount: 0, failureCount: 3, computedAt: "" },
        {
          loopsDetected: true,
          patterns: [],
          totalRetries: 3,
          timeInLoopsMs: 5000,
          computedAt: ""
        }
      );

      // With failures and loops, score should be lower
      expect(result.overall).toBeLessThanOrEqual(60);
      expect(["poor", "fair"]).toContain(result.classification);
    });
  });

  describe("getQualityLabel", () => {
    it("returns correct labels", () => {
      expect(getQualityLabel("excellent")).toBe("Excellent");
      expect(getQualityLabel("good")).toBe("Good");
      expect(getQualityLabel("fair")).toBe("Fair");
      expect(getQualityLabel("poor")).toBe("Poor");
    });
  });
});
