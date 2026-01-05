/**
 * Storage for Claude Code hook events.
 * Ported from agentwatch/hook_store.py
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
  DailyStats,
  GitCommit,
  HookSession,
  SessionSource,
  ToolStats,
  ToolUsage
} from "@agentwatch/core";

export type SessionChangeCallback = (session: HookSession) => void;
export type ToolUsageCallback = (usage: ToolUsage) => void;

/**
 * Thread-safe storage for hook events with persistence.
 */
export class HookStore {
  private dataDir: string;

  // In-memory state
  private sessions: Map<string, HookSession> = new Map();
  private toolUsages: Map<string, ToolUsage> = new Map();
  private toolStats: Map<string, ToolStats> = new Map();
  private dailyStats: Map<string, DailyStats> = new Map();
  private gitCommits: Map<string, GitCommit> = new Map();

  // Callbacks
  private onSessionChange?: SessionChangeCallback;
  private onToolUsage?: ToolUsageCallback;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? join(homedir(), ".agentwatch", "hooks");
    mkdirSync(this.dataDir, { recursive: true });
    this.loadStats();
  }

  /**
   * Set callbacks for state change notifications.
   */
  setCallbacks(callbacks: {
    onSessionChange?: SessionChangeCallback;
    onToolUsage?: ToolUsageCallback;
  }): void {
    this.onSessionChange = callbacks.onSessionChange;
    this.onToolUsage = callbacks.onToolUsage;
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /**
   * Record a new session start.
   */
  sessionStart(
    sessionId: string,
    transcriptPath: string,
    cwd: string,
    permissionMode = "default",
    source: SessionSource = "startup"
  ): HookSession {
    const now = Date.now();
    const session: HookSession = {
      sessionId,
      transcriptPath,
      cwd,
      startTime: now,
      permissionMode,
      source,
      toolCount: 0,
      lastActivity: now,
      awaitingUser: false,
      toolsUsed: {},
      commits: [],
      // Token/cost tracking
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostUsd: 0,
      autoContinueAttempts: 0
    };

    this.sessions.set(sessionId, session);
    this.updateDailyStatsSession(now);
    this.persistSession(session);

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * Record session end.
   */
  sessionEnd(sessionId: string): HookSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.endTime = Date.now();
    this.persistSession(session);

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * Update session awaiting_user status.
   */
  updateSessionAwaiting(sessionId: string, awaiting: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.awaitingUser = awaiting;
    session.lastActivity = Date.now();

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }
  }

  /**
   * Update session token counts from Stop hook.
   * @returns Updated session or null if not found
   */
  updateSessionTokens(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    estimatedCostUsd: number
  ): HookSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.estimatedCostUsd += estimatedCostUsd;
    session.lastActivity = Date.now();
    this.persistSession(session);

    if (this.onSessionChange) {
      try {
        this.onSessionChange(session);
      } catch {
        // Callback error
      }
    }

    return session;
  }

  /**
   * Increment auto-continue attempt count for a session.
   * @returns Updated count
   */
  incrementAutoContinueAttempts(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;

    session.autoContinueAttempts += 1;
    return session.autoContinueAttempts;
  }

  /**
   * Reset auto-continue attempts for a session.
   */
  resetAutoContinueAttempts(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.autoContinueAttempts = 0;
    }
  }

  // ==========================================================================
  // Tool Usage Tracking
  // ==========================================================================

  /**
   * Record a PreToolUse event.
   */
  recordPreToolUse(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    cwd: string
  ): ToolUsage {
    const now = Date.now();
    const usage: ToolUsage = {
      toolUseId,
      toolName,
      toolInput,
      timestamp: now,
      sessionId,
      cwd
    };

    this.toolUsages.set(toolUseId, usage);

    // Update session
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = now;
      session.awaitingUser = false;
    }

    return usage;
  }

  /**
   * Record a PostToolUse event, completing the tool usage record.
   */
  recordPostToolUse(
    toolUseId: string,
    toolResponse?: Record<string, unknown>,
    error?: string
  ): ToolUsage | null {
    const now = Date.now();
    const usage = this.toolUsages.get(toolUseId);
    if (!usage) return null;

    // Update usage record
    usage.toolResponse = toolResponse;
    usage.error = error;
    usage.success = error === undefined;
    usage.durationMs = now - usage.timestamp;

    // Update tool stats
    this.updateToolStats(usage);

    // Update daily stats
    this.updateDailyStatsTool(now, usage.toolName);

    // Update session
    const session = this.sessions.get(usage.sessionId);
    if (session) {
      session.toolCount++;
      session.lastActivity = now;
      session.toolsUsed[usage.toolName] =
        (session.toolsUsed[usage.toolName] ?? 0) + 1;
    }

    // Persist
    this.persistToolUsage(usage);
    this.persistStats();

    if (this.onToolUsage) {
      try {
        this.onToolUsage(usage);
      } catch {
        // Callback error
      }
    }

    return usage;
  }

  /**
   * Record a security gate block.
   */
  recordSecurityBlock(
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    ruleName?: string,
    reason?: string
  ): void {
    const now = Date.now();
    const usage: ToolUsage = {
      toolUseId: `blocked-${now}-${toolName}`,
      toolName,
      toolInput,
      timestamp: now,
      sessionId,
      cwd: "",
      success: false,
      error: `SECURITY_BLOCKED: ${reason} (rule: ${ruleName})`
    };

    this.toolUsages.set(usage.toolUseId, usage);

    // Update session
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = now;
    }

    this.persistToolUsage(usage);

    if (this.onToolUsage) {
      try {
        this.onToolUsage(usage);
      } catch {
        // Callback error
      }
    }
  }

  private updateToolStats(usage: ToolUsage): void {
    let stats = this.toolStats.get(usage.toolName);
    if (!stats) {
      stats = {
        toolName: usage.toolName,
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        avgDurationMs: 0,
        lastUsed: 0
      };
      this.toolStats.set(usage.toolName, stats);
    }

    stats.totalCalls++;
    stats.lastUsed = usage.timestamp;

    if (usage.success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
    }

    if (usage.durationMs !== undefined) {
      // Running average
      const oldAvg = stats.avgDurationMs;
      const n = stats.totalCalls;
      stats.avgDurationMs = oldAvg + (usage.durationMs - oldAvg) / n;
    }
  }

  private updateDailyStatsSession(timestamp: number): void {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    let stats = this.dailyStats.get(date);
    if (!stats) {
      stats = {
        date,
        sessionCount: 0,
        toolCalls: 0,
        toolsBreakdown: {},
        activeMinutes: 0
      };
      this.dailyStats.set(date, stats);
    }
    stats.sessionCount++;
  }

  private updateDailyStatsTool(timestamp: number, toolName: string): void {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    let stats = this.dailyStats.get(date);
    if (!stats) {
      stats = {
        date,
        sessionCount: 0,
        toolCalls: 0,
        toolsBreakdown: {},
        activeMinutes: 0
      };
      this.dailyStats.set(date, stats);
    }
    stats.toolCalls++;
    stats.toolsBreakdown[toolName] = (stats.toolsBreakdown[toolName] ?? 0) + 1;
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Get all active sessions.
   */
  getActiveSessions(): HookSession[] {
    return [...this.sessions.values()].filter((s) => s.endTime === undefined);
  }

  /**
   * Get a specific session.
   */
  getSession(sessionId: string): HookSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get recent sessions.
   */
  getAllSessions(limit = 100): HookSession[] {
    const sessions = [...this.sessions.values()];
    sessions.sort((a, b) => b.startTime - a.startTime);
    return sessions.slice(0, limit);
  }

  /**
   * Get tool statistics.
   */
  getToolStats(): ToolStats[] {
    const stats = [...this.toolStats.values()];
    stats.sort((a, b) => b.totalCalls - a.totalCalls);
    return stats;
  }

  /**
   * Get daily statistics.
   */
  getDailyStats(days = 30): DailyStats[] {
    const stats = [...this.dailyStats.values()];
    stats.sort((a, b) => b.date.localeCompare(a.date));
    return stats.slice(0, days);
  }

  /**
   * Get recent tool usages.
   */
  getRecentToolUsages(limit = 100, toolName?: string): ToolUsage[] {
    let usages = [...this.toolUsages.values()];
    if (toolName) {
      usages = usages.filter((u) => u.toolName === toolName);
    }
    usages.sort((a, b) => b.timestamp - a.timestamp);
    return usages.slice(0, limit);
  }

  /**
   * Get tool usages for a session (timeline).
   */
  getSessionToolUsages(sessionId: string): ToolUsage[] {
    const usages = [...this.toolUsages.values()].filter(
      (u) => u.sessionId === sessionId
    );
    usages.sort((a, b) => a.timestamp - b.timestamp);
    return usages;
  }

  // ==========================================================================
  // Git Session Attribution
  // ==========================================================================

  /**
   * Record a git commit attributed to a session.
   */
  recordCommit(
    sessionId: string,
    commitHash: string,
    message = "",
    repoPath = ""
  ): GitCommit {
    const commit: GitCommit = {
      commitHash,
      sessionId,
      timestamp: Date.now(),
      message,
      repoPath
    };

    this.gitCommits.set(commitHash, commit);

    // Add to session's commits list
    const session = this.sessions.get(sessionId);
    if (session && !session.commits.includes(commitHash)) {
      session.commits.push(commitHash);
    }

    this.persistCommit(commit);
    return commit;
  }

  /**
   * Get commits for a session.
   */
  getSessionCommits(sessionId: string): GitCommit[] {
    const commits = [...this.gitCommits.values()].filter(
      (c) => c.sessionId === sessionId
    );
    commits.sort((a, b) => a.timestamp - b.timestamp);
    return commits;
  }

  /**
   * Get all recent commits.
   */
  getAllCommits(limit = 100): GitCommit[] {
    const commits = [...this.gitCommits.values()];
    commits.sort((a, b) => b.timestamp - a.timestamp);
    return commits.slice(0, limit);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /** Get current date string for daily file naming */
  private getCurrentDateStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private persistSession(session: HookSession): void {
    try {
      const date = this.getCurrentDateStr();
      const file = join(this.dataDir, `sessions_${date}.jsonl`);
      appendFileSync(file, JSON.stringify(session) + "\n");
    } catch {
      // Ignore persistence errors
    }
  }

  private persistToolUsage(usage: ToolUsage): void {
    try {
      const date = this.getCurrentDateStr();
      const file = join(this.dataDir, `tool_usages_${date}.jsonl`);
      appendFileSync(file, JSON.stringify(usage) + "\n");
    } catch {
      // Ignore persistence errors
    }
  }

  private persistCommit(commit: GitCommit): void {
    try {
      const date = this.getCurrentDateStr();
      const file = join(this.dataDir, `commits_${date}.jsonl`);
      appendFileSync(file, JSON.stringify(commit) + "\n");
    } catch {
      // Ignore persistence errors
    }
  }

  private persistStats(): void {
    try {
      const file = join(this.dataDir, "stats.json");
      const data = {
        tool_stats: Object.fromEntries(this.toolStats),
        daily_stats: Object.fromEntries(this.dailyStats)
      };
      writeFileSync(file, JSON.stringify(data, null, 2));
    } catch {
      // Ignore persistence errors
    }
  }

  private loadStats(): void {
    try {
      const statsFile = join(this.dataDir, "stats.json");
      if (existsSync(statsFile)) {
        const data = JSON.parse(readFileSync(statsFile, "utf-8"));

        for (const [name, stats] of Object.entries(data.tool_stats ?? {})) {
          const s = stats as Record<string, unknown>;
          // Handle both snake_case (legacy) and camelCase formats
          this.toolStats.set(name, {
            toolName: (s.toolName ?? s.tool_name ?? name) as string,
            totalCalls: (s.totalCalls ?? s.total_calls ?? 0) as number,
            successCount: (s.successCount ?? s.success_count ?? 0) as number,
            failureCount: (s.failureCount ?? s.failure_count ?? 0) as number,
            avgDurationMs: (s.avgDurationMs ??
              s.avg_duration_ms ??
              0) as number,
            lastUsed: (s.lastUsed ?? s.last_used ?? 0) as number
          });
        }

        for (const [date, stats] of Object.entries(data.daily_stats ?? {})) {
          const s = stats as Record<string, unknown>;
          // Handle both snake_case (legacy) and camelCase formats
          this.dailyStats.set(date, {
            date: (s.date ?? date) as string,
            sessionCount: (s.sessionCount ?? s.session_count ?? 0) as number,
            toolCalls: (s.toolCalls ?? s.tool_calls ?? 0) as number,
            toolsBreakdown: (s.toolsBreakdown ??
              s.tools_breakdown ??
              {}) as Record<string, number>,
            activeMinutes: (s.activeMinutes ?? s.active_minutes ?? 0) as number
          });
        }
      }
    } catch {
      // Ignore load errors
    }

    // Load recent sessions from both legacy single file and daily files
    const cutoff = Date.now() - 86400000; // 24 hours
    this.loadSessionsFromFiles(cutoff);
    this.loadToolUsagesFromFiles(cutoff);
  }

  /** Load sessions from both legacy and daily files */
  private loadSessionsFromFiles(cutoff: number): void {
    try {
      // Load from legacy single file (backwards compat)
      const legacyFile = join(this.dataDir, "sessions.jsonl");
      if (existsSync(legacyFile)) {
        this.loadSessionsFromFile(legacyFile, cutoff);
      }

      // Load from daily files (sessions_YYYY-MM-DD.jsonl)
      for (const name of readdirSync(this.dataDir)) {
        if (name.startsWith("sessions_") && name.endsWith(".jsonl")) {
          const filepath = join(this.dataDir, name);
          this.loadSessionsFromFile(filepath, cutoff);
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  private loadSessionsFromFile(filepath: string, cutoff: number): void {
    try {
      const content = readFileSync(filepath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const session = JSON.parse(line) as HookSession;
          if (session.startTime > cutoff) {
            this.sessions.set(session.sessionId, session);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  /** Load tool usages from both legacy and daily files */
  private loadToolUsagesFromFiles(cutoff: number): void {
    try {
      // Load from legacy single file (backwards compat)
      const legacyFile = join(this.dataDir, "tool_usages.jsonl");
      if (existsSync(legacyFile)) {
        this.loadToolUsagesFromFile(legacyFile, cutoff);
      }

      // Load from daily files (tool_usages_YYYY-MM-DD.jsonl)
      for (const name of readdirSync(this.dataDir)) {
        if (name.startsWith("tool_usages_") && name.endsWith(".jsonl")) {
          const filepath = join(this.dataDir, name);
          this.loadToolUsagesFromFile(filepath, cutoff);
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  private loadToolUsagesFromFile(filepath: string, cutoff: number): void {
    try {
      const content = readFileSync(filepath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const usage = JSON.parse(line) as ToolUsage;
          if (usage.timestamp > cutoff) {
            this.toolUsages.set(usage.toolUseId, usage);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore load errors
    }
  }

  /**
   * Clean up old data to prevent memory leaks.
   *
   * This method should be called periodically (e.g., hourly) to:
   * - Remove sessions older than maxDays
   * - Remove tool usages older than maxDays
   * - Remove git commits older than maxDays
   * - Remove daily stats older than maxDays
   * - Enforce size limits on large collections
   *
   * @param maxDays Maximum age of data to keep (default: 30)
   * @param maxToolUsages Maximum number of tool usages to keep (default: 10000)
   */
  cleanupOldData(maxDays = 30, maxToolUsages = 10000): void {
    const cutoff = Date.now() - maxDays * 86400000;
    const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);

    // Clean old sessions
    for (const [sid, session] of this.sessions) {
      if (session.startTime < cutoff) {
        this.sessions.delete(sid);
      }
    }

    // Clean old daily stats
    for (const date of this.dailyStats.keys()) {
      if (date < cutoffDate) {
        this.dailyStats.delete(date);
      }
    }

    // Clean old tool usages (time-based)
    for (const [uid, usage] of this.toolUsages) {
      if (usage.timestamp < cutoff) {
        this.toolUsages.delete(uid);
      }
    }

    // Enforce size limit on tool usages (keep most recent)
    if (this.toolUsages.size > maxToolUsages) {
      const usages = [...this.toolUsages.entries()];
      usages.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const toKeep = new Set(usages.slice(0, maxToolUsages).map(([id]) => id));
      for (const uid of this.toolUsages.keys()) {
        if (!toKeep.has(uid)) {
          this.toolUsages.delete(uid);
        }
      }
    }

    // Clean old git commits
    for (const [hash, commit] of this.gitCommits) {
      if (commit.timestamp < cutoff) {
        this.gitCommits.delete(hash);
      }
    }

    this.persistStats();
  }

  /**
   * Rotate old log files on disk.
   *
   * This method should be called periodically (e.g., daily) to:
   * - Delete log files older than maxAgeDays
   * - Enforce a maximum number of log files
   *
   * Patterns matched: sessions_*.jsonl, tool_usages_*.jsonl, commits_*.jsonl
   * Legacy files (sessions.jsonl, tool_usages.jsonl, commits.jsonl) are also cleaned.
   *
   * @param maxAgeDays Maximum age of files to keep (default: 30)
   * @param maxFiles Maximum number of files per type to keep (default: 100)
   * @returns Number of files deleted
   */
  rotateLogs(maxAgeDays = 30, maxFiles = 100): number {
    let deleted = 0;
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    // File prefixes to rotate (excluding legacy single files)
    const prefixes = ["sessions_", "tool_usages_", "commits_"];

    try {
      // Collect all JSONL files
      const files: { path: string; mtime: number; prefix: string }[] = [];

      for (const name of readdirSync(this.dataDir)) {
        if (!name.endsWith(".jsonl")) continue;

        const matchedPrefix = prefixes.find((p) => name.startsWith(p));
        if (!matchedPrefix) {
          // Legacy single file - delete if old
          if (
            name === "sessions.jsonl" ||
            name === "tool_usages.jsonl" ||
            name === "commits.jsonl"
          ) {
            const filepath = join(this.dataDir, name);
            const stats = statSync(filepath);
            if (now - stats.mtimeMs > maxAgeMs) {
              try {
                unlinkSync(filepath);
                deleted++;
              } catch {
                // Ignore deletion errors
              }
            }
          }
          continue;
        }

        const filepath = join(this.dataDir, name);
        const stats = statSync(filepath);
        files.push({
          path: filepath,
          mtime: stats.mtimeMs,
          prefix: matchedPrefix
        });
      }

      // Delete files older than maxAgeDays
      for (const { path, mtime } of files) {
        if (now - mtime > maxAgeMs) {
          try {
            unlinkSync(path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      // Enforce maxFiles limit per prefix
      for (const prefix of prefixes) {
        const prefixFiles = files
          .filter(({ path, prefix: p }) => p === prefix && existsSync(path))
          .sort((a, b) => b.mtime - a.mtime);

        while (prefixFiles.length > maxFiles) {
          const oldest = prefixFiles.pop();
          if (oldest) {
            try {
              unlinkSync(oldest.path);
              deleted++;
            } catch {
              // Ignore deletion errors
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return deleted;
  }

  /**
   * Associate a session with a process PID.
   */
  setSessionPid(sessionId: string, pid: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pid = pid;
    }
  }

  /**
   * Clean up dead sessions based on live process information.
   *
   * This should be called periodically (e.g., when agent list updates) to
   * automatically end sessions whose processes have died.
   *
   * @param liveAgents Map of live agent PIDs to their cwds
   * @param staleThresholdMs How long a session can be inactive before considering it dead (default: 5 minutes)
   * @returns List of session IDs that were ended
   */
  cleanupDeadSessions(
    liveAgents: Map<number, { cwd: string | undefined; label: string }>,
    staleThresholdMs: number = 5 * 60 * 1000
  ): string[] {
    const now = Date.now();
    const endedSessions: string[] = [];

    // Build a set of live cwds for claude agents
    const liveCwds = new Set<string>();
    for (const [_pid, agent] of liveAgents) {
      if (agent.label === "claude" && agent.cwd) {
        liveCwds.add(agent.cwd);
      }
    }

    for (const [sessionId, session] of this.sessions) {
      // Skip already-ended sessions
      if (session.endTime !== undefined) continue;

      // If session has a PID, check if that PID is still alive
      if (session.pid !== undefined) {
        if (!liveAgents.has(session.pid)) {
          // Process is dead - end the session
          session.endTime = now;
          this.persistSession(session);
          endedSessions.push(sessionId);

          if (this.onSessionChange) {
            try {
              this.onSessionChange(session);
            } catch {
              // Callback error
            }
          }
          continue;
        }
      }

      // For sessions without a PID, check staleness
      const inactiveMs = now - session.lastActivity;
      const isStale = inactiveMs > staleThresholdMs;
      const isVeryStale = inactiveMs > 60 * 60 * 1000; // 1 hour
      const hasMatchingProcess = liveCwds.has(session.cwd);

      // Clean up if:
      // 1. Very stale (> 1 hour) - always clean up regardless of matching process
      // 2. Stale (> 5 min) and no matching process in cwd
      if (isVeryStale || (isStale && !hasMatchingProcess)) {
        session.endTime = now;
        this.persistSession(session);
        endedSessions.push(sessionId);

        if (this.onSessionChange) {
          try {
            this.onSessionChange(session);
          } catch {
            // Callback error
          }
        }
      }
    }

    return endedSessions;
  }

  /**
   * Try to match active sessions to live agents by cwd.
   * Updates session PIDs when a match is found.
   *
   * @param liveAgents Map of live agent PIDs to their info
   */
  matchSessionsToAgents(
    liveAgents: Map<number, { cwd: string | undefined; label: string }>
  ): void {
    // Build cwd -> PID map for claude agents
    const cwdToPid = new Map<string, number>();
    for (const [pid, agent] of liveAgents) {
      if (agent.label === "claude" && agent.cwd) {
        cwdToPid.set(agent.cwd, pid);
      }
    }

    // Match sessions without PIDs
    for (const session of this.sessions.values()) {
      if (session.endTime !== undefined) continue;
      if (session.pid !== undefined) continue;

      const matchedPid = cwdToPid.get(session.cwd);
      if (matchedPid !== undefined) {
        session.pid = matchedPid;
      }
    }
  }
}
