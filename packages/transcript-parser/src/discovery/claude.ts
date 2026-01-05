/**
 * Claude transcript discovery.
 * Scans ~/.claude/projects/<encoded-path>/<session>.jsonl
 */

import { readdir, stat } from "fs/promises";
import { basename, dirname, join } from "path";
import type { TranscriptMeta, AgentConfig } from "../types";

const CHUNK_SIZE = 64 * 1024; // 64KB for streaming

/**
 * Scan Claude projects for transcripts.
 */
export async function scanClaudeTranscripts(
  basePath: string,
  config: AgentConfig
): Promise<TranscriptMeta[]> {
  const results: TranscriptMeta[] = [];

  try {
    const projects = await readdir(basePath, { withFileTypes: true });

    for (const project of projects) {
      if (!project.isDirectory()) continue;

      const projectPath = join(basePath, project.name);

      try {
        const files = await readdir(projectPath, { withFileTypes: true });

        for (const file of files) {
          if (file.isFile() && file.name.endsWith(config.extension)) {
            const filePath = join(projectPath, file.name);
            const transcript = await parseClaudeMeta(filePath);
            if (transcript) {
              results.push(transcript);
            }
          }
        }
      } catch {
        // Ignore read errors for individual projects
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return results;
}

/**
 * Parse metadata from a Claude transcript file.
 */
async function parseClaudeMeta(
  filePath: string
): Promise<TranscriptMeta | null> {
  try {
    const stats = await stat(filePath);
    const fileName = basename(filePath, ".jsonl");

    let startTime: number | null = null;
    let endTime: number | null = null;
    let name = fileName;
    let projectDir: string | null = null;

    // Extract project directory from path format: -Users-alice-Documents-project
    const parentDir = basename(dirname(filePath));
    if (parentDir.startsWith("-")) {
      projectDir = parentDir.replace(/-/g, "/");
      name = basename(projectDir);
    }

    // Stream JSONL to extract metadata without loading entire file
    const file = Bun.file(filePath);
    const fileSize = stats.size;

    // Read first chunk for start time and name
    const firstChunkSize = Math.min(CHUNK_SIZE, fileSize);
    const firstChunk = await file.slice(0, firstChunkSize).text();
    const firstLines = firstChunk.split("\n").filter((l) => l.trim());

    // Process first lines
    for (const line of firstLines.slice(0, 50)) {
      try {
        const obj = JSON.parse(line);

        // Check for summary (session name)
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
      const lastLines = lastChunk
        .split("\n")
        .slice(1)
        .filter((l) => l.trim());

      for (const line of lastLines.slice(-50)) {
        try {
          const obj = JSON.parse(line);

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
      // Small file - use first chunk for end time
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

    // Estimate message count from file size
    const messageCount = Math.round(stats.size / 800);

    return {
      id: `claude:${fileName}`,
      agent: "claude",
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
