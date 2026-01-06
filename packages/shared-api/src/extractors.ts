/**
 * Helper functions to extract structured information from tool responses.
 *
 * These extractors parse unstructured output from git and other CLI tools
 * to identify commits, messages, and other meaningful data.
 *
 * @module
 */

/**
 * Extract a git commit hash from a tool response.
 *
 * Handles multiple git output formats:
 * - `[branch hash] message` - short format from `git commit`
 * - `hash ...` - raw hash at start of line
 * - `commit <hash>` - full format from `git log`
 *
 * @param toolResponse - The tool response (string, stdout object, or other)
 * @returns The commit hash if found, null otherwise
 *
 * @example
 * ```typescript
 * const hash = extractCommitHash(toolResponse);
 * if (hash) {
 *   hookStore.recordCommit(sessionId, hash, message, cwd);
 * }
 * ```
 */
export function extractCommitHash(toolResponse: unknown): string | null {
  let output = "";

  if (typeof toolResponse === "object" && toolResponse !== null) {
    const resp = toolResponse as Record<string, unknown>;
    output = String(
      resp.stdout ?? resp.content ?? JSON.stringify(toolResponse)
    );
  } else if (typeof toolResponse === "string") {
    output = toolResponse;
  }

  // Look for commit hash patterns
  const patterns = [
    /\[[\w/-]+\s+([a-f0-9]{7,40})\]/, // [branch hash] format
    /^([a-f0-9]{7,40})\s/m, // hash at start of line
    /commit\s+([a-f0-9]{40})/ // full commit hash
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(output);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract a commit message from a tool response.
 *
 * Parses the `[branch hash] message` format typically output by `git commit`.
 * Truncates long messages to 200 characters.
 *
 * @param toolResponse - The tool response (string, stdout object, or other)
 * @returns The commit message if found, empty string otherwise
 */
export function extractCommitMessage(toolResponse: unknown): string {
  let output = "";

  if (typeof toolResponse === "object" && toolResponse !== null) {
    const resp = toolResponse as Record<string, unknown>;
    output = String(
      resp.stdout ?? resp.content ?? JSON.stringify(toolResponse)
    );
  } else if (typeof toolResponse === "string") {
    output = toolResponse;
  }

  const match = /\[[^\]]+\]\s+(.+?)(?:\n|$)/.exec(output);
  if (match && match[1]) {
    return match[1].trim().slice(0, 200);
  }

  return "";
}
