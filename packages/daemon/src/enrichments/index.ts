/**
 * Auto-enrichment modules for Agentwatch Objects.
 *
 * These modules analyze session data to automatically generate
 * enrichments that make agent data more valuable and shareable.
 */

// Task type inference (feature, bugfix, refactor, etc.)
export {
  inferAutoTags,
  getTaskTypeLabel
} from "./task-inference";

// Outcome signal extraction (tests, lint, build, exit codes)
export {
  extractOutcomeSignals,
  isSuccessfulOutcome
} from "./outcome-signals";

// Stuck loop detection (retries, oscillations, permission loops)
export {
  detectLoops,
  getLoopSeverity,
  describeLoopPatterns
} from "./loop-detection";

// Git state snapshots (before/after diffs)
export {
  isGitRepo,
  captureGitState,
  captureSessionStart,
  getSessionStartState,
  computeDiffSnapshot,
  clearStartStateCache,
  describeDiff
} from "./git-snapshot";

// Quality score computation (composite score from all signals)
export {
  computeQualityScore,
  getQualityColor,
  getQualityLabel,
  describeQualityScore
} from "./quality-score";

// Transcript adapter (for enrichment without hooks)
export {
  convertTranscriptToToolUsages,
  createSessionFromTranscript,
  type MinimalSession
} from "./transcript-adapter";

import type {
  EnrichmentDataSource,
  HookSession,
  SessionEnrichments,
  SessionRef,
  ToolUsage
} from "@agentwatch/core";
import type { ParsedTranscript } from "../local-logs";

import { computeDiffSnapshot } from "./git-snapshot";
import { detectLoops } from "./loop-detection";
import { extractOutcomeSignals } from "./outcome-signals";
import { computeQualityScore } from "./quality-score";
import { inferAutoTags } from "./task-inference";
import {
  convertTranscriptToToolUsages,
  createSessionFromTranscript
} from "./transcript-adapter";

/**
 * Run full enrichment pipeline for a session at session end.
 *
 * This is the main entry point for auto-enrichment, typically called
 * when a session ends.
 */
export function computeAllEnrichments(
  sessionId: string,
  session: HookSession,
  toolUsages: ToolUsage[],
  cwd: string
): Partial<SessionEnrichments> {
  // 1. Infer auto-tags and task type
  const autoTags = inferAutoTags(session, toolUsages);

  // 2. Extract outcome signals
  const outcomeSignals = extractOutcomeSignals(toolUsages, session.startTime);

  // 3. Detect stuck loops
  const loopDetection = detectLoops(toolUsages);

  // 4. Capture git diff snapshot
  const diffSnapshot = computeDiffSnapshot(sessionId, cwd);

  // 5. Compute quality score (uses other enrichments)
  const qualityScore = computeQualityScore(
    session,
    toolUsages,
    outcomeSignals,
    loopDetection
  );

  return {
    autoTags,
    outcomeSignals,
    loopDetection,
    diffSnapshot: diffSnapshot || undefined,
    qualityScore,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Run enrichment pipeline from a parsed transcript.
 *
 * This is an alternative entry point for enrichment that works with
 * transcript data instead of hook data. Useful for:
 * - Analyzing transcripts from agents without hooks
 * - Re-analyzing historical transcripts
 * - Testing enrichment without running Claude Code
 *
 * Note: Some enrichments may be less accurate without hook data:
 * - Git diff snapshot requires access to the repo (cwd)
 * - Commit detection is based on command parsing rather than git hooks
 */
export function computeEnrichmentsFromTranscript(
  transcript: ParsedTranscript,
  options: {
    /** Skip git diff (e.g., if cwd is not accessible) */
    skipGitDiff?: boolean;
    /** Override cwd for git operations */
    cwd?: string;
  } = {}
): Partial<SessionEnrichments> {
  // Convert transcript to enrichment-compatible formats
  const session = createSessionFromTranscript(transcript);
  const toolUsages = convertTranscriptToToolUsages(
    transcript.id,
    transcript.messages
  );

  // Use session as HookSession (type compatible for the fields we use)
  const hookSession = session as unknown as HookSession;

  // 1. Infer auto-tags and task type
  const autoTags = inferAutoTags(hookSession, toolUsages);

  // 2. Extract outcome signals
  const outcomeSignals = extractOutcomeSignals(toolUsages, session.startTime);

  // 3. Detect stuck loops
  const loopDetection = detectLoops(toolUsages);

  // 4. Capture git diff snapshot (optional)
  const cwd = options.cwd || session.cwd;
  const diffSnapshot = options.skipGitDiff
    ? null
    : computeDiffSnapshot(transcript.id, cwd);

  // 5. Compute quality score
  const qualityScore = computeQualityScore(
    hookSession,
    toolUsages,
    outcomeSignals,
    loopDetection
  );

  return {
    autoTags,
    outcomeSignals,
    loopDetection,
    diffSnapshot: diffSnapshot || undefined,
    qualityScore,
    updatedAt: new Date().toISOString(),
    // Mark as transcript-sourced for UI differentiation
    source: "transcript" as EnrichmentDataSource
  };
}
