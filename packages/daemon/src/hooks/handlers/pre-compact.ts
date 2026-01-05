/**
 * PreCompact Hook Handler
 *
 * Handles PreCompact events with:
 * - Context preservation suggestions
 * - Compaction strategy recommendations
 */

import type {
  HookHandlerContext,
  PreCompactInput,
  PreCompactResponse
} from "../types";

/**
 * Handle PreCompact event.
 */
export async function handlePreCompact(
  input: PreCompactInput,
  ctx: HookHandlerContext
): Promise<PreCompactResponse> {
  const { connectionManager, config, notify } = ctx;

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_pre_compact",
    session_id: input.session_id,
    timestamp: Date.now()
  });

  // Send notification
  if (config.notifications.enable && config.notifications.hookPreCompact) {
    await notify({
      type: "info",
      title: "Context Compacting",
      message: "Claude is summarizing the conversation",
      hookType: "PreCompact",
      sessionId: input.session_id,
      cwd: input.cwd
    });
  }

  const preCompactConfig = config.hookEnhancements.preCompact;

  if (!preCompactConfig.enabled) {
    return { status: "ok" };
  }

  const preservePatterns = preCompactConfig.preservePatterns;
  const suggestStrategy = preCompactConfig.suggestStrategy;

  const response: PreCompactResponse = { status: "ok" };

  // Add preserve context instruction if patterns configured
  if (preservePatterns.length > 0) {
    const preserveParts = [
      "IMPORTANT: When summarizing, preserve content matching these patterns:"
    ];
    for (const pattern of preservePatterns) {
      preserveParts.push(`  - ${pattern}`);
    }
    response.preserveContext = preserveParts.join("\n");
  }

  // Add strategy suggestion if enabled
  if (suggestStrategy) {
    response.suggestedStrategy = [
      "Suggested summarization approach:",
      "1. Preserve all file paths and code snippets discussed",
      "2. Keep architectural decisions and their rationale",
      "3. Maintain the current task context and next steps",
      "4. Retain any errors encountered and their solutions"
    ].join("\n");
  }

  return response;
}
