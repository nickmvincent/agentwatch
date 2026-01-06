/**
 * Adapter to convert transcript data to enrichment-compatible formats.
 *
 * This allows running the enrichment pipeline on transcript files
 * without requiring Claude Code hooks.
 */

import type { HookSession, ToolUsage } from "@agentwatch/core";
import type { ParsedTranscript, TranscriptMessage } from "../local-logs";

/**
 * Minimal session interface for enrichment.
 * Contains only the fields actually used by enrichment functions.
 */
export interface MinimalSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  lastActivity: number;
  toolCount: number;
  commits: string[];
  // Fields needed for HookSession compatibility but may not be available
  cwd: string;
  transcriptPath: string;
  permissionMode: string;
  source: "startup" | "resume" | "clear" | "compact";
  awaitingUser: boolean;
  toolsUsed: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  autoContinueAttempts: number;
}

/**
 * Convert a parsed transcript to ToolUsage array.
 *
 * Extracts tool invocations from transcript messages and maps them
 * to the ToolUsage format expected by enrichment functions.
 */
export function convertTranscriptToToolUsages(
  transcriptId: string,
  messages: TranscriptMessage[]
): ToolUsage[] {
  const toolUsages: ToolUsage[] = [];

  for (const msg of messages) {
    // Skip non-tool messages
    if (!msg.toolName) {
      continue;
    }

    const timestamp = msg.timestamp
      ? new Date(msg.timestamp).getTime()
      : Date.now();

    // Determine success from tool result
    // Tool results typically contain error field or indicate success
    let success: boolean | undefined = undefined;
    let error: string | undefined = undefined;

    if (msg.toolResult !== undefined) {
      // Try to detect success/failure from result
      const result = msg.toolResult;
      if (typeof result === "object" && result !== null) {
        const resultObj = result as Record<string, unknown>;
        if ("error" in resultObj && resultObj.error) {
          success = false;
          error = String(resultObj.error);
        } else if ("success" in resultObj) {
          success = Boolean(resultObj.success);
        } else {
          // Assume success if we have a result without error
          success = true;
        }
      } else if (typeof result === "string") {
        // Check for common error patterns
        if (
          /error|failed|permission denied|not found|ENOENT|EPERM|EACCES/i.test(
            result
          )
        ) {
          success = false;
          error = result.slice(0, 200);
        } else {
          success = true;
        }
      }
    }

    const toolUsage: ToolUsage = {
      toolUseId: msg.uuid || `transcript-${toolUsages.length}`,
      toolName: msg.toolName,
      toolInput: msg.toolInput || {},
      timestamp,
      sessionId: transcriptId,
      cwd: extractCwdFromMessage(msg) || ".",
      success,
      error,
      toolResponse:
        typeof msg.toolResult === "object"
          ? (msg.toolResult as Record<string, unknown>)
          : undefined
    };

    toolUsages.push(toolUsage);
  }

  return toolUsages;
}

/**
 * Extract working directory from a message if present.
 */
function extractCwdFromMessage(msg: TranscriptMessage): string | null {
  const input = msg.toolInput;
  if (!input) return null;

  // Some tools have cwd in their input
  if ("cwd" in input && typeof input.cwd === "string") {
    return input.cwd;
  }

  // Try to extract from file paths
  if ("file_path" in input && typeof input.file_path === "string") {
    const parts = input.file_path.split("/");
    if (parts.length > 1) {
      return parts.slice(0, -1).join("/");
    }
  }

  return null;
}

/**
 * Create a minimal session object from a parsed transcript.
 *
 * This creates a HookSession-compatible object with the fields
 * actually used by enrichment functions.
 */
export function createSessionFromTranscript(
  transcript: ParsedTranscript
): MinimalSession {
  const messages = transcript.messages;

  // Extract timestamps
  let startTime: number | undefined;
  let endTime: number | undefined;
  let lastActivity: number | undefined;

  for (const msg of messages) {
    if (msg.timestamp) {
      const ts = new Date(msg.timestamp).getTime();
      if (!startTime || ts < startTime) startTime = ts;
      if (!endTime || ts > endTime) endTime = ts;
      lastActivity = ts;
    }
  }

  // Fall back to current time if no timestamps
  const now = Date.now();
  startTime = startTime || now;
  endTime = endTime || now;
  lastActivity = lastActivity || now;

  // Count tool usages by name
  const toolsUsed: Record<string, number> = {};
  let toolCount = 0;

  for (const msg of messages) {
    if (msg.toolName) {
      toolsUsed[msg.toolName] = (toolsUsed[msg.toolName] || 0) + 1;
      toolCount++;
    }
  }

  // Extract commits from git commit commands
  const commits: string[] = [];
  for (const msg of messages) {
    if (msg.toolName === "Bash" && msg.toolInput) {
      const command = (msg.toolInput as Record<string, unknown>).command;
      if (typeof command === "string" && command.includes("git commit")) {
        // Try to extract commit hash from result if available
        if (msg.toolResult && typeof msg.toolResult === "string") {
          const match = msg.toolResult.match(/\[[\w-]+\s+([a-f0-9]{7,40})\]/);
          if (match) {
            commits.push(match[1]!);
          }
        }
        // If no hash found but command succeeded, add placeholder
        if (commits.length === 0) {
          commits.push("commit-detected");
        }
      }
    }
  }

  return {
    sessionId: transcript.id,
    startTime,
    endTime,
    lastActivity,
    toolCount,
    commits,
    cwd: transcript.projectDir || ".",
    transcriptPath: transcript.path,
    permissionMode: "default",
    source: "startup",
    awaitingUser: false,
    toolsUsed,
    totalInputTokens: transcript.totalInputTokens,
    totalOutputTokens: transcript.totalOutputTokens,
    estimatedCostUsd: transcript.estimatedCostUsd,
    autoContinueAttempts: 0
  };
}

/**
 * Type guard to check if a minimal session can be used as HookSession.
 */
export function isCompatibleSession(
  session: MinimalSession
): session is HookSession {
  return (
    typeof session.sessionId === "string" &&
    typeof session.startTime === "number" &&
    typeof session.toolCount === "number" &&
    Array.isArray(session.commits)
  );
}
