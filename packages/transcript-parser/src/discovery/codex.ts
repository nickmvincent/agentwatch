/**
 * Codex transcript discovery.
 * Scans ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */

import { readdir, stat } from "fs/promises";
import { basename, join } from "path";
import type { TranscriptMeta, AgentConfig } from "../types";

const CHUNK_SIZE = 64 * 1024; // 64KB for streaming

/**
 * Scan Codex sessions for transcripts.
 * Directory structure: sessions/YYYY/MM/DD/rollout-*.jsonl
 */
export async function scanCodexTranscripts(
  basePath: string,
  config: AgentConfig
): Promise<TranscriptMeta[]> {
  const results: TranscriptMeta[] = [];

  try {
    // Scan year directories
    const years = await readdir(basePath, { withFileTypes: true });

    for (const year of years) {
      if (!year.isDirectory()) continue;

      const yearPath = join(basePath, year.name);

      try {
        const months = await readdir(yearPath, { withFileTypes: true });

        for (const month of months) {
          if (!month.isDirectory()) continue;

          const monthPath = join(yearPath, month.name);

          try {
            const days = await readdir(monthPath, { withFileTypes: true });

            for (const day of days) {
              if (!day.isDirectory()) continue;

              const dayPath = join(monthPath, day.name);

              try {
                const files = await readdir(dayPath, { withFileTypes: true });

                for (const file of files) {
                  if (file.isFile() && file.name.endsWith(config.extension)) {
                    const filePath = join(dayPath, file.name);
                    const transcript = await parseCodexMeta(filePath);
                    if (transcript) {
                      results.push(transcript);
                    }
                  }
                }
              } catch {
                // Ignore read errors for day directory
              }
            }
          } catch {
            // Ignore read errors for month directory
          }
        }
      } catch {
        // Ignore read errors for year directory
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return results;
}

/**
 * Parse metadata from a Codex transcript file.
 */
async function parseCodexMeta(
  filePath: string
): Promise<TranscriptMeta | null> {
  try {
    const stats = await stat(filePath);
    const fileName = basename(filePath, ".jsonl");

    let startTime: number | null = null;
    let endTime: number | null = null;
    let name = fileName;
    let projectDir: string | null = null;

    // Extract date from path: .codex/sessions/YYYY/MM/DD/rollout-...
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
    if (match?.[1]) {
      name = match[1].replace(/-/g, ":").replace("T", " ");
    }

    // Stream JSONL to extract metadata
    const file = Bun.file(filePath);
    const fileSize = stats.size;

    // Read first chunk
    const firstChunkSize = Math.min(CHUNK_SIZE, fileSize);
    const firstChunk = await file.slice(0, firstChunkSize).text();
    const firstLines = firstChunk.split("\n").filter((l) => l.trim());

    for (const line of firstLines.slice(0, 50)) {
      try {
        const obj = JSON.parse(line);
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

    // Read last chunk for end time
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

    // Estimate message count
    const messageCount = Math.round(stats.size / 800);

    return {
      id: `codex:${fileName}`,
      agent: "codex",
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
