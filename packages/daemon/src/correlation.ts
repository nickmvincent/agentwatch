/**
 * Correlation module for linking hook session data with transcript files.
 *
 * Strategy:
 * 1. Primary: Match HookSession.transcriptPath to LocalTranscript.path (exact match)
 * 2. Secondary: Match by cwd + startTime window (±5 seconds)
 * 3. Validation: Tool count and duration sanity checks
 */

import type { HookSession, ToolUsage } from "@agentwatch/core";
import type { ManagedSession, ProcessSnapshot } from "@agentwatch/monitor";
import type { ProjectConfig } from "./config";
import type { LocalTranscript } from "./local-logs";
import { getProjectRef, resolveProject } from "./project-matcher";

/**
 * Match confidence levels.
 */
export type MatchType = "exact" | "confident" | "uncertain" | "unmatched";

/**
 * Details about how the correlation was determined.
 */
export interface MatchDetails {
  /** Whether transcript paths matched exactly */
  pathMatch: boolean;
  /** Whether start times were within window */
  timeMatch: boolean;
  /** Whether working directories matched */
  cwdMatch: boolean;
  /** Whether tool counts are roughly consistent */
  toolCountMatch: boolean;
  /** Confidence score 0-100 */
  score: number;
}

/**
 * A conversation combining hook data with transcript data.
 * This is the primary "Agentwatch Object" - a unified view of an AI coding session.
 */
export interface Conversation {
  /** Unique ID for this correlated pair */
  correlationId: string;
  /** How confident the match is */
  matchType: MatchType;
  /** Details about the match */
  matchDetails: MatchDetails;
  /** Hook session data (if available) */
  hookSession?: HookSession;
  /** Tool usage events from hooks */
  toolUsages?: ToolUsage[];
  /** Local transcript data (if available) */
  transcript?: LocalTranscript;
  /** Process snapshots from period scans (if enabled) */
  processSnapshots?: ProcessSnapshot[];
  /** Project this conversation belongs to (if matched) */
  project?: { id: string; name: string };
  /** Managed session data from `aw run` (if matched) */
  managedSession?: ManagedSession;
  /** Merged timestamp (earliest of both sources) */
  startTime: number;
  /** Working directory */
  cwd: string | null;
  /** Agent type */
  agent: string;
}

/**
 * Configuration for correlation.
 */
export interface CorrelationConfig {
  /** Time window for matching (ms). Default: 5000 */
  timeWindowMs: number;
  /** Minimum score for "confident" match. Default: 70 */
  confidentThreshold: number;
  /** Minimum score for "uncertain" match. Default: 40 */
  uncertainThreshold: number;
}

const DEFAULT_CONFIG: CorrelationConfig = {
  timeWindowMs: 5000,
  confidentThreshold: 70,
  uncertainThreshold: 40
};

/**
 * Correlate hook sessions with local transcripts.
 *
 * @param hookSessions - Sessions from HookStore
 * @param transcripts - Transcripts from local-logs scanner
 * @param toolUsages - Tool usage records keyed by session ID
 * @param config - Correlation configuration
 * @returns Array of correlated sessions
 */
export function correlateSessionsWithTranscripts(
  hookSessions: HookSession[],
  transcripts: LocalTranscript[],
  toolUsages: Map<string, ToolUsage[]>,
  config: Partial<CorrelationConfig> = {}
): Conversation[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: Conversation[] = [];
  const usedTranscripts = new Set<string>();
  const usedHookSessions = new Set<string>();

  // Build path lookup for transcripts
  const transcriptsByPath = new Map<string, LocalTranscript>();
  for (const t of transcripts) {
    transcriptsByPath.set(t.path, t);
  }

  // Phase 1: Exact path matches (highest confidence)
  for (const hook of hookSessions) {
    if (!hook.transcriptPath) continue;

    const transcript = transcriptsByPath.get(hook.transcriptPath);
    if (transcript) {
      const details = computeMatchDetails(
        hook,
        transcript,
        toolUsages.get(hook.sessionId),
        cfg
      );
      details.pathMatch = true;
      details.score = Math.min(100, details.score + 30); // Boost for exact path match

      results.push({
        correlationId: generateCorrelationId(hook.sessionId, transcript.id),
        matchType: "exact",
        matchDetails: details,
        hookSession: hook,
        toolUsages: toolUsages.get(hook.sessionId),
        transcript,
        startTime: Math.min(
          hook.startTime,
          transcript.startTime ?? hook.startTime
        ),
        cwd: hook.cwd || transcript.projectDir,
        agent: transcript.agent
      });

      usedTranscripts.add(transcript.id);
      usedHookSessions.add(hook.sessionId);
    }
  }

  // Phase 2: Time + CWD matching for remaining
  for (const hook of hookSessions) {
    if (usedHookSessions.has(hook.sessionId)) continue;

    let bestMatch: {
      transcript: LocalTranscript;
      details: MatchDetails;
    } | null = null;

    for (const transcript of transcripts) {
      if (usedTranscripts.has(transcript.id)) continue;
      if (transcript.agent !== "claude") continue; // Hooks only work with Claude

      const details = computeMatchDetails(
        hook,
        transcript,
        toolUsages.get(hook.sessionId),
        cfg
      );

      if (details.score > (bestMatch?.details.score ?? 0)) {
        bestMatch = { transcript, details };
      }
    }

    if (bestMatch && bestMatch.details.score >= cfg.uncertainThreshold) {
      const matchType =
        bestMatch.details.score >= cfg.confidentThreshold
          ? "confident"
          : "uncertain";

      results.push({
        correlationId: generateCorrelationId(
          hook.sessionId,
          bestMatch.transcript.id
        ),
        matchType,
        matchDetails: bestMatch.details,
        hookSession: hook,
        toolUsages: toolUsages.get(hook.sessionId),
        transcript: bestMatch.transcript,
        startTime: Math.min(
          hook.startTime,
          bestMatch.transcript.startTime ?? hook.startTime
        ),
        cwd: hook.cwd || bestMatch.transcript.projectDir,
        agent: bestMatch.transcript.agent
      });

      usedTranscripts.add(bestMatch.transcript.id);
      usedHookSessions.add(hook.sessionId);
    }
  }

  // Phase 3: Add unmatched hook sessions
  for (const hook of hookSessions) {
    if (usedHookSessions.has(hook.sessionId)) continue;

    results.push({
      correlationId: `hook-${hook.sessionId}`,
      matchType: "unmatched",
      matchDetails: {
        pathMatch: false,
        timeMatch: false,
        cwdMatch: false,
        toolCountMatch: false,
        score: 0
      },
      hookSession: hook,
      toolUsages: toolUsages.get(hook.sessionId),
      startTime: hook.startTime,
      cwd: hook.cwd || null,
      agent: "claude"
    });
  }

  // Phase 4: Add unmatched transcripts
  for (const transcript of transcripts) {
    if (usedTranscripts.has(transcript.id)) continue;

    results.push({
      correlationId: `transcript-${transcript.id}`,
      matchType: "unmatched",
      matchDetails: {
        pathMatch: false,
        timeMatch: false,
        cwdMatch: false,
        toolCountMatch: false,
        score: 0
      },
      transcript,
      startTime: transcript.startTime ?? transcript.modifiedAt,
      cwd: transcript.projectDir,
      agent: transcript.agent
    });
  }

  // Sort by start time descending
  results.sort((a, b) => b.startTime - a.startTime);

  return results;
}

/**
 * Compute match details between a hook session and transcript.
 */
function computeMatchDetails(
  hook: HookSession,
  transcript: LocalTranscript,
  toolUsages: ToolUsage[] | undefined,
  config: CorrelationConfig
): MatchDetails {
  let score = 0;
  const details: MatchDetails = {
    pathMatch: false,
    timeMatch: false,
    cwdMatch: false,
    toolCountMatch: false,
    score: 0
  };

  // Path match (checked separately in phase 1)
  if (hook.transcriptPath === transcript.path) {
    details.pathMatch = true;
    score += 40;
  }

  // Time match
  if (transcript.startTime !== null) {
    const timeDiff = Math.abs(hook.startTime - transcript.startTime);
    if (timeDiff <= config.timeWindowMs) {
      details.timeMatch = true;
      score += 30;
    } else if (timeDiff <= config.timeWindowMs * 2) {
      // Partial credit for close times
      score += 15;
    }
  }

  // CWD match
  if (hook.cwd && transcript.projectDir) {
    if (hook.cwd === transcript.projectDir) {
      details.cwdMatch = true;
      score += 25;
    } else if (
      hook.cwd.startsWith(transcript.projectDir) ||
      transcript.projectDir.startsWith(hook.cwd)
    ) {
      // Partial match (one is subdirectory of other)
      score += 10;
    }
  }

  // Tool count sanity check
  if (toolUsages && transcript.messageCount !== null) {
    const toolCount = toolUsages.length;
    // Rough heuristic: messages should be >= tool calls (usually 2-3x)
    if (
      transcript.messageCount >= toolCount &&
      transcript.messageCount <= toolCount * 5
    ) {
      details.toolCountMatch = true;
      score += 5;
    }
  }

  details.score = Math.min(100, score);
  return details;
}

/**
 * Generate a stable correlation ID.
 */
function generateCorrelationId(hookId: string, transcriptId: string): string {
  return `corr-${hookId.slice(0, 8)}-${transcriptId.slice(0, 8)}`;
}

/**
 * Get correlation statistics.
 */
export function getCorrelationStats(sessions: Conversation[]): {
  total: number;
  exact: number;
  confident: number;
  uncertain: number;
  unmatched: number;
  hookOnly: number;
  transcriptOnly: number;
  managedOnly: number;
  withManagedSession: number;
} {
  let exact = 0,
    confident = 0,
    uncertain = 0,
    unmatched = 0;
  let hookOnly = 0,
    transcriptOnly = 0,
    managedOnly = 0,
    withManagedSession = 0;

  for (const s of sessions) {
    if (s.managedSession) withManagedSession++;

    switch (s.matchType) {
      case "exact":
        exact++;
        break;
      case "confident":
        confident++;
        break;
      case "uncertain":
        uncertain++;
        break;
      case "unmatched":
        if (s.managedSession && !s.hookSession && !s.transcript) managedOnly++;
        else if (s.hookSession && !s.transcript) hookOnly++;
        else if (!s.hookSession && s.transcript) transcriptOnly++;
        else unmatched++;
        break;
    }
  }

  return {
    total: sessions.length,
    exact,
    confident,
    uncertain,
    unmatched,
    hookOnly,
    transcriptOnly,
    managedOnly,
    withManagedSession
  };
}

/**
 * Attach process snapshots to conversations based on cwd/time matching.
 * This is called after correlation to enrich conversations with lightweight process data.
 *
 * @param conversations - Conversations from correlateSessionsWithTranscripts
 * @param snapshots - Process snapshots from ProcessLogger
 * @returns Conversations with processSnapshots attached
 */
export function attachProcessSnapshots(
  conversations: Conversation[],
  snapshots: ProcessSnapshot[]
): Conversation[] {
  if (snapshots.length === 0) return conversations;

  // Build index of snapshots by cwd/repoPath for faster lookup
  const snapshotsByCwd = new Map<string, ProcessSnapshot[]>();
  for (const s of snapshots) {
    const key = s.cwd || s.repoPath;
    if (key) {
      const existing = snapshotsByCwd.get(key) || [];
      existing.push(s);
      snapshotsByCwd.set(key, existing);
    }
  }

  // For each conversation, find matching snapshots
  for (const conv of conversations) {
    const convCwd = conv.cwd;
    if (!convCwd) continue;

    // Get potential matches by cwd
    const potentialMatches = snapshotsByCwd.get(convCwd) || [];

    // Filter by time window if we have a time range
    // Use conversation start time and estimate end time
    const startTime = conv.startTime;
    const endTime =
      conv.hookSession?.endTime ||
      conv.transcript?.endTime ||
      startTime + 3600000; // Default 1 hour

    const matching = potentialMatches.filter((s) => {
      return s.timestamp >= startTime && s.timestamp <= endTime;
    });

    if (matching.length > 0) {
      conv.processSnapshots = matching.sort(
        (a, b) => a.timestamp - b.timestamp
      );
    }
  }

  return conversations;
}

/**
 * Attach projects to conversations based on cwd matching.
 * This resolves each conversation's cwd to a configured project.
 *
 * @param conversations - Conversations from correlateSessionsWithTranscripts
 * @param projects - Project configurations from config
 * @returns Conversations with project field attached where matched
 */
export function attachProjects(
  conversations: Conversation[],
  projects: ProjectConfig[]
): Conversation[] {
  if (projects.length === 0) return conversations;

  for (const conv of conversations) {
    const project = resolveProject(conv.cwd, projects);
    if (project) {
      conv.project = getProjectRef(project) ?? undefined;
    }
  }

  return conversations;
}

/**
 * Attach managed sessions to conversations and add unmatched ones as standalone.
 * Called after correlation to integrate `aw run` sessions.
 *
 * Matching strategy:
 * 1. Primary: PID match (ManagedSession.pid === HookSession.pid)
 * 2. Secondary: CWD + time window overlap
 * 3. Unmatched managed sessions become standalone conversations
 *
 * @param conversations - Conversations from correlateSessionsWithTranscripts
 * @param managedSessions - Sessions from SessionStore
 * @returns Conversations with managedSession attached where matched, plus standalone managed sessions
 */
export function attachManagedSessions(
  conversations: Conversation[],
  managedSessions: ManagedSession[]
): Conversation[] {
  if (managedSessions.length === 0) return conversations;

  // Build indexes for efficient lookup
  const sessionsByPid = new Map<number, ManagedSession>();
  const sessionsByCwd = new Map<string, ManagedSession[]>();

  for (const ms of managedSessions) {
    if (ms.pid !== undefined) {
      sessionsByPid.set(ms.pid, ms);
    }
    const existing = sessionsByCwd.get(ms.cwd) || [];
    existing.push(ms);
    sessionsByCwd.set(ms.cwd, existing);
  }

  const usedManagedSessions = new Set<string>();

  // Phase 1: PID-based matching (highest confidence)
  for (const conv of conversations) {
    const hookPid = conv.hookSession?.pid;
    if (hookPid && sessionsByPid.has(hookPid)) {
      const ms = sessionsByPid.get(hookPid)!;
      conv.managedSession = ms;
      usedManagedSessions.add(ms.id);
    }
  }

  // Phase 2: CWD + time-based matching
  for (const conv of conversations) {
    if (conv.managedSession) continue; // Already matched
    const convCwd = conv.cwd;
    if (!convCwd) continue;

    const candidates = sessionsByCwd.get(convCwd) || [];
    for (const ms of candidates) {
      if (usedManagedSessions.has(ms.id)) continue;

      // Check time overlap
      const convStart = conv.startTime;
      const convEnd =
        conv.hookSession?.endTime ||
        conv.transcript?.endTime ||
        convStart + 3600000;
      const msStart = ms.startedAt;
      const msEnd = ms.endedAt || Date.now();

      // Sessions overlap if they have any time in common
      if (msStart <= convEnd && msEnd >= convStart) {
        conv.managedSession = ms;
        usedManagedSessions.add(ms.id);
        break;
      }
    }
  }

  // Phase 3: Add unmatched managed sessions as standalone conversations
  for (const ms of managedSessions) {
    if (usedManagedSessions.has(ms.id)) continue;

    conversations.push({
      correlationId: `managed-${ms.id}`,
      matchType: "unmatched",
      matchDetails: {
        pathMatch: false,
        timeMatch: false,
        cwdMatch: false,
        toolCountMatch: false,
        score: 0
      },
      managedSession: ms,
      startTime: ms.startedAt,
      cwd: ms.cwd,
      agent: ms.agent
    });
  }

  // Re-sort by start time descending
  conversations.sort((a, b) => b.startTime - a.startTime);

  return conversations;
}
