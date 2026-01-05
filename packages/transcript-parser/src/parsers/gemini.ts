/**
 * Gemini transcript parser.
 * Parses ~/.gemini/tmp/<hash>/chats/session-*.json
 */

import { readFile } from "fs/promises";
import { basename } from "path";
import type { ParsedTranscript, TranscriptMessage } from "../types";
import { estimateCost } from "../cost";

/**
 * Parse a Gemini JSON transcript file.
 * Gemini format: { messages: [...], startTime?, lastUpdated? }
 */
export async function parseGeminiTranscript(
  filePath: string,
  projectHash?: string
): Promise<ParsedTranscript | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const fileName = basename(filePath, ".json");

    const messages: TranscriptMessage[] = [];
    const totalInputTokens = 0;
    const totalOutputTokens = 0;
    let name = fileName;
    let projectDir: string | null = null;

    // Extract project hash from path if not provided
    if (!projectHash) {
      const pathParts = filePath.split("/");
      const chatsIdx = pathParts.indexOf("chats");
      if (chatsIdx > 0) {
        projectHash = pathParts[chatsIdx - 1];
      }
    }

    if (projectHash) {
      projectDir = `gemini:${projectHash.slice(0, 12)}`;
    }

    // Parse JSON
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
    const estimatedCostUsd = estimateCost(
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      "gemini"
    );

    // Include project hash in ID
    const id = projectHash
      ? `gemini:${projectHash}:${fileName}`
      : `gemini:${fileName}`;

    return {
      id,
      agent: "gemini",
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
