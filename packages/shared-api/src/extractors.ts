/**
 * Helper functions to extract information from tool responses.
 */

/**
 * Extract a git commit hash from a tool response.
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
