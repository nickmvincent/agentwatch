/**
 * Test Gate Decision Source
 *
 * Blocks git commits if tests haven't passed recently.
 */

import type { TestGateConfig } from "../../config";
import type { RuleEvaluationContext } from "../../rules/types";
import { checkTestGate, isGitCommit } from "../../security-gates";
import type {
  DecisionResult,
  DecisionSource,
  ExtendedDecisionContext
} from "../types";
import { BUILTIN_SOURCES, DECISION_PRIORITY } from "../types";

export interface TestGateSourceConfig {
  testGate: TestGateConfig;
}

/**
 * Create a decision source for test gate enforcement.
 */
export function createTestGateSource(
  getConfig: () => TestGateSourceConfig
): DecisionSource {
  return {
    name: BUILTIN_SOURCES.TEST_GATE,
    priority: DECISION_PRIORITY.TEST_GATE,
    enabled: true,

    appliesTo(hookType: string): boolean {
      // Only applies to PreToolUse for Bash commands
      return hookType === "PreToolUse";
    },

    async evaluate(
      context: RuleEvaluationContext | ExtendedDecisionContext
    ): Promise<DecisionResult | null> {
      const config = getConfig();

      // Check if test gate is enabled
      if (!config.testGate.enabled) {
        return null; // Abstain
      }

      // Only check Bash commands
      if (context.toolName !== "Bash") {
        return null;
      }

      // Check if this is a git commit command
      const command = String(
        (context.toolInput as Record<string, unknown>)?.command ?? ""
      );
      if (!isGitCommit(command)) {
        return null;
      }

      // Check test gate
      const decision = checkTestGate(config.testGate);

      if (!decision.allowed) {
        return {
          decision: "block",
          source: BUILTIN_SOURCES.TEST_GATE,
          reason: decision.reason ?? "Tests must pass before committing",
          metadata: {
            passFile: config.testGate.passFile,
            maxAgeSeconds: config.testGate.passFileMaxAgeSeconds
          }
        };
      }

      return null; // Abstain (allow commit)
    }
  };
}
