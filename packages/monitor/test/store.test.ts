import { beforeEach, describe, expect, test } from "bun:test";
import type { AgentProcess, RepoStatus } from "@agentwatch/core";
import { DataStore } from "../src/store";

describe("DataStore", () => {
  let store: DataStore;

  beforeEach(() => {
    store = new DataStore();
  });

  describe("repos", () => {
    test("updateRepos stores repos", () => {
      const repos = new Map<string, RepoStatus>([
        [
          "/path/to/repo",
          {
            repoId: "abc123",
            path: "/path/to/repo",
            name: "repo",
            stagedCount: 1,
            unstagedCount: 2,
            untrackedCount: 0,
            specialState: {
              conflict: false,
              rebase: false,
              merge: false,
              cherryPick: false,
              revert: false
            },
            upstream: {},
            lastScanTime: Date.now(),
            lastChangeTime: Date.now(),
            health: { timedOut: false, backoffUntil: 0 }
          }
        ]
      ]);

      store.updateRepos(repos, []);

      const snapshot = store.snapshotRepos();
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]!.name).toBe("repo");
    });

    test("updateRepos triggers callback", () => {
      let callbackCalled = false;
      let callbackRepos: RepoStatus[] = [];

      store.setCallbacks({
        onReposChange: (repos) => {
          callbackCalled = true;
          callbackRepos = repos;
        }
      });

      const repos = new Map<string, RepoStatus>([
        [
          "/path/to/repo",
          {
            repoId: "abc123",
            path: "/path/to/repo",
            name: "repo",
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
            upstream: {},
            lastScanTime: Date.now(),
            lastChangeTime: Date.now(),
            health: { timedOut: false, backoffUntil: 0 }
          }
        ]
      ]);

      store.updateRepos(repos, []);

      expect(callbackCalled).toBe(true);
      expect(callbackRepos).toHaveLength(1);
    });

    test("snapshotRepoErrors returns errors", () => {
      store.updateRepos(new Map(), ["error1", "error2"]);

      const errors = store.snapshotRepoErrors();
      expect(errors).toEqual(["error1", "error2"]);
    });

    test("snapshotRepoIgnoredCount returns count", () => {
      store.updateRepos(new Map(), [], 5);

      expect(store.snapshotRepoIgnoredCount()).toBe(5);
    });
  });

  describe("agents", () => {
    test("updateAgents stores agents", () => {
      const agents = new Map<number, AgentProcess>([
        [
          1234,
          {
            pid: 1234,
            label: "claude",
            cmdline: "claude --help",
            exe: "/usr/bin/claude",
            startTime: Date.now(),
            cpuPct: 5.0
          }
        ]
      ]);

      store.updateAgents(agents);

      const snapshot = store.snapshotAgents();
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]!.pid).toBe(1234);
    });

    test("updateAgents merges wrapper states", () => {
      // First set wrapper state
      store.updateWrapperState(1234, {
        state: "WORKING",
        lastOutputTime: Date.now(),
        lastLines: ["output line"],
        awaitingUser: false
      });

      // Then update agents
      const agents = new Map<number, AgentProcess>([
        [
          1234,
          {
            pid: 1234,
            label: "claude",
            cmdline: "claude --help",
            exe: "/usr/bin/claude",
            startTime: Date.now(),
            cpuPct: 5.0
          }
        ]
      ]);

      store.updateAgents(agents);

      const snapshot = store.snapshotAgents();
      expect(snapshot[0]!.wrapperState).toBeDefined();
      expect(snapshot[0]!.wrapperState!.state).toBe("WORKING");
    });

    test("updateAgents triggers callback", () => {
      let callbackCalled = false;

      store.setCallbacks({
        onAgentsChange: () => {
          callbackCalled = true;
        }
      });

      store.updateAgents(new Map());

      expect(callbackCalled).toBe(true);
    });

    test("getAgent returns specific agent", () => {
      const agents = new Map<number, AgentProcess>([
        [
          1234,
          {
            pid: 1234,
            label: "claude",
            cmdline: "claude --help",
            exe: "/usr/bin/claude",
            startTime: Date.now(),
            cpuPct: 5.0
          }
        ]
      ]);

      store.updateAgents(agents);

      expect(store.getAgent(1234)?.label).toBe("claude");
      expect(store.getAgent(9999)).toBeUndefined();
    });
  });

  describe("wrapper states", () => {
    test("updateWrapperState stores state", () => {
      store.updateWrapperState(1234, {
        state: "WAITING",
        lastOutputTime: Date.now(),
        lastLines: [],
        awaitingUser: true
      });

      const states = store.snapshotWrapperStates();
      expect(states.get(1234)?.awaitingUser).toBe(true);
    });

    test("removeWrapperState removes state", () => {
      store.updateWrapperState(1234, {
        state: "WAITING",
        lastOutputTime: Date.now(),
        lastLines: [],
        awaitingUser: false
      });

      store.removeWrapperState(1234);

      const states = store.snapshotWrapperStates();
      expect(states.has(1234)).toBe(false);
    });
  });
});
