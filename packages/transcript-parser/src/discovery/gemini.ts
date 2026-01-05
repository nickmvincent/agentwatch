/**
 * Gemini transcript discovery.
 * Scans ~/.gemini/tmp/<hash>/chats/session-*.json
 */

import { readdir, readFile, stat } from "fs/promises";
import { basename, join } from "path";
import type { TranscriptMeta, AgentConfig } from "../types";

/**
 * Scan Gemini sessions for transcripts.
 * Directory structure: tmp/<hash>/chats/session-*.json
 */
export async function scanGeminiTranscripts(
  basePath: string,
  config: AgentConfig
): Promise<TranscriptMeta[]> {
  const results: TranscriptMeta[] = [];

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
            const transcript = await parseGeminiMeta(filePath, hash.name);
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
    // Directory doesn't exist or not readable
  }

  return results;
}

/**
 * Parse metadata from a Gemini transcript file.
 * Gemini uses JSON format with full file read (typically smaller files).
 */
async function parseGeminiMeta(
  filePath: string,
  projectHash: string
): Promise<TranscriptMeta | null> {
  try {
    const stats = await stat(filePath);
    const fileName = basename(filePath, ".json");

    let messageCount = 0;
    let startTime: number | null = null;
    let endTime: number | null = null;
    let name = fileName;
    const projectDir = `gemini:${projectHash.slice(0, 12)}`;

    // Gemini JSON files are typically small, read fully
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

      // Override with explicit timestamps if present
      if (data.startTime) {
        startTime = new Date(data.startTime).getTime();
      }
      if (data.lastUpdated) {
        endTime = new Date(data.lastUpdated).getTime();
      }
    } catch {
      return null;
    }

    // Include project hash in ID to avoid collisions
    return {
      id: `gemini:${projectHash}:${fileName}`,
      agent: "gemini",
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
