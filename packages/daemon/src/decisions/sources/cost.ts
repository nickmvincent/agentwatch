/**
 * Cost Limit Decision Source
 *
 * Enforces budget limits on sessions.
 */

import type { RuleEvaluationContext } from "../../rules/types";
import type {
  DecisionResult,
  DecisionSource,
  ExtendedDecisionContext
} from "../types";
import { BUILTIN_SOURCES, DECISION_PRIORITY } from "../types";

/**
 * Cost controls configuration.
 */
export interface CostControlsConfig {
  enabled: boolean;
  sessionBudgetUsd: number | null;
  dailyBudgetUsd: number | null;
  monthlyBudgetUsd: number | null;
  alertThresholds: number[];
  overBudgetAction: "warn" | "block" | "notify";
}

/**
 * Interface for getting current cost data.
 */
export interface CostDataProvider {
  getSessionCost(sessionId: string): number;
  getDailyCost(): number;
  getMonthlyCost(): number;
}

/**
 * Create a decision source for cost limit enforcement.
 */
export function createCostSource(
  getConfig: () => CostControlsConfig,
  costProvider: CostDataProvider
): DecisionSource {
  return {
    name: BUILTIN_SOURCES.COST_LIMIT,
    priority: DECISION_PRIORITY.COST,
    enabled: true,

    appliesTo(hookType: string): boolean {
      // Check costs on Stop hook (before allowing session to continue)
      // and on PreToolUse (before expensive operations)
      return hookType === "Stop" || hookType === "PreToolUse";
    },

    async evaluate(
      context: RuleEvaluationContext | ExtendedDecisionContext
    ): Promise<DecisionResult | null> {
      const config = getConfig();

      if (!config.enabled) {
        return null; // Abstain
      }

      // Check session budget
      if (config.sessionBudgetUsd !== null) {
        const sessionCost = costProvider.getSessionCost(context.sessionId);
        if (sessionCost >= config.sessionBudgetUsd) {
          return createBudgetExceededResult(
            "session",
            sessionCost,
            config.sessionBudgetUsd,
            config.overBudgetAction
          );
        }
      }

      // Check daily budget
      if (config.dailyBudgetUsd !== null) {
        const dailyCost = costProvider.getDailyCost();
        if (dailyCost >= config.dailyBudgetUsd) {
          return createBudgetExceededResult(
            "daily",
            dailyCost,
            config.dailyBudgetUsd,
            config.overBudgetAction
          );
        }
      }

      // Check monthly budget
      if (config.monthlyBudgetUsd !== null) {
        const monthlyCost = costProvider.getMonthlyCost();
        if (monthlyCost >= config.monthlyBudgetUsd) {
          return createBudgetExceededResult(
            "monthly",
            monthlyCost,
            config.monthlyBudgetUsd,
            config.overBudgetAction
          );
        }
      }

      return null; // Abstain (within budget)
    }
  };
}

/**
 * Create a decision result for budget exceeded.
 */
function createBudgetExceededResult(
  budgetType: "session" | "daily" | "monthly",
  current: number,
  limit: number,
  action: "warn" | "block" | "notify"
): DecisionResult {
  const reason = `${budgetType.charAt(0).toUpperCase() + budgetType.slice(1)} budget exceeded: $${current.toFixed(2)} / $${limit.toFixed(2)}`;

  if (action === "block") {
    return {
      decision: "block",
      source: BUILTIN_SOURCES.COST_LIMIT,
      reason,
      metadata: {
        budgetType,
        currentCost: current,
        limit
      }
    };
  }

  // warn or notify
  return {
    decision: "warn",
    source: BUILTIN_SOURCES.COST_LIMIT,
    reason,
    metadata: {
      budgetType,
      currentCost: current,
      limit
    }
  };
}

/**
 * Calculate percentage of budget used.
 */
export function calculateBudgetUsage(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return (current / limit) * 100;
}

/**
 * Check if any alert threshold has been crossed.
 */
export function checkAlertThresholds(
  current: number,
  limit: number,
  thresholds: number[]
): number | null {
  const usage = calculateBudgetUsage(current, limit);

  // Find the highest threshold that has been crossed
  const crossedThresholds = thresholds.filter((t) => usage >= t);
  if (crossedThresholds.length === 0) {
    return null;
  }

  return Math.max(...crossedThresholds);
}
