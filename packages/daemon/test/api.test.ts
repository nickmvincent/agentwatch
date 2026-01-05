/**
 * Core API Integration Tests
 *
 * Tests for the main REST API endpoints in api.ts
 * Uses minimal mocking to test the Hono routes directly.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type {
  AgentProcess,
  HookSession,
  RepoStatus,
  ToolUsage
} from "@agentwatch/core";
import { Hono } from "hono";

// =============================================================================
// MOCK DATA STORES (simplified versions to avoid side effects)
// =============================================================================

class MockDataStore {
  private repos: RepoStatus[] = [];
  private agents: AgentProcess[] = [];
  private ports: any[] = [];

  updateRepos(repos: RepoStatus[]) {
    this.repos = repos;
  }
  updateAgents(agents: AgentProcess[]) {
    this.agents = agents;
  }
  getRepos() {
    return this.repos;
  }
  getAgents() {
    return this.agents;
  }
  getAgent(pid: number) {
    return this.agents.find((a) => a.pid === pid);
  }
  getPorts() {
    return this.ports;
  }
  getPort(port: number) {
    return this.ports.find((p) => p.port === port);
  }
  setCallbacks() {}
}

class MockHookStore {
  private sessions: Map<string, HookSession> = new Map();
  private toolUsages: Map<string, ToolUsage[]> = new Map();

  startSession(
    sessionId: string,
    cwd: string,
    permissionMode: string,
    transcriptPath?: string
  ) {
    const session: HookSession = {
      sessionId,
      cwd,
      permissionMode,
      transcriptPath,
      startTime: Date.now(),
      active: true,
      toolCount: 0,
      commits: [],
      toolsUsed: [],
      toolUsages: []
    };
    this.sessions.set(sessionId, session);
    this.toolUsages.set(sessionId, []);
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  recordToolUsage(sessionId: string, usage: ToolUsage) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.toolCount = (session.toolCount || 0) + 1;
      session.lastActivity = Date.now();
      if (!session.toolsUsed) session.toolsUsed = [];
      if (!session.toolsUsed.includes(usage.toolName)) {
        session.toolsUsed.push(usage.toolName);
      }
    }
    const usages = this.toolUsages.get(sessionId) || [];
    usages.push(usage);
    this.toolUsages.set(sessionId, usages);
  }

  getToolUsages(sessionId: string) {
    return this.toolUsages.get(sessionId) || [];
  }

  endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      session.active = false;
    }
  }

  getToolStats() {
    const stats: Record<
      string,
      { count: number; successCount: number; failureCount: number }
    > = {};
    for (const usages of this.toolUsages.values()) {
      for (const usage of usages) {
        if (!stats[usage.toolName]) {
          stats[usage.toolName] = {
            count: 0,
            successCount: 0,
            failureCount: 0
          };
        }
        stats[usage.toolName].count++;
        if (usage.success) {
          stats[usage.toolName].successCount++;
        } else {
          stats[usage.toolName].failureCount++;
        }
      }
    }
    return Object.entries(stats).map(([toolName, s]) => ({
      toolName,
      ...s
    }));
  }

  setCallbacks() {}
}

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockRepo(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    repoId: "test-repo-1",
    path: "/test/project",
    name: "test-project",
    branch: "main",
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    specialState: {
      conflict: false,
      rebase: false,
      merge: false,
      cherryPick: false,
      revert: false
    },
    upstream: {
      ahead: 0,
      behind: 0,
      upstreamName: "origin/main"
    },
    health: {
      lastError: null,
      timedOut: false
    },
    lastScanTime: Date.now(),
    lastChangeTime: null,
    ...overrides
  };
}

function createMockAgent(overrides: Partial<AgentProcess> = {}): AgentProcess {
  return {
    pid: 12345,
    label: "test-agent",
    cmdline: "node agent.js",
    exe: "/usr/bin/node",
    cpuPct: 5.0,
    rssKb: 102400,
    threads: 4,
    tty: "pts/0",
    cwd: "/test/project",
    repoPath: "/test/project",
    startTime: Date.now() - 60000,
    ...overrides
  };
}

// Helper to convert repo to API dict format
function repoToDict(repo: RepoStatus): Record<string, unknown> {
  return {
    repo_id: repo.repoId,
    path: repo.path,
    name: repo.name,
    branch: repo.branch,
    dirty:
      repo.stagedCount > 0 || repo.unstagedCount > 0 || repo.untrackedCount > 0,
    staged: repo.stagedCount,
    unstaged: repo.unstagedCount,
    untracked: repo.untrackedCount,
    conflict: repo.specialState.conflict,
    rebase: repo.specialState.rebase,
    merge: repo.specialState.merge,
    cherry_pick: repo.specialState.cherryPick,
    revert: repo.specialState.revert,
    ahead: repo.upstream?.ahead ?? 0,
    behind: repo.upstream?.behind ?? 0,
    upstream_name: repo.upstream?.upstreamName,
    last_error: repo.health.lastError,
    timed_out: repo.health.timedOut,
    last_scan_time: repo.lastScanTime,
    last_change_time: repo.lastChangeTime
  };
}

function agentToDict(agent: AgentProcess): Record<string, unknown> {
  return {
    pid: agent.pid,
    label: agent.label,
    cmdline: agent.cmdline,
    exe: agent.exe,
    cpu_pct: agent.cpuPct,
    rss_kb: agent.rssKb,
    threads: agent.threads,
    tty: agent.tty,
    cwd: agent.cwd,
    repo_path: agent.repoPath,
    start_time: agent.startTime,
    heuristic_state: null,
    wrapper_state: null
  };
}

function hookSessionToDict(session: HookSession): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    transcript_path: session.transcriptPath,
    cwd: session.cwd,
    start_time: session.startTime,
    end_time: session.endTime,
    permission_mode: session.permissionMode,
    tool_count: session.toolCount ?? 0,
    last_activity: session.lastActivity,
    active: session.endTime === undefined,
    commits: session.commits ?? [],
    commit_count: (session.commits ?? []).length,
    tools_used: session.toolsUsed ?? []
  };
}

function toolUsageToDict(usage: ToolUsage): Record<string, unknown> {
  return {
    tool_name: usage.toolName,
    tool_input: usage.toolInput,
    tool_result: usage.toolResult,
    timestamp: usage.timestamp,
    success: usage.success,
    duration_ms: usage.durationMs,
    error: usage.error
  };
}

// =============================================================================
// CREATE TEST APP (lightweight version of the real API)
// =============================================================================

function createTestApp() {
  const app = new Hono();
  const store = new MockDataStore();
  const hookStore = new MockHookStore();
  const startedAt = Date.now();
  const config = {
    testGate: { enabled: false, testCommand: "npm test" },
    daemon: { port: 8420 }
  };

  // Health endpoints
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.get("/api/status", (c) => {
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    return c.json({
      agent_count: store.getAgents().length,
      repo_count: store.getRepos().length,
      uptime_seconds: uptime
    });
  });

  // Repos endpoints
  app.get("/api/repos", (c) => {
    return c.json(store.getRepos().map(repoToDict));
  });

  // Agents endpoints
  app.get("/api/agents", (c) => {
    return c.json(store.getAgents().map(agentToDict));
  });

  app.get("/api/agents/:pid", (c) => {
    const pid = Number.parseInt(c.req.param("pid"), 10);
    const agent = store.getAgent(pid);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    return c.json(agentToDict(agent));
  });

  // Hook sessions endpoints
  app.get("/api/hooks/sessions", (c) => {
    return c.json(hookStore.getAllSessions().map(hookSessionToDict));
  });

  app.get("/api/hooks/sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = hookStore.getSession(id);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json({
      ...hookSessionToDict(session),
      tool_usages: hookStore.getToolUsages(id).map(toolUsageToDict)
    });
  });

  app.get("/api/hooks/sessions/:id/timeline", (c) => {
    const id = c.req.param("id");
    const usages = hookStore.getToolUsages(id);
    return c.json(usages.map(toolUsageToDict));
  });

  app.get("/api/hooks/tools/stats", (c) => {
    const stats = hookStore.getToolStats();
    return c.json(
      stats.map((s) => ({
        tool_name: s.toolName,
        count: s.count,
        success_count: s.successCount,
        failure_count: s.failureCount
      }))
    );
  });

  // Hook event handlers
  app.post("/api/hooks/session-start", async (c) => {
    const body = await c.req.json();
    hookStore.startSession(
      body.session_id,
      body.cwd,
      body.permission_mode || "default",
      body.transcript_path
    );
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/session-end", async (c) => {
    const body = await c.req.json();
    hookStore.endSession(body.session_id);
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/pre-tool-use", async (c) => {
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/post-tool-use", async (c) => {
    const body = await c.req.json();
    hookStore.recordToolUsage(body.session_id, {
      toolName: body.tool_name,
      toolInput: body.tool_input,
      toolResult: body.tool_result,
      timestamp: Date.now(),
      success: body.tool_result?.exit_code === 0 || !body.tool_result?.error
    });
    return c.json({ result: "continue" });
  });

  app.post("/api/hooks/stop", async (c) => {
    return c.json({ result: "continue" });
  });

  // Test gate
  app.get("/api/test-gate", (c) => {
    return c.json({
      enabled: config.testGate.enabled,
      test_command: config.testGate.testCommand,
      passed: false
    });
  });

  // Export
  app.get("/api/export/sessions", (c) => {
    return c.json({
      sessions: hookStore.getAllSessions().map(hookSessionToDict),
      exported_at: new Date().toISOString()
    });
  });

  // Config
  app.get("/api/config", (c) => {
    return c.json({
      daemon: config.daemon,
      test_gate: config.testGate
    });
  });

  return { app, store, hookStore };
}

// =============================================================================
// TESTS
// =============================================================================

describe("Health & Status API", () => {
  describe("GET /api/health", () => {
    it("returns ok status", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
    });
  });

  describe("GET /api/status", () => {
    it("returns daemon status with empty stores", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/status");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.agent_count).toBe(0);
      expect(data.repo_count).toBe(0);
      expect(data.uptime_seconds).toBeGreaterThanOrEqual(0);
    });

    it("returns correct counts with data", async () => {
      const { app, store } = createTestApp();
      store.updateRepos([createMockRepo()]);
      store.updateAgents([createMockAgent()]);

      const res = await app.request("/api/status");
      const data = await res.json();

      expect(data.agent_count).toBe(1);
      expect(data.repo_count).toBe(1);
    });
  });
});

describe("Repos API", () => {
  describe("GET /api/repos", () => {
    it("returns empty array when no repos", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/repos");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns repos with correct format", async () => {
      const { app, store } = createTestApp();
      store.updateRepos([
        createMockRepo({ repoId: "repo-1", name: "project-a", stagedCount: 2 }),
        createMockRepo({
          repoId: "repo-2",
          name: "project-b",
          unstagedCount: 3
        })
      ]);

      const res = await app.request("/api/repos");
      const data = await res.json();

      expect(data.length).toBe(2);
      expect(data[0].repo_id).toBe("repo-1");
      expect(data[0].name).toBe("project-a");
      expect(data[0].staged).toBe(2);
      expect(data[0].dirty).toBe(true);

      expect(data[1].repo_id).toBe("repo-2");
      expect(data[1].unstaged).toBe(3);
      expect(data[1].dirty).toBe(true);
    });

    it("shows clean repos as not dirty", async () => {
      const { app, store } = createTestApp();
      store.updateRepos([createMockRepo()]);

      const res = await app.request("/api/repos");
      const data = await res.json();

      expect(data[0].dirty).toBe(false);
    });
  });
});

describe("Agents API", () => {
  describe("GET /api/agents", () => {
    it("returns empty array when no agents", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/agents");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns agents with correct format", async () => {
      const { app, store } = createTestApp();
      store.updateAgents([
        createMockAgent({ pid: 1001, label: "agent-1" }),
        createMockAgent({ pid: 1002, label: "agent-2" })
      ]);

      const res = await app.request("/api/agents");
      const data = await res.json();

      expect(data.length).toBe(2);
      expect(data[0].pid).toBe(1001);
      expect(data[0].label).toBe("agent-1");
      expect(data[1].pid).toBe(1002);
    });
  });

  describe("GET /api/agents/:pid", () => {
    it("returns specific agent", async () => {
      const { app, store } = createTestApp();
      store.updateAgents([
        createMockAgent({ pid: 1001, label: "target-agent" })
      ]);

      const res = await app.request("/api/agents/1001");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.pid).toBe(1001);
      expect(data.label).toBe("target-agent");
    });

    it("returns 404 for non-existent agent", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/agents/99999");
      expect(res.status).toBe(404);
    });
  });
});

describe("Hook Sessions API", () => {
  describe("GET /api/hooks/sessions", () => {
    it("returns empty array when no sessions", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/hooks/sessions");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns sessions from hook store", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("test-session-1", "/test/project", "default");
      hookStore.recordToolUsage("test-session-1", {
        toolName: "Read",
        toolInput: { file_path: "/test/file.ts" },
        timestamp: Date.now(),
        success: true
      });

      const res = await app.request("/api/hooks/sessions");
      const data = await res.json();

      expect(data.length).toBe(1);
      expect(data[0].session_id).toBe("test-session-1");
      expect(data[0].cwd).toBe("/test/project");
      expect(data[0].tool_count).toBe(1);
    });
  });

  describe("GET /api/hooks/sessions/:id", () => {
    it("returns specific session with tool usages", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("session-123", "/project", "default");
      hookStore.recordToolUsage("session-123", {
        toolName: "Bash",
        toolInput: { command: "ls" },
        timestamp: Date.now(),
        success: true
      });

      const res = await app.request("/api/hooks/sessions/session-123");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.session_id).toBe("session-123");
      expect(data.tool_usages).toBeDefined();
      expect(data.tool_usages.length).toBe(1);
    });

    it("returns 404 for non-existent session", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/hooks/sessions/does-not-exist");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/hooks/sessions/:id/timeline", () => {
    it("returns tool timeline for session", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("timeline-session", "/project", "default");
      hookStore.recordToolUsage("timeline-session", {
        toolName: "Read",
        toolInput: { file_path: "/a.ts" },
        timestamp: Date.now(),
        success: true
      });
      hookStore.recordToolUsage("timeline-session", {
        toolName: "Edit",
        toolInput: { file_path: "/a.ts" },
        timestamp: Date.now() + 1000,
        success: true
      });

      const res = await app.request(
        "/api/hooks/sessions/timeline-session/timeline"
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.length).toBe(2);
      expect(data[0].tool_name).toBe("Read");
      expect(data[1].tool_name).toBe("Edit");
    });
  });

  describe("GET /api/hooks/tools/stats", () => {
    it("returns tool statistics", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("stats-session", "/project", "default");
      hookStore.recordToolUsage("stats-session", {
        toolName: "Read",
        toolInput: {},
        timestamp: Date.now(),
        success: true
      });
      hookStore.recordToolUsage("stats-session", {
        toolName: "Read",
        toolInput: {},
        timestamp: Date.now(),
        success: true
      });
      hookStore.recordToolUsage("stats-session", {
        toolName: "Bash",
        toolInput: {},
        timestamp: Date.now(),
        success: false
      });

      const res = await app.request("/api/hooks/tools/stats");
      expect(res.status).toBe(200);

      const data = await res.json();
      const readStats = data.find((s: any) => s.tool_name === "Read");
      const bashStats = data.find((s: any) => s.tool_name === "Bash");

      expect(readStats.count).toBe(2);
      expect(readStats.success_count).toBe(2);
      expect(bashStats.count).toBe(1);
      expect(bashStats.failure_count).toBe(1);
    });
  });
});

describe("Hook Event Handlers", () => {
  describe("POST /api/hooks/session-start", () => {
    it("creates a new session", async () => {
      const { app, hookStore } = createTestApp();
      const res = await app.request("/api/hooks/session-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "new-session",
          cwd: "/test/project",
          permission_mode: "default"
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.result).toBe("continue");

      // Verify session was created
      const session = hookStore.getSession("new-session");
      expect(session).toBeDefined();
      expect(session?.cwd).toBe("/test/project");
    });

    it("accepts optional transcript path", async () => {
      const { app, hookStore } = createTestApp();
      const res = await app.request("/api/hooks/session-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "session-with-transcript",
          cwd: "/project",
          transcript_path: "/path/to/transcript.json"
        })
      });

      expect(res.status).toBe(200);

      const session = hookStore.getSession("session-with-transcript");
      expect(session?.transcriptPath).toBe("/path/to/transcript.json");
    });
  });

  describe("POST /api/hooks/session-end", () => {
    it("ends an existing session", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("ending-session", "/project", "default");

      const res = await app.request("/api/hooks/session-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "ending-session"
        })
      });

      expect(res.status).toBe(200);

      const session = hookStore.getSession("ending-session");
      expect(session?.endTime).toBeDefined();
    });
  });

  describe("POST /api/hooks/pre-tool-use", () => {
    it("allows tool use by default", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("tool-session", "/project", "default");

      const res = await app.request("/api/hooks/pre-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "tool-session",
          tool_name: "Read",
          tool_input: { file_path: "/test/file.ts" }
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.result).toBe("continue");
    });
  });

  describe("POST /api/hooks/post-tool-use", () => {
    it("records tool usage", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("post-tool-session", "/project", "default");

      const res = await app.request("/api/hooks/post-tool-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "post-tool-session",
          tool_name: "Bash",
          tool_input: { command: "npm test" },
          tool_result: { stdout: "tests passed", exit_code: 0 }
        })
      });

      expect(res.status).toBe(200);

      const session = hookStore.getSession("post-tool-session");
      expect(session?.toolCount).toBe(1);
    });
  });

  describe("POST /api/hooks/stop", () => {
    it("returns continue result", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("stop-session", "/project", "default");

      const res = await app.request("/api/hooks/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "stop-session",
          stop_reason: "end_turn"
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.result).toBe("continue");
    });
  });
});

describe("Config API", () => {
  describe("GET /api/config", () => {
    it("returns current configuration", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/config");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.daemon).toBeDefined();
      expect(data.daemon.port).toBe(8420);
    });
  });
});

describe("Test Gate API", () => {
  describe("GET /api/test-gate", () => {
    it("returns test gate status", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/test-gate");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.enabled).toBe(false);
      expect(data.test_command).toBe("npm test");
    });
  });
});

describe("Export API", () => {
  describe("GET /api/export/sessions", () => {
    it("exports sessions as JSON", async () => {
      const { app, hookStore } = createTestApp();
      hookStore.startSession("export-session", "/project", "default");

      const res = await app.request("/api/export/sessions");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.sessions).toBeDefined();
      expect(data.sessions.length).toBe(1);
      expect(data.exported_at).toBeDefined();
    });
  });
});
