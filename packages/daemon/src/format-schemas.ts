/**
 * Data dictionaries for all supported agent log formats.
 * These schemas document the expected structure of transcript files
 * from different AI coding assistants.
 */

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
  children?: FieldDefinition[];
}

export interface FormatSchema {
  agent: string;
  displayName: string;
  description: string;
  fileFormat: "jsonl" | "json";
  fileExtension: string;
  fileLocation: string;
  filePattern: string;
  messageTypes: {
    name: string;
    description: string;
    fields: FieldDefinition[];
  }[];
  notes: string[];
  sampleEntry?: string;
}

export const FORMAT_SCHEMAS: FormatSchema[] = [
  {
    agent: "claude",
    displayName: "Claude Code",
    description:
      "Anthropic's Claude Code CLI stores session transcripts as JSONL files with one entry per message or event.",
    fileFormat: "jsonl",
    fileExtension: ".jsonl",
    fileLocation: "~/.claude/projects/<encoded-path>/",
    filePattern: "<session-uuid>.jsonl",
    messageTypes: [
      {
        name: "summary",
        description:
          "Session summary entry (appears at top of file, may appear multiple times as context updates)",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'summary'",
            example: "summary"
          },
          {
            name: "summary",
            type: "string",
            required: true,
            description: "Brief session description",
            example: "Implement user auth feature"
          },
          {
            name: "leafUuid",
            type: "string",
            required: false,
            description: "UUID of the last message in session"
          }
        ]
      },
      {
        name: "user",
        description: "User message entry",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'user'",
            example: "user"
          },
          {
            name: "uuid",
            type: "string",
            required: true,
            description: "Unique message identifier"
          },
          {
            name: "parentUuid",
            type: "string|null",
            required: true,
            description: "Parent message UUID for threading"
          },
          {
            name: "sessionId",
            type: "string",
            required: true,
            description: "Session identifier"
          },
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp",
            example: "2025-01-15T10:30:00.000Z"
          },
          {
            name: "cwd",
            type: "string",
            required: true,
            description: "Current working directory"
          },
          {
            name: "version",
            type: "string",
            required: false,
            description: "Claude Code version",
            example: "1.0.45"
          },
          {
            name: "userType",
            type: "string",
            required: false,
            description: "Type of user input",
            example: "external"
          },
          {
            name: "isSidechain",
            type: "boolean",
            required: false,
            description: "Whether this is a sidechain conversation"
          },
          {
            name: "message",
            type: "object",
            required: true,
            description: "Message content wrapper",
            children: [
              {
                name: "role",
                type: "string",
                required: true,
                description: "Always 'user'",
                example: "user"
              },
              {
                name: "content",
                type: "string|array",
                required: true,
                description: "User's message text or content blocks"
              }
            ]
          }
        ]
      },
      {
        name: "assistant",
        description: "Assistant response entry",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'assistant'",
            example: "assistant"
          },
          {
            name: "uuid",
            type: "string",
            required: true,
            description: "Unique message identifier"
          },
          {
            name: "parentUuid",
            type: "string",
            required: true,
            description: "Parent message UUID"
          },
          {
            name: "sessionId",
            type: "string",
            required: true,
            description: "Session identifier"
          },
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp"
          },
          {
            name: "isSidechain",
            type: "boolean",
            required: false,
            description: "Whether this is a sidechain conversation"
          },
          {
            name: "requestId",
            type: "string",
            required: false,
            description: "API request identifier",
            example: "req_01ABC..."
          },
          {
            name: "signature",
            type: "string",
            required: false,
            description: "Response signature for verification"
          },
          {
            name: "thinkingMetadata",
            type: "object",
            required: false,
            description: "Extended thinking metadata",
            children: [
              {
                name: "thinkingBudget",
                type: "number",
                required: false,
                description: "Token budget for thinking"
              }
            ]
          },
          {
            name: "codebaseContext",
            type: "array",
            required: false,
            description: "Array of codebase context items included"
          },
          {
            name: "gitBranch",
            type: "string",
            required: false,
            description: "Git branch at time of response",
            example: "main"
          },
          {
            name: "message",
            type: "object",
            required: true,
            description: "API response wrapper",
            children: [
              {
                name: "id",
                type: "string",
                required: true,
                description: "API message ID",
                example: "msg_01ABC..."
              },
              {
                name: "model",
                type: "string",
                required: true,
                description: "Model used",
                example: "claude-sonnet-4-20250514"
              },
              {
                name: "role",
                type: "string",
                required: true,
                description: "Always 'assistant'"
              },
              {
                name: "content",
                type: "array",
                required: true,
                description: "Content blocks (text, tool_use, thinking)"
              },
              {
                name: "stop_reason",
                type: "string|null",
                required: true,
                description: "Why generation stopped",
                example: "end_turn"
              },
              {
                name: "usage",
                type: "object",
                required: true,
                description: "Token usage stats",
                children: [
                  {
                    name: "input_tokens",
                    type: "number",
                    required: true,
                    description: "Input tokens used"
                  },
                  {
                    name: "output_tokens",
                    type: "number",
                    required: true,
                    description: "Output tokens generated"
                  },
                  {
                    name: "cache_creation_input_tokens",
                    type: "number",
                    required: false,
                    description: "Tokens used for cache creation"
                  },
                  {
                    name: "cache_read_input_tokens",
                    type: "number",
                    required: false,
                    description: "Tokens read from cache"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        name: "file-history-snapshot",
        description:
          "Snapshot of file state for version tracking (appears after file modifications)",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'file-history-snapshot'",
            example: "file-history-snapshot"
          },
          {
            name: "sessionId",
            type: "string",
            required: true,
            description: "Session identifier"
          },
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp"
          },
          {
            name: "files",
            type: "object",
            required: true,
            description: "Map of file paths to their content or hash"
          }
        ]
      },
      {
        name: "tool_use (content block)",
        description: "Tool invocation (part of assistant content array)",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'tool_use'",
            example: "tool_use"
          },
          {
            name: "id",
            type: "string",
            required: true,
            description: "Tool use ID for result matching",
            example: "toolu_01ABC..."
          },
          {
            name: "name",
            type: "string",
            required: true,
            description: "Tool name",
            example: "Read"
          },
          {
            name: "input",
            type: "object",
            required: true,
            description: "Tool input parameters"
          }
        ]
      },
      {
        name: "tool_result (content block)",
        description:
          "Tool execution result (part of user message content array)",
        fields: [
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'tool_result'",
            example: "tool_result"
          },
          {
            name: "tool_use_id",
            type: "string",
            required: true,
            description: "Matching tool_use ID"
          },
          {
            name: "content",
            type: "string|array",
            required: true,
            description: "Tool output or error"
          },
          {
            name: "is_error",
            type: "boolean",
            required: false,
            description: "True if tool execution failed"
          }
        ]
      }
    ],
    notes: [
      "Files are stored in project-specific folders with URL-encoded paths",
      "Each line is a separate JSON object (JSONL format)",
      "Content blocks can include 'thinking' type for extended thinking",
      "Tool results may contain large outputs (file contents, command output)",
      "Session may have multiple 'summary' entries as context updates",
      "User message content can be string (simple) or array (with tool_result blocks)",
      "Assistant responses include signature field for verification",
      "File snapshots track file state changes during session"
    ],
    sampleEntry: `{"type":"user","uuid":"abc123","parentUuid":null,"sessionId":"def456","timestamp":"2025-01-15T10:30:00.000Z","cwd":"/home/user/project","version":"1.0.45","message":{"role":"user","content":"Help me fix this bug"}}`
  },
  {
    agent: "codex",
    displayName: "OpenAI Codex CLI",
    description:
      "OpenAI's Codex CLI stores session transcripts as JSONL files with wrapper structure containing type and payload.",
    fileFormat: "jsonl",
    fileExtension: ".jsonl",
    fileLocation: "~/.codex/sessions/YYYY/MM/DD/",
    filePattern: "rollout-*.jsonl",
    messageTypes: [
      {
        name: "session_meta",
        description: "Session metadata entry (appears at start of file)",
        fields: [
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp",
            example: "2025-01-15T10:30:00.000Z"
          },
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'session_meta'",
            example: "session_meta"
          },
          {
            name: "payload",
            type: "object",
            required: true,
            description: "Session metadata",
            children: [
              {
                name: "id",
                type: "string",
                required: true,
                description: "Session UUID"
              },
              {
                name: "started_at",
                type: "string",
                required: true,
                description: "Session start time (ISO 8601)"
              },
              {
                name: "model",
                type: "string",
                required: true,
                description: "Model used",
                example: "o4-mini"
              },
              {
                name: "instructions",
                type: "string",
                required: true,
                description: "System instructions"
              }
            ]
          }
        ]
      },
      {
        name: "response_item",
        description:
          "Response item from the API (messages, function calls, results)",
        fields: [
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp"
          },
          {
            name: "type",
            type: "string",
            required: true,
            description: "Always 'response_item'",
            example: "response_item"
          },
          {
            name: "payload",
            type: "object",
            required: true,
            description: "Response item details",
            children: [
              {
                name: "type",
                type: "string",
                required: true,
                description:
                  "Item type: 'message', 'function_call', 'function_call_output'"
              },
              {
                name: "id",
                type: "string",
                required: true,
                description: "Item identifier"
              },
              {
                name: "status",
                type: "string",
                required: false,
                description: "Item status",
                example: "completed"
              },
              {
                name: "role",
                type: "string",
                required: false,
                description: "Message role (for message type)",
                example: "user"
              },
              {
                name: "content",
                type: "array",
                required: false,
                description: "Content blocks (for message type)",
                children: [
                  {
                    name: "type",
                    type: "string",
                    required: true,
                    description: "Content type",
                    example: "input_text"
                  },
                  {
                    name: "text",
                    type: "string",
                    required: true,
                    description: "Text content"
                  }
                ]
              },
              {
                name: "name",
                type: "string",
                required: false,
                description: "Function name (for function_call type)"
              },
              {
                name: "call_id",
                type: "string",
                required: false,
                description: "Function call ID"
              },
              {
                name: "arguments",
                type: "string",
                required: false,
                description: "JSON-encoded function arguments"
              },
              {
                name: "output",
                type: "string",
                required: false,
                description: "Function output (for function_call_output type)"
              }
            ]
          }
        ]
      }
    ],
    notes: [
      "Files organized in date-based directory structure (YYYY/MM/DD)",
      "Uses wrapper structure: {timestamp, type, payload}",
      "type is either 'session_meta' or 'response_item'",
      "response_item payload.type can be: 'message', 'function_call', 'function_call_output'",
      "Session files named with 'rollout-' prefix followed by UUID",
      "Arguments in function_call are JSON strings that need parsing"
    ],
    sampleEntry: `{"timestamp":"2025-01-15T10:30:00.000Z","type":"response_item","payload":{"type":"message","id":"msg_123","role":"user","content":[{"type":"input_text","text":"Help me fix this"}]}}`
  },
  {
    agent: "gemini",
    displayName: "Google Gemini CLI",
    description:
      "Google's Gemini CLI stores sessions as single JSON files with session metadata and messages array.",
    fileFormat: "json",
    fileExtension: ".json",
    fileLocation: "~/.gemini/tmp/<hash>/chats/",
    filePattern: "<uuid>.json",
    messageTypes: [
      {
        name: "root",
        description: "Root JSON structure (session file)",
        fields: [
          {
            name: "sessionId",
            type: "string",
            required: true,
            description: "Unique session identifier (UUID)"
          },
          {
            name: "projectHash",
            type: "string",
            required: true,
            description: "Hash of the project directory"
          },
          {
            name: "startTime",
            type: "string",
            required: true,
            description: "Session start time (ISO 8601)"
          },
          {
            name: "lastUpdated",
            type: "string",
            required: true,
            description: "Last update time (ISO 8601)"
          },
          {
            name: "messages",
            type: "array",
            required: true,
            description: "Array of all messages in session"
          }
        ]
      },
      {
        name: "message",
        description: "Individual message in messages array",
        fields: [
          {
            name: "id",
            type: "string",
            required: true,
            description: "Message identifier (UUID)"
          },
          {
            name: "timestamp",
            type: "string",
            required: true,
            description: "ISO 8601 timestamp"
          },
          {
            name: "type",
            type: "string",
            required: true,
            description: "'user' or 'model'",
            example: "user"
          },
          {
            name: "content",
            type: "string",
            required: true,
            description: "Message text content"
          },
          {
            name: "toolCalls",
            type: "array",
            required: false,
            description: "Tool invocations made by model",
            children: [
              {
                name: "id",
                type: "string",
                required: true,
                description: "Tool call identifier"
              },
              {
                name: "name",
                type: "string",
                required: true,
                description: "Tool/function name"
              },
              {
                name: "args",
                type: "object",
                required: true,
                description: "Tool arguments"
              },
              {
                name: "result",
                type: "string",
                required: false,
                description: "Tool execution result"
              }
            ]
          },
          {
            name: "thoughts",
            type: "array",
            required: false,
            description: "Gemini's thinking process (if enabled)",
            children: [
              {
                name: "text",
                type: "string",
                required: true,
                description: "Thought content"
              }
            ]
          },
          {
            name: "model",
            type: "string",
            required: false,
            description: "Model used for this response",
            example: "gemini-2.5-pro"
          },
          {
            name: "tokens",
            type: "object",
            required: false,
            description: "Token usage for this message",
            children: [
              {
                name: "input",
                type: "number",
                required: false,
                description: "Input tokens used"
              },
              {
                name: "output",
                type: "number",
                required: false,
                description: "Output tokens generated"
              }
            ]
          }
        ]
      }
    ],
    notes: [
      "Single JSON file per session (not JSONL)",
      "All messages stored in a 'messages' array",
      "Model responses have type 'model' (not 'assistant' or 'gemini')",
      "Includes token counts in individual messages",
      "Directory structure uses content-addressed hashing of project path",
      "toolCalls array included when model invokes tools",
      "thoughts array included when thinking/reasoning is enabled"
    ],
    sampleEntry: `{"sessionId":"abc-123","projectHash":"def456","startTime":"2025-01-15T10:30:00.000Z","lastUpdated":"2025-01-15T10:35:00.000Z","messages":[{"id":"msg1","timestamp":"2025-01-15T10:30:00.000Z","type":"user","content":"Help me fix this bug"}]}`
  },
  {
    agent: "opencode",
    displayName: "OpenCode",
    description:
      "OpenCode stores session data in a SQLite database, not plain text files. Direct transcript export is not currently supported.",
    fileFormat: "json",
    fileExtension: ".db",
    fileLocation: "~/.opencode/",
    filePattern: "*.db",
    messageTypes: [
      {
        name: "session",
        description: "SQLite database record",
        fields: [
          {
            name: "id",
            type: "string",
            required: true,
            description: "Session identifier"
          },
          {
            name: "messages",
            type: "array",
            required: true,
            description: "Conversation messages (in SQLite)"
          }
        ]
      }
    ],
    notes: [
      "OpenCode uses SQLite for persistent storage, not JSONL files",
      "Direct file parsing not supported - SQLite queries required",
      "See https://github.com/opencode-ai/opencode for database schema"
    ]
  },
  {
    agent: "aider",
    displayName: "Aider",
    description:
      "Aider stores chat history in markdown and JSONL formats within project directories.",
    fileFormat: "jsonl",
    fileExtension: ".jsonl",
    fileLocation: ".aider.chat.history.md / .aider.input.history",
    filePattern: ".aider.chat.history.md",
    messageTypes: [
      {
        name: "markdown_format",
        description: "Primary format is markdown with special markers",
        fields: [
          {
            name: "#### user",
            type: "marker",
            required: false,
            description: "User message header"
          },
          {
            name: "#### assistant",
            type: "marker",
            required: false,
            description: "Assistant message header"
          },
          {
            name: "content",
            type: "text",
            required: true,
            description: "Message content following marker"
          }
        ]
      }
    ],
    notes: [
      "Primary log is markdown format (.aider.chat.history.md)",
      "Also has .aider.input.history for user input history",
      "Stored in project root, not home directory",
      "May include inline diffs and file references",
      "Not currently parsed by agentwatch (planned)"
    ]
  },
  {
    agent: "cursor",
    displayName: "Cursor",
    description:
      "Cursor stores conversation history in SQLite databases and proprietary formats.",
    fileFormat: "json",
    fileExtension: ".sqlite / .json",
    fileLocation: "~/Library/Application Support/Cursor/",
    filePattern: "Various internal files",
    messageTypes: [
      {
        name: "internal",
        description: "Format is proprietary and may change",
        fields: [
          {
            name: "conversations",
            type: "object",
            required: true,
            description: "Conversation data"
          }
        ]
      }
    ],
    notes: [
      "Uses SQLite databases for primary storage",
      "Format is not publicly documented",
      "Location varies by OS",
      "Not currently parsed by agentwatch (planned)"
    ]
  },
  {
    agent: "continue",
    displayName: "Continue.dev",
    description: "Continue stores session data in its configuration directory.",
    fileFormat: "json",
    fileExtension: ".json",
    fileLocation: "~/.continue/sessions/",
    filePattern: "*.json",
    messageTypes: [
      {
        name: "session",
        description: "Session object structure",
        fields: [
          {
            name: "id",
            type: "string",
            required: true,
            description: "Session identifier"
          },
          {
            name: "messages",
            type: "array",
            required: true,
            description: "Conversation messages"
          },
          {
            name: "context",
            type: "object",
            required: false,
            description: "Context items used"
          }
        ]
      }
    ],
    notes: [
      "Sessions stored as individual JSON files",
      "Includes context items (files, docs) used in conversation",
      "Not currently parsed by agentwatch (planned)"
    ]
  }
];

/**
 * Get schema for a specific agent.
 */
export function getFormatSchema(agent: string): FormatSchema | undefined {
  return FORMAT_SCHEMAS.find((s) => s.agent === agent);
}

/**
 * Get all supported agent names.
 */
export function getSupportedAgents(): string[] {
  return FORMAT_SCHEMAS.map((s) => s.agent);
}

/**
 * Get schemas grouped by support status.
 */
export function getSchemasByStatus(): {
  supported: FormatSchema[];
  planned: FormatSchema[];
} {
  const supported = FORMAT_SCHEMAS.filter((s) =>
    ["claude", "codex", "gemini", "opencode"].includes(s.agent)
  );
  const planned = FORMAT_SCHEMAS.filter(
    (s) => !["claude", "codex", "gemini", "opencode"].includes(s.agent)
  );
  return { supported, planned };
}
