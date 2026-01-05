/**
 * Git state snapshot capture for sessions.
 *
 * Captures the repository state at session start and end
 * to enable diff comparison and change tracking.
 */

import { execSync } from "child_process";
import type {
  DiffSnapshotEnrichment,
  DiffSummary,
  FileChange,
  GitStateSnapshot
} from "@agentwatch/core";

// =============================================================================
// GIT COMMAND HELPERS
// =============================================================================

/**
 * Run a git command safely with timeout.
 */
function runGitCommand(
  command: string,
  cwd: string,
  timeoutMs = 5000
): string | null {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if a directory is a git repository.
 */
export function isGitRepo(cwd: string): boolean {
  const result = runGitCommand("git rev-parse --git-dir", cwd);
  return result !== null;
}

// =============================================================================
// SNAPSHOT CAPTURE
// =============================================================================

/**
 * Capture current git state.
 */
export function captureGitState(cwd: string): GitStateSnapshot | null {
  if (!isGitRepo(cwd)) {
    return null;
  }

  try {
    // Get current branch
    const branch =
      runGitCommand("git rev-parse --abbrev-ref HEAD", cwd) || "unknown";

    // Get current commit hash
    const commitHash =
      runGitCommand("git rev-parse --short HEAD", cwd) || "unknown";

    // Get working directory status
    const statusOutput = runGitCommand("git status --porcelain", cwd) || "";
    const statusLines = statusOutput.split("\n").filter((l) => l.trim());

    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;

    for (const line of statusLines) {
      const indexStatus = line[0];
      const workingStatus = line[1];

      if (indexStatus === "?") {
        untrackedCount++;
      } else {
        if (indexStatus !== " " && indexStatus !== "?") {
          stagedCount++;
        }
        if (workingStatus !== " " && workingStatus !== "?") {
          unstagedCount++;
        }
      }
    }

    const isDirty = stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0;

    return {
      branch,
      commitHash,
      isDirty,
      stagedCount,
      unstagedCount,
      untrackedCount,
      capturedAt: Date.now()
    };
  } catch {
    return null;
  }
}

// =============================================================================
// DIFF COMPUTATION
// =============================================================================

/**
 * Parse git diff --numstat output.
 */
function parseNumstat(output: string): FileChange[] {
  const changes: FileChange[] = [];
  const lines = output.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 3) {
      const ins = parts[0]!;
      const del = parts[1]!;
      const insertions = ins === "-" ? 0 : Number.parseInt(ins, 10) || 0;
      const deletions = del === "-" ? 0 : Number.parseInt(del, 10) || 0;
      const path = parts.slice(2).join("\t"); // Handle paths with tabs

      let status: FileChange["status"] = "modified";
      if (insertions > 0 && deletions === 0) {
        status = "added";
      } else if (insertions === 0 && deletions > 0) {
        status = "deleted";
      }

      changes.push({
        path,
        status,
        insertions,
        deletions
      });
    }
  }

  return changes;
}

/**
 * Compute diff between two git states.
 */
export function computeDiff(
  cwd: string,
  startCommit: string,
  endCommit: string
): { summary: DiffSummary; fileChanges: FileChange[] } | null {
  try {
    // Get numstat for detailed file changes
    const numstatOutput = runGitCommand(
      `git diff --numstat ${startCommit}..${endCommit}`,
      cwd,
      10000
    );

    if (numstatOutput === null) {
      return null;
    }

    const fileChanges = parseNumstat(numstatOutput);

    // Compute summary
    let filesCreated = 0;
    let filesDeleted = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of fileChanges) {
      linesAdded += change.insertions;
      linesRemoved += change.deletions;

      if (change.status === "added") {
        filesCreated++;
      } else if (change.status === "deleted") {
        filesDeleted++;
      }
    }

    // Get commit count
    const commitCountOutput = runGitCommand(
      `git rev-list --count ${startCommit}..${endCommit}`,
      cwd
    );
    const commitsCreated = commitCountOutput
      ? Number.parseInt(commitCountOutput, 10) || 0
      : 0;

    const summary: DiffSummary = {
      filesChanged: fileChanges.length,
      linesAdded,
      linesRemoved,
      filesCreated,
      filesDeleted,
      commitsCreated
    };

    // Limit file changes to top 50 by total changes
    const sortedChanges = fileChanges
      .sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions))
      .slice(0, 50);

    return { summary, fileChanges: sortedChanges };
  } catch {
    return null;
  }
}

/**
 * Compute diff including uncommitted changes.
 */
export function computeWorkingTreeDiff(
  cwd: string,
  startCommit: string
): { summary: DiffSummary; fileChanges: FileChange[] } | null {
  try {
    // Include staged and unstaged changes
    const numstatOutput = runGitCommand(
      `git diff --numstat ${startCommit}`,
      cwd,
      10000
    );

    const stagedOutput = runGitCommand(
      `git diff --numstat --cached`,
      cwd,
      10000
    );

    if (numstatOutput === null && stagedOutput === null) {
      return null;
    }

    const workingChanges = numstatOutput ? parseNumstat(numstatOutput) : [];
    const stagedChanges = stagedOutput ? parseNumstat(stagedOutput) : [];

    // Merge changes (staged takes precedence)
    const changeMap = new Map<string, FileChange>();
    for (const change of workingChanges) {
      changeMap.set(change.path, change);
    }
    for (const change of stagedChanges) {
      const existing = changeMap.get(change.path);
      if (existing) {
        existing.insertions += change.insertions;
        existing.deletions += change.deletions;
      } else {
        changeMap.set(change.path, change);
      }
    }

    const fileChanges = Array.from(changeMap.values());

    // Compute summary
    let filesCreated = 0;
    let filesDeleted = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of fileChanges) {
      linesAdded += change.insertions;
      linesRemoved += change.deletions;

      if (change.status === "added") {
        filesCreated++;
      } else if (change.status === "deleted") {
        filesDeleted++;
      }
    }

    // Get commit count from start to HEAD
    const commitCountOutput = runGitCommand(
      `git rev-list --count ${startCommit}..HEAD`,
      cwd
    );
    const commitsCreated = commitCountOutput
      ? Number.parseInt(commitCountOutput, 10) || 0
      : 0;

    const summary: DiffSummary = {
      filesChanged: fileChanges.length,
      linesAdded,
      linesRemoved,
      filesCreated,
      filesDeleted,
      commitsCreated
    };

    const sortedChanges = fileChanges
      .sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions))
      .slice(0, 50);

    return { summary, fileChanges: sortedChanges };
  } catch {
    return null;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * In-memory cache for session start states.
 * Key: sessionId, Value: GitStateSnapshot
 */
const startStateCache = new Map<string, GitStateSnapshot>();

/**
 * Capture and cache git state at session start.
 */
export function captureSessionStart(
  sessionId: string,
  cwd: string
): GitStateSnapshot | null {
  const state = captureGitState(cwd);
  if (state) {
    startStateCache.set(sessionId, state);
  }
  return state;
}

/**
 * Get cached start state for a session.
 */
export function getSessionStartState(
  sessionId: string
): GitStateSnapshot | null {
  return startStateCache.get(sessionId) || null;
}

/**
 * Compute full diff snapshot at session end.
 */
export function computeDiffSnapshot(
  sessionId: string,
  cwd: string
): DiffSnapshotEnrichment | null {
  const startState = startStateCache.get(sessionId);
  if (!startState) {
    // No start state cached, try to capture current state only
    const currentState = captureGitState(cwd);
    if (!currentState) {
      return null;
    }

    return {
      start: currentState, // Use current as approximation
      end: currentState,
      summary: {
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        filesCreated: 0,
        filesDeleted: 0,
        commitsCreated: 0
      },
      fileChanges: [],
      computedAt: new Date().toISOString()
    };
  }

  const endState = captureGitState(cwd);
  if (!endState) {
    return null;
  }

  // Compute diff between start and end
  let diffResult: { summary: DiffSummary; fileChanges: FileChange[] } | null;

  if (startState.commitHash === endState.commitHash) {
    // Same commit, compute working tree diff
    diffResult = computeWorkingTreeDiff(cwd, startState.commitHash);
  } else {
    // Different commits, compute commit diff
    diffResult = computeDiff(cwd, startState.commitHash, endState.commitHash);

    // Also include any uncommitted changes
    if (endState.isDirty && diffResult) {
      const workingDiff = computeWorkingTreeDiff(cwd, endState.commitHash);
      if (workingDiff) {
        diffResult.summary.linesAdded += workingDiff.summary.linesAdded;
        diffResult.summary.linesRemoved += workingDiff.summary.linesRemoved;
        diffResult.summary.filesChanged += workingDiff.summary.filesChanged;
        diffResult.fileChanges = [
          ...diffResult.fileChanges,
          ...workingDiff.fileChanges
        ].slice(0, 50);
      }
    }
  }

  // Clean up cache
  startStateCache.delete(sessionId);

  if (!diffResult) {
    return {
      start: startState,
      end: endState,
      summary: {
        filesChanged: 0,
        linesAdded: 0,
        linesRemoved: 0,
        filesCreated: 0,
        filesDeleted: 0,
        commitsCreated: 0
      },
      fileChanges: [],
      computedAt: new Date().toISOString()
    };
  }

  return {
    start: startState,
    end: endState,
    summary: diffResult.summary,
    fileChanges: diffResult.fileChanges,
    computedAt: new Date().toISOString()
  };
}

/**
 * Clear session start cache (for cleanup).
 */
export function clearStartStateCache(sessionId?: string): void {
  if (sessionId) {
    startStateCache.delete(sessionId);
  } else {
    startStateCache.clear();
  }
}

/**
 * Get human-readable summary of diff.
 */
export function describeDiff(snapshot: DiffSnapshotEnrichment): string {
  const { summary } = snapshot;

  if (summary.filesChanged === 0 && summary.commitsCreated === 0) {
    return "No changes";
  }

  const parts: string[] = [];

  if (summary.commitsCreated > 0) {
    parts.push(
      `${summary.commitsCreated} commit${summary.commitsCreated > 1 ? "s" : ""}`
    );
  }

  if (summary.filesChanged > 0) {
    parts.push(
      `${summary.filesChanged} file${summary.filesChanged > 1 ? "s" : ""} changed`
    );
  }

  if (summary.linesAdded > 0) {
    parts.push(`+${summary.linesAdded}`);
  }

  if (summary.linesRemoved > 0) {
    parts.push(`-${summary.linesRemoved}`);
  }

  return parts.join(", ");
}
