/**
 * Claude Code hook integration types
 * Ported from agentwatch/models.py
 */

/** Hook event types from Claude Code */
export type HookEventType =
  | "SessionStart"
  | "SessionEnd"
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "PermissionRequest"
  | "UserPromptSubmit"
  | "Stop"
  | "SubagentStop"
  | "PreCompact";

/** Record of a single tool invocation from Claude Code */
export interface ToolUsage {
  /** Unique tool use ID */
  toolUseId: string;
  /** Tool name (Bash, Read, Edit, etc.) */
  toolName: string;
  /** Input parameters to the tool */
  toolInput: Record<string, unknown>;
  /** Unix timestamp of invocation */
  timestamp: number;
  /** Session ID this tool belongs to */
  sessionId: string;
  /** Working directory when tool was called */
  cwd: string;
  /** Whether tool succeeded (null if pending) */
  success?: boolean;
  /** Duration in milliseconds (null if pending) */
  durationMs?: number;
  /** Tool response/output */
  toolResponse?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

/** A git commit attributed to a Claude session */
export interface GitCommit {
  /** Commit SHA */
  commitHash: string;
  /** Session ID that created this commit */
  sessionId: string;
  /** Unix timestamp */
  timestamp: number;
  /** Commit message */
  message: string;
  /** Repository path */
  repoPath: string;
}

/** A Claude Code session tracked via hooks */
export interface HookSession {
  /** Unique session ID */
  sessionId: string;
  /** Path to transcript file */
  transcriptPath: string;
  /** Working directory */
  cwd: string;
  /** Unix timestamp when session started */
  startTime: number;
  /** Permission mode (default, plan, etc.) */
  permissionMode: string;
  /** How session was started (startup, resume, clear, compact) */
  source: SessionSource;
  /** Unix timestamp when session ended (null if active) */
  endTime?: number;
  /** Total tool calls in this session */
  toolCount: number;
  /** Unix timestamp of last activity */
  lastActivity: number;
  /** Whether waiting for user input */
  awaitingUser: boolean;
  /** Tool name -> call count */
  toolsUsed: Record<string, number>;
  /** List of commit hashes made during session */
  commits: string[];
  /** Process ID (if known/matched) */
  pid?: number;
  // Token/cost tracking (from Stop hooks)
  /** Total input tokens used in session */
  totalInputTokens: number;
  /** Total output tokens used in session */
  totalOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Number of auto-continue attempts */
  autoContinueAttempts: number;
}

/** How a session was started */
export type SessionSource = "startup" | "resume" | "clear" | "compact";

/** Aggregated statistics for a tool across all sessions */
export interface ToolStats {
  /** Tool name */
  toolName: string;
  /** Total number of calls */
  totalCalls: number;
  /** Number of successful calls */
  successCount: number;
  /** Number of failed calls */
  failureCount: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Unix timestamp of last use */
  lastUsed: number;
}

/** Statistics for a single day */
export interface DailyStats {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Number of sessions */
  sessionCount: number;
  /** Total tool calls */
  toolCalls: number;
  /** Tool name -> call count */
  toolsBreakdown: Record<string, number>;
  /** Minutes of active coding */
  activeMinutes: number;
}

/** Hook event payloads */
export interface SessionStartEvent {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  permissionMode: string;
  source: SessionSource;
}

export interface SessionEndEvent {
  sessionId: string;
}

export interface PreToolUseEvent {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd: string;
}

export interface PostToolUseEvent {
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  cwd: string;
  success: boolean;
  durationMs: number;
  toolResponse?: Record<string, unknown>;
  error?: string;
}

/** Calculate success rate for a tool */
export function getToolSuccessRate(stats: ToolStats): number {
  if (stats.totalCalls === 0) return 0;
  return stats.successCount / stats.totalCalls;
}

/** Check if session is active */
export function isSessionActive(session: HookSession): boolean {
  return session.endTime === undefined;
}
