/**
 * Codex transcript parser.
 * Parses ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import type { ParsedTranscript, TranscriptMessage } from "../types";
import { estimateCost } from "../cost";

/**
 * Parse a Codex JSONL transcript file.
 * Codex format: { timestamp, type, payload } where payload contains message data
 */
export async function parseCodexTranscript(
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

    // Extract date from path
    const parts = filePath.split("/");
    const sessionIdx = parts.indexOf("sessions");
    if (sessionIdx !== -1 && parts.length > sessionIdx + 3) {
      const year = parts[sessionIdx + 1];
      const month = parts[sessionIdx + 2];
      const day = parts[sessionIdx + 3];
      projectDir = `${year}-${month}-${day}`;
    }

    // Extract timestamp from filename
    const match = fileName.match(
      /rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/
    );
    if (match?.[1]) {
      name = match[1].replace(/-/g, ":").replace("T", " ");
    }

    // Parse JSONL
    const lines = content
      .trim()
      .split("\n")
      .filter((l) => l.trim());

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        // Codex format detection
        if (obj.payload === undefined) continue;

        const payload = obj.payload;

        // Only process response_item with type "message"
        if (obj.type !== "response_item" || payload.type !== "message") {
          continue;
        }

        // Extract content from array
        let rawContent = "";
        if (Array.isArray(payload.content)) {
          rawContent = (payload.content as { text?: string }[])
            .map((item) => item.text || "")
            .filter((t) => t)
            .join("\n");
        } else if (typeof payload.content === "string") {
          rawContent = payload.content;
        }

        const msg: TranscriptMessage = {
          uuid: payload.uuid || payload.id || String(messages.length),
          parentUuid: payload.parentUuid || null,
          type: payload.type,
          subtype: payload.subtype,
          role: payload.role,
          content: rawContent,
          timestamp: obj.timestamp || new Date().toISOString(),
          isSidechain: payload.isSidechain === true,
          agentId: payload.agentId
        };

        // Extract tool info
        if (payload.toolName || payload.tool_name) {
          msg.toolName = payload.toolName || payload.tool_name;
          msg.toolInput =
            payload.toolInput || payload.tool_input || payload.input;
        }
        if (
          payload.toolResult !== undefined ||
          payload.tool_result !== undefined
        ) {
          msg.toolResult = payload.toolResult ?? payload.tool_result;
        }

        // Extract token usage
        if (payload.usage) {
          msg.inputTokens = payload.usage.input_tokens;
          msg.outputTokens = payload.usage.output_tokens;
          totalInputTokens += msg.inputTokens || 0;
          totalOutputTokens += msg.outputTokens || 0;
        }

        // Extract model
        if (payload.model) {
          msg.model = payload.model;
        }

        messages.push(msg);
      } catch {
        // Skip unparseable lines
      }
    }

    const estimatedCostUsd = estimateCost(
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      "codex"
    );

    return {
      id: `codex:${fileName}`,
      agent: "codex",
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
