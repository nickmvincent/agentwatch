/**
 * Claude transcript parser.
 * Parses ~/.claude/projects/<encoded-path>/<session>.jsonl
 */

import { readFile } from "fs/promises";
import { basename, dirname } from "path";
import type { ParsedTranscript, TranscriptMessage } from "../types";
import { estimateCost } from "../cost";

/**
 * Parse a Claude JSONL transcript file.
 */
export async function parseClaudeTranscript(
  filePath: string
): Promise<ParsedTranscript | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const fileName = basename(filePath, ".jsonl");

    const messages: TranscriptMessage[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let name = fileName;
    let projectDir: string | null = null;

    // Extract project directory from path
    const parentDir = basename(dirname(filePath));
    if (parentDir.startsWith("-")) {
      projectDir = parentDir.replace(/-/g, "/");
    }

    // Parse JSONL
    const lines = content
      .trim()
      .split("\n")
      .filter((l) => l.trim());

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        // Handle summary entries
        if (obj.type === "summary") {
          if (obj.summary) {
            name = obj.summary.slice(0, 100);
          }
          continue;
        }

        // Parse message content
        // Claude: obj.content (string) or obj.message.content (array of {type, text/thinking})
        let rawContent = "";
        if (Array.isArray(obj.message?.content)) {
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
          rawContent =
            typeof obj.content === "string"
              ? obj.content
              : typeof obj.message?.content === "string"
                ? obj.message.content
                : "";
        }

        const msg: TranscriptMessage = {
          uuid: obj.uuid || obj.id || String(messages.length),
          parentUuid: obj.parentUuid || null,
          type: obj.type || "unknown",
          subtype: obj.subtype,
          role:
            obj.role ||
            obj.message?.role ||
            (obj.type === "user"
              ? "user"
              : obj.type === "assistant"
                ? "assistant"
                : undefined),
          content: rawContent,
          timestamp: obj.timestamp || new Date().toISOString(),
          isSidechain: obj.isSidechain === true,
          agentId: obj.agentId
        };

        // Extract tool info
        if (obj.toolName || obj.tool_name) {
          msg.toolName = obj.toolName || obj.tool_name;
          msg.toolInput = obj.toolInput || obj.tool_input || obj.input;
        }
        if (obj.toolResult !== undefined || obj.tool_result !== undefined) {
          msg.toolResult = obj.toolResult ?? obj.tool_result;
        }

        // Extract token usage
        const usage = obj.message?.usage;
        if (usage) {
          msg.inputTokens = usage.input_tokens;
          msg.outputTokens = usage.output_tokens;
          msg.cacheCreationTokens = usage.cache_creation_input_tokens;
          msg.cacheReadTokens = usage.cache_read_input_tokens;
          totalInputTokens += msg.inputTokens || 0;
          totalOutputTokens += msg.outputTokens || 0;
        }

        // Extract model
        if (obj.model || obj.message?.model) {
          msg.model = obj.model || obj.message?.model;
        }

        messages.push(msg);
      } catch {
        // Skip unparseable lines
      }
    }

    const estimatedCostUsd = estimateCost(
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      "claude"
    );

    return {
      id: `claude:${fileName}`,
      agent: "claude",
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
