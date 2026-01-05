/**
 * macOS Desktop Notifications via osascript
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface NotificationOptions {
  title: string;
  message: string;
  subtitle?: string;
  sound?: boolean;
}

/**
 * Send a macOS desktop notification using osascript
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<boolean> {
  // Only works on macOS
  if (process.platform !== "darwin") {
    return false;
  }

  const { title, message, subtitle, sound = true } = options;

  // Escape special characters for AppleScript
  const escapeAS = (str: string) =>
    str.replace(/"/g, '\\"').replace(/\\/g, "\\\\");

  let script = `display notification "${escapeAS(message)}" with title "${escapeAS(title)}"`;

  if (subtitle) {
    script += ` subtitle "${escapeAS(subtitle)}"`;
  }

  if (sound) {
    script += ` sound name "default"`;
  }

  try {
    await execAsync(`osascript -e '${script}'`);
    return true;
  } catch (error) {
    // Notification failed - may be due to permissions or other issues
    console.error("Failed to send notification:", error);
    return false;
  }
}

// Pre-built notification types for common events
export const notifications = {
  /**
   * Session is waiting for user input (permission prompt)
   */
  awaitingInput: (sessionId: string, cwd?: string) =>
    sendNotification({
      title: "Claude Code",
      subtitle: "Permission Required",
      message: cwd
        ? `Session in ${cwd} needs input`
        : `Session ${sessionId.slice(0, 8)} needs input`
    }),

  /**
   * Session has ended
   */
  sessionEnd: (sessionId: string, cwd?: string) =>
    sendNotification({
      title: "Claude Code",
      subtitle: "Session Ended",
      message: cwd
        ? `Session in ${cwd} completed`
        : `Session ${sessionId.slice(0, 8)} completed`,
      sound: false
    }),

  /**
   * Tool execution failed
   */
  toolFailure: (toolName: string, error?: string) =>
    sendNotification({
      title: "Claude Code",
      subtitle: "Tool Failed",
      message: error
        ? `${toolName}: ${error.slice(0, 100)}`
        : `${toolName} execution failed`
    }),

  /**
   * Long-running operation detected
   */
  longRunning: (toolName: string, durationSeconds: number) =>
    sendNotification({
      title: "Claude Code",
      subtitle: "Long Running Operation",
      message: `${toolName} has been running for ${Math.round(durationSeconds)}s`
    }),

  /**
   * Security gate blocked an operation
   */
  securityBlocked: (toolName: string, reason: string) =>
    sendNotification({
      title: "Claude Code - Security",
      subtitle: "Operation Blocked",
      message: `${toolName}: ${reason.slice(0, 100)}`
    }),

  // ==========================================================================
  // Educational Hook Notifications
  // These help users understand how Claude Code hooks work
  // ==========================================================================

  /**
   * SessionStart hook fired - new or resumed session
   */
  hookSessionStart: (source: string, cwd: string) =>
    sendNotification({
      title: "Hook: SessionStart",
      subtitle: `Source: ${source}`,
      message: `Session started in ${cwd.split("/").pop() || cwd}. Use this hook to inject context.`,
      sound: false
    }),

  /**
   * PreToolUse hook fired - about to execute a tool
   */
  hookPreToolUse: (toolName: string, cwd: string) =>
    sendNotification({
      title: "Hook: PreToolUse",
      subtitle: `Tool: ${toolName}`,
      message: `About to run ${toolName}. Can block, modify input, or approve.`,
      sound: false
    }),

  /**
   * PostToolUse hook fired - tool completed
   */
  hookPostToolUse: (toolName: string, success: boolean, durationMs: number) =>
    sendNotification({
      title: "Hook: PostToolUse",
      subtitle: `Tool: ${toolName}`,
      message: `${toolName} ${success ? "succeeded" : "failed"} in ${durationMs}ms. Good for logging.`,
      sound: false
    }),

  /**
   * Notification hook fired - Claude is notifying about something
   */
  hookNotification: (notificationType: string) =>
    sendNotification({
      title: "Hook: Notification",
      subtitle: `Type: ${notificationType}`,
      message: "Claude is waiting for input or showing a notification.",
      sound: false
    }),

  /**
   * PermissionRequest hook fired - Claude needs permission
   */
  hookPermissionRequest: (toolName: string, action: string) =>
    sendNotification({
      title: "Hook: PermissionRequest",
      subtitle: `Tool: ${toolName}`,
      message: `User ${action}. Can auto-approve/deny based on rules.`,
      sound: false
    }),

  /**
   * UserPromptSubmit hook fired - user submitted a prompt
   */
  hookUserPromptSubmit: (promptLength: number) =>
    sendNotification({
      title: "Hook: UserPromptSubmit",
      subtitle: `${promptLength} chars`,
      message: "User prompt submitted. Can inject context or block.",
      sound: false
    }),

  /**
   * Stop hook fired - Claude finished responding
   */
  hookStop: (stopReason: string, inputTokens: number, outputTokens: number) =>
    sendNotification({
      title: "Hook: Stop",
      subtitle: `Reason: ${stopReason}`,
      message: `${inputTokens} in / ${outputTokens} out tokens. Can auto-continue.`,
      sound: false
    }),

  /**
   * SubagentStop hook fired - subagent (Task tool) finished
   */
  hookSubagentStop: (
    stopReason: string,
    inputTokens: number,
    outputTokens: number
  ) =>
    sendNotification({
      title: "Hook: SubagentStop",
      subtitle: `Reason: ${stopReason}`,
      message: `Subagent done. ${inputTokens} in / ${outputTokens} out. Can validate quality.`,
      sound: false
    }),

  /**
   * PreCompact hook fired - context is about to be compacted
   */
  hookPreCompact: (compactType: string) =>
    sendNotification({
      title: "Hook: PreCompact",
      subtitle: `Type: ${compactType}`,
      message: "Context compacting. Opportunity to preserve important info.",
      sound: false
    })
};
