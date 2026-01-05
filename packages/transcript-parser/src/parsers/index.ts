/**
 * Transcript parser orchestrator.
 */

import type { AgentType, ParsedTranscript } from "../types";
import { detectAgent } from "../discovery";
import { parseClaudeTranscript } from "./claude";
import { parseCodexTranscript } from "./codex";
import { parseGeminiTranscript } from "./gemini";

export { parseClaudeTranscript } from "./claude";
export { parseCodexTranscript } from "./codex";
export { parseGeminiTranscript } from "./gemini";

/**
 * Parse a transcript file.
 * Auto-detects agent from path if not specified.
 */
export async function parseTranscript(
  filePath: string,
  agent?: AgentType
): Promise<ParsedTranscript | null> {
  const detectedAgent = agent || detectAgent(filePath);

  if (!detectedAgent) {
    throw new Error(
      `Could not detect agent type for: ${filePath}. ` +
        `Please specify agent type explicitly.`
    );
  }

  switch (detectedAgent) {
    case "claude":
      return parseClaudeTranscript(filePath);
    case "codex":
      return parseCodexTranscript(filePath);
    case "gemini":
      return parseGeminiTranscript(filePath);
    default:
      throw new Error(`Unknown agent: ${detectedAgent}`);
  }
}

/**
 * Parse a transcript by ID.
 * ID format: agent:filename or agent:hash:filename
 */
export function parseTranscriptId(id: string): {
  agent: AgentType;
  fileName: string;
  hash?: string;
} {
  const parts = id.split(":");

  if (parts.length < 2) {
    throw new Error(`Invalid transcript ID: ${id}`);
  }

  const agent = parts[0] as AgentType;

  if (!["claude", "codex", "gemini"].includes(agent)) {
    throw new Error(`Unknown agent in ID: ${agent}`);
  }

  if (parts.length === 3) {
    // gemini:hash:filename
    return { agent, hash: parts[1], fileName: parts[2] };
  }

  // agent:filename
  return { agent, fileName: parts.slice(1).join(":") };
}
