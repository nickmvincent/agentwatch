/**
 * Cost Tracker
 *
 * Tracks costs across sessions, days, and months.
 */

import type { CostPeriod } from "./types";

/**
 * CostTracker maintains running totals of API costs.
 */
export class CostTracker {
  private dailyCosts: Map<string, CostPeriod> = new Map();
  private monthlyCosts: Map<string, CostPeriod> = new Map();

  /**
   * Record costs from a session update.
   */
  record(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number
  ): void {
    const now = new Date();
    const dayId = this.getDayId(now);
    const monthId = this.getMonthId(now);

    // Update daily costs
    this.updatePeriod(
      this.dailyCosts,
      dayId,
      inputTokens,
      outputTokens,
      costUsd
    );

    // Update monthly costs
    this.updatePeriod(
      this.monthlyCosts,
      monthId,
      inputTokens,
      outputTokens,
      costUsd
    );
  }

  /**
   * Get today's cost period.
   */
  getDaily(): CostPeriod | null {
    const dayId = this.getDayId(new Date());
    return this.dailyCosts.get(dayId) ?? null;
  }

  /**
   * Get this month's cost period.
   */
  getMonthly(): CostPeriod | null {
    const monthId = this.getMonthId(new Date());
    return this.monthlyCosts.get(monthId) ?? null;
  }

  /**
   * Get today's total cost in USD.
   */
  getDailyCost(): number {
    return this.getDaily()?.costUsd ?? 0;
  }

  /**
   * Get this month's total cost in USD.
   */
  getMonthlyCost(): number {
    return this.getMonthly()?.costUsd ?? 0;
  }

  /**
   * Get historical daily costs.
   */
  getDailyHistory(days = 30): CostPeriod[] {
    const periods: CostPeriod[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayId = this.getDayId(date);
      const period = this.dailyCosts.get(dayId);
      if (period) {
        periods.push(period);
      }
    }

    return periods;
  }

  /**
   * Get historical monthly costs.
   */
  getMonthlyHistory(months = 12): CostPeriod[] {
    const periods: CostPeriod[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const monthId = this.getMonthId(date);
      const period = this.monthlyCosts.get(monthId);
      if (period) {
        periods.push(period);
      }
    }

    return periods;
  }

  /**
   * Clear old data (keep last N days/months).
   */
  cleanup(keepDays = 90, keepMonths = 24): void {
    const now = new Date();

    // Clean daily costs
    const oldestDayDate = new Date(now);
    oldestDayDate.setDate(oldestDayDate.getDate() - keepDays);
    const oldestDayId = this.getDayId(oldestDayDate);

    for (const dayId of this.dailyCosts.keys()) {
      if (dayId < oldestDayId) {
        this.dailyCosts.delete(dayId);
      }
    }

    // Clean monthly costs
    const oldestMonthDate = new Date(now);
    oldestMonthDate.setMonth(oldestMonthDate.getMonth() - keepMonths);
    const oldestMonthId = this.getMonthId(oldestMonthDate);

    for (const monthId of this.monthlyCosts.keys()) {
      if (monthId < oldestMonthId) {
        this.monthlyCosts.delete(monthId);
      }
    }
  }

  /**
   * Export data for persistence.
   */
  export(): { daily: CostPeriod[]; monthly: CostPeriod[] } {
    return {
      daily: Array.from(this.dailyCosts.values()),
      monthly: Array.from(this.monthlyCosts.values())
    };
  }

  /**
   * Import data from persistence.
   */
  import(data: { daily?: CostPeriod[]; monthly?: CostPeriod[] }): void {
    if (data.daily) {
      for (const period of data.daily) {
        this.dailyCosts.set(period.periodId, period);
      }
    }
    if (data.monthly) {
      for (const period of data.monthly) {
        this.monthlyCosts.set(period.periodId, period);
      }
    }
  }

  private getDayId(date: Date): string {
    return date.toISOString().slice(0, 10); // "2024-01-15"
  }

  private getMonthId(date: Date): string {
    return date.toISOString().slice(0, 7); // "2024-01"
  }

  private updatePeriod(
    map: Map<string, CostPeriod>,
    periodId: string,
    inputTokens: number,
    outputTokens: number,
    costUsd: number
  ): void {
    const existing = map.get(periodId);

    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.costUsd += costUsd;
      existing.endTime = Date.now();
    } else {
      const now = Date.now();
      map.set(periodId, {
        periodId,
        startTime: now,
        endTime: now,
        inputTokens,
        outputTokens,
        costUsd,
        sessionCount: 1
      });
    }
  }
}
