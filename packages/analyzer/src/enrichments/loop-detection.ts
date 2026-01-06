/**
 * Stuck loop detection for agent sessions.
 *
 * Detects patterns where the agent repeatedly tries the same
 * commands or operations, indicating it may be stuck.
 */

import type {
  LoopDetectionEnrichment,
  LoopPattern,
  LoopPatternType,
  ToolUsage
} from "@agentwatch/core";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Minimum repetitions to consider a loop.
 */
const LOOP_THRESHOLD = 3;

/**
 * Time window for detecting loops (5 minutes).
 */
const TIME_WINDOW_MS = 5 * 60 * 1000;

/**
 * Maximum operations to analyze (performance limit).
 */
const MAX_OPERATIONS = 500;

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Normalize a command by removing variable parts.
 */
function normalizeCommand(command: string): string {
  return (
    command
      // Remove absolute paths, keep last component
      .replace(/\/[\w\/.-]+\/([^\/\s]+)/g, "<PATH>/$1")
      // Remove line numbers
      .replace(/:\d+/g, ":<LINE>")
      // Remove specific error codes/numbers
      .replace(/\b\d{3,}\b/g, "<NUM>")
      // Remove UUIDs
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "<UUID>"
      )
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Normalize a file path for comparison.
 */
function normalizeFilePath(filePath: string): string {
  // Keep just the filename for comparison
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * Get a signature for a tool usage for comparison.
 */
function getOperationSignature(usage: ToolUsage): string {
  const { toolName, toolInput } = usage;

  switch (toolName) {
    case "Bash": {
      const command = (toolInput?.command as string) || "";
      return `Bash:${normalizeCommand(command)}`;
    }

    case "Edit": {
      const filePath = (toolInput?.file_path as string) || "";
      const oldString = (toolInput?.old_string as string) || "";
      // Just use file and approximate old string length
      return `Edit:${normalizeFilePath(filePath)}:${oldString.length}`;
    }

    case "Write": {
      const filePath = (toolInput?.file_path as string) || "";
      return `Write:${normalizeFilePath(filePath)}`;
    }

    case "Read": {
      const filePath = (toolInput?.file_path as string) || "";
      return `Read:${normalizeFilePath(filePath)}`;
    }

    default:
      return `${toolName}`;
  }
}

/**
 * Extract error message from tool usage.
 */
function getErrorMessage(usage: ToolUsage): string | null {
  if (usage.success !== false) return null;

  // Check for explicit error
  if (usage.error) {
    return normalizeCommand(usage.error.slice(0, 100));
  }

  // Check response for error indicators
  const response = usage.toolResponse as Record<string, unknown> | undefined;
  if (response?.stderr) {
    return normalizeCommand(String(response.stderr).slice(0, 100));
  }

  return "unknown error";
}

// =============================================================================
// LOOP DETECTION LOGIC
// =============================================================================

interface OperationOccurrence {
  signature: string;
  timestamp: number;
  success: boolean;
  error: string | null;
  toolName: string;
}

/**
 * Detect retry patterns (same operation repeated after failure).
 */
function detectRetryPatterns(
  occurrences: OperationOccurrence[]
): LoopPattern[] {
  const patterns: LoopPattern[] = [];
  const signatureCounts = new Map<string, OperationOccurrence[]>();

  // Group by signature
  for (const occ of occurrences) {
    const list = signatureCounts.get(occ.signature) || [];
    list.push(occ);
    signatureCounts.set(occ.signature, list);
  }

  // Find patterns with repeated failures
  for (const [signature, occs] of signatureCounts) {
    const failures = occs.filter((o) => !o.success);

    if (failures.length >= LOOP_THRESHOLD) {
      // Check if within time window
      const firstFailure = failures[0]!;
      const lastFailure = failures[failures.length - 1]!;
      const timeSpan = lastFailure.timestamp - firstFailure.timestamp;

      if (timeSpan <= TIME_WINDOW_MS) {
        // Check if eventually resolved
        const lastOcc = occs[occs.length - 1]!;
        const resolution = lastOcc.success
          ? "success"
          : failures.length >= 5
            ? "abandoned"
            : undefined;

        patterns.push({
          patternType: "retry",
          involvedOperations: [signature],
          iterations: failures.length,
          startedAt: firstFailure.timestamp,
          endedAt: lastFailure.timestamp,
          resolution,
          normalizedPattern: signature
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect oscillation patterns (alternating between two operations).
 */
function detectOscillationPatterns(
  occurrences: OperationOccurrence[]
): LoopPattern[] {
  const patterns: LoopPattern[] = [];

  // Look for A-B-A-B patterns
  for (let i = 0; i < occurrences.length - 3; i++) {
    const occI = occurrences[i]!;
    const occI1 = occurrences[i + 1]!;
    const a = occI.signature;
    const b = occI1.signature;

    if (a === b) continue; // Not an oscillation

    // Count alternations
    let count = 2;
    let j = i + 2;
    while (j < occurrences.length) {
      const expected = count % 2 === 0 ? a : b;
      if (occurrences[j]!.signature === expected) {
        count++;
        j++;
      } else {
        break;
      }
    }

    if (count >= LOOP_THRESHOLD * 2) {
      // At least 3 full cycles
      const occJMinus1 = occurrences[j - 1]!;
      const timeSpan = occJMinus1.timestamp - occI.timestamp;

      if (timeSpan <= TIME_WINDOW_MS) {
        patterns.push({
          patternType: "oscillation",
          involvedOperations: [a, b],
          iterations: Math.floor(count / 2),
          startedAt: occI.timestamp,
          endedAt: occJMinus1.timestamp,
          normalizedPattern: `${a} <-> ${b}`
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect permission loop patterns (repeated permission-related failures).
 */
function detectPermissionLoops(
  occurrences: OperationOccurrence[]
): LoopPattern[] {
  const patterns: LoopPattern[] = [];
  const permissionErrors: OperationOccurrence[] = [];

  const PERMISSION_PATTERNS = [
    /permission denied/i,
    /access denied/i,
    /operation not permitted/i,
    /sandbox/i,
    /EPERM/i,
    /EACCES/i
  ];

  // Find permission-related errors
  for (const occ of occurrences) {
    if (occ.error && PERMISSION_PATTERNS.some((p) => p.test(occ.error || ""))) {
      permissionErrors.push(occ);
    }
  }

  if (permissionErrors.length >= LOOP_THRESHOLD) {
    const first = permissionErrors[0]!;
    const last = permissionErrors[permissionErrors.length - 1]!;
    const timeSpan = last.timestamp - first.timestamp;

    if (timeSpan <= TIME_WINDOW_MS) {
      patterns.push({
        patternType: "permission_loop",
        involvedOperations: permissionErrors.map((o) => o.signature),
        iterations: permissionErrors.length,
        startedAt: first.timestamp,
        endedAt: last.timestamp,
        normalizedPattern: "permission denied"
      });
    }
  }

  return patterns;
}

/**
 * Detect dead-end patterns (long pause followed by different approach).
 */
function detectDeadEnds(occurrences: OperationOccurrence[]): LoopPattern[] {
  const patterns: LoopPattern[] = [];
  const PAUSE_THRESHOLD_MS = 30000; // 30 seconds

  for (let i = 1; i < occurrences.length; i++) {
    const prev = occurrences[i - 1]!;
    const curr = occurrences[i]!;
    const gap = curr.timestamp - prev.timestamp;

    // Long pause after a failure
    if (gap >= PAUSE_THRESHOLD_MS && !prev.success) {
      // Check if the next operation is different (new approach)
      if (prev.signature !== curr.signature) {
        patterns.push({
          patternType: "dead_end",
          involvedOperations: [prev.signature],
          iterations: 1,
          startedAt: prev.timestamp,
          endedAt: prev.timestamp,
          resolution: "abandoned",
          normalizedPattern: prev.signature
        });
      }
    }
  }

  return patterns;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Detect stuck loop patterns in a session's tool usages.
 */
export function detectLoops(toolUsages: ToolUsage[]): LoopDetectionEnrichment {
  // Limit analysis for performance
  const recentUsages = toolUsages.slice(-MAX_OPERATIONS);

  // Convert to occurrences
  const occurrences: OperationOccurrence[] = recentUsages.map((usage) => ({
    signature: getOperationSignature(usage),
    timestamp: usage.timestamp,
    success: usage.success === true,
    error: getErrorMessage(usage),
    toolName: usage.toolName
  }));

  // Detect all pattern types
  const retryPatterns = detectRetryPatterns(occurrences);
  const oscillationPatterns = detectOscillationPatterns(occurrences);
  const permissionPatterns = detectPermissionLoops(occurrences);
  const deadEndPatterns = detectDeadEnds(occurrences);

  // Combine all patterns
  const allPatterns = [
    ...retryPatterns,
    ...oscillationPatterns,
    ...permissionPatterns,
    ...deadEndPatterns
  ];

  // Calculate totals
  const totalRetries = allPatterns.reduce((sum, p) => sum + p.iterations, 0);
  const timeInLoopsMs = allPatterns.reduce((sum, p) => {
    if (p.endedAt && p.startedAt) {
      return sum + (p.endedAt - p.startedAt);
    }
    return sum;
  }, 0);

  return {
    loopsDetected: allPatterns.length > 0,
    patterns: allPatterns,
    totalRetries,
    timeInLoopsMs,
    computedAt: new Date().toISOString()
  };
}

/**
 * Get severity of loop detection for display.
 */
export function getLoopSeverity(
  detection: LoopDetectionEnrichment
): "none" | "low" | "medium" | "high" {
  if (!detection.loopsDetected) return "none";

  // High: permission loops or many iterations
  if (
    detection.patterns.some((p) => p.patternType === "permission_loop") ||
    detection.totalRetries > 10
  ) {
    return "high";
  }

  // Medium: oscillation or moderate retries
  if (
    detection.patterns.some((p) => p.patternType === "oscillation") ||
    detection.totalRetries > 5
  ) {
    return "medium";
  }

  // Low: minor issues
  return "low";
}

/**
 * Get human-readable description of loop patterns.
 */
export function describeLoopPatterns(
  detection: LoopDetectionEnrichment
): string[] {
  return detection.patterns.map((p) => {
    switch (p.patternType) {
      case "retry":
        return `Retried "${p.normalizedPattern}" ${p.iterations} times`;
      case "oscillation":
        return `Oscillated between operations ${p.iterations} times`;
      case "permission_loop":
        return `Hit permission errors ${p.iterations} times`;
      case "dead_end":
        return `Abandoned approach after failure`;
      default:
        return `Unknown pattern (${p.iterations} iterations)`;
    }
  });
}
