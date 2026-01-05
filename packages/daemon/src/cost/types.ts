/**
 * Cost Control Types
 */

/**
 * Cost tracking entry for a specific period.
 */
export interface CostPeriod {
  /** Period identifier (e.g., "2024-01-15" for daily, "2024-01" for monthly) */
  periodId: string;
  /** Start timestamp of the period */
  startTime: number;
  /** End timestamp of the period */
  endTime: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Total cost in USD */
  costUsd: number;
  /** Number of sessions */
  sessionCount: number;
}

/**
 * Current cost status across all periods.
 */
export interface CostStatus {
  /** Today's cost */
  daily: CostPeriod | null;
  /** This month's cost */
  monthly: CostPeriod | null;
  /** Current session cost (if any) */
  session: {
    sessionId: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  } | null;
  /** Active budget limits */
  limits: {
    session: number | null;
    daily: number | null;
    monthly: number | null;
  };
  /** Budget warnings/alerts */
  alerts: CostAlert[];
}

/**
 * Cost alert.
 */
export interface CostAlert {
  /** Alert type */
  type: "warning" | "limit_reached" | "exceeded";
  /** Which budget was affected */
  budget: "session" | "daily" | "monthly";
  /** Current cost */
  current: number;
  /** Budget limit */
  limit: number;
  /** Percentage of limit used */
  percentage: number;
  /** Alert timestamp */
  timestamp: number;
}

/**
 * Cost check result.
 */
export interface CostCheckResult {
  /** Whether within all budgets */
  withinBudget: boolean;
  /** Any alerts triggered */
  alerts: CostAlert[];
  /** Recommended action */
  action: "allow" | "warn" | "block";
  /** Reason for the action */
  reason?: string;
}
