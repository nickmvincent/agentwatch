/**
 * Cost Limits Checker
 *
 * Enforces budget limits and generates alerts.
 */

import type { CostTracker } from "./tracker";
import type { CostAlert, CostCheckResult, CostStatus } from "./types";

/**
 * Cost limits configuration.
 */
export interface CostLimitsConfig {
  /** Whether cost controls are enabled */
  enabled: boolean;
  /** Per-session budget in USD */
  sessionBudgetUsd: number | null;
  /** Daily budget in USD */
  dailyBudgetUsd: number | null;
  /** Monthly budget in USD */
  monthlyBudgetUsd: number | null;
  /** Alert thresholds (percentages of limits, e.g., [0.5, 0.8, 0.95]) */
  alertThresholds: number[];
  /** Action when over budget */
  overBudgetAction: "warn" | "block" | "notify";
}

/**
 * CostLimitsChecker enforces budget limits.
 */
export class CostLimitsChecker {
  private readonly config: CostLimitsConfig;
  private readonly tracker: CostTracker;
  private readonly sentAlerts: Set<string> = new Set();

  constructor(config: CostLimitsConfig, tracker: CostTracker) {
    this.config = config;
    this.tracker = tracker;
  }

  /**
   * Check if a session is within budget.
   */
  checkSession(sessionCostUsd: number, additionalCostUsd = 0): CostCheckResult {
    if (!this.config.enabled) {
      return {
        withinBudget: true,
        alerts: [],
        action: "allow"
      };
    }

    const projectedSessionCost = sessionCostUsd + additionalCostUsd;
    const projectedDailyCost = this.tracker.getDailyCost() + additionalCostUsd;
    const projectedMonthlyCost =
      this.tracker.getMonthlyCost() + additionalCostUsd;

    const alerts: CostAlert[] = [];
    let action: "allow" | "warn" | "block" = "allow";

    // Check session budget
    if (this.config.sessionBudgetUsd !== null) {
      const sessionAlerts = this.checkLimit(
        "session",
        projectedSessionCost,
        this.config.sessionBudgetUsd
      );
      alerts.push(...sessionAlerts);
    }

    // Check daily budget
    if (this.config.dailyBudgetUsd !== null) {
      const dailyAlerts = this.checkLimit(
        "daily",
        projectedDailyCost,
        this.config.dailyBudgetUsd
      );
      alerts.push(...dailyAlerts);
    }

    // Check monthly budget
    if (this.config.monthlyBudgetUsd !== null) {
      const monthlyAlerts = this.checkLimit(
        "monthly",
        projectedMonthlyCost,
        this.config.monthlyBudgetUsd
      );
      alerts.push(...monthlyAlerts);
    }

    // Determine action based on alerts
    const exceededAlert = alerts.find((a) => a.type === "exceeded");
    const limitReachedAlert = alerts.find((a) => a.type === "limit_reached");

    if (exceededAlert) {
      action = this.config.overBudgetAction === "block" ? "block" : "warn";
    } else if (limitReachedAlert) {
      action = "warn";
    }

    const withinBudget = !exceededAlert;
    let reason: string | undefined;

    if (!withinBudget) {
      const budget = exceededAlert!.budget;
      reason = `${budget} budget exceeded: $${exceededAlert!.current.toFixed(2)} > $${exceededAlert!.limit.toFixed(2)}`;
    }

    return {
      withinBudget,
      alerts,
      action,
      reason
    };
  }

  /**
   * Get current cost status.
   */
  getStatus(sessionId?: string, sessionCostUsd?: number): CostStatus {
    const daily = this.tracker.getDaily();
    const monthly = this.tracker.getMonthly();

    const session =
      sessionId !== undefined && sessionCostUsd !== undefined
        ? {
            sessionId,
            costUsd: sessionCostUsd,
            inputTokens: 0, // Would need to be passed in
            outputTokens: 0
          }
        : null;

    // Collect current alerts
    const alerts: CostAlert[] = [];

    if (this.config.enabled) {
      if (this.config.dailyBudgetUsd !== null && daily) {
        alerts.push(
          ...this.checkLimit("daily", daily.costUsd, this.config.dailyBudgetUsd)
        );
      }
      if (this.config.monthlyBudgetUsd !== null && monthly) {
        alerts.push(
          ...this.checkLimit(
            "monthly",
            monthly.costUsd,
            this.config.monthlyBudgetUsd
          )
        );
      }
    }

    return {
      daily,
      monthly,
      session,
      limits: {
        session: this.config.sessionBudgetUsd,
        daily: this.config.dailyBudgetUsd,
        monthly: this.config.monthlyBudgetUsd
      },
      alerts
    };
  }

  /**
   * Update configuration.
   */
  updateConfig(newConfig: Partial<CostLimitsConfig>): void {
    Object.assign(this.config, newConfig);
    // Clear sent alerts when config changes
    this.sentAlerts.clear();
  }

  /**
   * Reset alerts (e.g., at start of new day/month).
   */
  resetAlerts(): void {
    this.sentAlerts.clear();
  }

  private checkLimit(
    budget: "session" | "daily" | "monthly",
    current: number,
    limit: number
  ): CostAlert[] {
    const alerts: CostAlert[] = [];
    const percentage = current / limit;
    const now = Date.now();

    // Check threshold alerts
    for (const threshold of this.config.alertThresholds) {
      if (percentage >= threshold) {
        const alertKey = `${budget}-${threshold}`;
        if (!this.sentAlerts.has(alertKey)) {
          alerts.push({
            type: "warning",
            budget,
            current,
            limit,
            percentage,
            timestamp: now
          });
          this.sentAlerts.add(alertKey);
        }
      }
    }

    // Check limit reached (100%)
    if (percentage >= 1) {
      const alertKey = `${budget}-limit`;
      if (!this.sentAlerts.has(alertKey)) {
        alerts.push({
          type: "limit_reached",
          budget,
          current,
          limit,
          percentage,
          timestamp: now
        });
        this.sentAlerts.add(alertKey);
      }
    }

    // Check exceeded (over 100%)
    if (percentage > 1) {
      // Always report exceeded alerts (but dedupe by significant percentage change)
      const roundedPct = Math.floor(percentage * 10) / 10;
      const alertKey = `${budget}-exceeded-${roundedPct}`;
      if (!this.sentAlerts.has(alertKey)) {
        alerts.push({
          type: "exceeded",
          budget,
          current,
          limit,
          percentage,
          timestamp: now
        });
        this.sentAlerts.add(alertKey);
      }
    }

    return alerts;
  }
}
