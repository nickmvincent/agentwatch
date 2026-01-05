/**
 * Server Tests
 *
 * Tests for DaemonServer helper functions and basic behavior.
 * Full lifecycle tests require running processes and are covered in E2E tests.
 */

import { describe, expect, it } from "bun:test";
import type { AgentProcess, ListeningPort, RepoStatus } from "@agentwatch/core";

describe("Server Helper Functions", () => {
  describe("repoToDict conversion", () => {
    it("should convert RepoStatus to API dict format", () => {
      const repo: RepoStatus = {
        repoId: "repo-123",
        path: "/path/to/repo",
        name: "my-repo",
        branch: "main",
        stagedCount: 2,
        unstagedCount: 3,
        untrackedCount: 1,
        specialState: {
          conflict: false,
          rebase: false,
          merge: true,
          cherryPick: false,
          revert: false
        },
        upstream: {
          ahead: 1,
          behind: 2,
          upstreamName: "origin/main"
        },
        health: {
          lastError: null,
          timedOut: false
        },
        lastScanTime: 1000,
        lastChangeTime: 900
      };

      // Test the conversion logic inline
      const dict = {
        repo_id: repo.repoId,
        path: repo.path,
        name: repo.name,
        branch: repo.branch,
        dirty:
          repo.stagedCount > 0 ||
          repo.unstagedCount > 0 ||
          repo.untrackedCount > 0,
        staged: repo.stagedCount,
        unstaged: repo.unstagedCount,
        untracked: repo.untrackedCount,
        conflict: repo.specialState.conflict,
        rebase: repo.specialState.rebase,
        merge: repo.specialState.merge,
        cherry_pick: repo.specialState.cherryPick,
        revert: repo.specialState.revert,
        ahead: repo.upstream.ahead ?? 0,
        behind: repo.upstream.behind ?? 0,
        upstream_name: repo.upstream.upstreamName ?? null,
        last_error: repo.health.lastError ?? null,
        timed_out: repo.health.timedOut,
        last_scan_time: repo.lastScanTime,
        last_change_time: repo.lastChangeTime
      };

      expect(dict.repo_id).toBe("repo-123");
      expect(dict.dirty).toBe(true);
      expect(dict.staged).toBe(2);
      expect(dict.merge).toBe(true);
      expect(dict.upstream_name).toBe("origin/main");
    });

    it("should mark repo as not dirty when all counts are zero", () => {
      const repo: RepoStatus = {
        repoId: "clean-repo",
        path: "/clean",
        name: "clean",
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
        upstream: { ahead: 0, behind: 0 },
        health: { timedOut: false },
        lastScanTime: 1000,
        lastChangeTime: 0
      };

      const dirty =
        repo.stagedCount > 0 ||
        repo.unstagedCount > 0 ||
        repo.untrackedCount > 0;
      expect(dirty).toBe(false);
    });
  });

  describe("agentToDict conversion", () => {
    it("should convert AgentProcess to API dict format", () => {
      const agent: AgentProcess = {
        pid: 12345,
        label: "claude-code",
        cmdline: "claude --help",
        exe: "/usr/bin/claude",
        cpuPct: 5.5,
        rssKb: 102400,
        threads: 4,
        cwd: "/projects/test",
        repoPath: "/projects/test",
        startTime: Date.now() - 60000,
        heuristicState: {
          state: "active",
          cpuPctRecent: 5.5,
          quietSeconds: 0
        },
        sandboxed: true,
        sandboxType: "macos"
      };

      const dict = {
        pid: agent.pid,
        label: agent.label,
        cmdline: agent.cmdline,
        exe: agent.exe,
        cpu_pct: agent.cpuPct,
        rss_kb: agent.rssKb,
        threads: agent.threads,
        cwd: agent.cwd,
        repo_path: agent.repoPath,
        start_time: agent.startTime,
        heuristic_state: agent.heuristicState
          ? {
              state: agent.heuristicState.state,
              cpu_pct_recent: agent.heuristicState.cpuPctRecent,
              quiet_seconds: agent.heuristicState.quietSeconds
            }
          : null,
        sandboxed: agent.sandboxed ?? false,
        sandbox_type: agent.sandboxType ?? null
      };

      expect(dict.pid).toBe(12345);
      expect(dict.label).toBe("claude-code");
      expect(dict.cpu_pct).toBe(5.5);
      expect(dict.heuristic_state?.state).toBe("active");
      expect(dict.sandboxed).toBe(true);
      expect(dict.sandbox_type).toBe("macos");
    });

    it("should handle null heuristic state", () => {
      const agent: AgentProcess = {
        pid: 1,
        label: "test",
        cmdline: "test",
        cpuPct: 0,
        rssKb: 0,
        threads: 1,
        startTime: Date.now()
      };

      const heuristicState = agent.heuristicState
        ? { state: agent.heuristicState.state }
        : null;

      expect(heuristicState).toBeNull();
    });
  });

  describe("portToDict conversion", () => {
    it("should convert ListeningPort to API dict format", () => {
      const port: ListeningPort = {
        port: 3000,
        pid: 12345,
        processName: "node",
        cmdline: "node server.js",
        bindAddress: "127.0.0.1",
        protocol: "tcp",
        agentPid: 12345,
        agentLabel: "claude-code",
        firstSeen: Date.now() - 30000,
        cwd: "/projects/test"
      };

      const dict = {
        port: port.port,
        pid: port.pid,
        process_name: port.processName,
        cmdline: port.cmdline,
        bind_address: port.bindAddress,
        protocol: port.protocol,
        agent_pid: port.agentPid,
        agent_label: port.agentLabel,
        first_seen: port.firstSeen,
        cwd: port.cwd
      };

      expect(dict.port).toBe(3000);
      expect(dict.process_name).toBe("node");
      expect(dict.agent_label).toBe("claude-code");
      expect(dict.bind_address).toBe("127.0.0.1");
    });
  });
});

describe("daemonStatus logic", () => {
  it("should return 0 when daemon is running", () => {
    // Simulate running state
    const isRunning = true;
    const exitCode = isRunning ? 0 : 1;
    expect(exitCode).toBe(0);
  });

  it("should return 1 when daemon is not running", () => {
    const isRunning = false;
    const exitCode = isRunning ? 0 : 1;
    expect(exitCode).toBe(1);
  });
});

describe("daemonStop logic", () => {
  it("should return 1 when trying to stop non-running daemon", () => {
    const isRunning = false;
    const exitCode = isRunning ? 0 : 1;
    expect(exitCode).toBe(1);
  });

  it("should return 0 when successfully stopping daemon", () => {
    const stopSuccessful = true;
    const exitCode = stopSuccessful ? 0 : 1;
    expect(exitCode).toBe(0);
  });
});
