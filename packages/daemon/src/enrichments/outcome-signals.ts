/**
 * Outcome signal extraction from tool responses.
 *
 * Parses bash command outputs to detect test results, lint status,
 * build success, and exit codes.
 */

import type {
  BuildStatus,
  ExitCodeSummary,
  GitOutcomes,
  LintResults,
  OutcomeSignalsEnrichment,
  TestResults,
  ToolUsage
} from "@agentwatch/core";

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

/**
 * Patterns to detect test commands.
 */
const TEST_COMMAND_PATTERNS = [
  /\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b/i,
  /\bpytest\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bcargo\s+test\b/i,
  /\bgo\s+test\b/i,
  /\bmocha\b/i,
  /\bplaywright\b/i,
  /\bcypress\b/i
];

/**
 * Patterns to detect test results in output.
 */
const TEST_RESULT_PATTERNS = {
  // Jest/Vitest format: "Tests: X passed, Y failed"
  jestSummary:
    /Tests:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?/i,
  // Jest/Vitest format: "X passed, Y failed"
  jestSimple: /(\d+)\s*passed(?:,\s*(\d+)\s*failed)?/i,
  // Pytest format: "X passed, Y failed, Z skipped"
  pytest: /(\d+)\s*passed(?:,?\s*(\d+)\s*failed)?(?:,?\s*(\d+)\s*skipped)?/i,
  // Go test format: "ok" or "FAIL"
  goTest: /^(ok|FAIL)\s+/m,
  // Cargo test format: "test result: ok. X passed; Y failed"
  cargoTest: /test result:\s*(ok|FAILED)\.\s*(\d+)\s*passed;\s*(\d+)\s*failed/i,
  // Generic failure indicators
  failures: /\b(FAIL|FAILED|ERROR|FAILING)\b/i,
  // Generic success indicators
  success: /\b(PASS|PASSED|OK|SUCCESS)\b/i
};

/**
 * Patterns to detect lint commands.
 */
const LINT_COMMAND_PATTERNS = [
  /\b(npm|yarn|pnpm|bun)\s+(run\s+)?lint\b/i,
  /\beslint\b/i,
  /\bprettier\b/i,
  /\bbiome\b/i,
  /\bruff\b/i,
  /\bgolangci-lint\b/i,
  /\bpylint\b/i,
  /\bmypy\b/i,
  /\bflake8\b/i
];

/**
 * Patterns to detect lint results.
 */
const LINT_RESULT_PATTERNS = {
  // ESLint format: "X problems (Y errors, Z warnings)"
  eslint: /(\d+)\s*problems?\s*\((\d+)\s*errors?,\s*(\d+)\s*warnings?\)/i,
  // Generic error/warning counts
  errors: /(\d+)\s*errors?/i,
  warnings: /(\d+)\s*warnings?/i,
  // Fixed counts
  fixed: /(\d+)\s*(?:files?\s*)?(?:auto[-\s]?)?fixed/i
};

/**
 * Patterns to detect build commands.
 */
const BUILD_COMMAND_PATTERNS = [
  /\b(npm|yarn|pnpm|bun)\s+(run\s+)?build\b/i,
  /\btsc\b/i,
  /\bcargo\s+build\b/i,
  /\bgo\s+build\b/i,
  /\bmake\b/i,
  /\bgradlew?\s+build\b/i,
  /\bmaven\b/i,
  /\bmvn\b/i
];

/**
 * Patterns to detect git operations.
 */
const GIT_PATTERNS = {
  commit: /\bgit\s+commit\b/i,
  push: /\bgit\s+push\b/i,
  mergeConflict: /CONFLICT|merge conflict|Automatic merge failed/i,
  rebase: /\bgit\s+rebase\b/i,
  stash: /\bgit\s+stash\b/i
};

// =============================================================================
// EXTRACTION LOGIC
// =============================================================================

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Extract test results from bash tool usages.
 */
function extractTestResults(toolUsages: ToolUsage[]): TestResults | undefined {
  let results: TestResults | undefined;
  let lastTestRun: ToolUsage | undefined;

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    if (!matchesAnyPattern(command, TEST_COMMAND_PATTERNS)) continue;

    lastTestRun = usage;
    const response = usage.toolResponse as Record<string, unknown> | undefined;
    const stdout = String(response?.stdout || "");
    const stderr = String(response?.stderr || "");
    const output = stdout + "\n" + stderr;

    // Initialize results
    results = {
      ran: true,
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDurationMs: usage.durationMs || 0,
      lastRunAt: new Date(usage.timestamp).toISOString(),
      testCommand: command.slice(0, 100)
    };

    // Try to parse specific formats
    let match: RegExpMatchArray | null;

    // Jest/Vitest summary format
    match = output.match(TEST_RESULT_PATTERNS.jestSummary);
    if (match) {
      results.passed = Number.parseInt(match[1] ?? "0", 10) || 0;
      results.failed = Number.parseInt(match[2] ?? "0", 10) || 0;
      results.skipped = Number.parseInt(match[3] ?? "0", 10) || 0;
      continue;
    }

    // Cargo test format
    match = output.match(TEST_RESULT_PATTERNS.cargoTest);
    if (match) {
      results.passed = Number.parseInt(match[2] ?? "0", 10) || 0;
      results.failed = Number.parseInt(match[3] ?? "0", 10) || 0;
      continue;
    }

    // Simple passed/failed count
    match = output.match(TEST_RESULT_PATTERNS.pytest);
    if (match) {
      results.passed = Number.parseInt(match[1] ?? "0", 10) || 0;
      results.failed = Number.parseInt(match[2] ?? "0", 10) || 0;
      results.skipped = Number.parseInt(match[3] ?? "0", 10) || 0;
      continue;
    }

    // Fallback: check for failure indicators
    if (TEST_RESULT_PATTERNS.failures.test(output)) {
      results.failed = 1; // At least one failure
    } else if (usage.success) {
      results.passed = 1; // Assume at least one passed if command succeeded
    }
  }

  return results;
}

/**
 * Extract lint results from bash tool usages.
 */
function extractLintResults(toolUsages: ToolUsage[]): LintResults | undefined {
  let results: LintResults | undefined;

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    if (!matchesAnyPattern(command, LINT_COMMAND_PATTERNS)) continue;

    const response = usage.toolResponse as Record<string, unknown> | undefined;
    const stdout = String(response?.stdout || "");
    const stderr = String(response?.stderr || "");
    const output = stdout + "\n" + stderr;

    results = {
      ran: true,
      errors: 0,
      warnings: 0,
      autoFixed: 0,
      linter: detectLinter(command)
    };

    // ESLint format
    let match = output.match(LINT_RESULT_PATTERNS.eslint);
    if (match) {
      results.errors = Number.parseInt(match[2] ?? "0", 10) || 0;
      results.warnings = Number.parseInt(match[3] ?? "0", 10) || 0;
      continue;
    }

    // Generic error/warning counts
    match = output.match(LINT_RESULT_PATTERNS.errors);
    if (match) {
      results.errors = Number.parseInt(match[1] ?? "0", 10) || 0;
    }

    match = output.match(LINT_RESULT_PATTERNS.warnings);
    if (match) {
      results.warnings = Number.parseInt(match[1] ?? "0", 10) || 0;
    }

    match = output.match(LINT_RESULT_PATTERNS.fixed);
    if (match) {
      results.autoFixed = Number.parseInt(match[1] ?? "0", 10) || 0;
    }

    // If command succeeded with no errors/warnings, it's clean
    if (usage.success && results.errors === 0 && results.warnings === 0) {
      // Leave as clean
    }
  }

  return results;
}

function detectLinter(command: string): string | undefined {
  if (/eslint/i.test(command)) return "eslint";
  if (/prettier/i.test(command)) return "prettier";
  if (/biome/i.test(command)) return "biome";
  if (/ruff/i.test(command)) return "ruff";
  if (/pylint/i.test(command)) return "pylint";
  if (/mypy/i.test(command)) return "mypy";
  if (/golangci-lint/i.test(command)) return "golangci-lint";
  return undefined;
}

/**
 * Extract build status from bash tool usages.
 */
function extractBuildStatus(toolUsages: ToolUsage[]): BuildStatus | undefined {
  let results: BuildStatus | undefined;

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    if (!matchesAnyPattern(command, BUILD_COMMAND_PATTERNS)) continue;

    results = {
      ran: true,
      success: usage.success === true,
      durationMs: usage.durationMs || 0,
      buildTool: detectBuildTool(command)
    };
  }

  return results;
}

function detectBuildTool(command: string): string | undefined {
  if (/tsc/i.test(command)) return "tsc";
  if (/cargo\s+build/i.test(command)) return "cargo";
  if (/go\s+build/i.test(command)) return "go";
  if (/make/i.test(command)) return "make";
  if (/(npm|yarn|pnpm|bun)\s+(run\s+)?build/i.test(command))
    return "npm-script";
  return undefined;
}

/**
 * Extract exit code summary from all bash commands.
 */
function extractExitCodes(toolUsages: ToolUsage[]): ExitCodeSummary {
  let successCount = 0;
  let failureCount = 0;
  let lastFailure: ExitCodeSummary["lastFailure"] | undefined;

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    if (usage.success === true) {
      successCount++;
    } else if (usage.success === false) {
      failureCount++;
      const command = (usage.toolInput?.command as string) || "";
      const response = usage.toolResponse as
        | Record<string, unknown>
        | undefined;
      const exitCode = (response?.exitCode as number) || 1;

      lastFailure = {
        code: exitCode,
        command: command.slice(0, 100),
        timestamp: usage.timestamp
      };
    }
  }

  return {
    successCount,
    failureCount,
    lastFailure
  };
}

/**
 * Extract git operation outcomes.
 */
function extractGitOutcomes(toolUsages: ToolUsage[]): GitOutcomes | undefined {
  let hasGitOps = false;
  const outcomes: GitOutcomes = {
    commitsCreated: 0,
    commitsPushed: 0,
    mergeConflicts: false,
    rebaseAttempts: 0,
    stashOperations: 0
  };

  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    const response = usage.toolResponse as Record<string, unknown> | undefined;
    const stdout = String(response?.stdout || "");
    const stderr = String(response?.stderr || "");
    const output = stdout + "\n" + stderr;

    if (GIT_PATTERNS.commit.test(command) && usage.success) {
      hasGitOps = true;
      outcomes.commitsCreated++;
    }

    if (GIT_PATTERNS.push.test(command) && usage.success) {
      hasGitOps = true;
      outcomes.commitsPushed++;
    }

    if (GIT_PATTERNS.mergeConflict.test(output)) {
      hasGitOps = true;
      outcomes.mergeConflicts = true;
    }

    if (GIT_PATTERNS.rebase.test(command)) {
      hasGitOps = true;
      outcomes.rebaseAttempts++;
    }

    if (GIT_PATTERNS.stash.test(command)) {
      hasGitOps = true;
      outcomes.stashOperations++;
    }
  }

  return hasGitOps ? outcomes : undefined;
}

/**
 * Calculate time to green (first successful test after session start).
 */
function calculateTimeToGreen(
  toolUsages: ToolUsage[],
  sessionStartTime: number
): number | undefined {
  for (const usage of toolUsages) {
    if (usage.toolName !== "Bash") continue;

    const command = (usage.toolInput?.command as string) || "";
    if (!matchesAnyPattern(command, TEST_COMMAND_PATTERNS)) continue;

    if (usage.success === true) {
      // Check if output indicates actual test success (not just command success)
      const response = usage.toolResponse as
        | Record<string, unknown>
        | undefined;
      const stdout = String(response?.stdout || "");

      // If no failure patterns and command succeeded, count as green
      if (!TEST_RESULT_PATTERNS.failures.test(stdout)) {
        return usage.timestamp - sessionStartTime;
      }
    }
  }

  return undefined;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract outcome signals from a session's tool usages.
 */
export function extractOutcomeSignals(
  toolUsages: ToolUsage[],
  sessionStartTime: number
): OutcomeSignalsEnrichment {
  return {
    testResults: extractTestResults(toolUsages),
    lintResults: extractLintResults(toolUsages),
    buildStatus: extractBuildStatus(toolUsages),
    exitCodes: extractExitCodes(toolUsages),
    timeToGreenMs: calculateTimeToGreen(toolUsages, sessionStartTime),
    gitOutcomes: extractGitOutcomes(toolUsages),
    computedAt: new Date().toISOString()
  };
}

/**
 * Check if outcome signals indicate overall success.
 */
export function isSuccessfulOutcome(
  signals: OutcomeSignalsEnrichment
): boolean {
  // If tests ran, they should pass
  if (signals.testResults?.ran && signals.testResults.failed > 0) {
    return false;
  }

  // If lint ran, should have no errors
  if (signals.lintResults?.ran && signals.lintResults.errors > 0) {
    return false;
  }

  // If build ran, should succeed
  if (signals.buildStatus?.ran && !signals.buildStatus.success) {
    return false;
  }

  // More successes than failures in bash commands
  const exitRatio =
    signals.exitCodes.successCount /
    (signals.exitCodes.successCount + signals.exitCodes.failureCount + 1);

  return exitRatio > 0.7;
}
