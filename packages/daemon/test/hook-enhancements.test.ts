/**
 * Hook Enhancements API Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { HookStore } from "@agentwatch/monitor";
import { Hono } from "hono";
import {
  type EnhancementsState,
  registerEnhancementEndpoints
} from "../src/api-enhancements";
import type { Config } from "../src/config";
import { CostLimitsChecker, CostTracker } from "../src/cost";
import {
  NotificationHub,
  type NotificationHubConfig
} from "../src/notifications/hub";
import { RuleEngine } from "../src/rules/engine";

// Create a mock notification hub config
function createMockNotificationHubConfig(): NotificationHubConfig {
  return {
    enabled: false,
    desktop: { enabled: false },
    webhooks: [],
    routing: []
  };
}

// Create a mock config with all hook enhancement settings
function createMockConfig(): Config {
  return {
    roots: [],
    repo: {
      refreshFastSeconds: 5,
      refreshSlowSeconds: 30,
      includeUntracked: true,
      showClean: false
    },
    daemon: {
      host: "127.0.0.1",
      port: 8420
    },
    testGate: {
      enabled: false,
      testCommand: "npm test",
      passFile: "/tmp/test-pass",
      passFileMaxAgeSeconds: 300
    },
    notifications: {
      enable: false,
      hookAwaitingInput: true,
      hookSessionEnd: true,
      hookToolFailure: true,
      hookLongRunning: true,
      longRunningThresholdSeconds: 120,
      hookSessionStart: false,
      hookPreToolUse: false,
      hookPostToolUse: false,
      hookNotification: false,
      hookPermissionRequest: false,
      hookUserPromptSubmit: false,
      hookStop: false,
      hookSubagentStop: false,
      hookPreCompact: false
    },
    agents: {
      refreshSeconds: 2,
      matchers: []
    },
    hookEnhancements: {
      rules: {
        enabled: false,
        rulesFile: "",
        enabledRuleSets: []
      },
      autoPermissions: {
        enabled: false,
        autoApproveReadOnly: false
      },
      contextInjection: {
        injectGitContext: false,
        injectProjectContext: false,
        maxContextLines: 100
      },
      inputModification: {
        enabled: false,
        addDryRunFlags: false,
        enforceCommitFormat: false,
        commitMessagePrefix: null
      },
      stopBlocking: {
        enabled: false,
        requireTestsPass: false,
        requireNoLintErrors: false,
        requireCoverageThreshold: null,
        maxBlockAttempts: 3
      },
      promptValidation: {
        enabled: false,
        blockPatterns: [],
        warnPatterns: [],
        minLength: null,
        maxLength: null
      },
      costControls: {
        enabled: false,
        sessionBudgetUsd: null,
        dailyBudgetUsd: null,
        monthlyBudgetUsd: null,
        alertThresholds: [50, 80, 100],
        overBudgetAction: "warn" as const
      },
      llmEvaluation: {
        enabled: false,
        provider: "anthropic" as const,
        model: "claude-3-haiku-20240307",
        triggerHooks: ["PreToolUse"]
      }
    }
  };
}

describe("Hook Enhancements API", () => {
  let app: Hono;
  let config: Config;
  let ruleEngine: RuleEngine;
  let hookStore: HookStore;
  let costTracker: CostTracker;
  let costLimitsChecker: CostLimitsChecker;
  let notificationHub: NotificationHub;

  beforeEach(() => {
    app = new Hono();
    config = createMockConfig();
    ruleEngine = new RuleEngine(config.hookEnhancements.rules);
    hookStore = new HookStore();
    costTracker = new CostTracker();
    costLimitsChecker = new CostLimitsChecker(
      config.hookEnhancements.costControls
    );
    notificationHub = new NotificationHub(createMockNotificationHubConfig());

    const getState = (): EnhancementsState => ({
      config,
      hookStore,
      ruleEngine,
      costTracker,
      costLimitsChecker,
      notificationHub
    });

    registerEnhancementEndpoints(app, getState);
  });

  describe("GET /api/hook-enhancements", () => {
    it("returns current hook enhancement configuration", async () => {
      const res = await app.request("/api/hook-enhancements");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("rules");
      expect(data).toHaveProperty("auto_permissions");
      expect(data).toHaveProperty("context_injection");
      expect(data).toHaveProperty("input_modification");
      expect(data).toHaveProperty("stop_blocking");
      expect(data).toHaveProperty("prompt_validation");
      expect(data).toHaveProperty("cost_controls");
      expect(data).toHaveProperty("llm_evaluation");
    });

    it("returns correct default values", async () => {
      const res = await app.request("/api/hook-enhancements");
      const data = await res.json();

      expect(data.rules.enabled).toBe(false);
      expect(data.auto_permissions.enabled).toBe(false);
      expect(data.cost_controls.enabled).toBe(false);
      expect(data.cost_controls.daily_budget_usd).toBeNull();
      expect(data.llm_evaluation.provider).toBe("anthropic");
    });
  });

  describe("PATCH /api/hook-enhancements", () => {
    it("updates rules.enabled", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: { enabled: true } })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.updates).toContain("rules.enabled = true");
      expect(config.hookEnhancements.rules.enabled).toBe(true);
    });

    it("updates auto_permissions settings", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_permissions: {
            enabled: true,
            auto_approve_read_only: true
          }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.updates).toContain("auto_permissions.enabled = true");
      expect(data.updates).toContain(
        "auto_permissions.auto_approve_read_only = true"
      );
      expect(config.hookEnhancements.autoPermissions.enabled).toBe(true);
      expect(config.hookEnhancements.autoPermissions.autoApproveReadOnly).toBe(
        true
      );
    });

    it("updates cost_controls with budget values", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_controls: {
            enabled: true,
            daily_budget_usd: 10,
            monthly_budget_usd: 100,
            over_budget_action: "block"
          }
        })
      });

      expect(res.status).toBe(200);
      expect(config.hookEnhancements.costControls.enabled).toBe(true);
      expect(config.hookEnhancements.costControls.dailyBudgetUsd).toBe(10);
      expect(config.hookEnhancements.costControls.monthlyBudgetUsd).toBe(100);
      expect(config.hookEnhancements.costControls.overBudgetAction).toBe(
        "block"
      );
    });

    it("updates stop_blocking settings", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stop_blocking: {
            enabled: true,
            require_tests_pass: true,
            require_no_lint_errors: true
          }
        })
      });

      expect(res.status).toBe(200);
      expect(config.hookEnhancements.stopBlocking.enabled).toBe(true);
      expect(config.hookEnhancements.stopBlocking.requireTestsPass).toBe(true);
      expect(config.hookEnhancements.stopBlocking.requireNoLintErrors).toBe(
        true
      );
    });

    it("updates llm_evaluation settings", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_evaluation: {
            enabled: true,
            provider: "openai",
            model: "gpt-4"
          }
        })
      });

      expect(res.status).toBe(200);
      expect(config.hookEnhancements.llmEvaluation.enabled).toBe(true);
      expect(config.hookEnhancements.llmEvaluation.provider).toBe("openai");
      expect(config.hookEnhancements.llmEvaluation.model).toBe("gpt-4");
    });

    it("updates multiple sections at once", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: { enabled: true },
          cost_controls: { enabled: true, daily_budget_usd: 5 },
          stop_blocking: { enabled: true }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.updates.length).toBeGreaterThanOrEqual(3);
      expect(config.hookEnhancements.rules.enabled).toBe(true);
      expect(config.hookEnhancements.costControls.enabled).toBe(true);
      expect(config.hookEnhancements.stopBlocking.enabled).toBe(true);
    });

    it("ignores unknown fields", async () => {
      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unknown_section: { foo: "bar" },
          rules: { enabled: true }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      // Should still process valid fields
      expect(data.updates).toContain("rules.enabled = true");
    });

    it("handles null budget values", async () => {
      // First set a budget
      config.hookEnhancements.costControls.dailyBudgetUsd = 50;

      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_controls: { daily_budget_usd: null }
        })
      });

      expect(res.status).toBe(200);
      expect(config.hookEnhancements.costControls.dailyBudgetUsd).toBeNull();
    });
  });
});

describe("Rules API", () => {
  let app: Hono;
  let config: Config;
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    app = new Hono();
    config = createMockConfig();
    ruleEngine = new RuleEngine(config.hookEnhancements.rules);
    const hookStore = new HookStore();
    const costTracker = new CostTracker();
    const costLimitsChecker = new CostLimitsChecker(
      config.hookEnhancements.costControls
    );
    const notificationHub = new NotificationHub(
      createMockNotificationHubConfig()
    );

    const getState = (): EnhancementsState => ({
      config,
      hookStore,
      ruleEngine,
      costTracker,
      costLimitsChecker,
      notificationHub
    });

    registerEnhancementEndpoints(app, getState);
  });

  describe("GET /api/rules", () => {
    it("returns empty list initially", async () => {
      const res = await app.request("/api/rules");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.rules).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("returns added rules", async () => {
      ruleEngine.addRule({
        id: "test-rule",
        name: "Test Rule",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules");
      const data = await res.json();

      expect(data.total).toBe(1);
      expect(data.rules[0].id).toBe("test-rule");
      expect(data.rules[0].name).toBe("Test Rule");
    });
  });

  describe("POST /api/rules", () => {
    it("creates a new rule", async () => {
      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "new-rule",
          name: "New Rule",
          hookTypes: ["PreToolUse"],
          conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
          action: { type: "deny", reason: "Bash blocked" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.rule.id).toBe("new-rule");

      // Verify rule was added
      const rule = ruleEngine.getRule("new-rule");
      expect(rule).toBeDefined();
      expect(rule?.name).toBe("New Rule");
    });

    it("returns error for missing id", async () => {
      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No ID Rule" })
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/rules/:id", () => {
    it("deletes an existing rule", async () => {
      ruleEngine.addRule({
        id: "to-delete",
        name: "To Delete",
        enabled: true,
        priority: 100,
        hookTypes: [],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules/to-delete", {
        method: "DELETE"
      });

      expect(res.status).toBe(200);
      expect(ruleEngine.getRule("to-delete")).toBeUndefined();
    });

    it("returns 404 for non-existent rule", async () => {
      const res = await app.request("/api/rules/does-not-exist", {
        method: "DELETE"
      });

      expect(res.status).toBe(404);
    });
  });
});
