/**
 * Transcript discovery and stats routes.
 *
 * Provides endpoints for:
 * - Listing local transcripts from AI agents
 * - Reading individual transcripts
 * - Aggregate statistics across transcripts
 * - Rescanning transcript index
 *
 * @module routes/transcripts
 */

import type { Hono } from "hono";
import {
  loadTranscriptIndex,
  getIndexedTranscripts,
  getIndexStats,
  updateTranscriptIndex
} from "../transcript-index";
import { readTranscript } from "../local-logs";

/**
 * Register transcript routes.
 *
 * @param app - The Hono app instance
 */
export function registerTranscriptRoutes(app: Hono): void {
  /**
   * GET /api/transcripts
   *
   * List local transcripts with pagination.
   *
   * @query agent - Filter by agent type (claude, codex, gemini)
   * @query limit - Max transcripts to return (default: 100)
   * @query offset - Pagination offset (default: 0)
   * @returns {
   *   transcripts: Array<TranscriptEntry>,
   *   total: number,
   *   offset: number,
   *   limit: number
   * }
   */
  app.get("/api/transcripts", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const agent = c.req.query("agent");
      const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
      const offset = Number.parseInt(c.req.query("offset") ?? "0", 10);

      const transcripts = getIndexedTranscripts(index, {
        agents: agent ? [agent] : undefined,
        limit
      });

      const stats = getIndexStats(index);

      // Apply offset manually (getIndexedTranscripts doesn't support it)
      const paged = transcripts.slice(offset, offset + limit);

      return c.json({
        transcripts: paged.map((t) => ({
          id: t.id,
          agent: t.agent,
          path: t.path,
          name: t.name,
          project_dir: t.projectDir,
          modified_at: t.modifiedAt,
          size_bytes: t.sizeBytes,
          message_count: t.messageCount,
          start_time: t.startTime,
          end_time: t.endTime
        })),
        total: stats.total,
        offset,
        limit
      });
    } catch {
      return c.json({
        transcripts: [],
        total: 0,
        offset: 0,
        limit: 100
      });
    }
  });

  /**
   * GET /api/transcripts/stats
   *
   * Aggregate statistics across all local transcripts.
   * Provides an overview of what data exists in the user's transcripts:
   * - Total count and size
   * - File operations summary
   * - Sensitive file detection
   * - Per-project breakdown
   *
   * NOTE: Must be registered BEFORE /api/transcripts/:id to prevent
   * "stats" from being matched as a transcript ID.
   *
   * @returns Transcript statistics object
   */
  app.get("/api/transcripts/stats", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const transcripts = getIndexedTranscripts(index, {});

      // Aggregate stats
      let totalSizeBytes = 0;
      let totalFileReads = 0;
      let totalFileWrites = 0;
      let totalFileEdits = 0;
      const sensitiveFiles: Map<
        string,
        { count: number; sessions: string[]; reason: string }
      > = new Map();
      const projectStats: Map<
        string,
        { transcripts: number; sizeBytes: number; fileReads: number }
      > = new Map();
      const fileReadCounts: Map<string, number> = new Map();

      // Sensitive patterns for detecting potentially private files
      const SENSITIVE_PATTERNS = [
        { pattern: /\.env($|\.)/, reason: "Environment file" },
        { pattern: /\.pem$/, reason: "PEM key file" },
        { pattern: /\.key$/, reason: "Key file" },
        { pattern: /id_rsa|id_ed25519|id_ecdsa/, reason: "SSH private key" },
        { pattern: /\.ssh\//, reason: "SSH directory" },
        { pattern: /credentials/i, reason: "Credentials file" },
        { pattern: /secrets?[/.]/, reason: "Secrets file" },
        { pattern: /password/i, reason: "Password file" },
        { pattern: /\.aws\//, reason: "AWS config" },
        { pattern: /\.npmrc$/, reason: "NPM config" },
        { pattern: /\.netrc$/, reason: "Netrc file" }
      ];

      // Process transcripts (limit to avoid timeout)
      const maxToProcess = 500;
      const toProcess = transcripts.slice(0, maxToProcess);

      for (const t of toProcess) {
        totalSizeBytes += t.sizeBytes;

        // Extract project name from path
        const projectMatch = t.projectDir?.match(/([^/]+)$/);
        const projectName = projectMatch?.[1] || "unknown";

        // Update project stats
        const ps = projectStats.get(projectName) || {
          transcripts: 0,
          sizeBytes: 0,
          fileReads: 0
        };
        ps.transcripts++;
        ps.sizeBytes += t.sizeBytes;
        projectStats.set(projectName, ps);

        // Read and analyze transcript
        try {
          const parsed = await readTranscript(t.id);
          if (!parsed) continue;

          for (const msg of parsed.messages) {
            if (msg.toolName === "Read" && msg.toolInput?.file_path) {
              const path = String(msg.toolInput.file_path);
              totalFileReads++;
              ps.fileReads++;
              fileReadCounts.set(path, (fileReadCounts.get(path) || 0) + 1);

              // Check for sensitive patterns
              for (const { pattern, reason } of SENSITIVE_PATTERNS) {
                if (pattern.test(path)) {
                  const existing = sensitiveFiles.get(path) || {
                    count: 0,
                    sessions: [],
                    reason
                  };
                  existing.count++;
                  if (!existing.sessions.includes(t.id)) {
                    existing.sessions.push(t.id);
                  }
                  sensitiveFiles.set(path, existing);
                  break;
                }
              }
            }

            if (msg.toolName === "Write") totalFileWrites++;
            if (msg.toolName === "Edit") totalFileEdits++;
          }
        } catch {
          // Skip unparseable transcripts
        }
      }

      // Sort and limit results
      const topFiles = [...fileReadCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([path, count]) => ({ path, count }));

      const sensitiveFilesList = [...sensitiveFiles.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([path, data]) => ({
          path,
          count: data.count,
          sessions: data.sessions.slice(0, 5),
          session_count: data.sessions.length,
          reason: data.reason
        }));

      const byProject = [...projectStats.entries()]
        .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes)
        .slice(0, 20)
        .map(([name, stats]) => ({ name, ...stats }));

      return c.json({
        total_transcripts: transcripts.length,
        processed_transcripts: toProcess.length,
        total_size_bytes: totalSizeBytes,
        total_size_mb: Math.round(totalSizeBytes / 1024 / 1024),
        summary: {
          file_reads: totalFileReads,
          file_writes: totalFileWrites,
          file_edits: totalFileEdits
        },
        sensitive_files: sensitiveFilesList,
        sensitive_file_count: sensitiveFilesList.length,
        top_files_read: topFiles,
        by_project: byProject
      });
    } catch {
      return c.json({
        total_transcripts: 0,
        processed_transcripts: 0,
        total_size_bytes: 0,
        total_size_mb: 0,
        summary: { file_reads: 0, file_writes: 0, file_edits: 0 },
        sensitive_files: [],
        sensitive_file_count: 0,
        top_files_read: [],
        by_project: []
      });
    }
  });

  /**
   * GET /api/transcripts/:id
   *
   * Get a specific transcript by ID.
   *
   * @param id - Transcript ID
   * @returns Transcript with content, or 404
   */
  app.get("/api/transcripts/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const index = loadTranscriptIndex();
      const entry = index.entries[id];

      if (!entry) {
        return c.json({ error: "Transcript not found" }, 404);
      }

      // Read the actual transcript file
      const content = await Bun.file(entry.path).text();
      return c.json({
        id: entry.id,
        agent: entry.agent,
        path: entry.path,
        name: entry.name,
        content,
        modified_at: entry.modifiedAt,
        size_bytes: entry.sizeBytes
      });
    } catch {
      return c.json({ error: "Transcript not found" }, 404);
    }
  });

  /**
   * POST /api/transcripts/rescan
   *
   * Trigger a transcript index rescan.
   *
   * @body force - If true, force a full scan
   * @returns { status: "ok", total: number, last_scan: string }
   */
  app.post("/api/transcripts/rescan", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const forceFullScan = body.force === true;

      const index = loadTranscriptIndex();
      await updateTranscriptIndex(index, { forceFullScan });

      const updatedIndex = loadTranscriptIndex();
      const stats = getIndexStats(updatedIndex);

      return c.json({
        status: "ok",
        total: stats.total,
        last_scan: updatedIndex.lastFullScan
      });
    } catch {
      return c.json({
        status: "ok",
        total: 0,
        last_scan: null
      });
    }
  });
}
