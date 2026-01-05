/**
 * Hook Enhancements API Endpoints
 *
 * Additional endpoints for rule management, cost tracking, and notifications.
 */

import type { HookEventType } from "@agentwatch/core";
import type { HookStore } from "@agentwatch/monitor";
import type { Hono } from "hono";
import type { Config } from "./config";
import type { CostLimitsChecker, CostTracker } from "./cost";
import type { NotificationHub } from "./notifications/hub";
import type { NotificationResult } from "./notifications/types";
import type { RuleEngine } from "./rules/engine";
import type { Rule, RuleEvaluationContext } from "./rules/types";

export interface EnhancementsState {
  config: Config;
  hookStore: HookStore;
  ruleEngine: RuleEngine;
  costTracker: CostTracker;
  costLimitsChecker: CostLimitsChecker;
  notificationHub: NotificationHub;
}

/**
 * Register hook enhancement endpoints on the app.
 */
export function registerEnhancementEndpoints(
  app: Hono,
  getState: () => EnhancementsState
): void {
  // ==========================================================================
  // Rule Management Endpoints
  // ==========================================================================

  /**
   * GET /api/rules - List all rules
   */
  app.get("/api/rules", (c) => {
    const state = getState();
    const rules = state.ruleEngine.getAllRules();

    return c.json({
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        priority: r.priority,
        hook_types: r.hookTypes,
        conditions_count: r.conditions?.length ?? 0,
        action: r.action.type
      })),
      total: rules.length
    });
  });

  /**
   * GET /api/rules/:id - Get a specific rule
   */
  app.get("/api/rules/:id", (c) => {
    const state = getState();
    const ruleId = c.req.param("id");
    const rule = state.ruleEngine.getRule(ruleId);

    if (!rule) {
      return c.json({ error: "Rule not found" }, 404);
    }

    return c.json({ rule });
  });

  /**
   * POST /api/rules - Add a new rule
   */
  app.post("/api/rules", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as Partial<Rule>;

    if (!body.id || !body.name) {
      return c.json({ error: "Rule must have id and name" }, 400);
    }

    const rule: Rule = {
      id: body.id,
      name: body.name,
      enabled: body.enabled ?? true,
      priority: body.priority ?? 100,
      hookTypes: body.hookTypes ?? [],
      conditions: body.conditions ?? [],
      action: body.action ?? { type: "allow" },
      description: body.description,
      metadata: body.metadata
    };

    state.ruleEngine.addRule(rule);

    return c.json({ status: "ok", rule });
  });

  /**
   * PUT /api/rules/:id - Update a rule
   */
  app.put("/api/rules/:id", async (c) => {
    const state = getState();
    const ruleId = c.req.param("id");
    const body = (await c.req.json()) as Partial<Rule>;

    const existing = state.ruleEngine.getRule(ruleId);
    if (!existing) {
      return c.json({ error: "Rule not found" }, 404);
    }

    const updated: Rule = {
      ...existing,
      ...body,
      id: ruleId // ID cannot be changed
    };

    state.ruleEngine.updateRule(ruleId, updated);

    return c.json({ status: "ok", rule: updated });
  });

  /**
   * DELETE /api/rules/:id - Delete a rule
   */
  app.delete("/api/rules/:id", (c) => {
    const state = getState();
    const ruleId = c.req.param("id");

    const deleted = state.ruleEngine.removeRule(ruleId);

    if (!deleted) {
      return c.json({ error: "Rule not found" }, 404);
    }

    return c.json({ status: "ok" });
  });

  /**
   * POST /api/rules/test - Test a rule against a context
   */
  app.post("/api/rules/test", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as {
      rule_id?: string;
      context: Record<string, unknown>;
    };

    if (!body.context) {
      return c.json({ error: "Context is required" }, 400);
    }

    const hookType = String(
      body.context.hook_type ?? "PreToolUse"
    ) as HookEventType;

    const context: RuleEvaluationContext = {
      hookType,
      sessionId: String(body.context.session_id ?? ""),
      toolName: body.context.tool_name
        ? String(body.context.tool_name)
        : undefined,
      toolInput: (body.context.tool_input as Record<string, unknown>) ?? {},
      cwd: body.context.cwd ? String(body.context.cwd) : undefined
    };

    const result = state.ruleEngine.evaluate(context);

    return c.json({
      matched: result.matched,
      rule_id: result.matchedRule?.id,
      action: result.action
    });
  });

  // ==========================================================================
  // Cost Control Endpoints
  // ==========================================================================

  /**
   * GET /api/cost/status - Get current cost status
   */
  app.get("/api/cost/status", (c) => {
    const state = getState();
    const status = state.costLimitsChecker.getStatus();

    return c.json({
      enabled: state.config.hookEnhancements.costControls.enabled,
      daily: status.daily
        ? {
            cost_usd: status.daily.costUsd,
            input_tokens: status.daily.inputTokens,
            output_tokens: status.daily.outputTokens,
            session_count: status.daily.sessionCount
          }
        : null,
      monthly: status.monthly
        ? {
            cost_usd: status.monthly.costUsd,
            input_tokens: status.monthly.inputTokens,
            output_tokens: status.monthly.outputTokens,
            session_count: status.monthly.sessionCount
          }
        : null,
      limits: {
        session_usd: status.limits.session,
        daily_usd: status.limits.daily,
        monthly_usd: status.limits.monthly
      },
      alerts: status.alerts.map((a) => ({
        type: a.type,
        budget: a.budget,
        current_usd: a.current,
        limit_usd: a.limit,
        percentage: a.percentage,
        timestamp: a.timestamp
      }))
    });
  });

  /**
   * GET /api/cost/history - Get cost history
   */
  app.get("/api/cost/history", (c) => {
    const state = getState();
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    const months = Number.parseInt(c.req.query("months") ?? "12", 10);

    const dailyHistory = state.costTracker.getDailyHistory(days);
    const monthlyHistory = state.costTracker.getMonthlyHistory(months);

    return c.json({
      daily: dailyHistory.map((p) => ({
        period: p.periodId,
        cost_usd: p.costUsd,
        input_tokens: p.inputTokens,
        output_tokens: p.outputTokens,
        session_count: p.sessionCount
      })),
      monthly: monthlyHistory.map((p) => ({
        period: p.periodId,
        cost_usd: p.costUsd,
        input_tokens: p.inputTokens,
        output_tokens: p.outputTokens,
        session_count: p.sessionCount
      }))
    });
  });

  /**
   * PATCH /api/cost/limits - Update cost limits
   */
  app.patch("/api/cost/limits", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as Record<string, unknown>;

    const updates: string[] = [];

    if (typeof body.enabled === "boolean") {
      state.config.hookEnhancements.costControls.enabled = body.enabled;
      updates.push(`enabled = ${body.enabled}`);
    }

    if (
      typeof body.session_budget_usd === "number" ||
      body.session_budget_usd === null
    ) {
      state.config.hookEnhancements.costControls.sessionBudgetUsd =
        body.session_budget_usd as number | null;
      updates.push(`session_budget_usd = ${body.session_budget_usd}`);
    }

    if (
      typeof body.daily_budget_usd === "number" ||
      body.daily_budget_usd === null
    ) {
      state.config.hookEnhancements.costControls.dailyBudgetUsd =
        body.daily_budget_usd as number | null;
      updates.push(`daily_budget_usd = ${body.daily_budget_usd}`);
    }

    if (
      typeof body.monthly_budget_usd === "number" ||
      body.monthly_budget_usd === null
    ) {
      state.config.hookEnhancements.costControls.monthlyBudgetUsd =
        body.monthly_budget_usd as number | null;
      updates.push(`monthly_budget_usd = ${body.monthly_budget_usd}`);
    }

    if (
      body.over_budget_action &&
      typeof body.over_budget_action === "string"
    ) {
      const action = body.over_budget_action as "warn" | "block" | "notify";
      if (["warn", "block", "notify"].includes(action)) {
        state.config.hookEnhancements.costControls.overBudgetAction = action;
        updates.push(`over_budget_action = ${action}`);
      }
    }

    // Update the limits checker with new config
    state.costLimitsChecker.updateConfig(
      state.config.hookEnhancements.costControls
    );

    return c.json({
      status: "ok",
      updates
    });
  });

  // ==========================================================================
  // Notification Hub Endpoints
  // ==========================================================================

  /**
   * GET /api/notifications/providers - List available providers
   */
  app.get("/api/notifications/providers", (c) => {
    const state = getState();
    const providers = state.notificationHub.getProviderNames();

    return c.json({
      providers,
      available: state.notificationHub.isAvailable()
    });
  });

  /**
   * POST /api/notifications/test/:provider - Test a notification provider
   */
  app.post("/api/notifications/test/:provider", async (c) => {
    const state = getState();
    const providerName = c.req.param("provider");

    const result = await state.notificationHub.testProvider(providerName);

    return c.json({
      success: result.success,
      provider: result.provider,
      error: result.error
    });
  });

  /**
   * POST /api/notifications/test - Test all providers
   */
  app.post("/api/notifications/test", async (c) => {
    const state = getState();
    const result = await state.notificationHub.testAll();

    return c.json({
      success: result.success,
      results: result.results.map((r: NotificationResult) => ({
        success: r.success,
        provider: r.provider,
        error: r.error
      }))
    });
  });

  /**
   * POST /api/notifications/webhooks - Add a webhook
   */
  app.post("/api/notifications/webhooks", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as Record<string, unknown>;

    if (!body.id || !body.url) {
      return c.json({ error: "Webhook must have id and url" }, 400);
    }

    const webhook = {
      id: String(body.id),
      name: String(body.name ?? body.id),
      url: String(body.url),
      method: (body.method as "POST" | "PUT") ?? "POST",
      headers: (body.headers as Record<string, string>) ?? {},
      enabled: body.enabled !== false,
      hookTypes: body.hook_types as string[] | undefined,
      retryCount:
        typeof body.retry_count === "number" ? body.retry_count : undefined
    };

    state.notificationHub.addWebhook(webhook);

    return c.json({ status: "ok", webhook });
  });

  /**
   * DELETE /api/notifications/webhooks/:id - Remove a webhook
   */
  app.delete("/api/notifications/webhooks/:id", (c) => {
    const state = getState();
    const webhookId = c.req.param("id");

    const deleted = state.notificationHub.removeWebhook(webhookId);

    if (!deleted) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    return c.json({ status: "ok" });
  });

  // ==========================================================================
  // Hook Enhancements Config Endpoint
  // ==========================================================================

  /**
   * GET /api/hook-enhancements - Get hook enhancements configuration
   */
  app.get("/api/hook-enhancements", (c) => {
    const state = getState();
    const he = state.config.hookEnhancements;

    return c.json({
      rules: {
        enabled: he.rules.enabled,
        rules_file: he.rules.rulesFile,
        enabled_rule_sets: he.rules.enabledRuleSets
      },
      auto_permissions: {
        enabled: he.autoPermissions.enabled,
        auto_approve_read_only: he.autoPermissions.autoApproveReadOnly
      },
      context_injection: {
        inject_git_context: he.contextInjection.injectGitContext,
        inject_project_context: he.contextInjection.injectProjectContext,
        max_context_lines: he.contextInjection.maxContextLines
      },
      input_modification: {
        enabled: he.inputModification.enabled,
        add_dry_run_flags: he.inputModification.addDryRunFlags,
        enforce_commit_format: he.inputModification.enforceCommitFormat,
        commit_message_prefix: he.inputModification.commitMessagePrefix
      },
      stop_blocking: {
        enabled: he.stopBlocking.enabled,
        require_tests_pass: he.stopBlocking.requireTestsPass,
        require_no_lint_errors: he.stopBlocking.requireNoLintErrors,
        require_coverage_threshold: he.stopBlocking.requireCoverageThreshold,
        max_block_attempts: he.stopBlocking.maxBlockAttempts
      },
      prompt_validation: {
        enabled: he.promptValidation.enabled,
        block_patterns: he.promptValidation.blockPatterns,
        warn_patterns: he.promptValidation.warnPatterns,
        min_length: he.promptValidation.minLength,
        max_length: he.promptValidation.maxLength
      },
      cost_controls: {
        enabled: he.costControls.enabled,
        session_budget_usd: he.costControls.sessionBudgetUsd,
        daily_budget_usd: he.costControls.dailyBudgetUsd,
        monthly_budget_usd: he.costControls.monthlyBudgetUsd,
        alert_thresholds: he.costControls.alertThresholds,
        over_budget_action: he.costControls.overBudgetAction
      },
      llm_evaluation: {
        enabled: he.llmEvaluation.enabled,
        provider: he.llmEvaluation.provider,
        model: he.llmEvaluation.model,
        trigger_hooks: he.llmEvaluation.triggerHooks
      }
    });
  });

  /**
   * PATCH /api/hook-enhancements - Update hook enhancements configuration
   */
  app.patch("/api/hook-enhancements", async (c) => {
    const state = getState();
    const body = (await c.req.json()) as Record<string, unknown>;
    const updates: string[] = [];

    // Update rules config
    if (typeof body.rules === "object" && body.rules) {
      const r = body.rules as Record<string, unknown>;
      if (typeof r.enabled === "boolean") {
        state.config.hookEnhancements.rules.enabled = r.enabled;
        updates.push(`rules.enabled = ${r.enabled}`);
      }
    }

    // Update auto_permissions config
    if (typeof body.auto_permissions === "object" && body.auto_permissions) {
      const ap = body.auto_permissions as Record<string, unknown>;
      if (typeof ap.enabled === "boolean") {
        state.config.hookEnhancements.autoPermissions.enabled = ap.enabled;
        updates.push(`auto_permissions.enabled = ${ap.enabled}`);
      }
      if (typeof ap.auto_approve_read_only === "boolean") {
        state.config.hookEnhancements.autoPermissions.autoApproveReadOnly =
          ap.auto_approve_read_only;
        updates.push(
          `auto_permissions.auto_approve_read_only = ${ap.auto_approve_read_only}`
        );
      }
    }

    // Update context_injection config
    if (typeof body.context_injection === "object" && body.context_injection) {
      const ci = body.context_injection as Record<string, unknown>;
      if (typeof ci.inject_git_context === "boolean") {
        state.config.hookEnhancements.contextInjection.injectGitContext =
          ci.inject_git_context;
        updates.push(
          `context_injection.inject_git_context = ${ci.inject_git_context}`
        );
      }
      if (typeof ci.inject_project_context === "boolean") {
        state.config.hookEnhancements.contextInjection.injectProjectContext =
          ci.inject_project_context;
        updates.push(
          `context_injection.inject_project_context = ${ci.inject_project_context}`
        );
      }
    }

    // Update stop_blocking config
    if (typeof body.stop_blocking === "object" && body.stop_blocking) {
      const sb = body.stop_blocking as Record<string, unknown>;
      if (typeof sb.enabled === "boolean") {
        state.config.hookEnhancements.stopBlocking.enabled = sb.enabled;
        updates.push(`stop_blocking.enabled = ${sb.enabled}`);
      }
      if (typeof sb.require_tests_pass === "boolean") {
        state.config.hookEnhancements.stopBlocking.requireTestsPass =
          sb.require_tests_pass;
        updates.push(
          `stop_blocking.require_tests_pass = ${sb.require_tests_pass}`
        );
      }
      if (typeof sb.require_no_lint_errors === "boolean") {
        state.config.hookEnhancements.stopBlocking.requireNoLintErrors =
          sb.require_no_lint_errors;
        updates.push(
          `stop_blocking.require_no_lint_errors = ${sb.require_no_lint_errors}`
        );
      }
    }

    // Update cost_controls config
    if (typeof body.cost_controls === "object" && body.cost_controls) {
      const cc = body.cost_controls as Record<string, unknown>;
      if (typeof cc.enabled === "boolean") {
        state.config.hookEnhancements.costControls.enabled = cc.enabled;
        updates.push(`cost_controls.enabled = ${cc.enabled}`);
      }
      if (
        typeof cc.session_budget_usd === "number" ||
        cc.session_budget_usd === null
      ) {
        state.config.hookEnhancements.costControls.sessionBudgetUsd =
          cc.session_budget_usd as number | null;
        updates.push(
          `cost_controls.session_budget_usd = ${cc.session_budget_usd}`
        );
      }
      if (
        typeof cc.daily_budget_usd === "number" ||
        cc.daily_budget_usd === null
      ) {
        state.config.hookEnhancements.costControls.dailyBudgetUsd =
          cc.daily_budget_usd as number | null;
        updates.push(`cost_controls.daily_budget_usd = ${cc.daily_budget_usd}`);
      }
      if (
        typeof cc.monthly_budget_usd === "number" ||
        cc.monthly_budget_usd === null
      ) {
        state.config.hookEnhancements.costControls.monthlyBudgetUsd =
          cc.monthly_budget_usd as number | null;
        updates.push(
          `cost_controls.monthly_budget_usd = ${cc.monthly_budget_usd}`
        );
      }
      if (typeof cc.over_budget_action === "string") {
        const action = cc.over_budget_action as "warn" | "block" | "notify";
        if (["warn", "block", "notify"].includes(action)) {
          state.config.hookEnhancements.costControls.overBudgetAction = action;
          updates.push(`cost_controls.over_budget_action = ${action}`);
        }
      }
    }

    // Update llm_evaluation config
    if (typeof body.llm_evaluation === "object" && body.llm_evaluation) {
      const le = body.llm_evaluation as Record<string, unknown>;
      if (typeof le.enabled === "boolean") {
        state.config.hookEnhancements.llmEvaluation.enabled = le.enabled;
        updates.push(`llm_evaluation.enabled = ${le.enabled}`);
      }
      if (typeof le.provider === "string") {
        const provider = le.provider as "anthropic" | "openai" | "ollama";
        if (["anthropic", "openai", "ollama"].includes(provider)) {
          state.config.hookEnhancements.llmEvaluation.provider = provider;
          updates.push(`llm_evaluation.provider = ${provider}`);
        }
      }
      if (typeof le.model === "string") {
        state.config.hookEnhancements.llmEvaluation.model = le.model;
        updates.push(`llm_evaluation.model = ${le.model}`);
      }
    }

    return c.json({
      status: "ok",
      updates
    });
  });
}
