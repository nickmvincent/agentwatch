/**
 * Dict converters for API responses.
 * Converts TypeScript camelCase types to snake_case JSON format.
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
 * Process snapshot type (from monitor package, redefined here to avoid circular deps)
 */
export interface ProcessSnapshot {
  timestamp: number;
  pid: number;
  label: string;
  cmdline: string;
  exe: string;
  cpuPct: number;
  rssKb?: number;
  threads?: number;
  cwd?: string;
  repoPath?: string;
  state?: string;
  sandboxed?: boolean;
  sandboxType?: string;
  startTime?: number;
}

/**
 * Process lifecycle event type
 */
export interface ProcessLifecycleEvent {
  type: "process_start" | "process_end";
  timestamp: number;
  pid: number;
  label: string;
  cmdline: string;
  cwd?: string;
  repoPath?: string;
  durationMs?: number;
}

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

export function dailyStatsToDict(stats: DailyStats): Record<string, unknown> {
  return {
    date: stats.date,
    session_count: stats.sessionCount,
    tool_calls: stats.toolCalls,
    tools_breakdown: stats.toolsBreakdown,
    active_minutes: stats.activeMinutes
  };
}

export function gitCommitToDict(commit: GitCommit): Record<string, unknown> {
  return {
    commit_hash: commit.commitHash,
    session_id: commit.sessionId,
    timestamp: commit.timestamp,
    message: commit.message,
    repo_path: commit.repoPath
  };
}

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
