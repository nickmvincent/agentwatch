/**
 * PermissionRequest Hook Handler
 *
 * Handles PermissionRequest events with:
 * - Auto-approval for read-only operations
 * - Rule-based decisions
 */

import type { RuleEvaluationContext } from "../../rules/types";
import type {
  HookHandlerContext,
  PermissionRequestInput,
  PermissionRequestResponse
} from "../types";

/**
 * Read-only tools that can be auto-approved.
 */
const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "LSP"
];

/**
 * Handle PermissionRequest event.
 */
export async function handlePermissionRequest(
  input: PermissionRequestInput,
  ctx: HookHandlerContext
): Promise<PermissionRequestResponse> {
  const {
    hookStore,
    ruleEngine,
    decisionEngine,
    connectionManager,
    config,
    notify
  } = ctx;

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_permission_request",
    session_id: input.session_id,
    tool_name: input.tool_name,
    action: input.action,
    timestamp: Date.now()
  });

  // Send notification
  if (
    config.notifications.enable &&
    config.notifications.hookPermissionRequest
  ) {
    await notify({
      type: "info",
      title: "Permission Request",
      message: `Permission: ${input.tool_name}`,
      hookType: "PermissionRequest",
      sessionId: input.session_id,
      toolName: input.tool_name,
      cwd: input.cwd,
      toolInput: input.tool_input
    });
  }

  // Build evaluation context
  const evalContext: RuleEvaluationContext = {
    hookType: "PermissionRequest",
    sessionId: input.session_id,
    toolName: input.tool_name,
    toolInput: input.tool_input,
    cwd: input.cwd,
    permissionMode: input.permission_mode
  };

  // Evaluate rules if enabled
  if (config.hookEnhancements.rules.enabled) {
    const ruleResult = ruleEngine.evaluate(evalContext);

    if (ruleResult.matched && ruleResult.action) {
      const action = ruleResult.action;

      if (action.type === "allow") {
        return {
          decision: "allow",
          reason: action.reason ?? "Allowed by rule"
        };
      }

      if (action.type === "deny" || action.type === "block") {
        return {
          decision: "deny",
          reason: action.reason ?? "Denied by rule"
        };
      }
    }
  }

  // Check auto-permissions
  const autoPerms = config.hookEnhancements.autoPermissions;

  if (autoPerms.enabled && autoPerms.autoApproveReadOnly) {
    if (READ_ONLY_TOOLS.includes(input.tool_name)) {
      return {
        decision: "allow",
        reason: "Auto-approved: read-only operation"
      };
    }
  }

  // Use decision engine for more complex evaluation
  const decision = await decisionEngine.decide(evalContext);

  if (decision.finalDecision === "allow") {
    return {
      decision: "allow",
      reason: decision.reason
    };
  }

  if (decision.finalDecision === "deny" || decision.finalDecision === "block") {
    return {
      decision: "deny",
      reason: decision.reason
    };
  }

  // Default: don't auto-decide, let user decide
  return { status: "ok" };
}
