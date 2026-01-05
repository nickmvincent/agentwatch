/**
 * Cost Control Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { CostLimitsChecker } from "../src/cost/limits";
import { CostTracker } from "../src/cost/tracker";

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe("record", () => {
    it("records costs for the current day", () => {
      tracker.record("session-1", 1000, 500, 0.05);

      const daily = tracker.getDaily();
      expect(daily).not.toBeNull();
      expect(daily!.inputTokens).toBe(1000);
      expect(daily!.outputTokens).toBe(500);
      expect(daily!.costUsd).toBe(0.05);
    });

    it("accumulates costs across multiple records", () => {
      tracker.record("session-1", 1000, 500, 0.05);
      tracker.record("session-2", 2000, 1000, 0.1);

      const daily = tracker.getDaily();
      expect(daily!.inputTokens).toBe(3000);
      expect(daily!.outputTokens).toBe(1500);
      expect(daily!.costUsd).toBeCloseTo(0.15, 10);
    });

    it("tracks monthly costs", () => {
      tracker.record("session-1", 1000, 500, 0.05);

      const monthly = tracker.getMonthly();
      expect(monthly).not.toBeNull();
      expect(monthly!.costUsd).toBe(0.05);
    });
  });

  describe("getDailyCost", () => {
    it("returns 0 when no costs recorded", () => {
      expect(tracker.getDailyCost()).toBe(0);
    });

    it("returns total daily cost", () => {
      tracker.record("session-1", 1000, 500, 0.05);
      tracker.record("session-2", 2000, 1000, 0.1);

      expect(tracker.getDailyCost()).toBeCloseTo(0.15, 10);
    });
  });

  describe("getMonthlyCost", () => {
    it("returns 0 when no costs recorded", () => {
      expect(tracker.getMonthlyCost()).toBe(0);
    });

    it("returns total monthly cost", () => {
      tracker.record("session-1", 1000, 500, 0.5);
      tracker.record("session-2", 2000, 1000, 1.0);

      expect(tracker.getMonthlyCost()).toBe(1.5);
    });
  });

  describe("getDailyHistory", () => {
    it("returns empty array when no history", () => {
      const history = tracker.getDailyHistory(7);
      expect(history).toEqual([]);
    });

    it("includes today in history", () => {
      tracker.record("session-1", 1000, 500, 0.05);

      const history = tracker.getDailyHistory(7);
      expect(history.length).toBe(1);
      expect(history[0].costUsd).toBe(0.05);
    });
  });

  describe("export/import", () => {
    it("exports and imports data correctly", () => {
      tracker.record("session-1", 1000, 500, 0.05);
      tracker.record("session-2", 2000, 1000, 0.1);

      const exported = tracker.export();
      expect(exported.daily.length).toBeGreaterThan(0);
      expect(exported.monthly.length).toBeGreaterThan(0);

      const newTracker = new CostTracker();
      newTracker.import(exported);

      expect(newTracker.getDailyCost()).toBeCloseTo(0.15, 10);
    });
  });
});

describe("CostLimitsChecker", () => {
  let tracker: CostTracker;
  let checker: CostLimitsChecker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe("checkSession", () => {
    it("allows when within all budgets", () => {
      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: 1.0,
          dailyBudgetUsd: 10.0,
          monthlyBudgetUsd: 100.0,
          alertThresholds: [0.8, 0.95],
          overBudgetAction: "block"
        },
        tracker
      );

      const result = checker.checkSession(0.5);

      expect(result.withinBudget).toBe(true);
      expect(result.action).toBe("allow");
      expect(result.alerts.length).toBe(0);
    });

    it("blocks when session budget exceeded", () => {
      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: 1.0,
          dailyBudgetUsd: null,
          monthlyBudgetUsd: null,
          alertThresholds: [],
          overBudgetAction: "block"
        },
        tracker
      );

      const result = checker.checkSession(1.5);

      expect(result.withinBudget).toBe(false);
      expect(result.action).toBe("block");
      expect(result.reason).toContain("session budget exceeded");
    });

    it("warns when daily budget exceeded with warn action", () => {
      tracker.record("earlier", 10000, 5000, 9.5);

      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: null,
          dailyBudgetUsd: 10.0,
          monthlyBudgetUsd: null,
          alertThresholds: [],
          overBudgetAction: "warn"
        },
        tracker
      );

      const result = checker.checkSession(0, 1.0);

      expect(result.withinBudget).toBe(false);
      expect(result.action).toBe("warn");
    });

    it("generates warning alerts at thresholds", () => {
      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: 1.0,
          dailyBudgetUsd: null,
          monthlyBudgetUsd: null,
          alertThresholds: [0.5, 0.8],
          overBudgetAction: "block"
        },
        tracker
      );

      // 60% of budget
      const result = checker.checkSession(0.6);

      expect(result.withinBudget).toBe(true);
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts[0].type).toBe("warning");
      expect(result.alerts[0].percentage).toBeCloseTo(0.6, 1);
    });

    it("allows everything when disabled", () => {
      checker = new CostLimitsChecker(
        {
          enabled: false,
          sessionBudgetUsd: 0.01,
          dailyBudgetUsd: 0.01,
          monthlyBudgetUsd: 0.01,
          alertThresholds: [0.1],
          overBudgetAction: "block"
        },
        tracker
      );

      const result = checker.checkSession(1000.0);

      expect(result.withinBudget).toBe(true);
      expect(result.action).toBe("allow");
    });

    it("handles null budgets", () => {
      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: null,
          dailyBudgetUsd: null,
          monthlyBudgetUsd: null,
          alertThresholds: [],
          overBudgetAction: "block"
        },
        tracker
      );

      const result = checker.checkSession(1000.0);

      expect(result.withinBudget).toBe(true);
      expect(result.action).toBe("allow");
    });
  });

  describe("getStatus", () => {
    it("returns current cost status", () => {
      tracker.record("session-1", 1000, 500, 0.05);

      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: 1.0,
          dailyBudgetUsd: 10.0,
          monthlyBudgetUsd: 100.0,
          alertThresholds: [],
          overBudgetAction: "block"
        },
        tracker
      );

      const status = checker.getStatus("test-session", 0.03);

      expect(status.daily).not.toBeNull();
      expect(status.daily!.costUsd).toBe(0.05);
      expect(status.limits.session).toBe(1.0);
      expect(status.limits.daily).toBe(10.0);
      expect(status.session?.costUsd).toBe(0.03);
    });
  });

  describe("updateConfig", () => {
    it("updates configuration and clears alerts", () => {
      checker = new CostLimitsChecker(
        {
          enabled: true,
          sessionBudgetUsd: 1.0,
          dailyBudgetUsd: null,
          monthlyBudgetUsd: null,
          alertThresholds: [0.5],
          overBudgetAction: "block"
        },
        tracker
      );

      // Trigger an alert
      checker.checkSession(0.6);

      // Update config
      checker.updateConfig({ sessionBudgetUsd: 2.0 });

      // Check again - should get new alert since alerts were cleared
      const result = checker.checkSession(1.2);
      expect(result.alerts.some((a) => a.budget === "session")).toBe(true);
    });
  });
});
