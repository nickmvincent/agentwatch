/**
 * Sanitization helpers for API responses.
 *
 * These functions redact sensitive information (usernames, tokens, secrets)
 * before data is sent to clients or stored in logs. Used primarily for
 * process snapshots and command lines that may contain sensitive paths.
 *
 * @module
 */

import type { ProcessSnapshot, ProcessLifecycleEvent } from "./dict-converters";
import { processSnapshotToDict, processEventToDict } from "./dict-converters";

/**
 * Redact username from a path by replacing /Users/xxx or /home/xxx with ~
 *
 * @param path - File path that may contain username
 * @returns Path with username replaced by ~
 *
 * @example
 * ```typescript
 * redactUserFromPath("/Users/alice/projects/foo") // => "~/projects/foo"
 * redactUserFromPath("/home/bob/.config")         // => "~/.config"
 * ```
 */
export function redactUserFromPath(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/^\/home\/[^/]+/, "~")
    .replace(/^C:\\Users\\[^\\]+/i, "~");
}

/**
 * Sanitize a command line by removing sensitive information.
 *
 * Redacts:
 * - Paths containing usernames
 * - `--token`, `--api-key`, `--password`, `--secret` values
 *
 * @param cmdline - Full command line string
 * @returns Sanitized command line with secrets replaced by [REDACTED]
 */
export function sanitizeCmdline(cmdline: string): string {
  let result = cmdline;

  // Redact paths containing usernames
  result = result
    .replace(/\/Users\/[^/\s]+/g, "/Users/[REDACTED]")
    .replace(/\/home\/[^/\s]+/g, "/home/[REDACTED]")
    .replace(/C:\\Users\\[^\\\s]+/gi, "C:\\Users\\[REDACTED]");

  // Redact common secret patterns
  result = result
    .replace(/--token[=\s]+\S+/gi, "--token=[REDACTED]")
    .replace(/--api[-_]?key[=\s]+\S+/gi, "--api-key=[REDACTED]")
    .replace(/--password[=\s]+\S+/gi, "--password=[REDACTED]")
    .replace(/--secret[=\s]+\S+/gi, "--secret=[REDACTED]");

  return result;
}

/**
 * Sanitize a process snapshot by redacting sensitive paths and cmdlines.
 *
 * Converts the snapshot to API dict format and optionally redacts:
 * - `cwd`, `repo_path`, `exe` paths (when redactPaths is true)
 * - `cmdline` secrets (when redactCmdline is true)
 *
 * @param snapshot - Process snapshot to sanitize
 * @param redactPaths - Whether to redact usernames from paths (default: true)
 * @param redactCmdlineFlag - Whether to redact secrets from cmdline (default: true)
 * @returns Sanitized snake_case dict for JSON response
 */
export function sanitizeProcessSnapshot(
  snapshot: ProcessSnapshot,
  redactPaths = true,
  redactCmdlineFlag = true
): Record<string, unknown> {
  const result = processSnapshotToDict(snapshot);

  if (redactPaths) {
    // Redact username from paths
    if (result.cwd && typeof result.cwd === "string") {
      result.cwd = redactUserFromPath(result.cwd);
    }
    if (result.repo_path && typeof result.repo_path === "string") {
      result.repo_path = redactUserFromPath(result.repo_path);
    }
    if (result.exe && typeof result.exe === "string") {
      result.exe = redactUserFromPath(result.exe);
    }
  }

  if (
    redactCmdlineFlag &&
    result.cmdline &&
    typeof result.cmdline === "string"
  ) {
    result.cmdline = sanitizeCmdline(result.cmdline);
  }

  return result;
}

/**
 * Sanitize a process lifecycle event by redacting sensitive paths and cmdlines.
 *
 * @param event - Process lifecycle event to sanitize
 * @param redactPaths - Whether to redact usernames from paths (default: true)
 * @param redactCmdlineArg - Whether to redact secrets from cmdline (default: true)
 * @returns Sanitized snake_case dict for JSON response
 */
export function sanitizeProcessEvent(
  event: ProcessLifecycleEvent,
  redactPaths = true,
  redactCmdlineArg = true
): Record<string, unknown> {
  const result = processEventToDict(event);

  if (redactPaths) {
    if (result.cwd && typeof result.cwd === "string") {
      result.cwd = redactUserFromPath(result.cwd);
    }
    if (result.repo_path && typeof result.repo_path === "string") {
      result.repo_path = redactUserFromPath(result.repo_path);
    }
  }

  if (
    redactCmdlineArg &&
    result.cmdline &&
    typeof result.cmdline === "string"
  ) {
    result.cmdline = sanitizeCmdline(result.cmdline);
  }

  return result;
}
