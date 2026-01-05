/**
 * Rules Decision Source
 *
 * Integrates the rule engine as a decision source.
 */

import type { RuleEngine } from "../../rules/engine";
import type { RuleEvaluationContext } from "../../rules/types";
import type { DecisionResult, DecisionSource } from "../types";
import { BUILTIN_SOURCES, DECISION_PRIORITY } from "../types";

/**
 * Create a decision source that uses the rule engine.
 */
export function createRulesSource(ruleEngine: RuleEngine): DecisionSource {
  return {
    name: BUILTIN_SOURCES.RULES,
    priority: DECISION_PRIORITY.RULES,
    enabled: true,

    async evaluate(
      context: RuleEvaluationContext
    ): Promise<DecisionResult | null> {
      const result = ruleEngine.evaluate(context);

      if (!result.matched || !result.action) {
        return null; // Abstain
      }

      // Map rule action type to decision outcome
      const action = result.action;
      let decision: DecisionResult["decision"];

      switch (action.type) {
        case "allow":
          decision = "allow";
          break;
        case "deny":
          decision = "deny";
          break;
        case "block":
          decision = "block";
          break;
        case "continue":
          decision = "continue";
          break;
        case "modify":
          decision = "modify";
          break;
        case "warn":
          decision = "warn";
          break;
        case "prompt":
          // Prompt means defer to LLM, so abstain here
          return null;
        default:
          return null;
      }

      return {
        decision,
        source: BUILTIN_SOURCES.RULES,
        reason: action.reason,
        systemMessage: action.systemMessage,
        modifications: action.modifications,
        metadata: {
          ruleId: result.matchedRule?.id,
          ruleName: result.matchedRule?.name,
          ruleSet: result.matchedRule?.ruleSet
        }
      };
    }
  };
}
