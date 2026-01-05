/**
 * @agentwatch/transcript-parser
 *
 * Standalone transcript parser for AI coding assistants.
 * Supports Claude, Codex, and Gemini transcript formats.
 *
 * @example
 * ```typescript
 * import { discoverTranscripts, parseTranscript } from '@agentwatch/transcript-parser';
 *
 * // Discover all transcripts
 * const transcripts = await discoverTranscripts();
 *
 * // Parse a specific transcript
 * const parsed = await parseTranscript('/path/to/transcript.jsonl');
 * ```
 */

// Types
export type {
  AgentType,
  TranscriptFormat,
  AgentConfig,
  TranscriptMeta,
  TranscriptMessage,
  ParsedTranscript,
  TokenUsage,
  DiscoveryOptions,
  DisplayMessage,
  DisplayTranscript
} from "./types";

export { AGENT_CONFIGS } from "./types";

// Discovery
export {
  discoverTranscripts,
  scanAgent,
  detectAgent,
  scanClaudeTranscripts,
  scanCodexTranscripts,
  scanGeminiTranscripts
} from "./discovery";

// Parsers
export {
  parseTranscript,
  parseTranscriptId,
  parseClaudeTranscript,
  parseCodexTranscript,
  parseGeminiTranscript
} from "./parsers";

// Cost
export { estimateCost, formatCost, formatTokens, getPricing } from "./cost";

// Format
export { formatForDisplay, getSummary } from "./format";
