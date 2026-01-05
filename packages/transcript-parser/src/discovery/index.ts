/**
 * Transcript discovery orchestrator.
 * Scans local filesystem for AI coding assistant transcripts.
 */

import { homedir } from "os";
import { join } from "path";
import type {
  AgentType,
  TranscriptMeta,
  DiscoveryOptions,
  AGENT_CONFIGS
} from "../types";
import { AGENT_CONFIGS as configs } from "../types";
import { scanClaudeTranscripts } from "./claude";
import { scanCodexTranscripts } from "./codex";
import { scanGeminiTranscripts } from "./gemini";

export { scanClaudeTranscripts } from "./claude";
export { scanCodexTranscripts } from "./codex";
export { scanGeminiTranscripts } from "./gemini";

/**
 * Discover all local transcripts from supported agents.
 */
export async function discoverTranscripts(
  options: DiscoveryOptions = {}
): Promise<TranscriptMeta[]> {
  const home = options.homeDir || homedir();
  const agentsToScan = options.agents || (Object.keys(configs) as AgentType[]);

  const results: TranscriptMeta[] = [];

  for (const agent of agentsToScan) {
    const config = configs[agent];
    if (!config) continue;

    const basePath = join(home, config.base);

    try {
      let transcripts: TranscriptMeta[] = [];

      switch (agent) {
        case "claude":
          transcripts = await scanClaudeTranscripts(basePath, config);
          break;
        case "codex":
          transcripts = await scanCodexTranscripts(basePath, config);
          break;
        case "gemini":
          transcripts = await scanGeminiTranscripts(basePath, config);
          break;
      }

      // Apply filters
      if (options.modifiedAfter) {
        transcripts = transcripts.filter(
          (t) => t.modifiedAt >= options.modifiedAfter!
        );
      }

      results.push(...transcripts);
    } catch (e) {
      if (process.env.DEBUG) {
        console.error(`Skipping ${agent} at ${basePath}:`, e);
      }
    }
  }

  // Sort by modification time (newest first)
  results.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // Apply limit
  if (options.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}

/**
 * Scan a specific agent for transcripts.
 */
export async function scanAgent(
  agent: AgentType,
  basePath?: string
): Promise<TranscriptMeta[]> {
  const config = configs[agent];
  if (!config) {
    throw new Error(`Unknown agent: ${agent}`);
  }

  const path = basePath || join(homedir(), config.base);

  switch (agent) {
    case "claude":
      return scanClaudeTranscripts(path, config);
    case "codex":
      return scanCodexTranscripts(path, config);
    case "gemini":
      return scanGeminiTranscripts(path, config);
    default:
      return [];
  }
}

/**
 * Detect agent type from file path.
 */
export function detectAgent(path: string): AgentType | null {
  if (path.includes(".claude/")) return "claude";
  if (path.includes(".codex/")) return "codex";
  if (path.includes(".gemini/")) return "gemini";
  return null;
}
