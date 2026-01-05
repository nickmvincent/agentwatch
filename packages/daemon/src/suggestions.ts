/**
 * Smart suggestions based on session patterns and tool usage.
 */

import type { HookSession, ToolStats, ToolUsage } from "@agentwatch/core";

export interface Suggestion {
  category: "warning" | "tip" | "pattern" | "insight";
  title: string;
  message: string;
  toolName?: string;
  sessionId?: string;
  details: Record<string, unknown>;
}

export function analyzeSession(
  session: HookSession,
  toolUsages: ToolUsage[]
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Count failures per tool
  const failuresByTool = new Map<string, number>();
  const successesByTool = new Map<string, number>();
  const totalCalls = toolUsages.length;

  for (const usage of toolUsages) {
    const tool = usage.toolName;
    if (usage.success === false) {
      failuresByTool.set(tool, (failuresByTool.get(tool) ?? 0) + 1);
    } else if (usage.success === true) {
      successesByTool.set(tool, (successesByTool.get(tool) ?? 0) + 1);
    }
  }

  // High failure rate warnings
  for (const [tool, failures] of failuresByTool) {
    const successes = successesByTool.get(tool) ?? 0;
    const totalForTool = failures + successes;
    if (totalForTool >= 3 && failures / totalForTool > 0.5) {
      const pct = Math.floor((failures * 100) / totalForTool);
      suggestions.push({
        category: "warning",
        title: `High ${tool} failure rate`,
        message: `${failures} of ${totalForTool} ${tool} calls failed (${pct}%)`,
        toolName: tool,
        sessionId: session.sessionId,
        details: { failures, total: totalForTool }
      });
    }
  }

  // Bash-specific: many failures might indicate test setup issues
  const bashFailures = failuresByTool.get("Bash") ?? 0;
  if (bashFailures >= 5) {
    suggestions.push({
      category: "warning",
      title: "Multiple Bash failures",
      message: `Session had ${bashFailures} failed Bash commands - check environment or test setup`,
      toolName: "Bash",
      sessionId: session.sessionId,
      details: { failureCount: bashFailures }
    });
  }

  // Heavy Read usage might indicate context could be cached
  const readCalls = session.toolsUsed["Read"] ?? 0;
  if (readCalls >= 30) {
    suggestions.push({
      category: "tip",
      title: "Heavy file reading",
      message: `Read tool used ${readCalls} times - consider caching or using grep for targeted lookups`,
      toolName: "Read",
      sessionId: session.sessionId,
      details: { readCount: readCalls }
    });
  }

  // Many Edit calls in succession might indicate iterative fixes
  const editCalls = session.toolsUsed["Edit"] ?? 0;
  if (editCalls >= 15) {
    suggestions.push({
      category: "pattern",
      title: "Many edits",
      message: `${editCalls} Edit operations - session involved significant code changes`,
      toolName: "Edit",
      sessionId: session.sessionId,
      details: { editCount: editCalls }
    });
  }

  // Heavy grep usage
  const grepCalls = session.toolsUsed["Grep"] ?? 0;
  if (grepCalls >= 20) {
    suggestions.push({
      category: "pattern",
      title: "Heavy searching",
      message: `Grep used ${grepCalls} times - agent was exploring codebase extensively`,
      toolName: "Grep",
      sessionId: session.sessionId,
      details: { grepCount: grepCalls }
    });
  }

  // Long session with few tools might indicate stuck agent
  if (session.endTime && session.startTime) {
    const durationMinutes = (session.endTime - session.startTime) / 60;
    if (durationMinutes > 30 && totalCalls < 10) {
      suggestions.push({
        category: "insight",
        title: "Long session, few tools",
        message: `Session lasted ${Math.floor(durationMinutes)} minutes with only ${totalCalls} tool calls`,
        sessionId: session.sessionId,
        details: { durationMinutes, toolCalls: totalCalls }
      });
    }
  }

  // Session with commits
  if (session.commits.length > 0) {
    suggestions.push({
      category: "insight",
      title: "Productive session",
      message: `Session resulted in ${session.commits.length} commit(s)`,
      sessionId: session.sessionId,
      details: {
        commitCount: session.commits.length,
        commits: session.commits.slice(0, 5)
      }
    });
  }

  return suggestions;
}

export function analyzeToolStats(stats: ToolStats[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const stat of stats) {
    // Tool with consistently high failure rate
    if (stat.totalCalls >= 10 && stat.failureCount / stat.totalCalls > 0.3) {
      const successRate = Math.floor(
        (stat.successCount / stat.totalCalls) * 100
      );
      suggestions.push({
        category: "warning",
        title: `${stat.toolName} often fails`,
        message: `${stat.toolName} has only ${successRate}% success rate across ${stat.totalCalls} calls`,
        toolName: stat.toolName,
        details: {
          totalCalls: stat.totalCalls,
          successCount: stat.successCount,
          failureCount: stat.failureCount
        }
      });
    }

    // Tool with unusually slow average
    if (stat.toolName === "Bash" && stat.avgDurationMs > 30000) {
      suggestions.push({
        category: "insight",
        title: "Slow Bash commands",
        message: `Average Bash command takes ${(stat.avgDurationMs / 1000).toFixed(1)}s - long-running processes are common`,
        toolName: "Bash",
        details: { avgDurationMs: stat.avgDurationMs }
      });
    }
  }

  // Most used tool insight
  if (stats.length > 0) {
    const mostUsed = stats.reduce((a, b) =>
      a.totalCalls > b.totalCalls ? a : b
    );
    suggestions.push({
      category: "insight",
      title: "Most used tool",
      message: `${mostUsed.toolName} is most frequently used (${mostUsed.totalCalls} calls)`,
      toolName: mostUsed.toolName,
      details: { totalCalls: mostUsed.totalCalls }
    });
  }

  return suggestions;
}

export function analyzeRecentSessions(
  sessions: HookSession[],
  toolUsagesBySession: Map<string, ToolUsage[]>
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (sessions.length === 0) {
    return suggestions;
  }

  // Calculate averages
  const totalTools = sessions.reduce((sum, s) => sum + s.toolCount, 0);
  const avgTools = totalTools / sessions.length;

  const sessionsWithCommits = sessions.filter((s) => s.commits.length > 0);
  const totalCommits = sessions.reduce((sum, s) => sum + s.commits.length, 0);

  // Sessions without commits
  const noCommitSessions = sessions.length - sessionsWithCommits.length;
  if (noCommitSessions >= 5 && sessionsWithCommits.length < noCommitSessions) {
    suggestions.push({
      category: "pattern",
      title: "Many exploratory sessions",
      message: `${noCommitSessions} of ${sessions.length} recent sessions had no commits - mostly exploration/research`,
      details: {
        noCommitSessions,
        totalSessions: sessions.length
      }
    });
  }

  // High productivity sessions
  if (sessionsWithCommits.length >= 3) {
    suggestions.push({
      category: "insight",
      title: "Productive period",
      message: `${sessionsWithCommits.length} sessions produced ${totalCommits} commits`,
      details: {
        sessionsWithCommits: sessionsWithCommits.length,
        totalCommits
      }
    });
  }

  // Average tool usage
  if (avgTools > 0) {
    suggestions.push({
      category: "insight",
      title: "Average session activity",
      message: `Sessions average ${Math.floor(avgTools)} tool calls`,
      details: { averageToolsPerSession: avgTools }
    });
  }

  // Check for patterns across sessions
  let bashHeavySessions = 0;
  let readHeavySessions = 0;

  for (const session of sessions) {
    if ((session.toolsUsed["Bash"] ?? 0) >= 20) {
      bashHeavySessions++;
    }
    if ((session.toolsUsed["Read"] ?? 0) >= 30) {
      readHeavySessions++;
    }
  }

  if (bashHeavySessions >= 3) {
    suggestions.push({
      category: "pattern",
      title: "Bash-heavy workflow",
      message: `${bashHeavySessions} sessions were command-line heavy (20+ Bash calls)`,
      toolName: "Bash",
      details: { bashHeavySessions }
    });
  }

  if (readHeavySessions >= 3) {
    suggestions.push({
      category: "tip",
      title: "Frequent heavy reading",
      message: `${readHeavySessions} sessions had 30+ Read calls - consider using CLAUDE.md for context`,
      toolName: "Read",
      details: { readHeavySessions }
    });
  }

  return suggestions;
}

export function suggestionToDict(
  suggestion: Suggestion
): Record<string, unknown> {
  return {
    category: suggestion.category,
    title: suggestion.title,
    message: suggestion.message,
    tool_name: suggestion.toolName,
    session_id: suggestion.sessionId,
    details: suggestion.details
  };
}
