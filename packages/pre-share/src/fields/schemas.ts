/**
 * Field schema definitions for transcript and hook session data.
 * Categories determine default selection behavior:
 * - essential: Cannot be removed
 * - recommended: Selected by default
 * - optional: User chooses
 * - strip: Deselected by default (may contain sensitive data)
 * - content_heavy: Contains large/sensitive content (file contents, outputs)
 * - always_strip: Always removed (binary data, signatures)
 */

import type { FieldSchema } from "../types/sanitizer";

/**
 * Fields that are known to contain heavy/sensitive content.
 * Used by UI to show warnings and by Safe Default profile to exclude.
 */
export const CONTENT_HEAVY_FIELDS = [
  "tool_usages[].tool_input",
  "tool_usages[].tool_response",
  "messages[].content",
  "messages[].message.content",
  "aggregated_output",
  "command"
] as const;

/**
 * Check if a field path is known to be content-heavy.
 */
export function isContentHeavyField(path: string): boolean {
  const normalizedPath = path.replace(/\[\d+\]/g, "[]");
  return CONTENT_HEAVY_FIELDS.some(
    (heavy) =>
      normalizedPath === heavy || normalizedPath.startsWith(heavy + ".")
  );
}

export const FIELD_SCHEMAS: FieldSchema[] = [
  // === ESSENTIAL FIELDS (cannot be removed) ===
  {
    path: "type",
    category: "essential",
    label: "Entry type",
    description: "Message type (user/assistant/system)",
    source: "all"
  },
  {
    path: "role",
    category: "essential",
    label: "Role",
    description: "Message role",
    source: "all"
  },
  {
    path: "message.role",
    category: "essential",
    label: "Message role",
    description: "Role in message object",
    source: "claude"
  },
  {
    path: "message.content",
    category: "essential",
    label: "Message content",
    description: "The actual message text",
    source: "claude"
  },
  {
    path: "content",
    category: "essential",
    label: "Content",
    description: "Message content",
    source: "all"
  },
  {
    path: "text",
    category: "essential",
    label: "Text",
    description: "Text content",
    source: "all"
  },

  // === RECOMMENDED FIELDS (selected by default) ===
  {
    path: "timestamp",
    category: "recommended",
    label: "Timestamp",
    description: "When the message occurred",
    source: "all"
  },
  {
    path: "sessionId",
    category: "recommended",
    label: "Session ID",
    description: "Links related messages together",
    source: "all"
  },
  {
    path: "uuid",
    category: "recommended",
    label: "Message UUID",
    description: "Unique message identifier",
    source: "claude"
  },
  {
    path: "parentUuid",
    category: "recommended",
    label: "Parent UUID",
    description: "Links to parent message (for threading)",
    source: "claude"
  },
  {
    path: "message.model",
    category: "recommended",
    label: "Model name",
    description: "Which model was used",
    source: "claude"
  },
  {
    path: "message.stop_reason",
    category: "recommended",
    label: "Stop reason",
    description: "Why the model stopped generating",
    source: "claude"
  },
  {
    path: "message.usage",
    category: "recommended",
    label: "Token usage",
    description: "Input/output token counts",
    source: "claude"
  },
  {
    path: "usage",
    category: "recommended",
    label: "Token usage",
    description: "Token consumption data",
    source: "all"
  },

  // === OPTIONAL FIELDS (user chooses) ===
  {
    path: "version",
    category: "optional",
    label: "Client version",
    description: "Version of the coding agent",
    source: "all"
  },
  {
    path: "message.id",
    category: "optional",
    label: "Message ID",
    description: "API message identifier",
    source: "claude"
  },
  {
    path: "message.type",
    category: "optional",
    label: "Message type",
    description: "API message type field",
    source: "claude"
  },
  {
    path: "message.stop_sequence",
    category: "optional",
    label: "Stop sequence",
    description: "Token sequence that stopped generation",
    source: "claude"
  },
  {
    path: "requestId",
    category: "optional",
    label: "Request ID",
    description: "API request identifier",
    source: "claude"
  },
  {
    path: "isSidechain",
    category: "optional",
    label: "Is sidechain",
    description: "Whether this is a sidechain message",
    source: "claude"
  },
  {
    path: "isMeta",
    category: "optional",
    label: "Is meta",
    description: "Whether this is a meta message",
    source: "claude"
  },
  {
    path: "userType",
    category: "optional",
    label: "User type",
    description: "Type of user (external/internal)",
    source: "claude"
  },
  {
    path: "summary",
    category: "optional",
    label: "Summary",
    description: "Context summary text",
    source: "claude"
  },
  {
    path: "leafUuid",
    category: "optional",
    label: "Leaf UUID",
    description: "Reference to conversation leaf",
    source: "claude"
  },
  {
    path: "subtype",
    category: "optional",
    label: "Subtype",
    description: "System message subtype",
    source: "claude"
  },
  {
    path: "level",
    category: "optional",
    label: "Level",
    description: "Log level for system messages",
    source: "claude"
  },
  {
    path: "gitBranch",
    category: "optional",
    label: "Git branch",
    description: "Current git branch name",
    source: "claude"
  },
  {
    path: "exit_code",
    category: "optional",
    label: "Exit code",
    description: "Command exit code",
    source: "codex"
  },
  {
    path: "status",
    category: "optional",
    label: "Status",
    description: "Command execution status",
    source: "codex"
  },

  // === FIELDS TO STRIP (deselected by default) ===
  {
    path: "cwd",
    category: "strip",
    label: "Working directory",
    description: "Full local path to working directory",
    source: "all"
  },
  {
    path: "sourcePathHint",
    category: "strip",
    label: "Source path hint",
    description: "Original file path on disk",
    source: "all"
  },
  {
    path: "original_path_hint",
    category: "strip",
    label: "Original path",
    description: "Original file path on disk",
    source: "all"
  },
  {
    path: "filePath",
    category: "strip",
    label: "File path",
    description: "File path in session",
    source: "all"
  },
  {
    path: "toolUseResult",
    category: "strip",
    label: "Tool use result",
    description: "Detailed tool execution results (may contain paths)",
    source: "claude"
  },
  {
    path: "hookErrors",
    category: "strip",
    label: "Hook errors",
    description: "Error messages from hooks",
    source: "claude"
  },
  {
    path: "hookInfos",
    category: "strip",
    label: "Hook info",
    description: "Information from hooks",
    source: "claude"
  },
  {
    path: "hasOutput",
    category: "strip",
    label: "Has output flag",
    description: "Boolean flag for output presence",
    source: "claude"
  },
  {
    path: "preventedContinuation",
    category: "strip",
    label: "Prevented continuation",
    description: "Whether continuation was prevented",
    source: "claude"
  },
  {
    path: "agentId",
    category: "strip",
    label: "Agent ID",
    description: "Internal agent identifier",
    source: "claude"
  },
  {
    path: "aggregated_output",
    category: "strip",
    label: "Aggregated output",
    description: "Full command output (may be large)",
    source: "codex"
  },
  {
    path: "command",
    category: "strip",
    label: "Command",
    description: "Full command with paths",
    source: "codex"
  },

  // === ALWAYS STRIP (cannot be included) ===
  {
    path: "message.content.*.source.data",
    category: "always_strip",
    label: "Base64 image data",
    description: "Raw image data (large, privacy)",
    source: "claude"
  },
  {
    path: "*.source.data",
    category: "always_strip",
    label: "Base64 data",
    description: "Any base64 encoded data",
    source: "all"
  },
  {
    path: "message.content.*.signature",
    category: "always_strip",
    label: "Thinking signature",
    description: "Thinking block signatures",
    source: "claude"
  },

  // ==========================================================
  // HOOK SESSION FIELDS (cc_hook source type)
  // ==========================================================

  // === HOOK SESSION METADATA (recommended) ===
  {
    path: "session",
    category: "recommended",
    label: "Session object",
    description: "Session-level metadata container",
    source: "cc_hook"
  },
  {
    path: "session.session_id",
    category: "recommended",
    label: "Session ID",
    description: "Unique session identifier",
    source: "cc_hook"
  },
  {
    path: "session.start_time",
    category: "recommended",
    label: "Start time",
    description: "When the session started",
    source: "cc_hook"
  },
  {
    path: "session.end_time",
    category: "recommended",
    label: "End time",
    description: "When the session ended",
    source: "cc_hook"
  },
  {
    path: "session.permission_mode",
    category: "recommended",
    label: "Permission mode",
    description: "Claude Code permission setting",
    source: "cc_hook"
  },
  {
    path: "session.source",
    category: "recommended",
    label: "Source",
    description: "Where session was launched from (vscode, cli, etc.)",
    source: "cc_hook"
  },
  {
    path: "session.tool_count",
    category: "recommended",
    label: "Tool count",
    description: "Total number of tool calls in session",
    source: "cc_hook"
  },
  {
    path: "session.tools_used",
    category: "recommended",
    label: "Tools used",
    description: "List of tool names used",
    source: "cc_hook"
  },
  {
    path: "session.total_input_tokens",
    category: "recommended",
    label: "Input tokens",
    description: "Total input tokens consumed",
    source: "cc_hook"
  },
  {
    path: "session.total_output_tokens",
    category: "recommended",
    label: "Output tokens",
    description: "Total output tokens generated",
    source: "cc_hook"
  },
  {
    path: "session.estimated_cost_usd",
    category: "recommended",
    label: "Estimated cost",
    description: "Estimated API cost in USD",
    source: "cc_hook"
  },

  // === HOOK SESSION FIELDS TO STRIP ===
  {
    path: "session.cwd",
    category: "strip",
    label: "Working directory",
    description: "Full path to working directory (contains username)",
    source: "cc_hook"
  },
  {
    path: "session.transcript_path",
    category: "strip",
    label: "Transcript path",
    description: "Full path to transcript file (contains username)",
    source: "cc_hook"
  },
  {
    path: "session.commits",
    category: "optional",
    label: "Git commits",
    description: "List of commits made during session",
    source: "cc_hook"
  },

  // === TOOL USAGES ARRAY ===
  {
    path: "tool_usages",
    category: "recommended",
    label: "Tool usages",
    description: "Array of individual tool calls",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_use_id",
    category: "recommended",
    label: "Tool use ID",
    description: "Unique identifier for this tool call",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_name",
    category: "recommended",
    label: "Tool name",
    description: "Name of the tool called (Read, Edit, Bash, etc.)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].timestamp",
    category: "recommended",
    label: "Timestamp",
    description: "When the tool was called",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].session_id",
    category: "recommended",
    label: "Session ID",
    description: "Parent session identifier",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].success",
    category: "recommended",
    label: "Success",
    description: "Whether the tool call succeeded",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].duration_ms",
    category: "recommended",
    label: "Duration",
    description: "How long the tool call took in milliseconds",
    source: "cc_hook"
  },

  // === CONTENT-HEAVY FIELDS (strip by default) ===
  {
    path: "tool_usages[].tool_input",
    category: "strip",
    label: "Tool input ⚠️",
    description: "Full tool input parameters (file paths, commands, code)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_response",
    category: "strip",
    label: "Tool response ⚠️",
    description: "Full tool output (file contents, command output, code)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].cwd",
    category: "strip",
    label: "Tool CWD",
    description: "Working directory for this tool call",
    source: "cc_hook"
  }
];
