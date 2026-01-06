/**
 * Quality score computation for agent sessions.
 *
 * Combines multiple signals (outcomes, loops, heuristics) into
 * a composite quality score with dimensional breakdown.
 */

import type {
  HeuristicSignal,
  HookSession,
  LoopDetectionEnrichment,
  OutcomeSignalsEnrichment,
  QualityClassification,
  QualityDimensions,
  QualityScoreEnrichment,
  ToolUsage
} from "@agentwatch/core";

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

/**
 * Weights for different quality dimensions.
 * Exported for API transparency.
 */
export const DIMENSION_WEIGHTS = {
  completion: 35,
  codeQuality: 25,
  efficiency: 25,
  safety: 15
};

/**
 * Signal weights for heuristic scoring.
 * Exported for API transparency.
 */
export const SIGNAL_WEIGHTS = {
  noFailures: 30,
  hasCommits: 25,
  normalEnd: 20,
  reasonableToolCount: 15,
  healthyPacing: 10
};

// =============================================================================
// DIMENSION SCORING
// =============================================================================

/**
 * Score task completion based on outcomes and session state.
 */
function scoreCompletion(
  session: HookSession,
  outcomes: OutcomeSignalsEnrichment | undefined
): number {
  let score = 50; // Start at neutral

  // Positive: has commits (task likely completed)
  if (session.commits && session.commits.length > 0) {
    score += 20;
  }

  // Positive: tests passed
  if (outcomes?.testResults?.ran && outcomes.testResults.passed > 0) {
    score += 15;
    if (outcomes.testResults.failed === 0) {
      score += 10;
    }
  }

  // Positive: build succeeded
  if (outcomes?.buildStatus?.ran && outcomes.buildStatus.success) {
    score += 10;
  }

  // Negative: test failures
  if (outcomes?.testResults?.ran && outcomes.testResults.failed > 0) {
    score -= 20;
  }

  // Negative: build failed
  if (outcomes?.buildStatus?.ran && !outcomes.buildStatus.success) {
    score -= 15;
  }

  // Positive: session ended normally (not abandoned)
  if (session.endTime) {
    const lastActivityGap = session.endTime - session.lastActivity;
    if (lastActivityGap < 60000) {
      // Ended within 1 min of last activity
      score += 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score code quality based on lint results and patterns.
 */
function scoreCodeQuality(
  outcomes: OutcomeSignalsEnrichment | undefined
): number {
  let score = 60; // Start slightly positive (assume decent quality)

  // Positive: lint ran clean
  if (outcomes?.lintResults?.ran) {
    if (
      outcomes.lintResults.errors === 0 &&
      outcomes.lintResults.warnings === 0
    ) {
      score += 20;
    } else if (outcomes.lintResults.errors === 0) {
      score += 10; // Warnings only
    } else {
      score -= 20; // Has errors
    }

    // Positive: auto-fixed issues
    if (outcomes.lintResults.autoFixed > 0) {
      score += 5;
    }
  }

  // Positive: tests exist and pass
  if (outcomes?.testResults?.ran && outcomes.testResults.passed > 0) {
    score += 15;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score efficiency based on loop detection and tool usage patterns.
 */
function scoreEfficiency(
  session: HookSession,
  toolUsages: ToolUsage[],
  loops: LoopDetectionEnrichment | undefined
): number {
  let score = 70; // Start positive

  // Negative: loops detected
  if (loops?.loopsDetected) {
    score -= 10 * loops.patterns.length;
    score -= Math.min(20, loops.totalRetries * 2);
  }

  // Negative: high failure rate
  const failures = toolUsages.filter((t) => t.success === false);
  const failureRate = failures.length / (toolUsages.length || 1);
  if (failureRate > 0.3) {
    score -= 20;
  } else if (failureRate > 0.2) {
    score -= 10;
  }

  // Positive: efficient tool usage (not too many, not too few)
  const toolCount = session.toolCount || toolUsages.length;
  if (toolCount >= 3 && toolCount <= 100) {
    score += 10;
  } else if (toolCount > 500) {
    score -= 15; // Excessive
  }

  // Positive: reasonable session duration vs tool count
  const sessionDurationMs = session.endTime
    ? session.endTime - session.startTime
    : Date.now() - session.startTime;
  const sessionMinutes = sessionDurationMs / 60000;
  const toolsPerMinute = toolCount / Math.max(1, sessionMinutes);

  if (toolsPerMinute >= 0.5 && toolsPerMinute <= 15) {
    score += 5;
  } else if (toolsPerMinute > 30) {
    score -= 10; // Frantic pace
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score safety based on dangerous operation detection.
 */
function scoreSafety(
  toolUsages: ToolUsage[],
  outcomes: OutcomeSignalsEnrichment | undefined
): number {
  let score = 80; // Start high (assume safe)

  // Patterns that indicate potentially dangerous operations
  const dangerPatterns = [
    /rm\s+-rf/i,
    /force\s*push/i,
    /--force/i,
    /DROP\s+TABLE/i,
    /DELETE\s+FROM.*WHERE\s+1/i,
    /sudo/i,
    /chmod\s+777/i
  ];

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    for (const pattern of dangerPatterns) {
      if (pattern.test(command)) {
        score -= 15;
        break;
      }
    }
  }

  // Negative: merge conflicts
  if (outcomes?.gitOutcomes?.mergeConflicts) {
    score -= 10;
  }

  // Positive: no permission errors (proper sandbox respect)
  const permissionErrors = toolUsages.filter(
    (t) =>
      t.success === false &&
      /permission|denied|EPERM|EACCES/i.test(t.error || "")
  );
  if (permissionErrors.length === 0) {
    score += 10;
  } else {
    score -= 5 * permissionErrors.length;
  }

  return Math.max(0, Math.min(100, score));
}

// =============================================================================
// HEURISTIC SIGNALS
// =============================================================================

/**
 * Compute heuristic signals for a session.
 */
function computeHeuristicSignals(
  session: HookSession,
  toolUsages: ToolUsage[]
): Record<string, HeuristicSignal> {
  const signals: Record<string, HeuristicSignal> = {
    noFailures: { value: true, weight: SIGNAL_WEIGHTS.noFailures },
    hasCommits: { value: false, weight: SIGNAL_WEIGHTS.hasCommits },
    normalEnd: { value: true, weight: SIGNAL_WEIGHTS.normalEnd },
    reasonableToolCount: {
      value: true,
      weight: SIGNAL_WEIGHTS.reasonableToolCount
    },
    healthyPacing: { value: true, weight: SIGNAL_WEIGHTS.healthyPacing }
  };

  // Check for tool failures
  const failures = toolUsages.filter((t) => t.success === false);
  const failureRate = failures.length / (toolUsages.length || 1);
  signals.noFailures!.value = failureRate < 0.2;
  signals.noFailures!.description =
    failureRate < 0.2
      ? "Low failure rate"
      : `${Math.round(failureRate * 100)}% failure rate`;

  // Check for commits
  signals.hasCommits!.value = (session.commits?.length || 0) > 0;
  signals.hasCommits!.description = signals.hasCommits!.value
    ? `${session.commits?.length} commit(s) made`
    : "No commits made";

  // Check for normal end
  if (session.endTime) {
    const lastActivityGap = session.endTime - session.lastActivity;
    signals.normalEnd!.value = lastActivityGap < 60000;
    signals.normalEnd!.description = signals.normalEnd!.value
      ? "Session ended normally"
      : "Session may have been abandoned";
  } else {
    signals.normalEnd!.value = true;
    signals.normalEnd!.description = "Session still active";
  }

  // Check tool count
  const toolCount = session.toolCount || toolUsages.length;
  signals.reasonableToolCount!.value = toolCount >= 3 && toolCount <= 500;
  signals.reasonableToolCount!.description = `${toolCount} tool calls`;

  // Check pacing
  const sessionDurationMs = session.endTime
    ? session.endTime - session.startTime
    : Date.now() - session.startTime;
  const sessionMinutes = Math.max(1, sessionDurationMs / 60000);
  const toolsPerMinute = toolCount / sessionMinutes;
  signals.healthyPacing!.value = toolsPerMinute >= 0.5 && toolsPerMinute <= 20;
  signals.healthyPacing!.description = `${toolsPerMinute.toFixed(1)} tools/min`;

  return signals;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Compute quality score for a session.
 */
export function computeQualityScore(
  session: HookSession,
  toolUsages: ToolUsage[],
  outcomes?: OutcomeSignalsEnrichment,
  loops?: LoopDetectionEnrichment
): QualityScoreEnrichment {
  // Compute dimension scores
  const dimensions: QualityDimensions = {
    completion: scoreCompletion(session, outcomes),
    codeQuality: scoreCodeQuality(outcomes),
    efficiency: scoreEfficiency(session, toolUsages, loops),
    safety: scoreSafety(toolUsages, outcomes)
  };

  // Compute weighted overall score
  let overall = 0;
  let totalWeight = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    overall += dimensions[dim as keyof QualityDimensions] * weight;
    totalWeight += weight;
  }
  overall = Math.round(overall / totalWeight);

  // Apply bonus/penalty from loops
  if (loops?.loopsDetected) {
    overall = Math.max(0, overall - 10);
  }

  // Determine classification
  let classification: QualityClassification;
  if (overall >= 80) {
    classification = "excellent";
  } else if (overall >= 60) {
    classification = "good";
  } else if (overall >= 40) {
    classification = "fair";
  } else if (overall > 0) {
    classification = "poor";
  } else {
    classification = "unknown";
  }

  // Compute heuristic signals
  const heuristicSignals = computeHeuristicSignals(session, toolUsages);

  return {
    overall,
    classification,
    dimensions,
    heuristicSignals,
    computedAt: new Date().toISOString()
  };
}

/**
 * Get color for quality classification.
 */
export function getQualityColor(classification: QualityClassification): string {
  switch (classification) {
    case "excellent":
      return "green";
    case "good":
      return "blue";
    case "fair":
      return "yellow";
    case "poor":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Get label for quality classification.
 */
export function getQualityLabel(classification: QualityClassification): string {
  switch (classification) {
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    default:
      return "Unknown";
  }
}

/**
 * Get summary description of quality score.
 */
export function describeQualityScore(score: QualityScoreEnrichment): string {
  const { overall, classification, dimensions } = score;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (dimensions.completion >= 70) {
    strengths.push("task completed");
  } else if (dimensions.completion < 40) {
    weaknesses.push("task may be incomplete");
  }

  if (dimensions.codeQuality >= 70) {
    strengths.push("good code quality");
  } else if (dimensions.codeQuality < 40) {
    weaknesses.push("code quality issues");
  }

  if (dimensions.efficiency >= 70) {
    strengths.push("efficient workflow");
  } else if (dimensions.efficiency < 40) {
    weaknesses.push("inefficient workflow");
  }

  if (dimensions.safety >= 70) {
    strengths.push("safe operations");
  } else if (dimensions.safety < 40) {
    weaknesses.push("safety concerns");
  }

  const parts: string[] = [
    `${getQualityLabel(classification)} (${overall}/100)`
  ];

  if (strengths.length > 0) {
    parts.push(`Strengths: ${strengths.join(", ")}`);
  }

  if (weaknesses.length > 0) {
    parts.push(`Areas to improve: ${weaknesses.join(", ")}`);
  }

  return parts.join(". ");
}
