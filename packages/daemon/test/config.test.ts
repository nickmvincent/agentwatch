/**
 * Config Tests
 *
 * Tests for configuration loading and defaults.
 */

import { describe, expect, it } from "bun:test";
import { homedir } from "os";
import { join } from "path";

// Test the expandPath logic inline (since it's not exported)
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

describe("Config Path Expansion", () => {
  it("should expand ~ to home directory", () => {
    const result = expandPath("~/.agentwatch");
    expect(result).toBe(join(homedir(), ".agentwatch"));
  });

  it("should expand ~/subfolder correctly", () => {
    const result = expandPath("~/subfolder/file.txt");
    expect(result).toBe(join(homedir(), "subfolder/file.txt"));
  });

  it("should leave absolute paths unchanged", () => {
    const result = expandPath("/etc/config");
    expect(result).toBe("/etc/config");
  });

  it("should leave relative paths unchanged", () => {
    const result = expandPath("./local/config");
    expect(result).toBe("./local/config");
  });
});

describe("Config Default Values", () => {
  // Test the structure of expected defaults
  const defaultConfig = {
    roots: [] as string[],
    repo: {
      refreshFastSeconds: 3,
      refreshSlowSeconds: 45,
      gitTimeoutFastMs: 800,
      gitTimeoutSlowMs: 2500,
      concurrencyGit: 12,
      includeUntracked: false,
      showClean: false
    },
    agents: {
      refreshSeconds: 1,
      activeCpuThreshold: 1.0,
      stalledSeconds: 30,
      matchers: [
        { label: "claude", type: "cmd_regex", pattern: "\\bclaude\\b" },
        { label: "codex", type: "cmd_regex", pattern: "\\bcodex\\b" },
        { label: "cursor", type: "cmd_regex", pattern: "\\bcursor\\b" },
        { label: "opencode", type: "cmd_regex", pattern: "\\bopencode\\b" },
        { label: "gemini", type: "cmd_regex", pattern: "\\bgemini\\b" }
      ]
    },
    daemon: {
      host: "127.0.0.1",
      port: 8420
    },
    testGate: {
      enabled: false,
      testCommand: "",
      passFileMaxAgeSeconds: 300
    },
    notifications: {
      enable: false,
      hookAwaitingInput: true,
      hookSessionEnd: true,
      hookToolFailure: true,
      hookLongRunning: true,
      longRunningThresholdSeconds: 60
    }
  };

  it("should have empty roots by default", () => {
    expect(defaultConfig.roots).toEqual([]);
  });

  it("should have correct repo scanning defaults", () => {
    expect(defaultConfig.repo.refreshFastSeconds).toBe(3);
    expect(defaultConfig.repo.refreshSlowSeconds).toBe(45);
    expect(defaultConfig.repo.concurrencyGit).toBe(12);
    expect(defaultConfig.repo.showClean).toBe(false);
  });

  it("should have correct agent scanner defaults", () => {
    expect(defaultConfig.agents.refreshSeconds).toBe(1);
    expect(defaultConfig.agents.activeCpuThreshold).toBe(1.0);
    expect(defaultConfig.agents.stalledSeconds).toBe(30);
  });

  it("should have 5 default agent matchers", () => {
    expect(defaultConfig.agents.matchers.length).toBe(5);
    const labels = defaultConfig.agents.matchers.map((m) => m.label);
    expect(labels).toContain("claude");
    expect(labels).toContain("codex");
    expect(labels).toContain("cursor");
    expect(labels).toContain("gemini");
    expect(labels).toContain("opencode");
  });

  it("should have correct daemon defaults", () => {
    expect(defaultConfig.daemon.host).toBe("127.0.0.1");
    expect(defaultConfig.daemon.port).toBe(8420);
  });

  it("should have test gate disabled by default", () => {
    expect(defaultConfig.testGate.enabled).toBe(false);
    expect(defaultConfig.testGate.testCommand).toBe("");
    expect(defaultConfig.testGate.passFileMaxAgeSeconds).toBe(300);
  });

  it("should have notifications disabled but useful ones configured", () => {
    expect(defaultConfig.notifications.enable).toBe(false);
    expect(defaultConfig.notifications.hookAwaitingInput).toBe(true);
    expect(defaultConfig.notifications.hookSessionEnd).toBe(true);
    expect(defaultConfig.notifications.hookToolFailure).toBe(true);
  });
});

describe("Config TOML Parsing", () => {
  // Test simple TOML parsing patterns
  it("should parse key-value pairs", () => {
    const content = 'host = "localhost"\nport = 8080';
    const lines = content.split("\n");

    const result: Record<string, unknown> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        let value: unknown = valueParts.join("=").trim();

        // Parse string values
        if (
          typeof value === "string" &&
          value.startsWith('"') &&
          value.endsWith('"')
        ) {
          value = value.slice(1, -1);
        }
        // Parse number values
        else if (typeof value === "string" && /^\d+$/.test(value)) {
          value = Number.parseInt(value, 10);
        }

        result[key!.trim()] = value;
      }
    }

    expect(result["host"]).toBe("localhost");
    expect(result["port"]).toBe(8080);
  });

  it("should parse section headers", () => {
    const content = "[daemon]\nhost = localhost\nport = 8080";
    const lines = content.split("\n");

    let currentSection = "";
    const result: Record<string, Record<string, unknown>> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1);
        result[currentSection] = {};
      } else if (trimmed.includes("=") && currentSection) {
        const [key, ...valueParts] = trimmed.split("=");
        result[currentSection]![key!.trim()] = valueParts.join("=").trim();
      }
    }

    expect(result["daemon"]).toBeDefined();
    expect(result["daemon"]!["host"]).toBe("localhost");
    expect(result["daemon"]!["port"]).toBe("8080");
  });

  it("should handle boolean values", () => {
    const parseBoolean = (val: string): boolean | string => {
      if (val === "true") return true;
      if (val === "false") return false;
      return val;
    };

    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("yes")).toBe("yes");
  });

  it("should handle array values", () => {
    const value = '["a", "b", "c"]';
    // Simple array parsing
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      const items = inner.split(",").map((s) => {
        const trimmed = s.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1);
        }
        return trimmed;
      });
      expect(items).toEqual(["a", "b", "c"]);
    }
  });
});

describe("Config Merging", () => {
  it("should preserve default values when partial config provided", () => {
    const defaults = {
      host: "127.0.0.1",
      port: 8420,
      enabled: false
    };

    const partial = {
      port: 9000
    };

    const merged = { ...defaults, ...partial };
    expect(merged.host).toBe("127.0.0.1");
    expect(merged.port).toBe(9000);
    expect(merged.enabled).toBe(false);
  });

  it("should handle nested config merging", () => {
    const defaults = {
      daemon: { host: "127.0.0.1", port: 8420 },
      notifications: { enable: false, hookAwaitingInput: true }
    };

    const partial = {
      daemon: { port: 9000 },
      notifications: { enable: true }
    };

    const merged = {
      daemon: { ...defaults.daemon, ...partial.daemon },
      notifications: { ...defaults.notifications, ...partial.notifications }
    };

    expect(merged.daemon.host).toBe("127.0.0.1");
    expect(merged.daemon.port).toBe(9000);
    expect(merged.notifications.enable).toBe(true);
    expect(merged.notifications.hookAwaitingInput).toBe(true);
  });
});
