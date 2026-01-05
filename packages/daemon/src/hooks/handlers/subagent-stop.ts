/**
 * SubagentStop Hook Handler
 */

import type {
  HookHandlerContext,
  SubagentStopInput,
  SubagentStopResponse
} from "../types";

/**
 * Handle SubagentStop event.
 */
export async function handleSubagentStop(
  input: SubagentStopInput,
  ctx: HookHandlerContext
): Promise<SubagentStopResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;

  const inputTokens = input.input_tokens ?? 0;
  const outputTokens = input.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;

  // CAVEAT: Cost is a rough ESTIMATE only, not actual billing.
  // See stop.ts calculateCost for details.
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  const costUsd = inputCost + outputCost;

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
    type: "hook_subagent_stop",
    session_id: input.session_id,
    subagent_id: input.subagent_id ?? input.tool_use_id,
    stop_reason: input.stop_reason ?? "end_turn",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: costUsd,
    timestamp: Date.now()
  });

  // Send notification
  if (config.notifications.enable && config.notifications.hookSubagentStop) {
    await notify({
      type: "info",
      title: "Subagent Stopped",
      message: `Subagent complete (${input.stop_reason ?? "end_turn"})`,
      hookType: "SubagentStop",
      sessionId: input.session_id,
      cwd: input.cwd,
      inputTokens,
      outputTokens
    });
  }

  // Check quality gates
  const qualityGates = config.hookEnhancements.subagentQuality;

  if (qualityGates.enabled) {
    // Check success requirement
    if (qualityGates.requireSuccess && input.stop_reason !== "end_turn") {
      return {
        decision: "block",
        reason: `Subagent did not complete successfully: ${input.stop_reason}`
      };
    }

    // Check token limit
    if (
      qualityGates.maxTokens !== null &&
      totalTokens > qualityGates.maxTokens
    ) {
      return {
        decision: "block",
        reason: `Subagent exceeded token limit: ${totalTokens} > ${qualityGates.maxTokens}`
      };
    }
  }

  return { status: "ok" };
}
