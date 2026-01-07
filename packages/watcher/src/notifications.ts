/**
 * macOS desktop notifications for hook events.
 *
 * Uses osascript to display native notifications without external dependencies.
 */

import { exec } from "child_process";
import { platform } from "os";

export interface NotificationOptions {
  title: string;
  message: string;
  subtitle?: string;
  sound?: boolean;
}

/**
 * Send a macOS desktop notification using osascript.
 */
export function sendNotification(options: NotificationOptions): void {
  if (platform() !== "darwin") {
    // Only macOS is supported
    return;
  }

  const { title, message, subtitle, sound = true } = options;

  // Escape quotes for AppleScript
  const escapeForAppleScript = (str: string) =>
    str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const escapedTitle = escapeForAppleScript(title);
  const escapedMessage = escapeForAppleScript(message);
  const escapedSubtitle = subtitle ? escapeForAppleScript(subtitle) : "";

  let script = `display notification "${escapedMessage}" with title "${escapedTitle}"`;
  if (escapedSubtitle) {
    script += ` subtitle "${escapedSubtitle}"`;
  }
  if (sound) {
    script += ` sound name "default"`;
  }

  exec(`osascript -e '${script}'`, (err) => {
    if (err) {
      // Silently ignore notification errors
      console.error(
        "[notifications] Failed to send notification:",
        err.message
      );
    }
  });
}

/**
 * Notification configuration from config.toml.
 */
export interface NotificationConfig {
  enable: boolean;
  hookAwaitingInput: boolean;
  hookSessionEnd: boolean;
  hookToolFailure: boolean;
  hookLongRunning: boolean;
  longRunningThresholdSeconds: number;
}

/**
 * Default notification configuration.
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enable: true,
  hookAwaitingInput: true,
  hookSessionEnd: true,
  hookToolFailure: true,
  hookLongRunning: true,
  longRunningThresholdSeconds: 60
};

/**
 * Notification helper for hook events.
 */
export class HookNotifier {
  private config: NotificationConfig;
  private longRunningTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
  }

  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  isEnabled(): boolean {
    return this.config.enable && platform() === "darwin";
  }

  /**
   * Notify when a session starts (optional, for debugging).
   */
  notifySessionStart(sessionId: string, cwd: string): void {
    if (!this.isEnabled()) return;

    const projectName = cwd.split("/").pop() || cwd;
    sendNotification({
      title: "Claude Code Session Started",
      message: projectName,
      subtitle: sessionId.slice(0, 8),
      sound: false
    });
  }

  /**
   * Notify when a session ends.
   */
  notifySessionEnd(sessionId: string, cwd: string): void {
    if (!this.isEnabled() || !this.config.hookSessionEnd) return;

    // Clear any long-running timer
    this.clearLongRunningTimer(sessionId);

    const projectName = cwd.split("/").pop() || cwd;
    sendNotification({
      title: "Claude Code Session Ended",
      message: projectName,
      subtitle: sessionId.slice(0, 8)
    });
  }

  /**
   * Notify when Claude is awaiting user input.
   */
  notifyAwaitingInput(sessionId: string, cwd: string): void {
    if (!this.isEnabled() || !this.config.hookAwaitingInput) return;

    const projectName = cwd.split("/").pop() || cwd;
    sendNotification({
      title: "Claude Code Needs Input",
      message: `Waiting for your response in ${projectName}`,
      subtitle: sessionId.slice(0, 8)
    });
  }

  /**
   * Notify when a tool fails.
   */
  notifyToolFailure(
    sessionId: string,
    toolName: string,
    error: string,
    cwd: string
  ): void {
    if (!this.isEnabled() || !this.config.hookToolFailure) return;

    const projectName = cwd.split("/").pop() || cwd;
    const shortError = error.length > 50 ? error.slice(0, 50) + "..." : error;
    sendNotification({
      title: `Tool Failed: ${toolName}`,
      message: shortError,
      subtitle: projectName
    });
  }

  /**
   * Start tracking a long-running operation.
   */
  startLongRunningTimer(
    sessionId: string,
    toolName: string,
    cwd: string
  ): void {
    if (!this.isEnabled() || !this.config.hookLongRunning) return;

    // Clear any existing timer
    this.clearLongRunningTimer(sessionId);

    const timer = setTimeout(() => {
      const projectName = cwd.split("/").pop() || cwd;
      sendNotification({
        title: "Long-Running Operation",
        message: `${toolName} has been running for ${this.config.longRunningThresholdSeconds}s`,
        subtitle: projectName
      });
      this.longRunningTimers.delete(sessionId);
    }, this.config.longRunningThresholdSeconds * 1000);

    this.longRunningTimers.set(sessionId, timer);
  }

  /**
   * Clear a long-running timer (operation completed).
   */
  clearLongRunningTimer(sessionId: string): void {
    const timer = this.longRunningTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.longRunningTimers.delete(sessionId);
    }
  }

  /**
   * Clean up all timers.
   */
  cleanup(): void {
    for (const timer of this.longRunningTimers.values()) {
      clearTimeout(timer);
    }
    this.longRunningTimers.clear();
  }
}
