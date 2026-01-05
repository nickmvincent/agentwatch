/**
 * Type definitions for transcript parsing.
 */

/** Supported AI coding agents */
export type AgentType = "claude" | "codex" | "gemini";

/** Transcript file format */
export type TranscriptFormat = "jsonl" | "json";

/** Agent configuration for discovery */
export interface AgentConfig {
  /** Base path relative to home directory */
  base: string;
  /** File extension */
  extension: string;
  /** File format */
  format: TranscriptFormat;
}

/** Default agent configurations */
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  // Claude Code: ~/.claude/projects/<encoded-path>/<session>.jsonl
  claude: {
    base: ".claude/projects",
    extension: ".jsonl",
    format: "jsonl"
  },
  // Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
  codex: {
    base: ".codex/sessions",
    extension: ".jsonl",
    format: "jsonl"
  },
  // Gemini CLI: ~/.gemini/tmp/<hash>/chats/session-*.json
  gemini: {
    base: ".gemini/tmp",
    extension: ".json",
    format: "json"
  }
};

/** Transcript metadata (from discovery, without full content) */
export interface TranscriptMeta {
  /** Unique ID for this transcript */
  id: string;
  /** Agent type */
  agent: AgentType;
  /** File path */
  path: string;
  /** Session/project name */
  name: string;
  /** Project directory this session was in */
  projectDir: string | null;
  /** File modification time (ms since epoch) */
  modifiedAt: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of messages (estimated for JSONL) */
  messageCount: number | null;
  /** First timestamp in the file (ms since epoch) */
  startTime: number | null;
  /** Last timestamp in the file (ms since epoch) */
  endTime: number | null;
}

/** A single message in a transcript */
export interface TranscriptMessage {
  /** Unique message ID */
  uuid: string;
  /** Parent message ID (for threading) */
  parentUuid: string | null;
  /** Message type (user, assistant, tool_use, tool_result, etc.) */
  type: string;
  /** Message subtype (e.g., thinking) */
  subtype?: string;
  /** Message role */
  role?: "user" | "assistant" | "system" | "tool";
  /** Message content (string or structured) */
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** Tool name if this is a tool invocation */
  toolName?: string;
  /** Tool input parameters */
  toolInput?: Record<string, unknown>;
  /** Tool result */
  toolResult?: unknown;
  /** Model used for this response */
  model?: string;
  /** Input tokens for this message */
  inputTokens?: number;
  /** Output tokens for this message */
  outputTokens?: number;
  /** Cache creation tokens */
  cacheCreationTokens?: number;
  /** Cache read tokens */
  cacheReadTokens?: number;
  /** Cost in USD (if calculated) */
  costUsd?: number;
  /** True if this message is from a sub-agent sidechain */
  isSidechain?: boolean;
  /** Sub-agent ID if this is a sidechain message */
  agentId?: string;
}

/** Fully parsed transcript with all messages */
export interface ParsedTranscript {
  /** Unique ID */
  id: string;
  /** Agent type */
  agent: AgentType;
  /** Session name */
  name: string;
  /** File path */
  path: string;
  /** Project directory */
  projectDir: string | null;
  /** All messages */
  messages: TranscriptMessage[];
  /** Total input tokens across all messages */
  totalInputTokens: number;
  /** Total output tokens across all messages */
  totalOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
}

/** Token usage summary */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/** Options for transcript discovery */
export interface DiscoveryOptions {
  /** Agents to scan (default: all) */
  agents?: AgentType[];
  /** Custom home directory (default: os.homedir()) */
  homeDir?: string;
  /** Maximum number of transcripts to return */
  limit?: number;
  /** Filter by modification time (ms since epoch) */
  modifiedAfter?: number;
}

/** Formatted message for display */
export interface DisplayMessage {
  role: "user" | "assistant" | "system" | "tool" | "tool_result";
  content: string;
  timestamp: string;
  meta?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
  };
  isSidechain?: boolean;
  agentId?: string;
  messageType?: string;
  hasThinking?: boolean;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/** Formatted transcript for display */
export interface DisplayTranscript {
  id: string;
  agent: AgentType;
  name: string;
  path: string;
  projectDir: string | null;
  messages: DisplayMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}
