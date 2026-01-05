/**
 * Session quality scoring.
 */

/**
 * Keywords that indicate higher-quality/more useful content.
 */
const QUALITY_KEYWORDS = [
  "error",
  "traceback",
  "stack",
  "diff",
  "patch",
  "git",
  "commit",
  "test",
  "pytest",
  "npm",
  "yarn",
  "pip",
  "stderr",
  "stdout",
  "tool call",
  "function",
  "stacktrace",
  "exception",
  "debug",
  "warning",
  "failed",
  "success",
  "build",
  "compile"
];

/**
 * Score text based on content quality indicators.
 *
 * Higher scores indicate more useful/interesting content for research.
 *
 * @param text - Text to score (typically a preview)
 * @returns Score from 0 to ~10
 */
export function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;

  // Keyword scoring
  for (const word of QUALITY_KEYWORDS) {
    if (lower.includes(word)) {
      score += 1.5;
    }
  }

  // Length heuristics
  const length = text.length;
  if (length > 400 && length < 8000) {
    // Sweet spot for useful content
    score += 2;
  }
  if (length > 8000) {
    // Very long might be noise
    score -= 1;
  }
  if (length < 120) {
    // Too short to be useful
    score -= 1;
  }

  // Ensure non-negative, round to 1 decimal
  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Score a session based on its data.
 */
export function scoreSession(data: unknown): number {
  let text = "";

  try {
    if (typeof data === "string") {
      text = data;
    } else {
      text = JSON.stringify(data);
    }
  } catch {
    text = String(data ?? "");
  }

  return scoreText(text);
}

/**
 * Rank sessions by score (highest first).
 */
export function rankSessions<T extends { score: number }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => b.score - a.score);
}

/**
 * Select top N sessions by score.
 */
export function selectTopSessions<T extends { score: number }>(
  sessions: T[],
  count: number
): T[] {
  return rankSessions(sessions).slice(0, count);
}
