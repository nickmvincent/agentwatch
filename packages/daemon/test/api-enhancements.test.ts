/**
 * Hook Enhancements API Tests
 *
 * Tests for the enhancement API endpoints including rules, cost controls,
 * and notifications.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { HookEventType } from "@agentwatch/core";
import { Hono } from "hono";
import type { EnhancementsState } from "../src/api-enhancements";
import { registerEnhancementEndpoints } from "../src/api-enhancements";
import type {
  Rule,
  RuleAction,
  RuleEvaluationResult
} from "../src/rules/types";

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

interface MockRule extends Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  hookTypes: HookEventType[];
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  action: RuleAction;
}

class MockRuleEngine {
  private rules: Map<string, MockRule> = new Map();

  getAllRules(): MockRule[] {
    return Array.from(this.rules.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  getRule(id: string): MockRule | undefined {
    return this.rules.get(id);
  }

  addRule(rule: Rule): void {
    this.rules.set(rule.id, rule as MockRule);
  }

  updateRule(id: string, rule: Rule): void {
    this.rules.set(id, rule as MockRule);
  }

  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  evaluate(context: { hookType: HookEventType }): RuleEvaluationResult {
    const matchingRule = this.getAllRules().find(
      (r) =>
        r.enabled &&
        (r.hookTypes.length === 0 || r.hookTypes.includes(context.hookType))
    );

    if (matchingRule) {
      return {
        matched: true,
        matchedRule: matchingRule,
        action: matchingRule.action
      };
    }

    return {
      matched: false,
      action: { type: "allow" }
    };
  }
}

class MockCostTracker {
  private dailyHistory: Array<{
    periodId: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
  }> = [];

  private monthlyHistory: Array<{
    periodId: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    sessionCount: number;
  }> = [];

  getDailyHistory(days: number) {
    return this.dailyHistory.slice(0, days);
  }

  getMonthlyHistory(months: number) {
    return this.monthlyHistory.slice(0, months);
  }

  setDailyHistory(history: typeof this.dailyHistory) {
    this.dailyHistory = history;
  }

  setMonthlyHistory(history: typeof this.monthlyHistory) {
    this.monthlyHistory = history;
  }
}

class MockCostLimitsChecker {
  private status = {
    daily: {
      costUsd: 0.5,
      inputTokens: 1000,
      outputTokens: 500,
      sessionCount: 3
    },
    monthly: {
      costUsd: 10,
      inputTokens: 20000,
      outputTokens: 10000,
      sessionCount: 50
    },
    limits: { session: 1.0, daily: 5.0, monthly: 100.0 },
    alerts: [] as Array<{
      type: string;
      budget: string;
      current: number;
      limit: number;
      percentage: number;
      timestamp: number;
    }>
  };

  getStatus() {
    return this.status;
  }

  setStatus(status: typeof this.status) {
    this.status = status;
  }

  updateConfig(_config: unknown) {
    // Mock implementation
  }
}

class MockNotificationHub {
  private providers: string[] = ["webhook:default"];
  private available = true;
  private webhooks: Map<string, unknown> = new Map();

  getProviderNames(): string[] {
    return this.providers;
  }

  isAvailable(): boolean {
    return this.available;
  }

  setAvailable(available: boolean) {
    this.available = available;
  }

  async testProvider(name: string) {
    if (!this.providers.includes(name)) {
      return { success: false, provider: name, error: "Provider not found" };
    }
    return { success: true, provider: name };
  }

  async testAll() {
    const results = await Promise.all(
      this.providers.map((name) => this.testProvider(name))
    );
    return {
      success: results.every((r) => r.success),
      results
    };
  }

  addWebhook(webhook: { id: string; [key: string]: unknown }) {
    this.webhooks.set(webhook.id, webhook);
    if (!this.providers.includes(`webhook:${webhook.id}`)) {
      this.providers.push(`webhook:${webhook.id}`);
    }
  }

  removeWebhook(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      const idx = this.providers.indexOf(`webhook:${id}`);
      if (idx >= 0) this.providers.splice(idx, 1);
    }
    return deleted;
  }
}

// =============================================================================
// TEST SETUP
// =============================================================================

function createDefaultConfig() {
  return {
    hookEnhancements: {
      rules: {
        enabled: true,
        rulesFile: "rules.json",
        enabledRuleSets: ["default"]
      },
      autoPermissions: {
        enabled: false,
        autoApproveReadOnly: false
      },
      contextInjection: {
        injectGitContext: true,
        injectProjectContext: true,
        maxContextLines: 100
      },
      inputModification: {
        enabled: false,
        addDryRunFlags: false,
        enforceCommitFormat: false,
        commitMessagePrefix: ""
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
        enabled: true,
        sessionBudgetUsd: 1.0,
        dailyBudgetUsd: 5.0,
        monthlyBudgetUsd: 100.0,
        alertThresholds: [0.5, 0.8, 0.95],
        overBudgetAction: "warn" as const
      },
      llmEvaluation: {
        enabled: false,
        provider: "anthropic" as const,
        model: "claude-3-haiku-20240307",
        triggerHooks: []
      }
    }
  };
}

function createTestApp() {
  const app = new Hono();
  const config = createDefaultConfig();
  const ruleEngine = new MockRuleEngine();
  const costTracker = new MockCostTracker();
  const costLimitsChecker = new MockCostLimitsChecker();
  const notificationHub = new MockNotificationHub();

  const getState = (): EnhancementsState =>
    ({
      config,
      hookStore: {} as any,
      ruleEngine: ruleEngine as any,
      costTracker: costTracker as any,
      costLimitsChecker: costLimitsChecker as any,
      notificationHub: notificationHub as any
    }) as EnhancementsState;

  registerEnhancementEndpoints(app, getState);

  return {
    app,
    config,
    ruleEngine,
    costTracker,
    costLimitsChecker,
    notificationHub
  };
}

// =============================================================================
// RULE MANAGEMENT TESTS
// =============================================================================

describe("Rule Management API", () => {
  describe("GET /api/rules", () => {
    it("returns empty rules list", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/rules");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.rules).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("returns rules with correct format", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "rule-1",
        name: "Block Dangerous Commands",
        enabled: true,
        priority: 10,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "tool_name", operator: "eq", value: "Bash" }],
        action: { type: "block", reason: "Blocked" }
      });

      const res = await app.request("/api/rules");
      const data = await res.json();

      expect(data.rules.length).toBe(1);
      expect(data.rules[0].id).toBe("rule-1");
      expect(data.rules[0].name).toBe("Block Dangerous Commands");
      expect(data.rules[0].enabled).toBe(true);
      expect(data.rules[0].priority).toBe(10);
      expect(data.rules[0].hook_types).toEqual(["PreToolUse"]);
      expect(data.rules[0].conditions_count).toBe(1);
      expect(data.rules[0].action).toBe("block");
      expect(data.total).toBe(1);
    });

    it("returns multiple rules sorted by priority", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "rule-low",
        name: "Low Priority",
        enabled: true,
        priority: 100,
        hookTypes: [],
        conditions: [],
        action: { type: "allow" }
      });
      ruleEngine.addRule({
        id: "rule-high",
        name: "High Priority",
        enabled: true,
        priority: 10,
        hookTypes: [],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules");
      const data = await res.json();

      expect(data.rules.length).toBe(2);
      expect(data.rules[0].id).toBe("rule-high");
      expect(data.rules[1].id).toBe("rule-low");
    });
  });

  describe("GET /api/rules/:id", () => {
    it("returns specific rule", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "my-rule",
        name: "My Rule",
        enabled: true,
        priority: 50,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules/my-rule");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.rule.id).toBe("my-rule");
      expect(data.rule.name).toBe("My Rule");
    });

    it("returns 404 for non-existent rule", async () => {
      const { app } = createTestApp();
      const res = await app.request("/api/rules/does-not-exist");
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Rule not found");
    });
  });

  describe("POST /api/rules", () => {
    it("creates a new rule", async () => {
      const { app, ruleEngine } = createTestApp();

      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "new-rule",
          name: "New Rule",
          enabled: true,
          priority: 50,
          hookTypes: ["PreToolUse"],
          conditions: [{ field: "tool_name", operator: "eq", value: "Bash" }],
          action: { type: "block", reason: "Not allowed" }
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

    it("creates rule with defaults for missing fields", async () => {
      const { app, ruleEngine } = createTestApp();

      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "minimal-rule",
          name: "Minimal Rule"
        })
      });

      expect(res.status).toBe(200);

      const rule = ruleEngine.getRule("minimal-rule");
      expect(rule?.enabled).toBe(true);
      expect(rule?.priority).toBe(100);
      expect(rule?.hookTypes).toEqual([]);
      expect(rule?.conditions).toEqual([]);
      expect(rule?.action).toEqual({ type: "allow" });
    });

    it("returns 400 for missing id", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No ID Rule" })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("id and name");
    });

    it("returns 400 for missing name", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "no-name-rule" })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("id and name");
    });
  });

  describe("PUT /api/rules/:id", () => {
    it("updates an existing rule", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "update-me",
        name: "Original Name",
        enabled: true,
        priority: 50,
        hookTypes: [],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules/update-me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Name",
          enabled: false,
          priority: 10
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.rule.name).toBe("Updated Name");
      expect(data.rule.enabled).toBe(false);
      expect(data.rule.priority).toBe(10);
      expect(data.rule.id).toBe("update-me"); // ID cannot change
    });

    it("returns 404 for non-existent rule", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules/does-not-exist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" })
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/rules/:id", () => {
    it("deletes an existing rule", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "delete-me",
        name: "To Delete",
        enabled: true,
        priority: 50,
        hookTypes: [],
        conditions: [],
        action: { type: "allow" }
      });

      const res = await app.request("/api/rules/delete-me", {
        method: "DELETE"
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");

      // Verify rule was deleted
      expect(ruleEngine.getRule("delete-me")).toBeUndefined();
    });

    it("returns 404 for non-existent rule", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules/does-not-exist", {
        method: "DELETE"
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/rules/test", () => {
    it("tests rule evaluation with context", async () => {
      const { app, ruleEngine } = createTestApp();
      ruleEngine.addRule({
        id: "bash-blocker",
        name: "Block Bash",
        enabled: true,
        priority: 10,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "tool_name", operator: "eq", value: "Bash" }],
        action: { type: "block", reason: "Bash blocked" }
      });

      const res = await app.request("/api/rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            hook_type: "PreToolUse",
            session_id: "test-session",
            tool_name: "Bash",
            tool_input: { command: "rm -rf /" }
          }
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.matched).toBe(true);
      expect(data.rule_id).toBe("bash-blocker");
      expect(data.action.type).toBe("block");
    });

    it("returns no match when no rules apply", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            hook_type: "PostToolUse",
            tool_name: "Read"
          }
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.matched).toBe(false);
    });

    it("returns 400 when context is missing", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/rules/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Context is required");
    });
  });
});

// =============================================================================
// COST CONTROL TESTS
// =============================================================================

describe("Cost Control API", () => {
  describe("GET /api/cost/status", () => {
    it("returns current cost status", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/cost/status");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.enabled).toBe(true);
      expect(data.daily).toBeDefined();
      expect(data.daily.cost_usd).toBe(0.5);
      expect(data.daily.input_tokens).toBe(1000);
      expect(data.daily.output_tokens).toBe(500);
      expect(data.daily.session_count).toBe(3);

      expect(data.monthly).toBeDefined();
      expect(data.monthly.cost_usd).toBe(10);

      expect(data.limits).toBeDefined();
      expect(data.limits.session_usd).toBe(1.0);
      expect(data.limits.daily_usd).toBe(5.0);
      expect(data.limits.monthly_usd).toBe(100.0);

      expect(data.alerts).toEqual([]);
    });

    it("returns alerts when present", async () => {
      const { app, costLimitsChecker } = createTestApp();
      costLimitsChecker.setStatus({
        daily: {
          costUsd: 4.5,
          inputTokens: 9000,
          outputTokens: 4500,
          sessionCount: 25
        },
        monthly: {
          costUsd: 10,
          inputTokens: 20000,
          outputTokens: 10000,
          sessionCount: 50
        },
        limits: { session: 1.0, daily: 5.0, monthly: 100.0 },
        alerts: [
          {
            type: "warning",
            budget: "daily",
            current: 4.5,
            limit: 5.0,
            percentage: 90,
            timestamp: Date.now()
          }
        ]
      });

      const res = await app.request("/api/cost/status");
      const data = await res.json();

      expect(data.alerts.length).toBe(1);
      expect(data.alerts[0].type).toBe("warning");
      expect(data.alerts[0].budget).toBe("daily");
      expect(data.alerts[0].percentage).toBe(90);
    });
  });

  describe("GET /api/cost/history", () => {
    it("returns cost history", async () => {
      const { app, costTracker } = createTestApp();
      costTracker.setDailyHistory([
        {
          periodId: "2024-01-01",
          costUsd: 2.5,
          inputTokens: 5000,
          outputTokens: 2500,
          sessionCount: 10
        },
        {
          periodId: "2024-01-02",
          costUsd: 3.0,
          inputTokens: 6000,
          outputTokens: 3000,
          sessionCount: 12
        }
      ]);
      costTracker.setMonthlyHistory([
        {
          periodId: "2024-01",
          costUsd: 50,
          inputTokens: 100000,
          outputTokens: 50000,
          sessionCount: 200
        }
      ]);

      const res = await app.request("/api/cost/history");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.daily.length).toBe(2);
      expect(data.daily[0].period).toBe("2024-01-01");
      expect(data.daily[0].cost_usd).toBe(2.5);

      expect(data.monthly.length).toBe(1);
      expect(data.monthly[0].period).toBe("2024-01");
      expect(data.monthly[0].cost_usd).toBe(50);
    });

    it("respects days and months query params", async () => {
      const { app, costTracker } = createTestApp();
      costTracker.setDailyHistory([
        {
          periodId: "2024-01-01",
          costUsd: 1,
          inputTokens: 0,
          outputTokens: 0,
          sessionCount: 0
        },
        {
          periodId: "2024-01-02",
          costUsd: 2,
          inputTokens: 0,
          outputTokens: 0,
          sessionCount: 0
        },
        {
          periodId: "2024-01-03",
          costUsd: 3,
          inputTokens: 0,
          outputTokens: 0,
          sessionCount: 0
        }
      ]);

      const res = await app.request("/api/cost/history?days=2&months=1");
      const data = await res.json();

      expect(data.daily.length).toBe(2);
    });
  });

  describe("PATCH /api/cost/limits", () => {
    it("updates cost limits", async () => {
      const { app, config } = createTestApp();

      const res = await app.request("/api/cost/limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          session_budget_usd: 2.0,
          daily_budget_usd: 10.0,
          monthly_budget_usd: 200.0,
          over_budget_action: "block"
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.updates.length).toBe(5);

      // Verify config was updated
      expect(config.hookEnhancements.costControls.enabled).toBe(false);
      expect(config.hookEnhancements.costControls.sessionBudgetUsd).toBe(2.0);
      expect(config.hookEnhancements.costControls.dailyBudgetUsd).toBe(10.0);
      expect(config.hookEnhancements.costControls.monthlyBudgetUsd).toBe(200.0);
      expect(config.hookEnhancements.costControls.overBudgetAction).toBe(
        "block"
      );
    });

    it("allows setting limits to null", async () => {
      const { app, config } = createTestApp();

      const res = await app.request("/api/cost/limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_budget_usd: null,
          daily_budget_usd: null
        })
      });

      expect(res.status).toBe(200);

      expect(config.hookEnhancements.costControls.sessionBudgetUsd).toBeNull();
      expect(config.hookEnhancements.costControls.dailyBudgetUsd).toBeNull();
    });

    it("validates over_budget_action", async () => {
      const { app, config } = createTestApp();

      // Invalid action should be ignored
      await app.request("/api/cost/limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          over_budget_action: "invalid_action"
        })
      });

      // Should still be the original value
      expect(config.hookEnhancements.costControls.overBudgetAction).toBe(
        "warn"
      );
    });
  });
});

// =============================================================================
// NOTIFICATION HUB TESTS
// =============================================================================

describe("Notification Hub API", () => {
  describe("GET /api/notifications/providers", () => {
    it("returns available providers", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/providers");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.providers).toContain("webhook:default");
      expect(data.available).toBe(true);
    });

    it("shows not available when hub is unavailable", async () => {
      const { app, notificationHub } = createTestApp();
      notificationHub.setAvailable(false);

      const res = await app.request("/api/notifications/providers");
      const data = await res.json();

      expect(data.available).toBe(false);
    });
  });

  describe("POST /api/notifications/test/:provider", () => {
    it("tests a specific provider", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/test/webhook:default", {
        method: "POST"
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.provider).toBe("webhook:default");
    });

    it("returns error for non-existent provider", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/test/does-not-exist", {
        method: "POST"
      });

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("not found");
    });
  });

  describe("POST /api/notifications/test", () => {
    it("tests all providers", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/test", {
        method: "POST"
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.results.length).toBeGreaterThan(0);
    });
  });

  describe("POST /api/notifications/webhooks", () => {
    it("adds a new webhook", async () => {
      const { app, notificationHub } = createTestApp();

      const res = await app.request("/api/notifications/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "my-webhook",
          name: "My Webhook",
          url: "https://example.com/webhook",
          method: "POST",
          headers: { Authorization: "Bearer token" },
          enabled: true,
          hook_types: ["PreToolUse", "Stop"]
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.webhook.id).toBe("my-webhook");
      expect(data.webhook.url).toBe("https://example.com/webhook");

      // Verify webhook was added
      expect(notificationHub.getProviderNames()).toContain(
        "webhook:my-webhook"
      );
    });

    it("returns 400 for missing id", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/webhook"
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("id and url");
    });

    it("returns 400 for missing url", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/notifications/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "no-url-webhook"
        })
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/notifications/webhooks/:id", () => {
    it("deletes an existing webhook", async () => {
      const { app, notificationHub } = createTestApp();
      notificationHub.addWebhook({
        id: "delete-me",
        url: "https://example.com"
      });

      const res = await app.request("/api/notifications/webhooks/delete-me", {
        method: "DELETE"
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");

      // Verify webhook was removed
      expect(notificationHub.getProviderNames()).not.toContain(
        "webhook:delete-me"
      );
    });

    it("returns 404 for non-existent webhook", async () => {
      const { app } = createTestApp();

      const res = await app.request(
        "/api/notifications/webhooks/does-not-exist",
        {
          method: "DELETE"
        }
      );

      expect(res.status).toBe(404);
    });
  });
});

// =============================================================================
// HOOK ENHANCEMENTS CONFIG TESTS
// =============================================================================

describe("Hook Enhancements Config API", () => {
  describe("GET /api/hook-enhancements", () => {
    it("returns full configuration", async () => {
      const { app } = createTestApp();

      const res = await app.request("/api/hook-enhancements");
      expect(res.status).toBe(200);

      const data = await res.json();

      // Rules
      expect(data.rules.enabled).toBe(true);
      expect(data.rules.rules_file).toBe("rules.json");

      // Auto permissions
      expect(data.auto_permissions.enabled).toBe(false);
      expect(data.auto_permissions.auto_approve_read_only).toBe(false);

      // Context injection
      expect(data.context_injection.inject_git_context).toBe(true);
      expect(data.context_injection.inject_project_context).toBe(true);

      // Stop blocking
      expect(data.stop_blocking.enabled).toBe(false);

      // Cost controls
      expect(data.cost_controls.enabled).toBe(true);
      expect(data.cost_controls.session_budget_usd).toBe(1.0);

      // LLM evaluation
      expect(data.llm_evaluation.enabled).toBe(false);
      expect(data.llm_evaluation.provider).toBe("anthropic");
    });
  });

  describe("PATCH /api/hook-enhancements", () => {
    it("updates rules config", async () => {
      const { app, config } = createTestApp();

      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: { enabled: false }
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.updates).toContain("rules.enabled = false");
      expect(config.hookEnhancements.rules.enabled).toBe(false);
    });

    it("updates auto_permissions config", async () => {
      const { app, config } = createTestApp();

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

      expect(config.hookEnhancements.autoPermissions.enabled).toBe(true);
      expect(config.hookEnhancements.autoPermissions.autoApproveReadOnly).toBe(
        true
      );
    });

    it("updates context_injection config", async () => {
      const { app, config } = createTestApp();

      await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_injection: {
            inject_git_context: false,
            inject_project_context: false
          }
        })
      });

      expect(config.hookEnhancements.contextInjection.injectGitContext).toBe(
        false
      );
      expect(
        config.hookEnhancements.contextInjection.injectProjectContext
      ).toBe(false);
    });

    it("updates stop_blocking config", async () => {
      const { app, config } = createTestApp();

      await app.request("/api/hook-enhancements", {
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

      expect(config.hookEnhancements.stopBlocking.enabled).toBe(true);
      expect(config.hookEnhancements.stopBlocking.requireTestsPass).toBe(true);
      expect(config.hookEnhancements.stopBlocking.requireNoLintErrors).toBe(
        true
      );
    });

    it("updates cost_controls config", async () => {
      const { app, config } = createTestApp();

      await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cost_controls: {
            enabled: false,
            session_budget_usd: 5.0,
            daily_budget_usd: null,
            over_budget_action: "block"
          }
        })
      });

      expect(config.hookEnhancements.costControls.enabled).toBe(false);
      expect(config.hookEnhancements.costControls.sessionBudgetUsd).toBe(5.0);
      expect(config.hookEnhancements.costControls.dailyBudgetUsd).toBeNull();
      expect(config.hookEnhancements.costControls.overBudgetAction).toBe(
        "block"
      );
    });

    it("updates llm_evaluation config", async () => {
      const { app, config } = createTestApp();

      await app.request("/api/hook-enhancements", {
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

      expect(config.hookEnhancements.llmEvaluation.enabled).toBe(true);
      expect(config.hookEnhancements.llmEvaluation.provider).toBe("openai");
      expect(config.hookEnhancements.llmEvaluation.model).toBe("gpt-4");
    });

    it("validates llm provider", async () => {
      const { app, config } = createTestApp();

      await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_evaluation: {
            provider: "invalid_provider"
          }
        })
      });

      // Should still be the original value
      expect(config.hookEnhancements.llmEvaluation.provider).toBe("anthropic");
    });

    it("updates multiple sections at once", async () => {
      const { app, config } = createTestApp();

      const res = await app.request("/api/hook-enhancements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: { enabled: false },
          auto_permissions: { enabled: true },
          stop_blocking: { enabled: true }
        })
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.updates.length).toBe(3);

      expect(config.hookEnhancements.rules.enabled).toBe(false);
      expect(config.hookEnhancements.autoPermissions.enabled).toBe(true);
      expect(config.hookEnhancements.stopBlocking.enabled).toBe(true);
    });
  });
});
