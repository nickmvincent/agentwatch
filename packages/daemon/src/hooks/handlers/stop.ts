/**
 * Stop Hook Handler
 *
 * Handles Stop events with:
 * - Token/cost tracking
 * - Auto-continue logic
 * - Stop blocking
 */

import type { RuleEvaluationContext } from "../../rules/types";
import { checkTestGate } from "../../security-gates";
import type { HookHandlerContext, StopInput, StopResponse } from "../types";

/**
 * Stop blockers that can prevent Claude from stopping.
 */
export interface StopBlocker {
  name: string;
  shouldBlock: (input: StopInput, ctx: HookHandlerContext) => Promise<boolean>;
  getMessage: (input: StopInput, ctx: HookHandlerContext) => string;
}

/**
 * Built-in stop blockers.
 */
export const builtInBlockers: StopBlocker[] = [
  {
    name: "tests-not-passing",
    async shouldBlock(input, ctx) {
      if (!ctx.config.hookEnhancements.stopBlocking.enabled) return false;
      if (!ctx.config.hookEnhancements.stopBlocking.requireTestsPass)
        return false;
      if (!ctx.config.testGate.enabled) return false;

      const decision = checkTestGate(ctx.config.testGate);
      return !decision.allowed;
    },
    getMessage() {
      return "Tests must pass before stopping. Please run the test suite and ensure all tests pass.";
    }
  },
  {
    name: "lint-errors",
    async shouldBlock(input, ctx) {
      if (!ctx.config.hookEnhancements.stopBlocking.enabled) return false;
      if (!ctx.config.hookEnhancements.stopBlocking.requireNoLintErrors)
        return false;

      // TODO: Implement lint check
      // For now, this is a placeholder that would need integration
      // with project-specific linting commands
      return false;
    },
    getMessage() {
      return "Lint errors detected. Please fix them before stopping.";
    }
  }
];

/**
 * Calculate cost from tokens.
 *
 * CAVEAT: This is a rough ESTIMATE only, not actual Anthropic billing.
 * Uses hardcoded Sonnet 3.5 pricing which may be outdated.
 * Does not account for model differences, caching, or API discounts.
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  // Approximate Sonnet pricing (ESTIMATE ONLY)
  // Input: $3 per 1M tokens, Output: $15 per 1M tokens
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  return inputCost + outputCost;
}

/**
 * Handle Stop event.
 */
export async function handleStop(
  input: StopInput,
  ctx: HookHandlerContext
): Promise<StopResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;
  const session = hookStore.getSession(input.session_id);

  // Calculate cost
  const inputTokens = input.input_tokens ?? 0;
  const outputTokens = input.output_tokens ?? 0;
  const costUsd = calculateCost(inputTokens, outputTokens);

  // Update session tokens
  if (input.session_id) {
    hookStore.updateSessionTokens(
      input.session_id,
      inputTokens,
      outputTokens,
      costUsd
    );
  }

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_stop",
    session_id: input.session_id,
    stop_reason: input.stop_reason ?? "end_turn",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: costUsd,
    timestamp: Date.now()
  });

  // Send notification
  if (config.notifications.enable && config.notifications.hookStop) {
    const reason = input.stop_reason ?? "end_turn";
    await notify({
      type: "info",
      title: "Claude Stopped",
      message: `Turn complete (${reason})`,
      hookType: "Stop",
      sessionId: input.session_id,
      cwd: input.cwd,
      toolCount: session?.toolCount,
      inputTokens: session
        ? session.totalInputTokens + inputTokens
        : inputTokens,
      outputTokens: session
        ? session.totalOutputTokens + outputTokens
        : outputTokens
    });
  }

  // Check for cost warnings
  const costControls = config.hookEnhancements.costControls;
  let costWarning: StopResponse["costWarning"] | undefined;

  if (costControls.enabled && session) {
    const sessionCost = session.estimatedCostUsd + costUsd;

    if (costControls.sessionBudgetUsd !== null) {
      const percentUsed = (sessionCost / costControls.sessionBudgetUsd) * 100;

      // Check if we've crossed any alert thresholds
      for (const threshold of costControls.alertThresholds) {
        if (percentUsed >= threshold) {
          costWarning = {
            type: "session",
            current: sessionCost,
            limit: costControls.sessionBudgetUsd
          };

          // Broadcast cost warning
          connectionManager.broadcast({
            type: "cost_warning",
            session_id: input.session_id,
            threshold,
            current: sessionCost,
            limit: costControls.sessionBudgetUsd,
            timestamp: Date.now()
          });

          break;
        }
      }

      // Check if over budget
      if (
        sessionCost >= costControls.sessionBudgetUsd &&
        costControls.overBudgetAction === "block"
      ) {
        return {
          status: "blocked",
          costWarning,
          blockedBy: ["cost_limit"]
        };
      }
    }
  }

  // Check stop blockers (only if not already continuing from previous stop hook)
  if (
    config.hookEnhancements.stopBlocking.enabled &&
    !input.stop_hook_active &&
    session
  ) {
    // Check if we've exceeded max block attempts
    const attempts = hookStore.incrementAutoContinueAttempts(input.session_id);
    const maxAttempts = config.hookEnhancements.stopBlocking.maxBlockAttempts;

    if (attempts <= maxAttempts) {
      const blockedBy: string[] = [];
      const messages: string[] = [];

      for (const blocker of builtInBlockers) {
        if (await blocker.shouldBlock(input, ctx)) {
          blockedBy.push(blocker.name);
          messages.push(blocker.getMessage(input, ctx));
        }
      }

      if (blockedBy.length > 0) {
        return {
          continue: true,
          systemMessage: messages.join("\n\n"),
          blockedBy,
          costWarning
        };
      }
    }

    // Reset attempts if no blockers
    hookStore.resetAutoContinueAttempts(input.session_id);
  }

  // Check auto-continue conditions
  if (
    config.hookEnhancements.autoContinue.enabled &&
    !input.stop_hook_active &&
    session
  ) {
    const attempts = session.autoContinueAttempts;
    const maxAttempts = config.hookEnhancements.autoContinue.maxAttempts;

    if (attempts < maxAttempts) {
      // Check if tests are failing and auto-continue is enabled
      if (config.hookEnhancements.autoContinue.onFailingTests) {
        const testDecision = checkTestGate(config.testGate);
        if (!testDecision.allowed) {
          hookStore.incrementAutoContinueAttempts(input.session_id);

          return {
            continue: true,
            systemMessage: `Tests are failing: ${testDecision.reason}. Please fix the failing tests before considering the task complete.`,
            costWarning
          };
        }
      }
    }
  }

  return {
    status: "ok",
    costWarning
  };
}
