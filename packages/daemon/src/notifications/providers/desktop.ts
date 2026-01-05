/**
 * Desktop Notification Provider
 *
 * Sends notifications via macOS osascript (AppleScript).
 * Can be extended to support other platforms.
 */

import { exec } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { DesktopFormatConfig } from "../../config";
import type {
  NotificationPayload,
  NotificationProvider,
  NotificationResult
} from "../types";

const execAsync = promisify(exec);

/**
 * Desktop notification provider config.
 */
export interface DesktopProviderConfig {
  enabled: boolean;
  format: DesktopFormatConfig;
}

/**
 * Derive project name from cwd path.
 * Returns the last path segment (directory name).
 */
function deriveProjectName(cwd: string): string {
  if (!cwd) return "";
  return basename(cwd);
}

/**
 * Abbreviate session ID to first 8 characters.
 */
function abbreviateSessionId(sessionId: string): string {
  if (!sessionId) return "";
  return sessionId.slice(0, 8);
}

/**
 * Get tool input preview (for Bash commands, file paths, etc.)
 */
function getToolInputPreview(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  if (!toolInput) return "";

  // For Bash, show the command
  if (toolName === "Bash" && typeof toolInput.command === "string") {
    const cmd = toolInput.command;
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  }

  // For file operations, show the path
  if (typeof toolInput.file_path === "string") {
    const path = toolInput.file_path;
    return path.length > 60 ? "..." + path.slice(-57) : path;
  }

  if (typeof toolInput.path === "string") {
    const path = toolInput.path;
    return path.length > 60 ? "..." + path.slice(-57) : path;
  }

  // For patterns (Glob, Grep)
  if (typeof toolInput.pattern === "string") {
    return toolInput.pattern.slice(0, 60);
  }

  return "";
}

/**
 * Format a token count for display (e.g., 1234 -> "1.2k", 1234567 -> "1.2M").
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Format stats string (tool count and/or tokens).
 */
function formatStats(
  toolCount?: number,
  inputTokens?: number,
  outputTokens?: number
): string {
  const parts: string[] = [];

  if (toolCount !== undefined && toolCount > 0) {
    parts.push(`${toolCount} tool${toolCount !== 1 ? "s" : ""}`);
  }

  // Show tokens if available
  if (inputTokens !== undefined || outputTokens !== undefined) {
    const inTok = inputTokens ?? 0;
    const outTok = outputTokens ?? 0;
    if (inTok > 0 || outTok > 0) {
      parts.push(`${formatTokenCount(inTok)}/${formatTokenCount(outTok)} tok`);
    }
  }

  return parts.join(", ");
}

/**
 * macOS Desktop Notification Provider
 */
export class DesktopNotificationProvider implements NotificationProvider {
  readonly name = "desktop";

  private readonly enabled: boolean;
  private readonly format: DesktopFormatConfig;

  constructor(config: DesktopProviderConfig) {
    this.enabled = config.enabled;
    this.format = config.format;
  }

  isAvailable(): boolean {
    // Only available on macOS and when enabled
    return this.enabled && process.platform === "darwin";
  }

  /**
   * Format notification based on config settings.
   */
  private formatNotification(payload: NotificationPayload): {
    title: string;
    message: string;
    subtitle?: string;
  } {
    const { format } = this;
    const {
      title: rawTitle,
      message: rawMessage,
      subtitle: rawSubtitle,
      cwd,
      sessionId,
      toolName,
      toolInput,
      toolCount,
      inputTokens,
      outputTokens
    } = payload;

    // Build title
    let title = rawTitle;
    if (format.showProjectName && cwd) {
      const projectName = deriveProjectName(cwd);
      if (projectName) {
        title = projectName;
      }
    }

    // Build message
    const message = rawMessage;

    // Build subtitle parts
    const subtitleParts: string[] = [];

    if (format.showSessionId && sessionId) {
      subtitleParts.push(abbreviateSessionId(sessionId));
    }

    if (format.showToolDetails && toolName && toolInput) {
      const preview = getToolInputPreview(toolName, toolInput);
      if (preview) {
        subtitleParts.push(preview);
      }
    }

    if (format.showStats) {
      const stats = formatStats(toolCount, inputTokens, outputTokens);
      if (stats) {
        subtitleParts.push(stats);
      }
    }

    if (format.showCwd && cwd) {
      subtitleParts.push(cwd);
    }

    // Prefer formatted subtitle, fall back to raw if no parts
    let subtitle: string | undefined;
    if (subtitleParts.length > 0) {
      subtitle = subtitleParts.join(" | ");
    } else if (rawSubtitle) {
      subtitle = rawSubtitle;
    }

    return { title, message, subtitle };
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        provider: this.name,
        error: "Desktop notifications not available"
      };
    }

    const { sound = true } = payload;
    const { title, message, subtitle } = this.formatNotification(payload);

    // Escape special characters for AppleScript
    const escapeAS = (str: string) =>
      str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    let script = `display notification "${escapeAS(message)}" with title "${escapeAS(title)}"`;

    if (subtitle) {
      script += ` subtitle "${escapeAS(subtitle)}"`;
    }

    if (sound) {
      script += ` sound name "default"`;
    }

    try {
      await execAsync(`osascript -e '${script}'`);
      return {
        success: true,
        provider: this.name
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async test(): Promise<NotificationResult> {
    return this.send({
      type: "info",
      title: "AgentWatch",
      message: "Desktop notifications are working!",
      subtitle: "Test notification",
      cwd: "/Users/test/my-project",
      sessionId: "test-session-12345678",
      sound: true
    });
  }
}
