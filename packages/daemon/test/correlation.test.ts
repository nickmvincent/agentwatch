/**
 * Correlation Logic Tests
 *
 * Tests for correlating hook sessions, transcripts, and process snapshots.
 */

import { describe, expect, it } from "bun:test";
import type { HookSession, ToolUsage } from "@agentwatch/core";
import type { ProcessSnapshot } from "@agentwatch/monitor";
import {
  type Conversation,
  type MatchDetails,
  attachProcessSnapshots,
  correlateSessionsWithTranscripts,
  getCorrelationStats
} from "../src/correlation";
import type { LocalTranscript } from "../src/local-logs";

// =============================================================================
// MOCK DATA FACTORIES
// =============================================================================

function createMockHookSession(
  overrides: Partial<HookSession> = {}
): HookSession {
  return {
    sessionId: "session-1",
    cwd: "/projects/test",
    permissionMode: "default",
    transcriptPath: undefined,
    startTime: Date.now() - 3600000, // 1 hour ago
    active: false,
    endTime: Date.now() - 1800000, // 30 min ago
    toolCount: 10,
    commits: [],
    toolsUsed: ["Read", "Write", "Bash"],
    toolUsages: [],
    lastActivity: Date.now() - 1800000,
    ...overrides
  };
}

function createMockLocalTranscript(
  overrides: Partial<LocalTranscript> = {}
): LocalTranscript {
  return {
    id: "transcript-1",
    agent: "claude",
    path: "/home/user/.claude/projects/test/session-abc.jsonl",
    name: "Test Session",
    projectDir: "/projects/test",
    modifiedAt: Date.now() - 1800000,
    sizeBytes: 10240,
    messageCount: 25,
    startTime: Date.now() - 3600000,
    endTime: Date.now() - 1800000,
    ...overrides
  };
}

function createMockProcessSnapshot(
  overrides: Partial<ProcessSnapshot> = {}
): ProcessSnapshot {
  return {
    pid: 12345,
    agent: "claude",
    cwd: "/projects/test",
    cmdline: "/usr/bin/claude-code",
    exe: "/usr/bin/claude-code",
    timestamp: Date.now() - 2400000, // 40 min ago
    cpu_pct: 15,
    rss_kb: 512000,
    start_time: Date.now() - 3600000,
    ...overrides
  };
}

// =============================================================================
// CORRELATION TESTS
// =============================================================================

describe("correlateSessionsWithTranscripts", () => {
  it("should create exact match when transcript path matches", () => {
    const transcriptPath = "/home/user/.claude/projects/test/session-abc.jsonl";
    const hookSession = createMockHookSession({
      transcriptPath,
      cwd: "/projects/test"
    });
    const transcript = createMockLocalTranscript({
      path: transcriptPath,
      projectDir: "/projects/test"
    });

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      new Map()
    );

    expect(result.length).toBe(1);
    expect(result[0].matchType).toBe("exact");
    expect(result[0].matchDetails.pathMatch).toBe(true);
    expect(result[0].hookSession).toBeDefined();
    expect(result[0].transcript).toBeDefined();
  });

  it("should create confident match when time and cwd align", () => {
    const now = Date.now();
    const hookSession = createMockHookSession({
      sessionId: "session-1",
      cwd: "/projects/test",
      startTime: now - 3600000,
      transcriptPath: undefined // No direct path match
    });
    const transcript = createMockLocalTranscript({
      id: "transcript-1",
      projectDir: "/projects/test",
      startTime: now - 3600000 + 1000 // Within time window
    });

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      new Map()
    );

    expect(result.length).toBe(1);
    const match = result[0];
    expect(["confident", "uncertain"]).toContain(match.matchType);
    expect(match.matchDetails.cwdMatch).toBe(true);
    expect(match.matchDetails.timeMatch).toBe(true);
  });

  it("should create unmatched entries for orphaned sessions", () => {
    const hookSession = createMockHookSession({
      cwd: "/projects/project-a"
    });
    const transcript = createMockLocalTranscript({
      projectDir: "/projects/project-b" // Different project
    });

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      new Map()
    );

    // Should have 2 unmatched entries
    expect(result.length).toBe(2);
    const hookOnly = result.find((s) => s.hookSession && !s.transcript);
    const transcriptOnly = result.find((s) => s.transcript && !s.hookSession);
    expect(hookOnly).toBeDefined();
    expect(transcriptOnly).toBeDefined();
    expect(hookOnly?.matchType).toBe("unmatched");
    expect(transcriptOnly?.matchType).toBe("unmatched");
  });

  it("should include tool usages in correlated conversation", () => {
    const transcriptPath = "/home/user/.claude/projects/test/session-abc.jsonl";
    const sessionId = "session-with-tools";
    const hookSession = createMockHookSession({
      sessionId,
      transcriptPath,
      toolCount: 5
    });
    const transcript = createMockLocalTranscript({
      path: transcriptPath
    });
    const toolUsages: ToolUsage[] = [
      {
        toolUseId: "t1",
        toolName: "Read",
        timestamp: Date.now(),
        sessionId,
        cwd: "/projects/test"
      },
      {
        toolUseId: "t2",
        toolName: "Write",
        timestamp: Date.now(),
        sessionId,
        cwd: "/projects/test"
      }
    ];
    const toolUsageMap = new Map<string, ToolUsage[]>();
    toolUsageMap.set(sessionId, toolUsages);

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      toolUsageMap
    );

    expect(result.length).toBe(1);
    expect(result[0].toolUsages?.length).toBe(2);
  });

  it("should generate correct stats", () => {
    const hookSession1 = createMockHookSession({
      sessionId: "s1",
      transcriptPath: "/path/to/transcript1.jsonl"
    });
    const hookSession2 = createMockHookSession({
      sessionId: "s2",
      cwd: "/projects/orphan"
    });
    const transcript1 = createMockLocalTranscript({
      id: "t1",
      path: "/path/to/transcript1.jsonl"
    });
    const transcript2 = createMockLocalTranscript({
      id: "t2",
      projectDir: "/projects/unrelated"
    });

    const conversations = correlateSessionsWithTranscripts(
      [hookSession1, hookSession2],
      [transcript1, transcript2],
      new Map()
    );
    const stats = getCorrelationStats(conversations);

    expect(stats.total).toBe(3); // 1 exact + 1 hook-only + 1 transcript-only
    expect(stats.exact).toBe(1);
    expect(stats.hookOnly).toBe(1);
    expect(stats.transcriptOnly).toBe(1);
  });
});

describe("attachProcessSnapshots", () => {
  it("should attach process snapshots to conversations by cwd", () => {
    const conversation: Conversation = {
      correlationId: "conv-1",
      matchType: "exact",
      matchDetails: {
        pathMatch: true,
        timeMatch: true,
        cwdMatch: true,
        toolCountMatch: true,
        score: 100
      },
      startTime: Date.now() - 3600000,
      cwd: "/projects/test",
      agent: "claude"
    };
    const snapshot = createMockProcessSnapshot({
      cwd: "/projects/test",
      timestamp: Date.now() - 2400000
    });

    const result = attachProcessSnapshots([conversation], [snapshot]);

    expect(result.length).toBe(1);
    expect(result[0].processSnapshots?.length).toBe(1);
    expect(result[0].processSnapshots?.[0].pid).toBe(12345);
  });

  it("should only attach snapshots within time window", () => {
    const startTime = Date.now() - 3600000;
    const endTime = Date.now() - 1800000;
    const conversation: Conversation = {
      correlationId: "conv-1",
      matchType: "exact",
      matchDetails: {
        pathMatch: true,
        timeMatch: true,
        cwdMatch: true,
        toolCountMatch: true,
        score: 100
      },
      startTime,
      cwd: "/projects/test",
      agent: "claude",
      hookSession: createMockHookSession({
        startTime,
        endTime
      })
    };
    const snapshotInWindow = createMockProcessSnapshot({
      cwd: "/projects/test",
      timestamp: startTime + 600000 // 10 min after start
    });
    const snapshotOutOfWindow = createMockProcessSnapshot({
      cwd: "/projects/test",
      timestamp: startTime - 7200000 // 2 hours before start
    });

    const result = attachProcessSnapshots(
      [conversation],
      [snapshotInWindow, snapshotOutOfWindow]
    );

    expect(result[0].processSnapshots?.length).toBe(1);
    expect(result[0].processSnapshots?.[0].timestamp).toBe(
      snapshotInWindow.timestamp
    );
  });

  it("should not attach snapshots with different cwd", () => {
    const conversation: Conversation = {
      correlationId: "conv-1",
      matchType: "exact",
      matchDetails: {
        pathMatch: true,
        timeMatch: true,
        cwdMatch: true,
        toolCountMatch: true,
        score: 100
      },
      startTime: Date.now() - 3600000,
      cwd: "/projects/test",
      agent: "claude"
    };
    const snapshot = createMockProcessSnapshot({
      cwd: "/projects/other-project",
      timestamp: Date.now() - 2400000
    });

    const result = attachProcessSnapshots([conversation], [snapshot]);

    expect(result[0].processSnapshots).toBeUndefined();
  });

  it("should handle conversations without cwd", () => {
    const conversation: Conversation = {
      correlationId: "conv-1",
      matchType: "unmatched",
      matchDetails: {
        pathMatch: false,
        timeMatch: false,
        cwdMatch: false,
        toolCountMatch: false,
        score: 0
      },
      startTime: Date.now() - 3600000,
      cwd: null,
      agent: "claude"
    };
    const snapshot = createMockProcessSnapshot();

    const result = attachProcessSnapshots([conversation], [snapshot]);

    expect(result[0].processSnapshots).toBeUndefined();
  });
});

describe("match scoring", () => {
  it("should score exact path matches highest", () => {
    const transcriptPath = "/path/to/transcript.jsonl";
    const hookSession = createMockHookSession({
      transcriptPath
    });
    const transcript = createMockLocalTranscript({
      path: transcriptPath
    });

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      new Map()
    );

    expect(result[0].matchDetails.score).toBeGreaterThanOrEqual(90);
  });

  it("should give lower score for uncertain matches", () => {
    const now = Date.now();
    const hookSession = createMockHookSession({
      cwd: "/projects/test",
      startTime: now - 60000 // Different time window
    });
    const transcript = createMockLocalTranscript({
      projectDir: "/projects/test",
      startTime: now - 3600000 // Much earlier
    });

    const result = correlateSessionsWithTranscripts(
      [hookSession],
      [transcript],
      new Map()
    );

    // Should either match with low score or be unmatched
    const match = result.find((s) => s.hookSession && s.transcript);
    if (match) {
      expect(match.matchDetails.score).toBeLessThan(70);
    }
  });
});

describe("getCorrelationStats", () => {
  it("should count match types correctly", () => {
    const conversations: Conversation[] = [
      {
        correlationId: "c1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: Date.now(),
        cwd: "/a",
        agent: "claude",
        hookSession: createMockHookSession(),
        transcript: createMockLocalTranscript()
      },
      {
        correlationId: "c2",
        matchType: "confident",
        matchDetails: {
          pathMatch: false,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 75
        },
        startTime: Date.now(),
        cwd: "/b",
        agent: "claude",
        hookSession: createMockHookSession(),
        transcript: createMockLocalTranscript()
      },
      {
        correlationId: "c3",
        matchType: "uncertain",
        matchDetails: {
          pathMatch: false,
          timeMatch: false,
          cwdMatch: true,
          toolCountMatch: false,
          score: 45
        },
        startTime: Date.now(),
        cwd: "/c",
        agent: "claude",
        hookSession: createMockHookSession(),
        transcript: createMockLocalTranscript()
      },
      {
        correlationId: "c4",
        matchType: "unmatched",
        matchDetails: {
          pathMatch: false,
          timeMatch: false,
          cwdMatch: false,
          toolCountMatch: false,
          score: 0
        },
        startTime: Date.now(),
        cwd: "/d",
        agent: "claude",
        hookSession: createMockHookSession()
      },
      {
        correlationId: "c5",
        matchType: "unmatched",
        matchDetails: {
          pathMatch: false,
          timeMatch: false,
          cwdMatch: false,
          toolCountMatch: false,
          score: 0
        },
        startTime: Date.now(),
        cwd: "/e",
        agent: "claude",
        transcript: createMockLocalTranscript()
      }
    ];

    const stats = getCorrelationStats(conversations);

    expect(stats.total).toBe(5);
    expect(stats.exact).toBe(1);
    expect(stats.confident).toBe(1);
    expect(stats.uncertain).toBe(1);
    expect(stats.hookOnly).toBe(1);
    expect(stats.transcriptOnly).toBe(1);
  });

  it("should handle empty array", () => {
    const stats = getCorrelationStats([]);

    expect(stats.total).toBe(0);
    expect(stats.exact).toBe(0);
    expect(stats.confident).toBe(0);
    expect(stats.uncertain).toBe(0);
    expect(stats.hookOnly).toBe(0);
    expect(stats.transcriptOnly).toBe(0);
  });

  it("should count managed sessions", () => {
    const managedSession = {
      id: "ms-1",
      agent: "claude",
      cwd: "/projects/test",
      prompt: "Test prompt",
      startedAt: Date.now(),
      status: "running" as const
    };

    const conversations: Conversation[] = [
      {
        correlationId: "c1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: Date.now(),
        cwd: "/a",
        agent: "claude",
        hookSession: createMockHookSession(),
        transcript: createMockLocalTranscript(),
        managedSession
      },
      {
        correlationId: "c2",
        matchType: "unmatched",
        matchDetails: {
          pathMatch: false,
          timeMatch: false,
          cwdMatch: false,
          toolCountMatch: false,
          score: 0
        },
        startTime: Date.now(),
        cwd: "/b",
        agent: "claude",
        managedSession: { ...managedSession, id: "ms-2" }
      }
    ];

    const stats = getCorrelationStats(conversations);

    expect(stats.withManagedSession).toBe(2);
    expect(stats.managedOnly).toBe(1);
  });
});

describe("attachManagedSessions", () => {
  // Import the function dynamically since it may not be exported yet
  const { attachManagedSessions } = require("../src/correlation");

  function createMockManagedSession(overrides: Partial<any> = {}): any {
    return {
      id: "managed-1",
      agent: "claude",
      cwd: "/projects/test",
      prompt: "Test prompt",
      startedAt: Date.now() - 3600000,
      endedAt: Date.now() - 1800000,
      status: "completed",
      pid: 12345,
      ...overrides
    };
  }

  it("should attach managed session by PID match", () => {
    const hookSession = createMockHookSession({
      sessionId: "session-1",
      pid: 12345,
      cwd: "/projects/test"
    });
    const conversations: Conversation[] = [
      {
        correlationId: "conv-1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: Date.now() - 3600000,
        cwd: "/projects/test",
        agent: "claude",
        hookSession
      }
    ];
    const managedSession = createMockManagedSession({ pid: 12345 });

    const result = attachManagedSessions(conversations, [managedSession]);

    expect(result.length).toBe(1);
    expect(result[0].managedSession).toBeDefined();
    expect(result[0].managedSession?.pid).toBe(12345);
  });

  it("should attach managed session by CWD and time overlap", () => {
    const now = Date.now();
    const hookSession = createMockHookSession({
      sessionId: "session-1",
      cwd: "/projects/test",
      startTime: now - 3600000,
      endTime: now - 1800000
    });
    const conversations: Conversation[] = [
      {
        correlationId: "conv-1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: now - 3600000,
        cwd: "/projects/test",
        agent: "claude",
        hookSession
      }
    ];
    const managedSession = createMockManagedSession({
      pid: undefined, // No PID match
      cwd: "/projects/test",
      startedAt: now - 3500000, // Overlaps with hook session
      endedAt: now - 2000000
    });

    const result = attachManagedSessions(conversations, [managedSession]);

    expect(result.length).toBe(1);
    expect(result[0].managedSession).toBeDefined();
  });

  it("should add unmatched managed sessions as standalone conversations", () => {
    const conversations: Conversation[] = [];
    const managedSession = createMockManagedSession({
      id: "orphan-session",
      cwd: "/projects/orphan"
    });

    const result = attachManagedSessions(conversations, [managedSession]);

    expect(result.length).toBe(1);
    expect(result[0].correlationId).toBe("managed-orphan-session");
    expect(result[0].matchType).toBe("unmatched");
    expect(result[0].managedSession).toBeDefined();
    expect(result[0].hookSession).toBeUndefined();
    expect(result[0].transcript).toBeUndefined();
  });

  it("should not double-match managed sessions", () => {
    const now = Date.now();
    const hookSession1 = createMockHookSession({
      sessionId: "session-1",
      pid: 12345,
      cwd: "/projects/test"
    });
    const hookSession2 = createMockHookSession({
      sessionId: "session-2",
      pid: 12346,
      cwd: "/projects/test"
    });
    const conversations: Conversation[] = [
      {
        correlationId: "conv-1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: now - 3600000,
        cwd: "/projects/test",
        agent: "claude",
        hookSession: hookSession1
      },
      {
        correlationId: "conv-2",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: now - 3600000,
        cwd: "/projects/test",
        agent: "claude",
        hookSession: hookSession2
      }
    ];
    const managedSession = createMockManagedSession({ pid: 12345 });

    const result = attachManagedSessions(conversations, [managedSession]);

    // Only the first conversation should have the managed session
    const withManaged = result.filter((c) => c.managedSession !== undefined);
    expect(withManaged.length).toBe(1);
    expect(withManaged[0]?.hookSession?.pid).toBe(12345);
  });

  it("should handle empty managed sessions array", () => {
    const conversations: Conversation[] = [
      {
        correlationId: "conv-1",
        matchType: "exact",
        matchDetails: {
          pathMatch: true,
          timeMatch: true,
          cwdMatch: true,
          toolCountMatch: true,
          score: 100
        },
        startTime: Date.now(),
        cwd: "/projects/test",
        agent: "claude",
        hookSession: createMockHookSession()
      }
    ];

    const result = attachManagedSessions(conversations, []);

    expect(result.length).toBe(1);
    expect(result[0].managedSession).toBeUndefined();
  });

  it("should sort results by start time descending", () => {
    const now = Date.now();
    const conversations: Conversation[] = [];
    const managedSessions = [
      createMockManagedSession({ id: "ms-1", startedAt: now - 3600000 }),
      createMockManagedSession({ id: "ms-2", startedAt: now - 1800000 }),
      createMockManagedSession({ id: "ms-3", startedAt: now - 7200000 })
    ];

    const result = attachManagedSessions(conversations, managedSessions);

    expect(result.length).toBe(3);
    expect(result[0].managedSession?.id).toBe("ms-2"); // Most recent
    expect(result[1].managedSession?.id).toBe("ms-1");
    expect(result[2].managedSession?.id).toBe("ms-3"); // Oldest
  });
});
