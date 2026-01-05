/**
 * PostToolUse Hook Handler
 *
 * Handles PostToolUse events with:
 * - Tool usage recording
 * - Git commit detection
 * - Failure notifications
 */

import type {
  HookHandlerContext,
  PostToolUseInput,
  PostToolUseResponse
} from "../types";

/**
 * Check if a command is a git commit.
 */
function isGitCommit(command: string): boolean {
  return /git\s+commit(?!\s+--amend)/.test(command);
}

/**
 * Extract commit hash from git commit output.
 */
function extractCommitHash(output: string): string | null {
  // Match patterns like "[main abc1234]" or "abc1234 commit message"
  const match = output.match(
    /\[[\w-]+\s+([a-f0-9]{7,40})\]|^([a-f0-9]{7,40})\s/m
  );
  return match?.[1] ?? match?.[2] ?? null;
}

/**
 * Handle PostToolUse event.
 */
export async function handlePostToolUse(
  input: PostToolUseInput,
  ctx: HookHandlerContext
): Promise<PostToolUseResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;

  // Record the tool usage completion
  const usage = hookStore.recordPostToolUse(
    input.tool_use_id,
    input.tool_response,
    input.error
  );

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_post_tool_use",
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id,
    success: !input.error,
    duration_ms: usage?.durationMs,
    session_id: input.session_id,
    timestamp: Date.now()
  });

  // Send notification for tool completion
  if (config.notifications.enable && config.notifications.hookPostToolUse) {
    await notify({
      type: input.error ? "error" : "success",
      title: `Tool ${input.error ? "Failed" : "Completed"}`,
      message: `${input.tool_name} (${usage?.durationMs ?? 0}ms)`,
      hookType: "PostToolUse",
      sessionId: input.session_id,
      toolName: input.tool_name,
      cwd: input.cwd,
      toolInput: input.tool_input
    });
  }

  // Send failure notification if enabled
  if (
    input.error &&
    config.notifications.enable &&
    config.notifications.hookToolFailure
  ) {
    await notify({
      type: "error",
      title: "Tool Failed",
      message: `${input.tool_name}: ${input.error.slice(0, 100)}`,
      hookType: "PostToolUse",
      sessionId: input.session_id,
      toolName: input.tool_name,
      cwd: input.cwd,
      toolInput: input.tool_input
    });
  }

  // Detect git commits
  if (input.tool_name === "Bash" && !input.error && usage?.success) {
    const command = String(input.tool_input?.command ?? "");

    if (isGitCommit(command)) {
      const output = String(
        (input.tool_response as Record<string, unknown>)?.stdout ??
          (input.tool_response as Record<string, unknown>)?.output ??
          ""
      );

      const commitHash = extractCommitHash(output);

      if (commitHash) {
        // Extract commit message from command
        const msgMatch = command.match(/-m\s+["']([^"']+)/);
        const message = msgMatch?.[1] ?? "";

        hookStore.recordCommit(
          input.session_id,
          commitHash,
          message,
          input.cwd
        );

        connectionManager.broadcast({
          type: "git_commit",
          session_id: input.session_id,
          commit_hash: commitHash,
          message,
          cwd: input.cwd,
          timestamp: Date.now()
        });

        // Record test pass if test gate is enabled
        if (config.testGate.enabled) {
          // Clear test pass on commit (tests need to be re-run)
          // This is handled by the test gate logic
        }
      }
    }
  }

  return { status: "ok" };
}
