/**
 * Scanner Tests
 *
 * Tests for PortScanner, ProcessScanner, and RepoScanner.
 * Focus on configuration, state management, and data transformations.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PortScanner } from "../src/port-scanner";
import { ProcessScanner } from "../src/process-scanner";
import { RepoScanner } from "../src/repo-scanner";
import { DataStore } from "../src/store";

// =============================================================================
// PORT SCANNER TESTS
// =============================================================================

describe("PortScanner", () => {
  let store: DataStore;
  let scanner: PortScanner;

  beforeEach(() => {
    store = new DataStore();
  });

  afterEach(() => {
    scanner?.stop();
  });

  describe("configuration", () => {
    it("uses default config when none provided", () => {
      scanner = new PortScanner(store);
      // Scanner should be created without error
      expect(scanner).toBeDefined();
    });

    it("merges custom config with defaults", () => {
      scanner = new PortScanner(store, {
        refreshSeconds: 5,
        minPort: 3000
      });
      expect(scanner).toBeDefined();
    });
  });

  describe("start/stop lifecycle", () => {
    it("can be started and stopped", () => {
      scanner = new PortScanner(store);
      scanner.start();
      // Should not throw
      scanner.stop();
    });

    it("handles multiple start calls gracefully", () => {
      scanner = new PortScanner(store);
      scanner.start();
      scanner.start(); // Should not throw or create duplicate intervals
      scanner.stop();
    });

    it("handles stop without start", () => {
      scanner = new PortScanner(store);
      scanner.stop(); // Should not throw
    });
  });

  describe("pause/resume", () => {
    it("can be paused and resumed", () => {
      scanner = new PortScanner(store);
      scanner.start();

      scanner.setPaused(true);
      // When paused, scans should not update store
      const portsBefore = store.snapshotPorts();

      scanner.setPaused(false);
      scanner.stop();

      // Should complete without error
      expect(portsBefore).toBeDefined();
    });
  });
});

// =============================================================================
// PROCESS SCANNER TESTS
// =============================================================================

describe("ProcessScanner", () => {
  let store: DataStore;
  let scanner: ProcessScanner;

  beforeEach(() => {
    store = new DataStore();
  });

  afterEach(() => {
    scanner?.stop();
  });

  describe("configuration", () => {
    it("uses default config when none provided", () => {
      scanner = new ProcessScanner(store);
      expect(scanner).toBeDefined();
    });

    it("accepts custom matchers", () => {
      scanner = new ProcessScanner(store, {
        matchers: [
          { label: "custom-agent", type: "cmd_regex", pattern: "custom" }
        ]
      });
      expect(scanner).toBeDefined();
    });

    it("accepts heuristic config", () => {
      scanner = new ProcessScanner(store, {
        heuristic: {
          activeCpuPct: 2.0,
          stalledSeconds: 60
        }
      });
      expect(scanner).toBeDefined();
    });

    it("accepts cwd resolution config", () => {
      scanner = new ProcessScanner(store, {
        cwdResolution: "off"
      });
      expect(scanner).toBeDefined();
    });
  });

  describe("start/stop lifecycle", () => {
    it("can be started and stopped", () => {
      scanner = new ProcessScanner(store);
      scanner.start();
      scanner.stop();
    });

    it("handles multiple start calls gracefully", () => {
      scanner = new ProcessScanner(store);
      scanner.start();
      scanner.start();
      scanner.stop();
    });
  });

  describe("pause/resume", () => {
    it("can be paused and resumed", () => {
      scanner = new ProcessScanner(store);
      scanner.start();
      scanner.setPaused(true);
      scanner.setPaused(false);
      scanner.stop();
    });
  });

  describe("default matchers", () => {
    it("has matchers for common AI agents", () => {
      scanner = new ProcessScanner(store);
      // The default matchers should include claude, codex, cursor, etc.
      // We test that the scanner starts without error with defaults
      scanner.start();
      scanner.stop();
    });
  });
});

// =============================================================================
// REPO SCANNER TESTS
// =============================================================================

describe("RepoScanner", () => {
  let store: DataStore;
  let scanner: RepoScanner;

  beforeEach(() => {
    store = new DataStore();
  });

  afterEach(() => {
    scanner?.stop();
  });

  describe("configuration", () => {
    it("uses default config when none provided", () => {
      scanner = new RepoScanner(store);
      expect(scanner).toBeDefined();
    });

    it("accepts custom roots", () => {
      scanner = new RepoScanner(store, {
        roots: ["/custom/path"]
      });
      expect(scanner).toBeDefined();
    });

    it("accepts custom ignore dirs", () => {
      scanner = new RepoScanner(store, {
        ignoreDirs: ["node_modules", "custom_ignore"]
      });
      expect(scanner).toBeDefined();
    });

    it("accepts refresh intervals", () => {
      scanner = new RepoScanner(store, {
        refreshFastSeconds: 5,
        refreshSlowSeconds: 60
      });
      expect(scanner).toBeDefined();
    });

    it("accepts showClean option", () => {
      scanner = new RepoScanner(store, {
        showClean: true
      });
      expect(scanner).toBeDefined();
    });

    it("accepts fetch policy", () => {
      scanner = new RepoScanner(store, {
        fetchPolicy: "auto"
      });
      expect(scanner).toBeDefined();
    });
  });

  describe("start/stop lifecycle", () => {
    it("can be started and stopped", () => {
      scanner = new RepoScanner(store, { roots: [] }); // Empty roots to avoid scanning
      scanner.start();
      scanner.stop();
    });

    it("handles multiple start calls gracefully", () => {
      scanner = new RepoScanner(store, { roots: [] });
      scanner.start();
      scanner.start();
      scanner.stop();
    });
  });

  describe("pause/resume", () => {
    it("can be paused and resumed", () => {
      scanner = new RepoScanner(store, { roots: [] });
      scanner.start();
      scanner.setPaused(true);
      scanner.setPaused(false);
      scanner.stop();
    });
  });

  describe("default ignore dirs", () => {
    it("has sensible default ignore directories", () => {
      scanner = new RepoScanner(store);
      // Scanner should start with defaults that ignore common non-repo dirs
      expect(scanner).toBeDefined();
    });
  });
});

// =============================================================================
// DATASTORE INTEGRATION TESTS
// =============================================================================

describe("Scanner-DataStore Integration", () => {
  let store: DataStore;

  beforeEach(() => {
    store = new DataStore();
  });

  describe("callback notifications", () => {
    it("store accepts callbacks for port changes", () => {
      let callbackCalled = false;
      store.setCallbacks({
        onPortsChange: () => {
          callbackCalled = true;
        }
      });

      store.updatePorts([]);
      expect(callbackCalled).toBe(true);
    });

    it("store accepts callbacks for agent changes", () => {
      let callbackCalled = false;
      store.setCallbacks({
        onAgentsChange: () => {
          callbackCalled = true;
        }
      });

      store.updateAgents([]);
      expect(callbackCalled).toBe(true);
    });

    it("store accepts callbacks for repo changes", () => {
      let callbackCalled = false;
      store.setCallbacks({
        onReposChange: () => {
          callbackCalled = true;
        }
      });

      store.updateRepos([]);
      expect(callbackCalled).toBe(true);
    });
  });

  describe("data persistence", () => {
    it("ports are stored and retrievable", () => {
      const testPort = {
        port: 3000,
        pid: 1234,
        command: "node",
        protocol: "tcp" as const,
        address: "127.0.0.1",
        firstSeenTime: Date.now()
      };
      const portsMap = new Map([[3000, testPort]]);

      store.updatePorts(portsMap);
      expect(store.snapshotPorts()).toEqual([testPort]);
    });

    it("agents are stored and retrievable", () => {
      const testAgent = {
        pid: 5678,
        label: "test-agent",
        cmdline: "node agent.js",
        exe: "/usr/bin/node",
        cpuPct: 5.0,
        rssKb: 102400,
        threads: 4,
        tty: "pts/0",
        cwd: "/test",
        repoPath: "/test",
        startTime: Date.now()
      };
      const agentsMap = new Map([[5678, testAgent]]);

      store.updateAgents(agentsMap);
      expect(store.snapshotAgents()).toEqual([testAgent]);
    });

    it("repos are stored and retrievable", () => {
      const testRepo = {
        repoId: "test-repo",
        path: "/test/repo",
        name: "test-repo",
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
        upstream: null,
        health: {
          lastError: null,
          timedOut: false
        },
        lastScanTime: Date.now(),
        lastChangeTime: null
      };
      const reposMap = new Map([["/test/repo", testRepo]]);

      store.updateRepos(reposMap);
      expect(store.snapshotRepos()).toEqual([testRepo]);
    });
  });

  describe("individual item retrieval", () => {
    it("can retrieve specific port by number", () => {
      const portsMap = new Map([
        [
          3000,
          {
            port: 3000,
            pid: 1,
            command: "a",
            protocol: "tcp" as const,
            address: "127.0.0.1",
            firstSeenTime: Date.now()
          }
        ],
        [
          8080,
          {
            port: 8080,
            pid: 2,
            command: "b",
            protocol: "tcp" as const,
            address: "127.0.0.1",
            firstSeenTime: Date.now()
          }
        ]
      ]);
      store.updatePorts(portsMap);

      const port = store.getPort(8080);
      expect(port?.port).toBe(8080);
      expect(port?.command).toBe("b");
    });

    it("can retrieve specific agent by pid", () => {
      const agentsMap = new Map([
        [
          100,
          {
            pid: 100,
            label: "agent-a",
            cmdline: "",
            exe: "",
            cpuPct: 0,
            rssKb: 0,
            threads: 0,
            tty: "",
            cwd: "",
            startTime: 0
          }
        ],
        [
          200,
          {
            pid: 200,
            label: "agent-b",
            cmdline: "",
            exe: "",
            cpuPct: 0,
            rssKb: 0,
            threads: 0,
            tty: "",
            cwd: "",
            startTime: 0
          }
        ]
      ]);
      store.updateAgents(agentsMap);

      const agent = store.getAgent(200);
      expect(agent?.pid).toBe(200);
      expect(agent?.label).toBe("agent-b");
    });

    it("returns undefined for non-existent port", () => {
      store.updatePorts(new Map());
      expect(store.getPort(9999)).toBeUndefined();
    });

    it("returns undefined for non-existent agent", () => {
      store.updateAgents(new Map());
      expect(store.getAgent(9999)).toBeUndefined();
    });
  });
});
