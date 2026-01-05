/**
 * Decision Engine Types
 *
 * Defines types for the decision coordination system that combines
 * multiple decision sources (rules, test-gate, cost limits, LLM).
 */

import type { RuleAction, RuleEvaluationContext } from "../rules/types";

// =============================================================================
// Decision Results
// =============================================================================

/**
 * Possible decision outcomes.
 */
export type DecisionOutcome =
  | "allow" // Allow the operation to proceed
  | "deny" // Deny with reason shown to user
  | "block" // Block and return error to Claude
  | "continue" // Force continuation (Stop hook)
  | "modify" // Modify the tool input
  | "warn" // Warn but allow
  | "abstain"; // Source has no opinion

/**
 * Result from a single decision source.
 */
export interface DecisionResult {
  /** The decision outcome */
  decision: DecisionOutcome;
  /** Name of the source that made this decision */
  source: string;
  /** Human-readable reason for the decision */
  reason?: string;
  /** System message for Claude (used with continue) */
  systemMessage?: string;
  /** Input modifications (used with modify) */
  modifications?: Record<string, unknown>;
  /** Confidence level 0-1 (for LLM decisions) */
  confidence?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated result from all decision sources.
 */
export interface AggregatedDecisionResult {
  /** Final decision after combining all sources */
  finalDecision: DecisionOutcome;
  /** Source that determined the final decision */
  decidingSource: string;
  /** Reason for the final decision */
  reason?: string;
  /** System message (combined if multiple) */
  systemMessage?: string;
  /** Combined modifications */
  modifications?: Record<string, unknown>;
  /** All individual decisions */
  decisions: DecisionResult[];
  /** Total decision time (ms) */
  totalTimeMs: number;
  /** Whether decision was cached */
  cached?: boolean;
}

// =============================================================================
// Decision Sources
// =============================================================================

/**
 * Priority levels for decision sources.
 * Lower number = higher priority.
 */
export const DECISION_PRIORITY = {
  /** Security rules - highest priority, can block anything */
  SECURITY: 0,
  /** Cost limits - budget enforcement */
  COST: 10,
  /** Test gate - workflow requirements */
  TEST_GATE: 20,
  /** User rules - custom rules */
  RULES: 30,
  /** LLM evaluation - intelligent decisions */
  LLM: 40,
  /** Default - fallback */
  DEFAULT: 100
} as const;

/**
 * Interface for a decision source.
 */
export interface DecisionSource {
  /** Unique name for this source */
  name: string;
  /** Priority (lower = evaluated first, can short-circuit) */
  priority: number;
  /** Whether this source is enabled */
  enabled: boolean;
  /**
   * Evaluate the context and return a decision.
   * Return null to abstain from decision-making.
   */
  evaluate(context: RuleEvaluationContext): Promise<DecisionResult | null>;
  /**
   * Optional: Check if this source applies to the given hook type.
   * If not implemented, source is assumed to apply to all hooks.
   */
  appliesTo?(hookType: string): boolean;
}

// =============================================================================
// Decision Engine Configuration
// =============================================================================

/**
 * Configuration for decision source behavior.
 */
export interface DecisionSourceConfig {
  /** Whether the source is enabled */
  enabled: boolean;
  /** Custom priority override */
  priority?: number;
  /** Source-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Overall decision engine configuration.
 */
export interface DecisionEngineConfig {
  /** Whether to stop on first non-abstain decision */
  shortCircuit: boolean;
  /** Default decision when all sources abstain */
  defaultDecision: DecisionOutcome;
  /** Maximum time to wait for all sources (ms) */
  timeoutMs: number;
  /** Per-source configuration */
  sources: Record<string, DecisionSourceConfig>;
}

// =============================================================================
// Built-in Source Names
// =============================================================================

export const BUILTIN_SOURCES = {
  /** Rule engine evaluation */
  RULES: "rules",
  /** Test gate (tests must pass) */
  TEST_GATE: "test_gate",
  /** Cost limit enforcement */
  COST_LIMIT: "cost_limit",
  /** LLM-based evaluation */
  LLM: "llm"
} as const;

export type BuiltinSourceName =
  (typeof BUILTIN_SOURCES)[keyof typeof BUILTIN_SOURCES];

// =============================================================================
// Decision Context Extensions
// =============================================================================

/**
 * Extended context with session state for decision making.
 */
export interface ExtendedDecisionContext extends RuleEvaluationContext {
  /** Current session data */
  session?: {
    /** Total input tokens used */
    totalInputTokens: number;
    /** Total output tokens used */
    totalOutputTokens: number;
    /** Estimated cost in USD */
    estimatedCostUsd: number;
    /** Number of tools used */
    toolCount: number;
    /** Auto-continue attempts */
    autoContinueAttempts: number;
    /** Session start time */
    startTime: number;
  };
  /** Test gate status */
  testGate?: {
    /** Whether tests are currently passing */
    passing: boolean;
    /** Time of last test run */
    lastRunTime?: number;
    /** Time of last pass */
    lastPassTime?: number;
  };
  /** Budget status */
  budget?: {
    /** Session budget remaining */
    sessionRemaining?: number;
    /** Daily budget remaining */
    dailyRemaining?: number;
    /** Monthly budget remaining */
    monthlyRemaining?: number;
  };
}

// =============================================================================
// Decision Events
// =============================================================================

/**
 * Event emitted when a decision is made.
 */
export interface DecisionEvent {
  /** Timestamp of the decision */
  timestamp: number;
  /** Hook type that triggered the decision */
  hookType: string;
  /** Session ID */
  sessionId: string;
  /** Tool name (if applicable) */
  toolName?: string;
  /** The aggregated result */
  result: AggregatedDecisionResult;
}

/**
 * Callback for decision events.
 */
export type DecisionEventCallback = (event: DecisionEvent) => void;
