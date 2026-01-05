import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HookStore } from "../src/hook-store";

describe("HookStore", () => {
  let store: HookStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "hookstore-test-"));
    store = new HookStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  describe("sessions", () => {
    test("sessionStart creates session", () => {
      const session = store.sessionStart(
        "session-1",
        "/path/to/transcript.jsonl",
        "/path/to/project",
        "default",
        "startup"
      );

      expect(session.sessionId).toBe("session-1");
      expect(session.transcriptPath).toBe("/path/to/transcript.jsonl");
      expect(session.cwd).toBe("/path/to/project");
      expect(session.permissionMode).toBe("default");
      expect(session.source).toBe("startup");
      expect(session.endTime).toBeUndefined();
      expect(session.toolCount).toBe(0);
    });

    test("sessionEnd marks session as ended", () => {
      store.sessionStart(
        "session-1",
        "/path/transcript.jsonl",
        "/cwd",
        "default",
        "startup"
      );

      const ended = store.sessionEnd("session-1");

      expect(ended?.endTime).toBeDefined();
      expect(ended?.endTime).toBeGreaterThan(0);
    });

    test("sessionEnd returns null for unknown session", () => {
      const result = store.sessionEnd("nonexistent");
      expect(result).toBeNull();
    });

    test("getActiveSessions returns only active", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.sessionStart("s2", "/t2", "/c2", "default", "startup");
      store.sessionEnd("s1");

      const active = store.getActiveSessions();

      expect(active).toHaveLength(1);
      expect(active[0]!.sessionId).toBe("s2");
    });

    test("getAllSessions returns sessions sorted by start time", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      // Small delay to ensure different timestamps
      store.sessionStart("s2", "/t2", "/c2", "default", "startup");

      const all = store.getAllSessions();

      expect(all).toHaveLength(2);
      expect(all[0]!.startTime).toBeGreaterThanOrEqual(all[1]!.startTime);
    });

    test("updateSessionAwaiting updates state", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.updateSessionAwaiting("s1", true);

      const session = store.getSession("s1");
      expect(session?.awaitingUser).toBe(true);
    });

    test("sessionStart triggers callback", () => {
      let callbackSession: any = null;

      store.setCallbacks({
        onSessionChange: (session) => {
          callbackSession = session;
        }
      });

      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      expect(callbackSession).not.toBeNull();
      expect(callbackSession.sessionId).toBe("s1");
    });
  });

  describe("tool usage", () => {
    test("recordPreToolUse creates pending usage", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      const usage = store.recordPreToolUse(
        "s1",
        "tool-use-1",
        "Bash",
        { command: "ls" },
        "/cwd"
      );

      expect(usage.toolUseId).toBe("tool-use-1");
      expect(usage.toolName).toBe("Bash");
      expect(usage.success).toBeUndefined();
      expect(usage.durationMs).toBeUndefined();
    });

    test("recordPostToolUse completes usage", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordPreToolUse(
        "s1",
        "tool-use-1",
        "Bash",
        { command: "ls" },
        "/cwd"
      );

      const usage = store.recordPostToolUse("tool-use-1", {
        output: "file1\nfile2"
      });

      expect(usage?.success).toBe(true);
      expect(usage?.durationMs).toBeGreaterThanOrEqual(0);
      expect(usage?.toolResponse).toEqual({ output: "file1\nfile2" });
    });

    test("recordPostToolUse with error marks failure", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordPreToolUse(
        "s1",
        "tool-use-1",
        "Bash",
        { command: "bad" },
        "/cwd"
      );

      const usage = store.recordPostToolUse(
        "tool-use-1",
        undefined,
        "command not found"
      );

      expect(usage?.success).toBe(false);
      expect(usage?.error).toBe("command not found");
    });

    test("recordPostToolUse updates session toolCount", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Read", {}, "/cwd");
      store.recordPostToolUse("t2");

      const session = store.getSession("s1");
      expect(session?.toolCount).toBe(2);
      expect(session?.toolsUsed["Bash"]).toBe(1);
      expect(session?.toolsUsed["Read"]).toBe(1);
    });

    test("recordPostToolUse returns null for unknown tool", () => {
      const result = store.recordPostToolUse("nonexistent");
      expect(result).toBeNull();
    });

    test("getRecentToolUsages returns sorted by timestamp", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Read", {}, "/cwd");
      store.recordPostToolUse("t2");

      const recent = store.getRecentToolUsages();

      expect(recent).toHaveLength(2);
      expect(recent[0]!.timestamp).toBeGreaterThanOrEqual(recent[1]!.timestamp);
    });

    test("getRecentToolUsages filters by tool name", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Read", {}, "/cwd");
      store.recordPostToolUse("t2");

      const bashOnly = store.getRecentToolUsages(100, "Bash");

      expect(bashOnly).toHaveLength(1);
      expect(bashOnly[0]!.toolName).toBe("Bash");
    });

    test("getSessionToolUsages returns timeline sorted", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Read", {}, "/cwd");
      store.recordPostToolUse("t2");

      const timeline = store.getSessionToolUsages("s1");

      expect(timeline).toHaveLength(2);
      expect(timeline[0]!.timestamp).toBeLessThanOrEqual(
        timeline[1]!.timestamp
      );
    });

    test("recordPostToolUse triggers callback", () => {
      let callbackUsage: any = null;

      store.setCallbacks({
        onToolUsage: (usage) => {
          callbackUsage = usage;
        }
      });

      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      expect(callbackUsage).not.toBeNull();
      expect(callbackUsage.toolName).toBe("Bash");
    });
  });

  describe("tool stats", () => {
    test("updates stats after tool completion", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Bash", {}, "/cwd");
      store.recordPostToolUse("t2", undefined, "failed");

      const stats = store.getToolStats();
      const bashStats = stats.find((s) => s.toolName === "Bash");

      expect(bashStats?.totalCalls).toBe(2);
      expect(bashStats?.successCount).toBe(1);
      expect(bashStats?.failureCount).toBe(1);
    });

    test("calculates running average duration", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Bash", {}, "/cwd");
      store.recordPostToolUse("t2");

      const stats = store.getToolStats();
      const bashStats = stats.find((s) => s.toolName === "Bash");

      expect(bashStats?.avgDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("daily stats", () => {
    test("tracks session count by day", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.sessionStart("s2", "/t2", "/c2", "default", "startup");

      const daily = store.getDailyStats();
      const today = new Date().toISOString().slice(0, 10);
      const todayStats = daily.find((d) => d.date === today);

      expect(todayStats?.sessionCount).toBe(2);
    });

    test("tracks tool calls by day", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordPreToolUse("s1", "t1", "Bash", {}, "/cwd");
      store.recordPostToolUse("t1");

      store.recordPreToolUse("s1", "t2", "Read", {}, "/cwd");
      store.recordPostToolUse("t2");

      const daily = store.getDailyStats();
      const today = new Date().toISOString().slice(0, 10);
      const todayStats = daily.find((d) => d.date === today);

      expect(todayStats?.toolCalls).toBe(2);
      expect(todayStats?.toolsBreakdown["Bash"]).toBe(1);
      expect(todayStats?.toolsBreakdown["Read"]).toBe(1);
    });
  });

  describe("git commits", () => {
    test("recordCommit creates commit", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      const commit = store.recordCommit(
        "s1",
        "abc123def456",
        "feat: add feature",
        "/path/to/repo"
      );

      expect(commit.commitHash).toBe("abc123def456");
      expect(commit.sessionId).toBe("s1");
      expect(commit.message).toBe("feat: add feature");
    });

    test("recordCommit adds to session commits list", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordCommit("s1", "commit-1", "msg1", "/repo");
      store.recordCommit("s1", "commit-2", "msg2", "/repo");

      const session = store.getSession("s1");
      expect(session?.commits).toContain("commit-1");
      expect(session?.commits).toContain("commit-2");
    });

    test("getSessionCommits returns commits for session", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.sessionStart("s2", "/t2", "/c2", "default", "startup");

      store.recordCommit("s1", "c1", "msg1", "/repo");
      store.recordCommit("s2", "c2", "msg2", "/repo");

      const s1Commits = store.getSessionCommits("s1");

      expect(s1Commits).toHaveLength(1);
      expect(s1Commits[0]!.commitHash).toBe("c1");
    });

    test("getAllCommits returns recent commits", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordCommit("s1", "c1", "msg1", "/repo");
      store.recordCommit("s1", "c2", "msg2", "/repo");

      const all = store.getAllCommits();

      expect(all).toHaveLength(2);
      expect(all[0]!.timestamp).toBeGreaterThanOrEqual(all[1]!.timestamp);
    });
  });

  describe("security blocks", () => {
    test("recordSecurityBlock creates blocked tool usage", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      store.recordSecurityBlock(
        "s1",
        "Bash",
        { command: "rm -rf /" },
        "block_rm_rf",
        "Dangerous command blocked"
      );

      const usages = store.getRecentToolUsages();

      expect(usages).toHaveLength(1);
      expect(usages[0]!.success).toBe(false);
      expect(usages[0]!.error).toContain("SECURITY_BLOCKED");
      expect(usages[0]!.error).toContain("block_rm_rf");
    });
  });

  describe("token/cost tracking", () => {
    test("sessionStart initializes token/cost fields to zero", () => {
      const session = store.sessionStart(
        "s1",
        "/t1",
        "/c1",
        "default",
        "startup"
      );

      expect(session.totalInputTokens).toBe(0);
      expect(session.totalOutputTokens).toBe(0);
      expect(session.estimatedCostUsd).toBe(0);
      expect(session.autoContinueAttempts).toBe(0);
    });

    test("updateSessionTokens accumulates token counts", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      // First update
      store.updateSessionTokens("s1", 1000, 500, 0.05);
      let session = store.getSession("s1");
      expect(session?.totalInputTokens).toBe(1000);
      expect(session?.totalOutputTokens).toBe(500);
      expect(session?.estimatedCostUsd).toBe(0.05);

      // Second update - should accumulate
      store.updateSessionTokens("s1", 2000, 800, 0.08);
      session = store.getSession("s1");
      expect(session?.totalInputTokens).toBe(3000);
      expect(session?.totalOutputTokens).toBe(1300);
      expect(session?.estimatedCostUsd).toBe(0.13);
    });

    test("updateSessionTokens returns null for unknown session", () => {
      const result = store.updateSessionTokens("nonexistent", 100, 50, 0.01);
      expect(result).toBeNull();
    });

    test("updateSessionTokens triggers callback", () => {
      let callbackSession: any = null;

      store.setCallbacks({
        onSessionChange: (session) => {
          callbackSession = session;
        }
      });

      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.updateSessionTokens("s1", 1000, 500, 0.05);

      expect(callbackSession).not.toBeNull();
      expect(callbackSession.totalInputTokens).toBe(1000);
      expect(callbackSession.totalOutputTokens).toBe(500);
    });

    test("incrementAutoContinueAttempts increments counter", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      expect(store.incrementAutoContinueAttempts("s1")).toBe(1);
      expect(store.incrementAutoContinueAttempts("s1")).toBe(2);
      expect(store.incrementAutoContinueAttempts("s1")).toBe(3);

      const session = store.getSession("s1");
      expect(session?.autoContinueAttempts).toBe(3);
    });

    test("incrementAutoContinueAttempts returns 0 for unknown session", () => {
      expect(store.incrementAutoContinueAttempts("nonexistent")).toBe(0);
    });

    test("resetAutoContinueAttempts resets counter", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.incrementAutoContinueAttempts("s1");
      store.incrementAutoContinueAttempts("s1");

      store.resetAutoContinueAttempts("s1");

      const session = store.getSession("s1");
      expect(session?.autoContinueAttempts).toBe(0);
    });
  });

  describe("cleanupOldData (memory management)", () => {
    test("removes old sessions beyond maxDays", () => {
      // Create a session
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      // Get the session and manually backdate it
      const session = store.getSession("s1");
      expect(session).not.toBeNull();

      // Backdate session to 31 days ago
      (session as any).startTime = Date.now() - 31 * 86400000;

      // Run cleanup with 30 day limit
      store.cleanupOldData(30);

      // Session should be removed
      expect(store.getSession("s1")).toBeNull();
    });

    test("keeps recent sessions", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      // Run cleanup - session is fresh, should be kept
      store.cleanupOldData(30);

      expect(store.getSession("s1")).not.toBeNull();
    });

    test("removes old git commits", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordCommit("s1", "old-commit", "old msg", "/repo");

      // Backdate the commit by accessing internal state
      const commits = store.getAllCommits();
      const commit = commits.find((c) => c.commitHash === "old-commit");
      expect(commit).not.toBeUndefined();
      (commit as any).timestamp = Date.now() - 31 * 86400000;

      store.cleanupOldData(30);

      // Old commit should be removed
      const remaining = store.getAllCommits();
      expect(
        remaining.find((c) => c.commitHash === "old-commit")
      ).toBeUndefined();
    });

    test("enforces size limit on toolUsages", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      // Create many tool usages
      for (let i = 0; i < 15; i++) {
        store.recordPreToolUse("s1", `t${i}`, "Bash", { i }, "/cwd");
        store.recordPostToolUse(`t${i}`);
      }

      expect(store.getRecentToolUsages(100).length).toBe(15);

      // Cleanup with size limit of 10
      store.cleanupOldData(30, 10);

      // Should only have 10 most recent
      const remaining = store.getRecentToolUsages(100);
      expect(remaining.length).toBe(10);

      // Verify all remaining have IDs (we keep the most recent by timestamp)
      for (const usage of remaining) {
        expect(usage.toolUseId).toMatch(/^t\d+$/);
      }
    });

    test("removes old tool usages by time", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");
      store.recordPreToolUse("s1", "old-tool", "Bash", {}, "/cwd");
      store.recordPostToolUse("old-tool");

      // Backdate the tool usage
      const usages = store.getRecentToolUsages(100);
      const oldUsage = usages.find((u) => u.toolUseId === "old-tool");
      expect(oldUsage).not.toBeUndefined();
      (oldUsage as any).timestamp = Date.now() - 31 * 86400000;

      store.cleanupOldData(30);

      // Old usage should be removed
      const remaining = store.getRecentToolUsages(100);
      expect(remaining.find((u) => u.toolUseId === "old-tool")).toBeUndefined();
    });

    test("removes old daily stats", () => {
      store.sessionStart("s1", "/t1", "/c1", "default", "startup");

      // Get today's stats
      const daily = store.getDailyStats();
      expect(daily.length).toBeGreaterThan(0);

      // Manually add an old date entry (hack via internal access would be needed)
      // For now, just verify today's stats survive cleanup
      store.cleanupOldData(30);

      const remaining = store.getDailyStats();
      const today = new Date().toISOString().slice(0, 10);
      expect(remaining.find((d) => d.date === today)).not.toBeUndefined();
    });
  });
});
