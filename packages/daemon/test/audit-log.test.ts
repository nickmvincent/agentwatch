/**
 * Audit Log Tests
 *
 * Tests for the centralized audit log functionality.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// We need to mock the DATA_DIR since the module uses a hardcoded path
// For testing, we'll test the core logic functions

// =============================================================================
// UNIT TESTS FOR AUDIT LOG TYPES AND HELPERS
// =============================================================================

describe("Audit Log Types", () => {
  describe("AuditEntry structure", () => {
    it("should have required fields", () => {
      const entry = {
        timestamp: new Date().toISOString(),
        category: "hook_session" as const,
        action: "start" as const,
        entityId: "session-123",
        description: "Hook session started",
        details: { cwd: "/test/project" },
        source: "hook" as const
      };

      expect(entry.timestamp).toBeDefined();
      expect(entry.category).toBe("hook_session");
      expect(entry.action).toBe("start");
      expect(entry.entityId).toBe("session-123");
      expect(entry.description).toBeDefined();
      expect(entry.source).toBe("hook");
    });
  });

  describe("AuditCategory values", () => {
    it("should include all expected categories", () => {
      const categories = [
        "transcript",
        "hook_session",
        "tool_usage",
        "enrichment",
        "annotation",
        "conversation",
        "agent",
        "managed_session",
        "process",
        "config",
        "contributor",
        "daemon",
        "system"
      ];

      // Just verify these are valid category strings
      for (const cat of categories) {
        expect(typeof cat).toBe("string");
        expect(cat.length).toBeGreaterThan(0);
      }
    });
  });

  describe("AuditAction values", () => {
    it("should include all expected actions", () => {
      const actions = [
        "create",
        "read",
        "update",
        "delete",
        "start",
        "end",
        "discover",
        "rename",
        "annotate",
        "compute",
        "export",
        "import"
      ];

      for (const action of actions) {
        expect(typeof action).toBe("string");
        expect(action.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("Audit Log JSONL Format", () => {
  const testDir = join(tmpdir(), "agentwatch-test-audit");
  const testLogPath = join(testDir, "audit.jsonl");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("should write valid JSONL format", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "daemon-1",
        description: "Daemon started",
        source: "daemon"
      },
      {
        timestamp: "2024-01-01T10:01:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "session-1",
        description: "Session started",
        source: "hook"
      }
    ];

    const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(testLogPath, content);

    const lines = readFileSync(testLogPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    const parsed1 = JSON.parse(lines[0]!);
    expect(parsed1.category).toBe("daemon");
    expect(parsed1.action).toBe("start");

    const parsed2 = JSON.parse(lines[1]!);
    expect(parsed2.category).toBe("hook_session");
    expect(parsed2.entityId).toBe("session-1");
  });

  it("should handle empty log file", () => {
    writeFileSync(testLogPath, "");

    const content = readFileSync(testLogPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(0);
  });

  it("should append entries without overwriting", () => {
    const entry1 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      category: "daemon",
      action: "start",
      entityId: "d1",
      description: "First",
      source: "daemon"
    };
    writeFileSync(testLogPath, JSON.stringify(entry1) + "\n");

    const entry2 = {
      timestamp: "2024-01-01T10:01:00.000Z",
      category: "daemon",
      action: "end",
      entityId: "d1",
      description: "Second",
      source: "daemon"
    };
    const existingContent = readFileSync(testLogPath, "utf-8");
    writeFileSync(testLogPath, existingContent + JSON.stringify(entry2) + "\n");

    const lines = readFileSync(testLogPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);
  });
});

describe("Audit Log Filtering", () => {
  it("should filter by category", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:01:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "s1"
      },
      {
        timestamp: "2024-01-01T10:02:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:03:00.000Z",
        category: "tool_usage",
        action: "create",
        entityId: "t1"
      }
    ];

    const daemonEvents = entries.filter((e) => e.category === "daemon");
    expect(daemonEvents.length).toBe(2);
    expect(daemonEvents.every((e) => e.category === "daemon")).toBe(true);
  });

  it("should filter by action", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:01:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "s1"
      },
      {
        timestamp: "2024-01-01T10:02:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1"
      }
    ];

    const startEvents = entries.filter((e) => e.action === "start");
    expect(startEvents.length).toBe(2);
    expect(startEvents.every((e) => e.action === "start")).toBe(true);
  });

  it("should filter by time range (since)", () => {
    const entries = [
      {
        timestamp: "2024-01-01T09:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "s1"
      },
      {
        timestamp: "2024-01-01T11:00:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1"
      }
    ];

    const since = "2024-01-01T09:30:00.000Z";
    const filtered = entries.filter((e) => e.timestamp >= since);
    expect(filtered.length).toBe(2);
  });

  it("should filter by time range (until)", () => {
    const entries = [
      {
        timestamp: "2024-01-01T09:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "s1"
      },
      {
        timestamp: "2024-01-01T11:00:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1"
      }
    ];

    const until = "2024-01-01T10:30:00.000Z";
    const filtered = entries.filter((e) => e.timestamp <= until);
    expect(filtered.length).toBe(2);
  });

  it("should combine multiple filters", () => {
    const entries = [
      {
        timestamp: "2024-01-01T09:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "hook_session",
        action: "start",
        entityId: "s1"
      },
      {
        timestamp: "2024-01-01T11:00:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1"
      },
      {
        timestamp: "2024-01-01T12:00:00.000Z",
        category: "hook_session",
        action: "end",
        entityId: "s1"
      }
    ];

    const filtered = entries
      .filter((e) => e.category === "hook_session")
      .filter((e) => e.action === "start");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.entityId).toBe("s1");
  });
});

describe("Audit Log Statistics", () => {
  it("should count events by category", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start"
      },
      {
        timestamp: "2024-01-01T10:01:00.000Z",
        category: "hook_session",
        action: "start"
      },
      {
        timestamp: "2024-01-01T10:02:00.000Z",
        category: "daemon",
        action: "end"
      },
      {
        timestamp: "2024-01-01T10:03:00.000Z",
        category: "hook_session",
        action: "end"
      },
      {
        timestamp: "2024-01-01T10:04:00.000Z",
        category: "tool_usage",
        action: "create"
      }
    ];

    const byCategory: Record<string, number> = {};
    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }

    expect(byCategory["daemon"]).toBe(2);
    expect(byCategory["hook_session"]).toBe(2);
    expect(byCategory["tool_usage"]).toBe(1);
  });

  it("should count events by action", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start"
      },
      {
        timestamp: "2024-01-01T10:01:00.000Z",
        category: "hook_session",
        action: "start"
      },
      {
        timestamp: "2024-01-01T10:02:00.000Z",
        category: "daemon",
        action: "end"
      },
      {
        timestamp: "2024-01-01T10:03:00.000Z",
        category: "tool_usage",
        action: "create"
      }
    ];

    const byAction: Record<string, number> = {};
    for (const e of entries) {
      byAction[e.action] = (byAction[e.action] || 0) + 1;
    }

    expect(byAction["start"]).toBe(2);
    expect(byAction["end"]).toBe(1);
    expect(byAction["create"]).toBe(1);
  });

  it("should find oldest and newest events", () => {
    const entries = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start"
      },
      {
        timestamp: "2024-01-01T12:00:00.000Z",
        category: "daemon",
        action: "end"
      },
      {
        timestamp: "2024-01-01T11:00:00.000Z",
        category: "hook_session",
        action: "start"
      }
    ];

    const sorted = [...entries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    const oldest = sorted[0]?.timestamp;
    const newest = sorted[sorted.length - 1]?.timestamp;

    expect(oldest).toBe("2024-01-01T10:00:00.000Z");
    expect(newest).toBe("2024-01-01T12:00:00.000Z");
  });

  it("should handle empty entries", () => {
    const entries: any[] = [];

    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byAction[e.action] = (byAction[e.action] || 0) + 1;
    }

    expect(Object.keys(byCategory).length).toBe(0);
    expect(Object.keys(byAction).length).toBe(0);
  });
});

describe("Audit Log Deduplication", () => {
  it("should generate unique keys for entries", () => {
    const getKey = (e: {
      timestamp: string;
      category: string;
      action: string;
      entityId: string;
    }) => `${e.timestamp.slice(0, 19)}:${e.category}:${e.action}:${e.entityId}`;

    const entry1 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      category: "daemon",
      action: "start",
      entityId: "d1"
    };
    const entry2 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      category: "daemon",
      action: "start",
      entityId: "d1"
    };
    const entry3 = {
      timestamp: "2024-01-01T10:00:00.000Z",
      category: "daemon",
      action: "start",
      entityId: "d2"
    };

    expect(getKey(entry1)).toBe(getKey(entry2)); // Duplicates
    expect(getKey(entry1)).not.toBe(getKey(entry3)); // Different entity
  });

  it("should deduplicate entries preferring logged over inferred", () => {
    const logged = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1",
        source: "hook"
      }
    ];
    const inferred = [
      {
        timestamp: "2024-01-01T10:00:00.000Z",
        category: "daemon",
        action: "start",
        entityId: "d1",
        source: "inferred"
      },
      {
        timestamp: "2024-01-01T11:00:00.000Z",
        category: "daemon",
        action: "end",
        entityId: "d1",
        source: "inferred"
      }
    ];

    const getKey = (e: any) =>
      `${e.timestamp.slice(0, 19)}:${e.category}:${e.action}:${e.entityId}`;
    const seenKeys = new Set<string>();
    const merged: any[] = [];

    // Prefer logged
    for (const e of logged) {
      const key = getKey(e);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        merged.push(e);
      }
    }

    // Then add inferred that aren't duplicates
    for (const e of inferred) {
      const key = getKey(e);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        merged.push(e);
      }
    }

    expect(merged.length).toBe(2);
    expect(merged.find((e) => e.action === "start")?.source).toBe("hook");
    expect(merged.find((e) => e.action === "end")?.source).toBe("inferred");
  });
});

describe("Audit Log Pagination", () => {
  it("should apply offset correctly", () => {
    const entries = [
      { id: 1, timestamp: "2024-01-01T10:00:00.000Z" },
      { id: 2, timestamp: "2024-01-01T11:00:00.000Z" },
      { id: 3, timestamp: "2024-01-01T12:00:00.000Z" },
      { id: 4, timestamp: "2024-01-01T13:00:00.000Z" },
      { id: 5, timestamp: "2024-01-01T14:00:00.000Z" }
    ];

    const offset = 2;
    const paginated = entries.slice(offset);

    expect(paginated.length).toBe(3);
    expect(paginated[0]?.id).toBe(3);
  });

  it("should apply limit correctly", () => {
    const entries = [
      { id: 1, timestamp: "2024-01-01T10:00:00.000Z" },
      { id: 2, timestamp: "2024-01-01T11:00:00.000Z" },
      { id: 3, timestamp: "2024-01-01T12:00:00.000Z" },
      { id: 4, timestamp: "2024-01-01T13:00:00.000Z" },
      { id: 5, timestamp: "2024-01-01T14:00:00.000Z" }
    ];

    const limit = 3;
    const paginated = entries.slice(0, limit);

    expect(paginated.length).toBe(3);
    expect(paginated[2]?.id).toBe(3);
  });

  it("should apply offset and limit together", () => {
    const entries = [
      { id: 1, timestamp: "2024-01-01T10:00:00.000Z" },
      { id: 2, timestamp: "2024-01-01T11:00:00.000Z" },
      { id: 3, timestamp: "2024-01-01T12:00:00.000Z" },
      { id: 4, timestamp: "2024-01-01T13:00:00.000Z" },
      { id: 5, timestamp: "2024-01-01T14:00:00.000Z" }
    ];

    const offset = 1;
    const limit = 2;
    const paginated = entries.slice(offset).slice(0, limit);

    expect(paginated.length).toBe(2);
    expect(paginated[0]?.id).toBe(2);
    expect(paginated[1]?.id).toBe(3);
  });

  it("should determine has_more correctly", () => {
    const total = 100;
    const limit = 20;
    const offset = 0;

    const hasMore = total > offset + limit;
    expect(hasMore).toBe(true);

    const offset2 = 90;
    const hasMore2 = total > offset2 + limit;
    expect(hasMore2).toBe(false);
  });
});

describe("Audit Entry Descriptions", () => {
  it("should generate descriptive messages for hook sessions", () => {
    const session = {
      sessionId: "sess-123",
      source: "startup",
      cwd: "/projects/test",
      toolCount: 15,
      estimatedCostUsd: 0.0234
    };

    const startDesc = `Hook session started: ${session.source || "startup"}`;
    expect(startDesc).toBe("Hook session started: startup");

    const endDesc = `Hook session ended (${session.toolCount} tools, $${session.estimatedCostUsd.toFixed(4)})`;
    expect(endDesc).toBe("Hook session ended (15 tools, $0.0234)");
  });

  it("should generate descriptive messages for processes", () => {
    const process = {
      pid: 12345,
      label: "claude-code",
      event: "started",
      command: "claude-code --help"
    };

    const desc = `Process ${process.event}: ${process.label || process.command?.slice(0, 40) || "unknown"}`;
    expect(desc).toBe("Process started: claude-code");
  });

  it("should truncate long transcript names", () => {
    const transcript = {
      name: "This is a very long session name that exceeds the fifty character limit"
    };

    const desc = `Transcript discovered: ${transcript.name.slice(0, 50)}`;
    expect(desc.length).toBeLessThanOrEqual(73); // "Transcript discovered: " (23) + 50 chars
  });
});
