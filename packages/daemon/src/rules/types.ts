/**
 * Rule Engine Types
 *
 * Defines the core types for the rule-based decision system.
 * Rules can match on hook events and tool invocations, and return
 * decisions that influence Claude Code's behavior.
 */

import type { HookEventType } from "@agentwatch/core";

// =============================================================================
// Rule Conditions
// =============================================================================

/**
 * Operators for rule condition matching.
 */
export type ConditionOperator =
  | "eq" // Exact equality
  | "neq" // Not equal
  | "matches" // Regex match
  | "contains" // Substring match
  | "startsWith" // Prefix match
  | "endsWith" // Suffix match
  | "in" // Value in array
  | "notIn" // Value not in array
  | "gt" // Greater than (numeric)
  | "gte" // Greater than or equal
  | "lt" // Less than
  | "lte" // Less than or equal
  | "exists" // Field exists and is truthy
  | "notExists"; // Field doesn't exist or is falsy

/**
 * A single condition to evaluate against the context.
 */
export interface RuleCondition {
  /** Field path to evaluate (dot notation supported, e.g., "tool_input.command") */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against (not used for exists/notExists) */
  value?: string | number | boolean | string[];
  /** Whether string comparisons are case-sensitive (default: true) */
  caseSensitive?: boolean;
  /** Negate the entire condition result */
  negate?: boolean;
}

/**
 * Logical grouping of conditions.
 */
export interface ConditionGroup {
  /** Logical operator for combining conditions */
  logic: "and" | "or";
  /** Conditions in this group */
  conditions: (RuleCondition | ConditionGroup)[];
}

// =============================================================================
// Rule Actions
// =============================================================================

/**
 * Types of actions a rule can take.
 */
export type ActionType =
  | "allow" // Allow the operation
  | "deny" // Deny with reason shown to user
  | "block" // Block and return error to Claude
  | "continue" // Force continuation (Stop hook)
  | "modify" // Modify the tool input
  | "warn" // Warn but allow
  | "prompt"; // Defer to LLM evaluation

/**
 * Action to take when a rule matches.
 */
export interface RuleAction {
  /** Type of action */
  type: ActionType;
  /** Human-readable reason (shown to user or Claude) */
  reason?: string;
  /** System message for Claude (used with continue action) */
  systemMessage?: string;
  /** Input modifications (used with modify action) */
  modifications?: Record<string, unknown>;
  /** LLM prompt template (used with prompt action) */
  promptTemplate?: string;
}

// =============================================================================
// Rules
// =============================================================================

/**
 * A complete rule definition.
 */
export interface Rule {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this rule does */
  description?: string;
  /** Whether the rule is active */
  enabled: boolean;
  /** Priority (lower = higher priority, evaluated first) */
  priority: number;
  /** Hook types this rule applies to */
  hookTypes: HookEventType[];
  /** Tool name patterns to match (regex supported, empty = all tools) */
  toolPatterns?: string[];
  /** Conditions that must be met (ANDed by default) */
  conditions?: RuleCondition[];
  /** Complex condition grouping (alternative to conditions) */
  conditionGroup?: ConditionGroup;
  /** Action to take when rule matches */
  action: RuleAction;
  /** Optional metadata for tracking/debugging */
  metadata?: Record<string, unknown>;
  /** Tags for categorization */
  tags?: string[];
  /** Rule set this belongs to */
  ruleSet?: string;
}

// =============================================================================
// Rule Evaluation
// =============================================================================

/**
 * Context provided for rule evaluation.
 */
export interface RuleEvaluationContext {
  /** The hook event type being evaluated */
  hookType: HookEventType;
  /** Session ID */
  sessionId: string;
  /** Tool name (for tool-related hooks) */
  toolName?: string;
  /** Tool input parameters */
  toolInput?: Record<string, unknown>;
  /** Tool response (for PostToolUse) */
  toolResponse?: Record<string, unknown>;
  /** Current working directory */
  cwd?: string;
  /** User prompt text (for UserPromptSubmit) */
  prompt?: string;
  /** Stop reason (for Stop/SubagentStop) */
  stopReason?: string;
  /** Token counts */
  tokens?: {
    input: number;
    output: number;
  };
  /** Estimated cost in USD */
  costUsd?: number;
  /** Notification type (for Notification hook) */
  notificationType?: string;
  /** Compact trigger (for PreCompact) */
  compactTrigger?: "manual" | "auto";
  /** Session source (for SessionStart) */
  sessionSource?: "startup" | "resume" | "clear" | "compact";
  /** Permission mode */
  permissionMode?: string;
  /** Transcript path */
  transcriptPath?: string;
  /** Additional context that may be useful */
  extra?: Record<string, unknown>;
}

/**
 * Result of evaluating a single rule.
 */
export interface RuleEvaluationResult {
  /** Whether the rule matched */
  matched: boolean;
  /** The rule that was evaluated */
  rule: Rule;
  /** The action to take (if matched) */
  action?: RuleAction;
  /** Additional context from evaluation */
  evaluationDetails?: {
    /** Which conditions matched/failed */
    conditionResults?: Array<{
      condition: RuleCondition;
      matched: boolean;
      actualValue?: unknown;
    }>;
    /** Time taken to evaluate (ms) */
    evaluationTimeMs?: number;
  };
}

/**
 * Aggregated result from evaluating multiple rules.
 */
export interface RuleSetEvaluationResult {
  /** Whether any rule matched */
  matched: boolean;
  /** The highest-priority matching rule */
  matchedRule?: Rule;
  /** Action from the matched rule */
  action?: RuleAction;
  /** All evaluation results (for debugging) */
  allResults: RuleEvaluationResult[];
  /** Total rules evaluated */
  rulesEvaluated: number;
  /** Total evaluation time (ms) */
  totalTimeMs: number;
}

// =============================================================================
// Rule Sets
// =============================================================================

/**
 * A named collection of rules.
 */
export interface RuleSet {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Whether this rule set is active */
  enabled: boolean;
  /** Rules in this set */
  rules: Rule[];
  /** Version for tracking changes */
  version?: string;
  /** Author/source */
  author?: string;
  /** Tags for categorization */
  tags?: string[];
}

// =============================================================================
// Built-in Rule Set IDs
// =============================================================================

export const BUILTIN_RULE_SETS = {
  /** Security-focused rules (block dangerous operations) */
  SECURITY: "builtin:security",
  /** Read-only auto-approval rules */
  READ_ONLY_APPROVAL: "builtin:read-only-approval",
  /** Path sanitization rules */
  PATH_SANITIZATION: "builtin:path-sanitization",
  /** Git workflow rules */
  GIT_WORKFLOW: "builtin:git-workflow",
  /** Cost control rules */
  COST_CONTROL: "builtin:cost-control"
} as const;

export type BuiltinRuleSetId =
  (typeof BUILTIN_RULE_SETS)[keyof typeof BUILTIN_RULE_SETS];
