/**
 * Local log discovery for AI coding agents.
 * Scans local filesystem for session transcripts from various agents.
 */

import { homedir } from "os";
import { basename, dirname, join } from "path";
import { readFile, readdir, stat } from "fs/promises";

export interface LocalTranscript {
  /** Unique ID for this transcript */
  id: string;
  /** Agent type (claude, codex, gemini, etc.) */
  agent: string;
  /** File path */
  path: string;
  /** Session/project name */
  name: string;
  /** Project directory this session was in */
  projectDir: string | null;
  /** File modification time */
  modifiedAt: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of messages (if parseable) */
  messageCount: number | null;
  /** First timestamp in the file */
  startTime: number | null;
  /** Last timestamp in the file */
  endTime: number | null;
}

export interface TranscriptMessage {
  uuid: string;
  parentUuid: string | null;
  type: string;
  subtype?: string;
  role?: string;
  content: string | { type: string; text?: string }[];
  timestamp: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
  /** True if this message is from a sub-agent sidechain (e.g., Task tool) */
  isSidechain?: boolean;
  /** Sub-agent ID if this is a sidechain message */
  agentId?: string;
}

export interface ParsedTranscript {
  id: string;
  agent: string;
  name: string;
  path: string;
  projectDir: string | null;
  messages: TranscriptMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

// Agent transcript locations - based on actual file structures
interface AgentConfig {
  base: string;
  extension: string;
  format: "jsonl" | "json";
  // Custom scanner for complex directory structures
  scanner?: "claude" | "codex" | "gemini";
}

const AGENT_PATHS: Record<string, AgentConfig> = {
  // Claude Code: ~/.claude/projects/<encoded-path>/<session>.jsonl
  claude: {
    base: ".claude/projects",
    extension: ".jsonl",
    format: "jsonl",
    scanner: "claude"
  },
  // Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
  codex: {
    base: ".codex/sessions",
    extension: ".jsonl",
    format: "jsonl",
    scanner: "codex"
  },
  // Gemini CLI: ~/.gemini/tmp/<hash>/chats/session-*.json
  gemini: {
    base: ".gemini/tmp",
    extension: ".json",
    format: "json",
    scanner: "gemini"
  }
  // OpenCode - uses SQLite database, not currently supported for scanning
  // opencode: {
  //   base: ".opencode",
  //   extension: ".db",
  //   format: "sqlite",  // Not supported
  // },
};

/**
 * Discover all local transcripts from supported agents.
 */
export async function discoverLocalTranscripts(
  agents?: string[]
): Promise<LocalTranscript[]> {
  const home = homedir();
  const results: LocalTranscript[] = [];
  const agentsToScan = agents || Object.keys(AGENT_PATHS);

  for (const agent of agentsToScan) {
    const config = AGENT_PATHS[agent];
    if (!config) continue;

    const basePath = join(home, config.base);

    try {
      let transcripts: LocalTranscript[] = [];

      switch (config.scanner) {
        case "claude":
          transcripts = await scanClaudeProjects(basePath, config);
          break;
        case "codex":
          transcripts = await scanCodexSessions(basePath, config);
          break;
        case "gemini":
          transcripts = await scanGeminiSessions(basePath, config);
          break;
        default:
          // Generic flat directory scan
          transcripts = await scanFlatDirectory(agent, basePath, config);
      }

      results.push(...transcripts);
    } catch (e) {
      // Directory doesn't exist or not readable - skip silently
      if (process.env.DEBUG) {
        console.log(`Skipping ${agent} logs at ${basePath}: ${e}`);
      }
    }
  }

  // Sort by modification time (newest first)
  results.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return results;
}

/**
 * Scan Claude projects: ~/.claude/projects/<encoded-path>/<session>.jsonl
 */
async function scanClaudeProjects(
  basePath: string,
  config: AgentConfig
): Promise<LocalTranscript[]> {
  const results: LocalTranscript[] = [];

  try {
    const projects = await readdir(basePath, { withFileTypes: true });

    for (const project of projects) {
      if (!project.isDirectory()) continue;

      const projectPath = join(basePath, project.name);
      const files = await readdir(projectPath, { withFileTypes: true });

      for (const file of files) {
        if (file.isFile() && file.name.endsWith(config.extension)) {
          const filePath = join(projectPath, file.name);
          const transcript = await parseTranscriptMeta(
            "claude",
            filePath,
            config.format
          );
          if (transcript) {
            results.push(transcript);
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return results;
}

/**
 * Scan Codex sessions: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */
async function scanCodexSessions(
  basePath: string,
  config: AgentConfig
): Promise<LocalTranscript[]> {
  const results: LocalTranscript[] = [];

  try {
    // Scan year directories
    const years = await readdir(basePath, { withFileTypes: true });

    for (const year of years) {
      if (!year.isDirectory()) continue;

      const yearPath = join(basePath, year.name);
      const months = await readdir(yearPath, { withFileTypes: true });

      for (const month of months) {
        if (!month.isDirectory()) continue;

        const monthPath = join(yearPath, month.name);
        const days = await readdir(monthPath, { withFileTypes: true });

        for (const day of days) {
          if (!day.isDirectory()) continue;

          const dayPath = join(monthPath, day.name);
          const files = await readdir(dayPath, { withFileTypes: true });

          for (const file of files) {
            if (file.isFile() && file.name.endsWith(config.extension)) {
              const filePath = join(dayPath, file.name);
              const transcript = await parseTranscriptMeta(
                "codex",
                filePath,
                config.format
              );
              if (transcript) {
                results.push(transcript);
              }
            }
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return results;
}

/**
 * Scan Gemini sessions: ~/.gemini/tmp/<hash>/chats/session-*.json
 */
async function scanGeminiSessions(
  basePath: string,
  config: AgentConfig
): Promise<LocalTranscript[]> {
  const results: LocalTranscript[] = [];

  try {
    // Scan project hash directories
    const hashes = await readdir(basePath, { withFileTypes: true });

    for (const hash of hashes) {
      if (!hash.isDirectory()) continue;

      const chatsPath = join(basePath, hash.name, "chats");

      try {
        const files = await readdir(chatsPath, { withFileTypes: true });

        for (const file of files) {
          if (file.isFile() && file.name.endsWith(config.extension)) {
            const filePath = join(chatsPath, file.name);
            const transcript = await parseTranscriptMeta(
              "gemini",
              filePath,
              config.format,
              hash.name
            );
            if (transcript) {
              results.push(transcript);
            }
          }
        }
      } catch {
        // chats directory doesn't exist - skip
      }
    }
  } catch {
    // Ignore read errors
  }

  return results;
}

/**
 * Generic flat directory scan for simple structures.
 */
async function scanFlatDirectory(
  agent: string,
  basePath: string,
  config: AgentConfig
): Promise<LocalTranscript[]> {
  const results: LocalTranscript[] = [];

  try {
    const entries = await readdir(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(config.extension)) {
        const filePath = join(basePath, entry.name);
        const transcript = await parseTranscriptMeta(
          agent,
          filePath,
          config.format
        );
        if (transcript) {
          results.push(transcript);
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return results;
}

/**
 * Parse basic metadata from a transcript file.
 * Uses streaming for JSONL to avoid loading large files into memory.
 */
async function parseTranscriptMeta(
  agent: string,
  filePath: string,
  format: "jsonl" | "json" = "jsonl",
  projectHash?: string
): Promise<LocalTranscript | null> {
  try {
    const stats = await stat(filePath);
    const ext = format === "jsonl" ? ".jsonl" : ".json";
    const fileName = basename(filePath, ext);

    let messageCount = 0;
    let startTime: number | null = null;
    let endTime: number | null = null;
    let name = fileName;
    let projectDir: string | null = null;

    if (format === "json") {
      // JSON files (Gemini) are typically small, read fully
      const content = await readFile(filePath, "utf-8");
      try {
        const data = JSON.parse(content);

        // Gemini stores messages in a messages array
        if (data.messages && Array.isArray(data.messages)) {
          messageCount = data.messages.length;

          // Extract timestamps
          for (const msg of data.messages) {
            if (msg.timestamp) {
              const ts = new Date(msg.timestamp).getTime();
              if (!startTime || ts < startTime) startTime = ts;
              if (!endTime || ts > endTime) endTime = ts;
            }
          }

          // Use first user message as name
          const firstUser = data.messages.find(
            (m: { type: string }) => m.type === "user"
          );
          if (firstUser?.content) {
            name = String(firstUser.content).slice(0, 50);
          }
        }

        // Gemini project hash as projectDir
        if (projectHash) {
          projectDir = `gemini:${projectHash.slice(0, 12)}`;
        }

        if (data.startTime) {
          startTime = new Date(data.startTime).getTime();
        }
        if (data.lastUpdated) {
          endTime = new Date(data.lastUpdated).getTime();
        }
      } catch {
        return null;
      }
    } else {
      // JSONL format (Claude, Codex) - stream to avoid memory issues
      // Extract project directory from Claude path format
      if (agent === "claude") {
        const parentDir = basename(dirname(filePath));
        // Claude encodes paths like -Users-alice-Documents-GitHub-project
        if (parentDir.startsWith("-")) {
          projectDir = parentDir.replace(/-/g, "/");
          name = basename(projectDir);
        }
      }

      // Extract project info for Codex from path (YYYY/MM/DD)
      if (agent === "codex") {
        // Path like: .codex/sessions/2025/12/22/rollout-...
        const parts = filePath.split("/");
        const sessionIdx = parts.indexOf("sessions");
        if (sessionIdx !== -1 && parts.length > sessionIdx + 3) {
          const year = parts[sessionIdx + 1];
          const month = parts[sessionIdx + 2];
          const day = parts[sessionIdx + 3];
          projectDir = `${year}-${month}-${day}`;
        }
        // Extract timestamp from filename: rollout-2025-12-22T10-27-28-<uuid>.jsonl
        const match = fileName.match(
          /rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/
        );
        if (match && match[1]) {
          name = match[1].replace(/-/g, ":").replace("T", " ");
        }
      }

      // Stream JSONL file to extract metadata without loading entire file
      // Read first ~64KB for start time/name, last ~64KB for end time
      const file = Bun.file(filePath);
      const fileSize = stats.size;
      const CHUNK_SIZE = 64 * 1024; // 64KB chunks

      // Read first chunk for start time and name
      const firstChunkSize = Math.min(CHUNK_SIZE, fileSize);
      const firstChunk = await file.slice(0, firstChunkSize).text();
      const firstLines = firstChunk.split("\n").filter((l) => l.trim());

      // Process first lines for start time and name
      for (const line of firstLines.slice(0, 50)) {
        try {
          const obj = JSON.parse(line);

          // Check for summary (Claude session name)
          if (obj.type === "summary" && obj.summary) {
            name = obj.summary.slice(0, 50);
            continue;
          }

          // Get timestamp
          const ts = obj.timestamp || obj.ts;
          if (ts) {
            const time =
              typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
            if (!startTime || time < startTime) startTime = time;
          }
        } catch {
          // Skip unparseable lines
        }
      }

      // Read last chunk for end time (if file is larger than one chunk)
      if (fileSize > CHUNK_SIZE) {
        const lastChunkStart = Math.max(0, fileSize - CHUNK_SIZE);
        const lastChunk = await file.slice(lastChunkStart, fileSize).text();
        // Skip first line which may be partial
        const lastLines = lastChunk
          .split("\n")
          .slice(1)
          .filter((l) => l.trim());

        // Process last lines for end time
        for (const line of lastLines.slice(-50)) {
          try {
            const obj = JSON.parse(line);

            // Check for summary in last lines too
            if (obj.type === "summary" && obj.summary) {
              name = obj.summary.slice(0, 50);
              continue;
            }

            const ts = obj.timestamp || obj.ts;
            if (ts) {
              const time =
                typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
              if (!endTime || time > endTime) endTime = time;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      } else {
        // Small file - use the lines we already have for end time
        for (const line of firstLines.slice(-50)) {
          try {
            const obj = JSON.parse(line);
            const ts = obj.timestamp || obj.ts;
            if (ts) {
              const time =
                typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
              if (!endTime || time > endTime) endTime = time;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Estimate message count from file size (rough approximation)
      // Average JSONL line is ~500-1000 bytes for Claude transcripts
      messageCount = Math.round(fileSize / 800);
    }

    // For Gemini, include project hash in ID to avoid collisions across projects
    const id =
      agent === "gemini" && projectHash
        ? `${agent}:${projectHash}:${fileName}`
        : `${agent}:${fileName}`;

    return {
      id,
      agent,
      path: filePath,
      name,
      projectDir,
      modifiedAt: stats.mtimeMs,
      sizeBytes: stats.size,
      messageCount: messageCount > 0 ? messageCount : null,
      startTime,
      endTime
    };
  } catch {
    return null;
  }
}

/**
 * Read and parse a full transcript file.
 */
export async function readTranscript(
  transcriptId: string
): Promise<ParsedTranscript | null> {
  // Find the transcript by ID
  const transcripts = await discoverLocalTranscripts();
  const meta = transcripts.find((t) => t.id === transcriptId);

  if (!meta) {
    return null;
  }

  return readTranscriptByPath(meta.agent, meta.path);
}

/**
 * Read a transcript by file path.
 */
export async function readTranscriptByPath(
  agent: string,
  filePath: string
): Promise<ParsedTranscript | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const config = AGENT_PATHS[agent];
    const format = config?.format || "jsonl";
    const ext = format === "jsonl" ? ".jsonl" : ".json";

    const messages: TranscriptMessage[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCostUsd = 0;
    let name = basename(filePath, ext);
    let projectDir: string | null = null;

    // For Gemini, extract project hash from path: ~/.gemini/tmp/<hash>/chats/session-*.json
    let projectHash: string | null = null;
    if (agent === "gemini") {
      const pathParts = filePath.split("/");
      const chatsIdx = pathParts.indexOf("chats");
      if (chatsIdx > 0) {
        const hash = pathParts[chatsIdx - 1];
        if (hash) {
          projectHash = hash;
          projectDir = `gemini:${hash.slice(0, 12)}`;
        }
      }
    }

    if (format === "json") {
      // Parse Gemini JSON format
      const data = JSON.parse(content);

      if (data.messages && Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          const transcriptMsg: TranscriptMessage = {
            uuid: msg.id || String(messages.length),
            parentUuid: null,
            type: msg.type === "gemini" ? "assistant" : msg.type,
            role:
              msg.type === "gemini"
                ? "assistant"
                : msg.type === "user"
                  ? "user"
                  : "system",
            content: msg.content || "",
            timestamp: msg.timestamp || new Date().toISOString()
          };

          // Gemini may have "thoughts" field
          if (msg.thoughts && Array.isArray(msg.thoughts)) {
            transcriptMsg.subtype = "thinking";
          }

          messages.push(transcriptMsg);
        }

        // Use first user message as name
        const firstUser = data.messages.find(
          (m: { type: string }) => m.type === "user"
        );
        if (firstUser?.content) {
          name = String(firstUser.content).slice(0, 100);
        }
      }

      // Gemini doesn't provide token counts in the file
    } else {
      // Parse JSONL format (Claude, Codex)
      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l.trim());

      // Extract project directory
      if (agent === "claude") {
        const parentDir = basename(dirname(filePath));
        if (parentDir.startsWith("-")) {
          projectDir = parentDir.replace(/-/g, "/");
        }
      }

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);

          if (obj.type === "summary") {
            if (obj.summary) {
              name = obj.summary.slice(0, 100);
            }
            continue;
          }

          // Codex format: { timestamp, type, payload } where payload contains message data
          // Claude format: message data at top level
          const isCodexFormat = obj.payload !== undefined;
          const payload = isCodexFormat ? obj.payload : obj;

          // Skip non-message types in Codex format
          if (isCodexFormat) {
            // Only process response_item with type "message"
            if (obj.type !== "response_item" || payload.type !== "message") {
              continue;
            }
          }

          // Parse message content
          // Claude: obj.content (string) or obj.message.content (array of {type, text/thinking})
          // Codex: payload.content (array of {type: "input_text"/"output_text", text: "..."})
          let rawContent = "";
          if (isCodexFormat && Array.isArray(payload.content)) {
            // Codex format: extract text from content array
            rawContent = (payload.content as { text?: string }[])
              .map((item) => item.text || "")
              .filter((t) => t)
              .join("\n");
          } else if (Array.isArray(obj.message?.content)) {
            // Claude assistant format: array of {type: "text"/"thinking", text/thinking: "..."}
            rawContent = (
              obj.message.content as {
                type: string;
                text?: string;
                thinking?: string;
              }[]
            )
              .map((item) => item.text || item.thinking || "")
              .filter((t) => t)
              .join("\n");
          } else {
            // String content (Claude user messages, system messages)
            rawContent =
              typeof payload.content === "string"
                ? payload.content
                : typeof obj.content === "string"
                  ? obj.content
                  : typeof obj.message?.content === "string"
                    ? obj.message.content
                    : "";
          }

          const msg: TranscriptMessage = {
            uuid:
              payload.uuid ||
              payload.id ||
              obj.uuid ||
              obj.id ||
              String(messages.length),
            parentUuid: payload.parentUuid || obj.parentUuid || null,
            type: isCodexFormat ? payload.type : obj.type || "unknown",
            subtype: payload.subtype || obj.subtype,
            role:
              payload.role ||
              obj.role ||
              obj.message?.role ||
              (obj.type === "user"
                ? "user"
                : obj.type === "assistant"
                  ? "assistant"
                  : undefined),
            content: rawContent,
            timestamp: obj.timestamp || new Date().toISOString(),
            // Track sidechain messages (sub-agent conversations)
            isSidechain:
              payload.isSidechain === true || obj.isSidechain === true,
            agentId: payload.agentId || obj.agentId
          };

          // Extract tool info
          const toolSource = isCodexFormat ? payload : obj;
          if (toolSource.toolName || toolSource.tool_name) {
            msg.toolName = toolSource.toolName || toolSource.tool_name;
            msg.toolInput =
              toolSource.toolInput || toolSource.tool_input || toolSource.input;
          }
          if (
            toolSource.toolResult !== undefined ||
            toolSource.tool_result !== undefined
          ) {
            msg.toolResult = toolSource.toolResult ?? toolSource.tool_result;
          }

          // Extract token usage
          const usageSource = isCodexFormat
            ? payload.usage
            : obj.message?.usage;
          if (usageSource) {
            msg.inputTokens = usageSource.input_tokens;
            msg.outputTokens = usageSource.output_tokens;
            msg.cacheCreationTokens = usageSource.cache_creation_input_tokens;
            msg.cacheReadTokens = usageSource.cache_read_input_tokens;
            totalInputTokens += msg.inputTokens || 0;
            totalOutputTokens += msg.outputTokens || 0;
          }

          // Extract model
          if (payload.model || obj.model || obj.message?.model) {
            msg.model = payload.model || obj.model || obj.message?.model;
          }

          messages.push(msg);
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // CAVEAT: Cost is a rough ESTIMATE only, not actual billing.
    // Uses hardcoded pricing which may be outdated.
    // Does not account for model variants, caching, or API discounts.
    if (agent === "claude") {
      // Claude Sonnet pricing estimate: $3/M input, $15/M output
      estimatedCostUsd =
        (totalInputTokens / 1_000_000) * 3 +
        (totalOutputTokens / 1_000_000) * 15;
    } else if (agent === "codex") {
      // GPT-4o pricing estimate: $2.50/M input, $10/M output
      estimatedCostUsd =
        (totalInputTokens / 1_000_000) * 2.5 +
        (totalOutputTokens / 1_000_000) * 10;
    } else if (agent === "gemini") {
      // Gemini 2.0 Flash pricing estimate: $0.10/M input, $0.40/M output
      estimatedCostUsd =
        (totalInputTokens / 1_000_000) * 0.1 +
        (totalOutputTokens / 1_000_000) * 0.4;
    }

    // For Gemini, include project hash in ID to avoid collisions across projects
    const id =
      agent === "gemini" && projectHash
        ? `${agent}:${projectHash}:${basename(filePath, ext)}`
        : `${agent}:${basename(filePath, ext)}`;

    return {
      id,
      agent,
      name,
      path: filePath,
      projectDir,
      messages,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUsd
    };
  } catch {
    return null;
  }
}

/**
 * Format transcript messages for display.
 */
export function formatTranscriptForDisplay(transcript: ParsedTranscript): {
  role: string;
  content: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  isSidechain?: boolean;
  agentId?: string;
  /** Original message type from transcript (user, assistant, tool_use, tool_result, etc.) */
  messageType?: string;
  /** Whether this message contains thinking content */
  hasThinking?: boolean;
  /** Tool name if this is a tool_use message */
  toolName?: string;
  /** Tool input if this is a tool_use message */
  toolInput?: Record<string, unknown>;
}[] {
  const formatted: {
    role: string;
    content: string;
    timestamp: string;
    meta?: Record<string, unknown>;
    isSidechain?: boolean;
    agentId?: string;
    messageType?: string;
    hasThinking?: boolean;
    toolName?: string;
    toolInput?: Record<string, unknown>;
  }[] = [];

  for (const msg of transcript.messages) {
    let role = "system";
    let content = "";
    let hasThinking = false;

    // Determine role
    if (msg.type === "user" || msg.role === "user") {
      role = "user";
    } else if (msg.type === "assistant" || msg.role === "assistant") {
      role = "assistant";
    } else if (msg.type === "tool_use" || msg.toolName) {
      role = "tool";
    } else if (msg.type === "tool_result") {
      role = "tool_result";
    }

    // Extract content and detect thinking blocks
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const c of msg.content) {
        if (typeof c === "string") {
          parts.push(c);
        } else if (c.type === "thinking") {
          hasThinking = true;
          // Include thinking content if present
          if ("thinking" in c && typeof c.thinking === "string") {
            parts.push(`[Thinking]\n${c.thinking}`);
          }
        } else if (c.text) {
          parts.push(c.text);
        } else {
          parts.push(JSON.stringify(c));
        }
      }
      content = parts.join("\n");
    }

    // Add tool info
    if (msg.toolName) {
      content = `[Tool: ${msg.toolName}]\n${content}`;
    }

    if (content.trim()) {
      formatted.push({
        role,
        content,
        timestamp: msg.timestamp,
        meta: {
          inputTokens: msg.inputTokens,
          outputTokens: msg.outputTokens,
          model: msg.model
        },
        isSidechain: msg.isSidechain,
        agentId: msg.agentId,
        messageType: msg.type,
        hasThinking,
        toolName: msg.toolName,
        toolInput: msg.toolInput
      });
    }
  }

  return formatted;
}
