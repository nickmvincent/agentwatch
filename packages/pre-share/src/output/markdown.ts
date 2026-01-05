/**
 * Markdown output formatter.
 */

import type { TranscriptSanitizer } from "../sanitizer/sanitizer";
import type { TranscriptEntry } from "../types/contrib";

/**
 * Generate a readable markdown transcript from sanitized entries.
 */
export function generateMarkdown(
  entries: TranscriptEntry[],
  sanitizer: TranscriptSanitizer,
  options: {
    sourcePath?: string;
    projectName?: string;
  } = {}
): string {
  const { sourcePath = "unknown", projectName = "unknown" } = options;

  const lines: string[] = [
    "# Claude Code Session Transcript (Redacted)",
    "",
    `**Generated:** ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
    `**Source:** ${sanitizer.redactText(sourcePath)}`,
    `**Project:** ${projectName}`,
    "",
    "---",
    ""
  ];

  for (const entry of entries) {
    const role = entry.role || entry.type || "unknown";

    // Add role header
    if (role === "user" || role === "human") {
      lines.push("## User");
      lines.push("");
    } else if (role === "assistant" || role === "ai") {
      lines.push("## Assistant");
      lines.push("");
    } else if (role === "tool") {
      const toolName =
        (entry as Record<string, unknown>).name ||
        (entry as Record<string, unknown>).tool ||
        "unknown";
      lines.push(`## Tool: ${toolName}`);
      lines.push("");
    } else if (role === "system") {
      lines.push("## System");
      lines.push("");
    } else {
      lines.push(`## ${role.charAt(0).toUpperCase() + role.slice(1)}`);
      lines.push("");
    }

    // Extract and format content
    const content =
      entry.content ||
      entry.message?.content ||
      (entry as Record<string, unknown>).text ||
      "";

    if (Array.isArray(content)) {
      // Handle content blocks (e.g., text + tool_use)
      for (const block of content) {
        if (typeof block === "object" && block !== null) {
          const b = block as Record<string, unknown>;
          const blockType = b.type as string;

          if (blockType === "text") {
            const text = sanitizer.redactText(String(b.text || ""));
            lines.push(text);
            lines.push("");
          } else if (blockType === "tool_use") {
            const toolName = b.name || "unknown";
            const toolInput = b.input || {};
            const redactedInput = sanitizer.redactObject(toolInput);
            lines.push(`**Tool Call: ${toolName}**`);
            lines.push("```json");
            lines.push(JSON.stringify(redactedInput, null, 2));
            lines.push("```");
            lines.push("");
          } else if (blockType === "tool_result") {
            const result = b.content || "";
            const redactedResult = sanitizer.redactText(String(result));
            lines.push("**Tool Result:**");
            lines.push("```");
            lines.push(redactedResult);
            lines.push("```");
            lines.push("");
          } else {
            // Generic block
            const redacted = sanitizer.redactObject(block);
            lines.push("```json");
            lines.push(JSON.stringify(redacted, null, 2));
            lines.push("```");
            lines.push("");
          }
        } else if (typeof block === "string") {
          lines.push(sanitizer.redactText(block));
          lines.push("");
        }
      }
    } else if (typeof content === "string") {
      // Check if it looks like JSON
      const trimmed = content.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(content);
          const redacted = sanitizer.redactObject(parsed);
          lines.push("```json");
          lines.push(JSON.stringify(redacted, null, 2));
          lines.push("```");
        } catch {
          lines.push(sanitizer.redactText(content));
        }
      } else {
        lines.push(sanitizer.redactText(content));
      }
      lines.push("");
    } else if (typeof content === "object" && content !== null) {
      const redacted = sanitizer.redactObject(content);
      lines.push("```json");
      lines.push(JSON.stringify(redacted, null, 2));
      lines.push("```");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // Add redaction summary
  const report = sanitizer.getReport();
  lines.push("## Redaction Summary");
  lines.push("");
  lines.push(`**Total redactions:** ${report.totalRedactions}`);
  lines.push("");

  if (Object.keys(report.countsByCategory).length > 0) {
    lines.push("**By category:**");
    for (const [category, count] of Object.entries(
      report.countsByCategory
    ).sort()) {
      lines.push(`- ${category}: ${count}`);
    }
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push("**Warnings:**");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  lines.push(
    "> **Note:** This transcript has been automatically sanitized. Please review manually before sharing to ensure no sensitive information remains."
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate a safe filename from project and session info.
 */
export function generateSafeFilename(project: string, session: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);

  // Sanitize project and session names
  const safeProject = project.replace(/[^\w-]/g, "_").slice(0, 30);
  const safeSession = session.replace(/[^\w-]/g, "_").slice(0, 20);

  return `${timestamp}_${safeProject}_${safeSession}`;
}
