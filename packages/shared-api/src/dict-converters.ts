/**
 * Dict converters for API responses.
 *
 * These functions convert internal TypeScript objects (camelCase) to API-ready
 * dictionaries (snake_case) suitable for JSON serialization. Each converter
 * performs a semantic transformation, not just case conversion:
 *
 * - Computed fields are added (e.g., `dirty`, `active`, `success_rate`)
 * - Optional fields are normalized to null when missing
 * - Nested objects are flattened where appropriate
 *
 * @example
 * ```typescript
 * import { repoToDict, agentToDict } from "@agentwatch/shared-api";
 *
 * // In an API handler
 * app.get("/api/repos", (c) => {
 *   const repos = store.snapshotRepos();
 *   return c.json(repos.map(repoToDict));
 * });
 * ```
 *
 * @module
 */

import type {
  RepoStatus,
  AgentProcess,
  HookSession,
  ToolUsage,
  ToolStats,
  DailyStats,
  GitCommit,
  ListeningPort
} from "@agentwatch/core";

// Re-export types that consumers might need
export type {
  RepoStatus,
  AgentProcess,
  HookSession,
  ToolUsage,
  ToolStats,
  DailyStats,
  GitCommit,
  ListeningPort
};

/**
 * Point-in-time snapshot of a running AI agent process.
 *
 * Captured by the process scanner at regular intervals and stored in
 * `~/.agentwatch/processes/snapshots_YYYY-MM-DD.jsonl`.
 */
export interface ProcessSnapshot {
  /** Unix timestamp (ms) when this snapshot was taken */
  timestamp: number;
  /** Process ID */
  pid: number;
  /** Human-readable label (e.g., "claude", "codex", "cursor") */
  label: string;
  /** Full command line */
  cmdline: string;
  /** Path to executable */
  exe: string;
  /** CPU usage percentage (0-100+) */
  cpuPct: number;
  /** Resident set size in KB (memory usage) */
  rssKb?: number;
  /** Number of threads */
  threads?: number;
  /** Current working directory */
  cwd?: string;
  /** Git repository path if running in a repo */
  repoPath?: string;
  /** Process state (Running, Sleeping, etc.) */
  state?: string;
  /** Whether process is sandboxed */
  sandboxed?: boolean;
  /** Type of sandbox if sandboxed (AppSandbox, etc.) */
  sandboxType?: string;
  /** Process start time (Unix timestamp ms) */
  startTime?: number;
}

/**
 * Lifecycle event for an AI agent process (start or end).
 *
 * Stored in `~/.agentwatch/processes/events_YYYY-MM-DD.jsonl`.
 */
export interface ProcessLifecycleEvent {
  /** Event type: "process_start" or "process_end" */
  type: "process_start" | "process_end";
  /** Unix timestamp (ms) when event occurred */
  timestamp: number;
  /** Process ID */
  pid: number;
  /** Human-readable label */
  label: string;
  /** Full command line */
  cmdline: string;
  /** Current working directory */
  cwd?: string;
  /** Git repository path */
  repoPath?: string;
  /** Duration in ms (only for process_end events) */
  durationMs?: number;
}

/**
 * Convert a RepoStatus to API dict format.
 *
 * Adds computed field `dirty` (true if any staged/unstaged/untracked changes).
 * Flattens `specialState` and `upstream` objects into top-level fields.
 *
 * @param repo - Repository status from the data store
 * @returns Snake_case dict for JSON response
 *
 * @example
 * ```typescript
 * const repos = store.snapshotRepos();
 * return c.json(repos.map(repoToDict));
 * ```
 */
export function repoToDict(repo: RepoStatus): Record<string, unknown> {
  return {
    repo_id: repo.repoId,
    path: repo.path,
    name: repo.name,
    branch: repo.branch,
    dirty:
      repo.stagedCount > 0 || repo.unstagedCount > 0 || repo.untrackedCount > 0,
    staged: repo.stagedCount,
    unstaged: repo.unstagedCount,
    untracked: repo.untrackedCount,
    conflict: repo.specialState.conflict,
    rebase: repo.specialState.rebase,
    merge: repo.specialState.merge,
    cherry_pick: repo.specialState.cherryPick,
    revert: repo.specialState.revert,
    ahead: repo.upstream?.ahead ?? 0,
    behind: repo.upstream?.behind ?? 0,
    upstream_name: repo.upstream?.upstreamName,
    last_error: repo.health.lastError,
    timed_out: repo.health.timedOut,
    last_scan_time: repo.lastScanTime,
    last_change_time: repo.lastChangeTime
  };
}

/**
 * Convert an AgentProcess to API dict format.
 *
 * Converts nested `heuristicState` and `wrapperState` objects to snake_case.
 * Missing optional nested objects are returned as null (not undefined).
 *
 * @param agent - Agent process from the data store
 * @returns Snake_case dict for JSON response
 *
 * @example
 * ```typescript
 * const agents = store.snapshotAgents();
 * return c.json(agents.map(agentToDict));
 * ```
 */
export function agentToDict(agent: AgentProcess): Record<string, unknown> {
  const result: Record<string, unknown> = {
    pid: agent.pid,
    label: agent.label,
    cmdline: agent.cmdline,
    exe: agent.exe,
    cpu_pct: agent.cpuPct,
    rss_kb: agent.rssKb,
    threads: agent.threads,
    tty: agent.tty,
    cwd: agent.cwd,
    repo_path: agent.repoPath,
    start_time: agent.startTime,
    heuristic_state: null,
    wrapper_state: null
  };

  if (agent.heuristicState) {
    result.heuristic_state = {
      state: agent.heuristicState.state,
      cpu_pct_recent: agent.heuristicState.cpuPctRecent,
      quiet_seconds: agent.heuristicState.quietSeconds
    };
  }

  if (agent.wrapperState) {
    result.wrapper_state = {
      state: agent.wrapperState.state,
      last_output_time: agent.wrapperState.lastOutputTime,
      awaiting_user: agent.wrapperState.awaitingUser,
      cmdline: agent.wrapperState.cmdline,
      cwd: agent.wrapperState.cwd,
      label: agent.wrapperState.label,
      start_time: agent.wrapperState.startTime
    };
  }

  return result;
}

/**
 * Convert a HookSession to API dict format.
 *
 * Adds computed fields:
 * - `active`: true if endTime is undefined
 * - `commit_count`: length of commits array
 *
 * @param session - Hook session from the hook store
 * @returns Snake_case dict for JSON response
 *
 * @example
 * ```typescript
 * const sessions = hookStore.getActiveSessions();
 * return c.json(sessions.map(hookSessionToDict));
 * ```
 */
export function hookSessionToDict(
  session: HookSession
): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    transcript_path: session.transcriptPath,
    cwd: session.cwd,
    start_time: session.startTime,
    end_time: session.endTime,
    permission_mode: session.permissionMode,
    source: session.source,
    tool_count: session.toolCount,
    last_activity: session.lastActivity,
    awaiting_user: session.awaitingUser,
    tools_used: session.toolsUsed,
    active: session.endTime === undefined,
    commits: session.commits,
    commit_count: session.commits.length,
    // Token/cost tracking
    total_input_tokens: session.totalInputTokens,
    total_output_tokens: session.totalOutputTokens,
    estimated_cost_usd: session.estimatedCostUsd,
    auto_continue_attempts: session.autoContinueAttempts,
    pid: session.pid
  };
}

/**
 * Convert a ToolUsage to API dict format.
 *
 * Normalizes optional fields to null when missing.
 *
 * @param usage - Tool usage record from the hook store
 * @returns Snake_case dict for JSON response
 */
export function toolUsageToDict(usage: ToolUsage): Record<string, unknown> {
  return {
    tool_use_id: usage.toolUseId,
    tool_name: usage.toolName,
    tool_input: usage.toolInput,
    timestamp: usage.timestamp,
    session_id: usage.sessionId,
    cwd: usage.cwd,
    success: usage.success ?? null,
    duration_ms: usage.durationMs ?? null,
    tool_response: usage.toolResponse ?? null,
    error: usage.error ?? null
  };
}

/**
 * Convert ToolStats to API dict format.
 *
 * Adds computed field `success_rate` (0-100 percentage).
 *
 * @param stats - Aggregated tool statistics from the hook store
 * @returns Snake_case dict for JSON response
 */
export function toolStatsToDict(stats: ToolStats): Record<string, unknown> {
  return {
    tool_name: stats.toolName,
    total_calls: stats.totalCalls,
    success_count: stats.successCount,
    failure_count: stats.failureCount,
    avg_duration_ms: stats.avgDurationMs,
    last_used: stats.lastUsed,
    success_rate:
      stats.totalCalls > 0 ? (stats.successCount / stats.totalCalls) * 100 : 0
  };
}

/**
 * Convert DailyStats to API dict format.
 *
 * @param stats - Daily aggregated statistics
 * @returns Snake_case dict for JSON response
 */
export function dailyStatsToDict(stats: DailyStats): Record<string, unknown> {
  return {
    date: stats.date,
    session_count: stats.sessionCount,
    tool_calls: stats.toolCalls,
    tools_breakdown: stats.toolsBreakdown,
    active_minutes: stats.activeMinutes
  };
}

/**
 * Convert a GitCommit to API dict format.
 *
 * @param commit - Git commit record from the hook store
 * @returns Snake_case dict for JSON response
 */
export function gitCommitToDict(commit: GitCommit): Record<string, unknown> {
  return {
    commit_hash: commit.commitHash,
    session_id: commit.sessionId,
    timestamp: commit.timestamp,
    message: commit.message,
    repo_path: commit.repoPath
  };
}

/**
 * Convert a ProcessSnapshot to API dict format.
 *
 * @param snapshot - Process snapshot from the monitor
 * @returns Snake_case dict for JSON response
 */
export function processSnapshotToDict(
  snapshot: ProcessSnapshot
): Record<string, unknown> {
  return {
    timestamp: snapshot.timestamp,
    pid: snapshot.pid,
    label: snapshot.label,
    cmdline: snapshot.cmdline,
    exe: snapshot.exe,
    cpu_pct: snapshot.cpuPct,
    rss_kb: snapshot.rssKb,
    threads: snapshot.threads,
    cwd: snapshot.cwd,
    repo_path: snapshot.repoPath,
    state: snapshot.state,
    sandboxed: snapshot.sandboxed,
    sandbox_type: snapshot.sandboxType,
    start_time: snapshot.startTime
  };
}

/**
 * Convert a ProcessLifecycleEvent to API dict format.
 *
 * @param event - Process lifecycle event (start or end)
 * @returns Snake_case dict for JSON response
 */
export function processEventToDict(
  event: ProcessLifecycleEvent
): Record<string, unknown> {
  return {
    type: event.type,
    timestamp: event.timestamp,
    pid: event.pid,
    label: event.label,
    cmdline: event.cmdline,
    cwd: event.cwd,
    repo_path: event.repoPath,
    duration_ms: event.durationMs
  };
}

/**
 * Convert a ListeningPort to API dict format.
 *
 * @param port - Listening port from the port scanner
 * @returns Snake_case dict for JSON response
 */
export function portToDict(port: ListeningPort): Record<string, unknown> {
  return {
    port: port.port,
    pid: port.pid,
    process_name: port.processName,
    cmdline: port.cmdline,
    bind_address: port.bindAddress,
    protocol: port.protocol,
    agent_pid: port.agentPid,
    agent_label: port.agentLabel,
    first_seen: port.firstSeen,
    cwd: port.cwd
  };
}
