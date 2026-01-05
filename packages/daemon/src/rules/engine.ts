/**
 * Rule Engine
 *
 * Evaluates rules against hook contexts and returns decisions.
 * Supports pattern matching, condition evaluation, and priority-based ordering.
 */

import type { HookEventType } from "@agentwatch/core";
import type {
  ConditionGroup,
  ConditionOperator,
  Rule,
  RuleCondition,
  RuleEvaluationContext,
  RuleEvaluationResult,
  RuleSet,
  RuleSetEvaluationResult
} from "./types";

/**
 * Get a nested value from an object using dot notation.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Check if a value matches a pattern (supports regex).
 */
function matchesPattern(value: string, pattern: string): boolean {
  try {
    // If pattern looks like a regex (starts and ends with /), parse it
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const lastSlash = pattern.lastIndexOf("/");
      const regexBody = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      const regex = new RegExp(regexBody, flags);
      return regex.test(value);
    }
    // Otherwise treat as a simple glob-like pattern
    // Convert * to .* and ? to . for basic glob support
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${regexPattern}$`).test(value);
  } catch {
    // If regex parsing fails, do exact match
    return value === pattern;
  }
}

/**
 * Evaluate a single condition against the context.
 */
function evaluateCondition(
  condition: RuleCondition,
  context: RuleEvaluationContext
): { matched: boolean; actualValue?: unknown } {
  const actualValue = getNestedValue(context, condition.field);
  const { operator, value, caseSensitive = true, negate = false } = condition;

  let matched = false;

  // Handle exists/notExists operators first
  if (operator === "exists") {
    matched =
      actualValue !== undefined && actualValue !== null && actualValue !== "";
  } else if (operator === "notExists") {
    matched =
      actualValue === undefined || actualValue === null || actualValue === "";
  } else if (actualValue === undefined || actualValue === null) {
    // For other operators, undefined/null doesn't match
    matched = false;
  } else {
    // Normalize strings for case-insensitive comparison
    const normalizeString = (v: unknown): unknown => {
      if (typeof v === "string" && !caseSensitive) {
        return v.toLowerCase();
      }
      return v;
    };

    const normalizedActual = normalizeString(actualValue);
    const normalizedValue = normalizeString(value);

    switch (operator) {
      case "eq":
        matched = normalizedActual === normalizedValue;
        break;

      case "neq":
        matched = normalizedActual !== normalizedValue;
        break;

      case "matches":
        if (typeof actualValue === "string" && typeof value === "string") {
          matched = matchesPattern(
            caseSensitive ? actualValue : actualValue.toLowerCase(),
            caseSensitive ? value : value.toLowerCase()
          );
        }
        break;

      case "contains":
        if (typeof actualValue === "string" && typeof value === "string") {
          matched = (normalizedActual as string).includes(
            normalizedValue as string
          );
        }
        break;

      case "startsWith":
        if (typeof actualValue === "string" && typeof value === "string") {
          matched = (normalizedActual as string).startsWith(
            normalizedValue as string
          );
        }
        break;

      case "endsWith":
        if (typeof actualValue === "string" && typeof value === "string") {
          matched = (normalizedActual as string).endsWith(
            normalizedValue as string
          );
        }
        break;

      case "in":
        if (Array.isArray(value)) {
          matched = value.some((v) => normalizeString(v) === normalizedActual);
        }
        break;

      case "notIn":
        if (Array.isArray(value)) {
          matched = !value.some((v) => normalizeString(v) === normalizedActual);
        }
        break;

      case "gt":
        if (typeof actualValue === "number" && typeof value === "number") {
          matched = actualValue > value;
        }
        break;

      case "gte":
        if (typeof actualValue === "number" && typeof value === "number") {
          matched = actualValue >= value;
        }
        break;

      case "lt":
        if (typeof actualValue === "number" && typeof value === "number") {
          matched = actualValue < value;
        }
        break;

      case "lte":
        if (typeof actualValue === "number" && typeof value === "number") {
          matched = actualValue <= value;
        }
        break;
    }
  }

  // Apply negation if specified
  if (negate) {
    matched = !matched;
  }

  return { matched, actualValue };
}

/**
 * Evaluate a condition group (supports nested groups).
 */
function evaluateConditionGroup(
  group: ConditionGroup,
  context: RuleEvaluationContext
): boolean {
  const { logic, conditions } = group;

  if (conditions.length === 0) {
    return true; // Empty group matches everything
  }

  for (const item of conditions) {
    let itemMatched: boolean;

    if ("logic" in item) {
      // Nested group
      itemMatched = evaluateConditionGroup(item, context);
    } else {
      // Simple condition
      itemMatched = evaluateCondition(item, context).matched;
    }

    if (logic === "or" && itemMatched) {
      return true; // Short-circuit OR
    }
    if (logic === "and" && !itemMatched) {
      return false; // Short-circuit AND
    }
  }

  // For AND, we got here without failing, so all matched
  // For OR, we got here without finding a match
  return logic === "and";
}

/**
 * Check if a rule applies to the given hook type and tool.
 */
function ruleApplies(
  rule: Rule,
  hookType: HookEventType,
  toolName?: string
): boolean {
  // Check hook type
  if (!rule.hookTypes.includes(hookType)) {
    return false;
  }

  // Check tool patterns (if specified)
  if (rule.toolPatterns && rule.toolPatterns.length > 0 && toolName) {
    const matches = rule.toolPatterns.some((pattern) =>
      matchesPattern(toolName, pattern)
    );
    if (!matches) {
      return false;
    }
  }

  return true;
}

/**
 * Rule Engine class for evaluating rules against contexts.
 */
export class RuleEngine {
  private rules: Map<string, Rule> = new Map();
  private ruleSets: Map<string, RuleSet> = new Map();

  /**
   * Add a rule to the engine.
   */
  addRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a rule from the engine.
   */
  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Update an existing rule.
   */
  updateRule(id: string, updates: Partial<Omit<Rule, "id">>): boolean {
    const existing = this.rules.get(id);
    if (!existing) {
      return false;
    }
    this.rules.set(id, { ...existing, ...updates });
    return true;
  }

  /**
   * Get a rule by ID.
   */
  getRule(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all rules.
   */
  getAllRules(): Rule[] {
    return [...this.rules.values()];
  }

  /**
   * Get rules that apply to a specific hook type.
   */
  getRulesForHook(hookType: HookEventType): Rule[] {
    return [...this.rules.values()]
      .filter((rule) => rule.enabled && rule.hookTypes.includes(hookType))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add a rule set.
   */
  addRuleSet(ruleSet: RuleSet): void {
    this.ruleSets.set(ruleSet.id, ruleSet);
    for (const rule of ruleSet.rules) {
      this.addRule({ ...rule, ruleSet: ruleSet.id });
    }
  }

  /**
   * Remove a rule set and its rules.
   */
  removeRuleSet(id: string): boolean {
    const ruleSet = this.ruleSets.get(id);
    if (!ruleSet) {
      return false;
    }

    for (const rule of ruleSet.rules) {
      this.rules.delete(rule.id);
    }
    return this.ruleSets.delete(id);
  }

  /**
   * Enable or disable a rule set.
   */
  setRuleSetEnabled(id: string, enabled: boolean): boolean {
    const ruleSet = this.ruleSets.get(id);
    if (!ruleSet) {
      return false;
    }

    ruleSet.enabled = enabled;
    for (const rule of ruleSet.rules) {
      const r = this.rules.get(rule.id);
      if (r) {
        r.enabled = enabled;
      }
    }
    return true;
  }

  /**
   * Evaluate a single rule against the context.
   */
  evaluateRule(
    rule: Rule,
    context: RuleEvaluationContext
  ): RuleEvaluationResult {
    const startTime = performance.now();

    // Check if rule applies
    if (
      !rule.enabled ||
      !ruleApplies(rule, context.hookType, context.toolName)
    ) {
      return {
        matched: false,
        rule,
        evaluationDetails: {
          evaluationTimeMs: performance.now() - startTime
        }
      };
    }

    // Evaluate conditions
    let conditionsMatch = true;
    const conditionResults: Array<{
      condition: RuleCondition;
      matched: boolean;
      actualValue?: unknown;
    }> = [];

    if (rule.conditionGroup) {
      // Use complex condition grouping
      conditionsMatch = evaluateConditionGroup(rule.conditionGroup, context);
    } else if (rule.conditions && rule.conditions.length > 0) {
      // Simple AND of all conditions
      for (const condition of rule.conditions) {
        const result = evaluateCondition(condition, context);
        conditionResults.push({
          condition,
          matched: result.matched,
          actualValue: result.actualValue
        });
        if (!result.matched) {
          conditionsMatch = false;
          break; // Short-circuit
        }
      }
    }

    return {
      matched: conditionsMatch,
      rule,
      action: conditionsMatch ? rule.action : undefined,
      evaluationDetails: {
        conditionResults,
        evaluationTimeMs: performance.now() - startTime
      }
    };
  }

  /**
   * Evaluate all applicable rules and return the first match.
   */
  evaluate(context: RuleEvaluationContext): RuleSetEvaluationResult {
    const startTime = performance.now();
    const allResults: RuleEvaluationResult[] = [];

    // Get applicable rules sorted by priority
    const applicableRules = [...this.rules.values()]
      .filter(
        (rule) =>
          rule.enabled && ruleApplies(rule, context.hookType, context.toolName)
      )
      .sort((a, b) => a.priority - b.priority);

    let matchedRule: Rule | undefined;
    let matchedAction: RuleEvaluationResult["action"];

    for (const rule of applicableRules) {
      const result = this.evaluateRule(rule, context);
      allResults.push(result);

      if (result.matched && !matchedRule) {
        matchedRule = rule;
        matchedAction = result.action;
        // Don't break - continue evaluating for debugging purposes
        // but we already have our answer
      }
    }

    return {
      matched: matchedRule !== undefined,
      matchedRule,
      action: matchedAction,
      allResults,
      rulesEvaluated: applicableRules.length,
      totalTimeMs: performance.now() - startTime
    };
  }

  /**
   * Evaluate all rules and return all matches (not just first).
   */
  evaluateAll(context: RuleEvaluationContext): RuleSetEvaluationResult {
    const startTime = performance.now();
    const allResults: RuleEvaluationResult[] = [];
    const matchedResults: RuleEvaluationResult[] = [];

    const applicableRules = [...this.rules.values()]
      .filter(
        (rule) =>
          rule.enabled && ruleApplies(rule, context.hookType, context.toolName)
      )
      .sort((a, b) => a.priority - b.priority);

    for (const rule of applicableRules) {
      const result = this.evaluateRule(rule, context);
      allResults.push(result);
      if (result.matched) {
        matchedResults.push(result);
      }
    }

    return {
      matched: matchedResults.length > 0,
      matchedRule: matchedResults[0]?.rule,
      action: matchedResults[0]?.action,
      allResults,
      rulesEvaluated: applicableRules.length,
      totalTimeMs: performance.now() - startTime
    };
  }

  /**
   * Export all rules as an array.
   */
  exportRules(): Rule[] {
    return [...this.rules.values()];
  }

  /**
   * Import rules from an array.
   */
  importRules(rules: Rule[], replace = false): void {
    if (replace) {
      this.rules.clear();
    }
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  /**
   * Clear all rules.
   */
  clear(): void {
    this.rules.clear();
    this.ruleSets.clear();
  }

  /**
   * Get statistics about loaded rules.
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    rulesByHookType: Record<string, number>;
    ruleSets: number;
  } {
    const rulesByHookType: Record<string, number> = {};
    let enabledRules = 0;

    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        enabledRules++;
      }
      for (const hookType of rule.hookTypes) {
        rulesByHookType[hookType] = (rulesByHookType[hookType] ?? 0) + 1;
      }
    }

    return {
      totalRules: this.rules.size,
      enabledRules,
      rulesByHookType,
      ruleSets: this.ruleSets.size
    };
  }
}
