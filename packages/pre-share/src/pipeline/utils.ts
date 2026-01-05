/**
 * Shared utility functions for session processing.
 *
 * These are exported for use by both the daemon and static sites.
 */

/**
 * Generate safe preview of data.
 * Shows both message content AND field structure for better diff visibility.
 */
export function safePreview(data: unknown, maxLen = 800): string {
  const parts: string[] = [];

  try {
    if (typeof data === "string") {
      return data.slice(0, maxLen).replace(/\s+/g, " ").trim();
    }

    if (Array.isArray(data)) {
      // Process first few items to show structure
      for (const item of data.slice(0, 3)) {
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;

          // Show important fields with their values for diff visibility
          const importantFields = [
            "role",
            "type",
            "timestamp",
            "model",
            "uuid",
            "message"
          ];
          for (const field of importantFields) {
            if (field in obj && obj[field] !== undefined) {
              const val = obj[field];
              if (typeof val === "string" || typeof val === "number") {
                parts.push(`${field}: ${String(val).slice(0, 50)}`);
              }
            }
          }

          // Extract message content
          const content = obj.content || obj.text || obj.message;
          if (typeof content === "string") {
            parts.push(`content: ${content.slice(0, 100)}...`);
          } else if (Array.isArray(content)) {
            for (const part of content.slice(0, 2)) {
              if (typeof part === "object" && part !== null) {
                const p = part as Record<string, unknown>;
                if (typeof p.text === "string") {
                  parts.push(`text: ${p.text.slice(0, 100)}...`);
                }
                if (typeof p.type === "string") {
                  parts.push(`type: ${p.type}`);
                }
              }
            }
          }

          // Show meta fields if present (often stripped)
          if (
            "meta" in obj &&
            typeof obj.meta === "object" &&
            obj.meta !== null
          ) {
            const meta = obj.meta as Record<string, unknown>;
            const metaFields = [
              "inputTokens",
              "outputTokens",
              "model",
              "sessionId"
            ];
            for (const mf of metaFields) {
              if (mf in meta) {
                parts.push(`meta.${mf}: ${String(meta[mf]).slice(0, 30)}`);
              }
            }
          }

          parts.push("---");
        }
      }
    } else if (typeof data === "object" && data !== null) {
      // Single object - show its fields
      const obj = data as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj).slice(0, 10)) {
        if (val === null || val === undefined) continue;
        if (
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean"
        ) {
          parts.push(`${key}: ${String(val).slice(0, 50)}`);
        } else if (Array.isArray(val)) {
          parts.push(`${key}: [${val.length} items]`);
        } else {
          parts.push(`${key}: {...}`);
        }
      }
    }
  } catch {
    return String(data ?? "").slice(0, maxLen);
  }

  return (
    parts.join(" | ").slice(0, maxLen).replace(/\s+/g, " ").trim() ||
    JSON.stringify(data).slice(0, maxLen)
  );
}

/**
 * Generate a rich chat-style preview of messages.
 * Used for the diff view "Original" mode.
 */
export function formatChatPreview(data: unknown, maxLen = 4000): string {
  const lines: string[] = [];

  try {
    if (!data || typeof data !== "object") {
      return safePreview(data, maxLen);
    }

    const obj = data as Record<string, unknown>;

    // Handle hook session format (session + tool_usages)
    if (Array.isArray(obj.tool_usages)) {
      const session = obj.session as Record<string, unknown> | undefined;
      const usages = obj.tool_usages as Array<Record<string, unknown>>;

      // Show session info
      if (session) {
        const cwd = session.cwd as string | undefined;
        const permMode = session.permission_mode as string | undefined;
        const toolCount = session.tool_count as number | undefined;
        lines.push(`📂 ${cwd || "unknown"}`);
        lines.push(
          `🔐 Permission: ${permMode || "default"} | Tools: ${toolCount ?? usages.length}`
        );
        lines.push("");
      }

      // Show tool usages timeline
      lines.push("📋 Tool Timeline:");
      for (const usage of usages.slice(0, 30)) {
        const toolName = (usage.tool_name as string) || "unknown";
        const success = usage.success;
        const durationMs = usage.duration_ms as number | null;
        const ts = usage.timestamp as number;

        const icon = success === true ? "✓" : success === false ? "✗" : "•";
        const time = ts
          ? new Date(ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          : "";
        const duration = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : "";

        lines.push(`  ${icon} ${time} ${toolName} ${duration}`);
      }

      if (usages.length > 30) {
        lines.push(`  ... and ${usages.length - 30} more tool calls`);
      }

      return lines.join("\n").slice(0, maxLen);
    }

    // Handle array of messages (transcript format)
    const messages = Array.isArray(data)
      ? data
      : Array.isArray(obj.messages)
        ? obj.messages
        : null;

    if (messages) {
      for (const msg of messages.slice(0, 20)) {
        // Limit to first 20 messages
        if (typeof msg !== "object" || msg === null) continue;
        const m = msg as Record<string, unknown>;

        // Get role
        const role = String(m.role || m.type || "unknown");
        const icon =
          role === "user"
            ? "👤"
            : role === "assistant"
              ? "🤖"
              : role === "tool"
                ? "🔧"
                : "📝";

        // Get content
        let content = "";
        if (typeof m.content === "string") {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          // Handle content blocks
          content = (m.content as Array<Record<string, unknown>>)
            .map((c) => {
              if (typeof c.text === "string") return c.text;
              if (c.type === "thinking") return "[thinking...]";
              if (c.type === "tool_use") return `[tool: ${c.name}]`;
              if (c.type === "tool_result") return `[tool result]`;
              return "";
            })
            .filter(Boolean)
            .join(" ");
        } else if (typeof m.text === "string") {
          content = m.text;
        }

        // Get timestamp
        const ts = m.timestamp
          ? new Date(String(m.timestamp)).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })
          : "";

        // Format line
        const truncatedContent = content
          .slice(0, 200)
          .replace(/\n/g, " ")
          .trim();
        lines.push(
          `${icon}${role.charAt(0).toUpperCase() + role.slice(1)} ${ts}`
        );
        if (truncatedContent) {
          lines.push(
            `  ${truncatedContent}${content.length > 200 ? "..." : ""}`
          );
        }
        lines.push("");
      }

      if (messages.length > 20) {
        lines.push(`... and ${messages.length - 20} more messages`);
      }
    }

    // Show metadata if present
    const metaFields = [
      "total_input_tokens",
      "total_output_tokens",
      "estimated_cost_usd"
    ];
    const metaParts: string[] = [];
    for (const field of metaFields) {
      if (field in obj) {
        const val = obj[field];
        if (field === "estimated_cost_usd" && typeof val === "number") {
          metaParts.push(`cost: $${val.toFixed(3)}`);
        } else if (typeof val === "number") {
          metaParts.push(
            `${field.replace("total_", "").replace("_tokens", "")}: ${val.toLocaleString()}`
          );
        }
      }
    }
    if (metaParts.length > 0) {
      lines.unshift(`📊 ${metaParts.join(" | ")}\n`);
    }
  } catch {
    return safePreview(data, maxLen);
  }

  return lines.join("\n").slice(0, maxLen) || safePreview(data, maxLen);
}

/**
 * Format UTC timestamp.
 */
export function formatUtcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Generate random UUID.
 */
export function randomUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback implementation
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Redact username from file path.
 */
export function redactPathUsername(path: string): string {
  return path
    .replace(/\/Users\/[^/]+\//g, "/Users/<USER>/")
    .replace(/\/home\/[^/]+\//g, "/home/<USER>/")
    .replace(/C:\\Users\\[^\\]+\\/gi, "C:\\Users\\<USER>\\");
}

/**
 * Calculate SHA256 hash of data.
 * Works in browser and Node.js/Bun environments.
 */
export async function sha256Hex(data: unknown): Promise<string> {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse JSONL (newline-delimited JSON) text.
 */
export function parseJsonLines(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((item) => item !== null);
}

/**
 * Infer source from file path.
 */
export function inferSource(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("claude") || lower.includes(".claude")) return "claude";
  if (lower.includes("codex")) return "codex";
  if (lower.includes("opencode")) return "opencode";
  return "unknown";
}

/**
 * Extract entry type counts from session data.
 */
export function extractEntryTypes(data: unknown): {
  types: Record<string, number>;
  primary: string;
} {
  const types: Record<string, number> = {};
  if (!Array.isArray(data)) return { types, primary: "unknown" };

  for (const item of data) {
    if (typeof item === "object" && item !== null) {
      const type = String(
        (item as Record<string, unknown>).type ||
          (item as Record<string, unknown>).role ||
          "unknown"
      );
      types[type] = (types[type] || 0) + 1;
    }
  }

  const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);
  return { types, primary: sorted[0]?.[0] || "unknown" };
}

/**
 * Generate a bundle ID from contributor ID.
 */
export function makeBundleId(contributorId: string): string {
  const safe = contributorId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  const now = formatUtcNow().replace(/[-:]/g, "").replace(".", "");
  const short = Math.random().toString(36).slice(2, 8);
  return `${now}_${safe || "anonymous"}_${short}`;
}
