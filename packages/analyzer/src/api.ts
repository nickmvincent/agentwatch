/**
 * Analyzer API routes.
 *
 * Handles:
 * - /api/health, /api/status
 * - /api/heartbeat - Browser lifecycle heartbeat
 * - /api/enrichments/* - Session enrichments
 * - /api/transcripts/* - Transcript browsing
 * - /api/annotations/* - Manual annotations
 * - /api/analytics/* - Aggregated statistics
 * - /api/share/* - Export and contribution
 * - Static files for web UI
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";

// Import data stores
import {
  loadTranscriptIndex,
  getIndexedTranscripts,
  getIndexStats,
  updateTranscriptIndex
} from "./transcript-index";
import { readTranscript } from "./local-logs";
import {
  getAllEnrichments,
  getEnrichments,
  getEnrichmentStats,
  setManualAnnotation as setEnrichmentAnnotation,
  updateUserTags,
  bulkGetEnrichments,
  deleteEnrichments
} from "./enrichment-store";
import {
  getAllAnnotations,
  getAnnotation,
  setAnnotation,
  deleteAnnotation,
  getAnnotationStats
} from "./annotations";
import {
  loadAnalyzerConfig,
  addProject,
  updateProject,
  removeProject,
  type ProjectConfig
} from "./config";

export interface AnalyzerAppState {
  startedAt: number;
  watcherUrl: string;
  shutdown?: () => void;
}

export function createAnalyzerApp(state: AnalyzerAppState): Hono {
  const app = new Hono();

  // Request logging (enable with DEBUG=1)
  if (process.env.DEBUG) {
    app.use("*", logger());
  }

  // CORS for browser access
  app.use(
    "/api/*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true
    })
  );

  // =========== Health & Status ===========
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  // Proxy config from watcher
  app.get("/api/config", async (c) => {
    try {
      const res = await fetch(`${state.watcherUrl}/api/config`);
      if (res.ok) {
        const config = await res.json();
        return c.json(config);
      }
      return c.json({ error: "Watcher not available" }, 503);
    } catch {
      return c.json({ error: "Watcher not available" }, 503);
    }
  });

  app.get("/api/status", (c) => {
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - state.startedAt) / 1000)
    );
    return c.json({
      status: "ok",
      component: "analyzer",
      uptime_seconds: uptimeSeconds,
      watcher_url: state.watcherUrl
    });
  });

  // =========== Browser Lifecycle ===========
  app.post("/api/heartbeat", (c) => {
    // Heartbeat is handled by the server, this just acknowledges
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });

  // =========== Enrichments ===========
  app.get("/api/enrichments", async (c) => {
    try {
      const enrichments = getAllEnrichments();
      const stats = getEnrichmentStats();

      // Convert to array format for API
      const sessions = Object.entries(enrichments).map(([id, e]) => ({
        session_id: id,
        ...e
      }));

      return c.json({
        sessions,
        stats: {
          total: stats.totalSessions,
          with_quality_score:
            stats.qualityDistribution.excellent +
            stats.qualityDistribution.good +
            stats.qualityDistribution.fair +
            stats.qualityDistribution.poor,
          with_annotations: stats.annotated.positive + stats.annotated.negative,
          with_auto_tags: stats.byType.autoTags,
          // Include annotated breakdown for UI compatibility
          annotated: {
            positive: stats.annotated.positive,
            negative: stats.annotated.negative
          }
        }
      });
    } catch {
      return c.json({
        sessions: [],
        stats: {
          total: 0,
          with_quality_score: 0,
          with_annotations: 0,
          with_auto_tags: 0,
          annotated: { positive: 0, negative: 0 }
        }
      });
    }
  });

  app.get("/api/enrichments/workflow-stats", async (c) => {
    try {
      const stats = getEnrichmentStats();
      const withAnnotations =
        stats.annotated.positive + stats.annotated.negative;
      return c.json({
        total: stats.totalSessions,
        reviewed: withAnnotations,
        ready_to_contribute: stats.annotated.positive,
        skipped: 0,
        pending: stats.totalSessions - withAnnotations
      });
    } catch {
      return c.json({
        total: 0,
        reviewed: 0,
        ready_to_contribute: 0,
        skipped: 0,
        pending: 0
      });
    }
  });

  app.get("/api/enrichments/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      // Try with transcriptId first
      const enrichment = getEnrichments({ transcriptId: sessionId });

      if (!enrichment) {
        return c.json({ error: "Enrichment not found" }, 404);
      }

      return c.json({
        session_id: sessionId,
        ...enrichment
      });
    } catch {
      return c.json({ error: "Enrichment not found" }, 404);
    }
  });

  app.post("/api/enrichments/:sessionId/annotation", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();

      // Map rating to feedback type
      const feedback =
        body.thumbs ||
        (body.rating >= 4 ? "positive" : body.rating <= 2 ? "negative" : null);

      setEnrichmentAnnotation({ transcriptId: sessionId }, feedback, {
        notes: body.notes
      });

      return c.json({ status: "ok", session_id: sessionId });
    } catch (err) {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

  app.post("/api/enrichments/:sessionId/tags", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();
      const tags = body.tags || [];

      const enrichment = updateUserTags({ transcriptId: sessionId }, tags);

      return c.json({
        success: true,
        session_id: sessionId,
        tags: enrichment.autoTags?.userTags || []
      });
    } catch (err) {
      return c.json({ error: "Failed to update tags" }, 500);
    }
  });

  app.post("/api/enrichments/bulk", async (c) => {
    try {
      const body = await c.req.json();
      const sessionIds = body.session_ids || [];

      const refs = sessionIds.map((id: string) => ({ transcriptId: id }));
      const enrichments = bulkGetEnrichments(refs);

      const result: Record<string, unknown> = {};
      for (const [id, e] of Object.entries(enrichments)) {
        if (e) {
          result[id] = {
            session_id: id,
            auto_tags: e.autoTags,
            outcome_signals: e.outcomeSignals,
            quality_score: e.qualityScore,
            manual_annotation: e.manualAnnotation,
            loop_detection: e.loopDetection,
            diff_snapshot: e.diffSnapshot,
            updated_at: e.updatedAt
          };
        } else {
          result[id] = null;
        }
      }

      return c.json({
        enrichments: result,
        found: Object.values(enrichments).filter(Boolean).length,
        missing: Object.values(enrichments).filter((e) => !e).length
      });
    } catch {
      return c.json({ enrichments: {}, found: 0, missing: 0 });
    }
  });

  app.delete("/api/enrichments/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");

    const deleted = deleteEnrichments({ transcriptId: sessionId });

    if (!deleted) {
      return c.json({ error: "Enrichment not found" }, 404);
    }

    return c.json({ success: true });
  });

  // =========== Transcripts ===========
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
   * @returns {
   *   total_transcripts: number,
   *   processed_transcripts: number,
   *   total_size_bytes: number,
   *   total_size_mb: number,
   *   summary: { file_reads: number, file_writes: number, file_edits: number },
   *   sensitive_files: Array<{ path: string, count: number, reason: string }>,
   *   sensitive_file_count: number,
   *   top_files_read: Array<{ path: string, count: number }>,
   *   by_project: Array<{ name: string, transcripts: number, sizeBytes: number }>
   * }
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

  /**
   * GET /api/enrichments/privacy-risk/:transcriptId
   *
   * Analyze a transcript for privacy-sensitive content before sharing.
   * Returns a risk assessment with detailed breakdown of:
   * - Files read, written, and edited
   * - Domains accessed via WebFetch
   * - Sensitive files detected (env files, keys, credentials)
   * - Risk level (low, medium, high)
   *
   * @param transcriptId - The transcript ID to analyze
   * @returns Privacy risk assessment object
   */
  app.get("/api/enrichments/privacy-risk/:transcriptId", async (c) => {
    const transcriptId = c.req.param("transcriptId");

    try {
      const parsed = await readTranscript(transcriptId);
      if (!parsed) {
        return c.json({ error: "Transcript not found" }, 404);
      }

      const filesRead: string[] = [];
      const filesWritten: string[] = [];
      const filesEdited: string[] = [];
      const domains: string[] = [];
      const sensitivePatterns: { path: string; reason: string }[] = [];

      // Patterns that indicate potentially sensitive file access
      const SENSITIVE_PATTERNS = [
        {
          pattern: /\.env($|\.)/,
          reason: "Environment file (may contain secrets)"
        },
        { pattern: /\.pem$/, reason: "PEM certificate/key file" },
        { pattern: /\.key$/, reason: "Key file" },
        { pattern: /id_rsa|id_ed25519|id_ecdsa/, reason: "SSH private key" },
        { pattern: /\.ssh\//, reason: "SSH directory" },
        { pattern: /credentials/, reason: "Credentials file" },
        { pattern: /secrets?[/.]/, reason: "Secrets file/directory" },
        { pattern: /password/, reason: "Password file" },
        { pattern: /\.aws\//, reason: "AWS configuration" },
        { pattern: /\.docker\/config\.json/, reason: "Docker credentials" },
        { pattern: /\.npmrc/, reason: "NPM config (may contain tokens)" },
        { pattern: /\.pypirc/, reason: "PyPI config (may contain tokens)" },
        { pattern: /\.netrc/, reason: "Netrc file (may contain passwords)" },
        { pattern: /config\.json$/, reason: "Config file (review for secrets)" }
      ];

      for (const msg of parsed.messages) {
        // Check tool uses
        if (msg.toolName === "Read" && msg.toolInput?.file_path) {
          const path = String(msg.toolInput.file_path);
          filesRead.push(path);

          // Check for sensitive patterns
          for (const { pattern, reason } of SENSITIVE_PATTERNS) {
            if (pattern.test(path)) {
              sensitivePatterns.push({ path, reason });
              break;
            }
          }
        }

        if (msg.toolName === "Write" && msg.toolInput?.file_path) {
          filesWritten.push(String(msg.toolInput.file_path));
        }

        if (msg.toolName === "Edit" && msg.toolInput?.file_path) {
          filesEdited.push(String(msg.toolInput.file_path));
        }

        if (msg.toolName === "WebFetch" && msg.toolInput?.url) {
          try {
            const url = new URL(String(msg.toolInput.url));
            if (!domains.includes(url.hostname)) {
              domains.push(url.hostname);
            }
          } catch {
            /* invalid URL */
          }
        }
      }

      // Deduplicate
      const uniqueFilesRead = [...new Set(filesRead)];
      const uniqueFilesWritten = [...new Set(filesWritten)];
      const uniqueFilesEdited = [...new Set(filesEdited)];

      // Risk level assessment
      let riskLevel: "low" | "medium" | "high" = "low";
      if (sensitivePatterns.length > 0) {
        riskLevel = "high";
      } else if (uniqueFilesRead.length > 20 || domains.length > 5) {
        riskLevel = "medium";
      }

      return c.json({
        transcript_id: transcriptId,
        risk_level: riskLevel,
        summary: {
          files_read: uniqueFilesRead.length,
          files_written: uniqueFilesWritten.length,
          files_edited: uniqueFilesEdited.length,
          domains_accessed: domains.length,
          sensitive_files: sensitivePatterns.length,
          total_messages: parsed.messages.length
        },
        files_read: uniqueFilesRead,
        files_written: uniqueFilesWritten,
        files_edited: uniqueFilesEdited,
        domains_accessed: domains,
        sensitive_files: sensitivePatterns,
        recommendations:
          sensitivePatterns.length > 0
            ? [
                "Use 'Tool Usage Patterns' profile (shares no file contents)",
                "Manually review files listed above before sharing 'Full Transcript'"
              ]
            : []
      });
    } catch {
      return c.json({ error: "Failed to analyze transcript" }, 500);
    }
  });

  // =========== Analytics ===========
  app.get("/api/analytics/overview", async (c) => {
    try {
      const index = loadTranscriptIndex();
      const indexStats = getIndexStats(index);
      const enrichStats = getEnrichmentStats();
      const withFeedback =
        enrichStats.annotated.positive + enrichStats.annotated.negative;

      return c.json({
        sessions: {
          total: indexStats.total,
          with_enrichments: enrichStats.totalSessions,
          with_feedback: withFeedback
        },
        quality: {
          average_score: null,
          distribution: enrichStats.qualityDistribution
        },
        costs: {
          total_usd: 0,
          average_per_session: 0
        }
      });
    } catch {
      return c.json({
        sessions: { total: 0, with_enrichments: 0, with_feedback: 0 },
        quality: { average_score: null, distribution: {} },
        costs: { total_usd: 0, average_per_session: 0 }
      });
    }
  });

  app.get("/api/analytics/daily", async (c) => {
    const days = Number.parseInt(c.req.query("days") ?? "30", 10);
    try {
      const index = loadTranscriptIndex();
      const transcripts = getIndexedTranscripts(index, {});
      const enrichments = getAllEnrichments();

      // Group by date
      const byDate = new Map<
        string,
        { total: number; success: number; failure: number }
      >();
      const cutoff = Date.now() - days * 86400 * 1000;

      for (const t of transcripts) {
        if (t.modifiedAt < cutoff) continue;
        const date = new Date(t.modifiedAt).toISOString().slice(0, 10);
        const stats = byDate.get(date) || { total: 0, success: 0, failure: 0 };
        stats.total++;

        // Check enrichment quality
        const enrichment = enrichments[`transcript:${t.id}`];
        if (enrichment?.qualityScore) {
          if (enrichment.qualityScore.overall >= 60) stats.success++;
          else if (enrichment.qualityScore.overall < 40) stats.failure++;
        }

        byDate.set(date, stats);
      }

      const dailyData = Array.from(byDate.entries())
        .map(([date, stats]) => ({
          date,
          total: stats.total,
          success_count: stats.success,
          failure_count: stats.failure,
          rate:
            stats.total > 0
              ? Math.round((stats.success / stats.total) * 1000) / 10
              : 0
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return c.json({
        days,
        daily: dailyData,
        summary: {
          total_days: dailyData.length,
          total_sessions: dailyData.reduce((sum, d) => sum + d.total, 0)
        }
      });
    } catch {
      return c.json({
        days,
        daily: [],
        summary: { total_days: 0, total_sessions: 0 }
      });
    }
  });

  app.get("/api/analytics/quality-distribution", (c) => {
    try {
      const enrichments = getAllEnrichments();

      const buckets = [
        { range: "0-25", min: 0, max: 25, count: 0 },
        { range: "25-50", min: 25, max: 50, count: 0 },
        { range: "50-75", min: 50, max: 75, count: 0 },
        { range: "75-100", min: 75, max: 100, count: 0 }
      ];

      let total = 0;
      const scores: number[] = [];

      for (const enrichment of Object.values(enrichments)) {
        if (!enrichment.qualityScore) continue;

        const score = enrichment.qualityScore.overall;
        scores.push(score);
        total++;

        for (const bucket of buckets) {
          if (score >= bucket.min && score < bucket.max) {
            bucket.count++;
            break;
          }
          if (score >= 100 && bucket.max === 100) {
            bucket.count++;
            break;
          }
        }
      }

      scores.sort((a, b) => a - b);
      const percentiles = {
        p25: scores[Math.floor(scores.length * 0.25)] || 0,
        p50: scores[Math.floor(scores.length * 0.5)] || 0,
        p75: scores[Math.floor(scores.length * 0.75)] || 0,
        p90: scores[Math.floor(scores.length * 0.9)] || 0
      };

      return c.json({
        total_scored: total,
        distribution: buckets.map((b) => ({
          range: b.range,
          min: b.min,
          max: b.max,
          count: b.count,
          percentage: total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0
        })),
        percentiles
      });
    } catch {
      return c.json({ total_scored: 0, distribution: [], percentiles: {} });
    }
  });

  app.get("/api/analytics/by-project", async (c) => {
    try {
      const config = loadAnalyzerConfig();
      const index = loadTranscriptIndex();
      const transcripts = getIndexedTranscripts(index, {});
      const enrichments = getAllEnrichments();

      // Group transcripts by project
      const byProject = new Map<
        string,
        {
          name: string;
          count: number;
          quality_sum: number;
          quality_count: number;
        }
      >();

      // Initialize projects
      for (const project of config.projects) {
        byProject.set(project.id, {
          name: project.name,
          count: 0,
          quality_sum: 0,
          quality_count: 0
        });
      }

      // Unassigned bucket
      const unassigned = { count: 0, quality_sum: 0, quality_count: 0 };

      for (const t of transcripts) {
        const enrichment = enrichments[`transcript:${t.id}`];
        const qualityScore = enrichment?.qualityScore?.overall;

        // Find matching project
        let matched = false;
        for (const project of config.projects) {
          for (const path of project.paths) {
            if (t.projectDir?.startsWith(path)) {
              const stats = byProject.get(project.id);
              if (stats) {
                stats.count++;
                if (qualityScore !== undefined) {
                  stats.quality_sum += qualityScore;
                  stats.quality_count++;
                }
              }
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        if (!matched) {
          unassigned.count++;
          if (qualityScore !== undefined) {
            unassigned.quality_sum += qualityScore;
            unassigned.quality_count++;
          }
        }
      }

      const projects = Array.from(byProject.entries()).map(([id, stats]) => ({
        project_id: id,
        project_name: stats.name,
        session_count: stats.count,
        avg_quality:
          stats.quality_count > 0
            ? Math.round(stats.quality_sum / stats.quality_count)
            : null
      }));

      return c.json({
        projects,
        unassigned: {
          session_count: unassigned.count,
          avg_quality:
            unassigned.quality_count > 0
              ? Math.round(unassigned.quality_sum / unassigned.quality_count)
              : null
        }
      });
    } catch {
      return c.json({
        projects: [],
        unassigned: { session_count: 0, avg_quality: null }
      });
    }
  });

  // =========== Annotations ===========
  app.get("/api/annotations", async (c) => {
    try {
      const annotations = getAllAnnotations();
      const list = Object.entries(annotations).map(([id, a]) => ({
        session_id: id,
        ...a
      }));
      return c.json({ annotations: list });
    } catch {
      return c.json({ annotations: [] });
    }
  });

  app.get("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const annotation = getAnnotation(sessionId);

      if (!annotation) {
        return c.json({ error: "Annotation not found" }, 404);
      }

      return c.json({ session_id: sessionId, ...annotation });
    } catch {
      return c.json({ error: "Annotation not found" }, 404);
    }
  });

  app.post("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const body = await c.req.json();

      // setAnnotation(sessionId, feedback, notes) - feedback is "positive" | "negative" | null
      const feedback =
        body.feedback ||
        (body.rating >= 4 ? "positive" : body.rating <= 2 ? "negative" : null);
      setAnnotation(sessionId, feedback, body.notes);

      return c.json({ status: "ok", session_id: sessionId });
    } catch {
      return c.json({ error: "Failed to save annotation" }, 500);
    }
  });

  app.delete("/api/annotations/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      const deleted = deleteAnnotation(sessionId);

      if (!deleted) {
        return c.json({ error: "Annotation not found" }, 404);
      }

      return c.json({ status: "ok", session_id: sessionId });
    } catch {
      return c.json({ error: "Annotation not found" }, 404);
    }
  });

  // =========== Projects ===========
  app.get("/api/projects", (c) => {
    const config = loadAnalyzerConfig();
    return c.json({
      projects: config.projects.map((p) => ({
        id: p.id,
        name: p.name,
        paths: p.paths,
        description: p.description
      }))
    });
  });

  app.get("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const config = loadAnalyzerConfig();
    const project = config.projects.find((p) => p.id === id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({
      id: project.id,
      name: project.name,
      paths: project.paths,
      description: project.description
    });
  });

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json()) as {
      id: string;
      name: string;
      paths: string[];
      description?: string;
    };

    // Validate required fields
    if (
      !body.id ||
      !body.name ||
      !Array.isArray(body.paths) ||
      body.paths.length === 0
    ) {
      return c.json(
        { error: "Missing required fields: id, name, paths (non-empty array)" },
        400
      );
    }

    // Check for duplicate ID
    const config = loadAnalyzerConfig();
    if (config.projects.some((p) => p.id === body.id)) {
      return c.json({ error: "Project with this ID already exists" }, 409);
    }

    const project: ProjectConfig = {
      id: body.id,
      name: body.name,
      paths: body.paths,
      description: body.description
    };

    addProject(project);

    return c.json({ success: true, project }, 201);
  });

  app.patch("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as Partial<{
      name: string;
      paths: string[];
      description: string;
    }>;

    const config = loadAnalyzerConfig();
    const project = config.projects.find((p) => p.id === id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updates: Partial<ProjectConfig> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.paths !== undefined) updates.paths = body.paths;
    if (body.description !== undefined) updates.description = body.description;

    const success = updateProject(id, updates);
    if (!success) {
      return c.json({ error: "Failed to update project" }, 500);
    }

    // Reload to get updated project
    const updatedConfig = loadAnalyzerConfig();
    const updatedProject = updatedConfig.projects.find((p) => p.id === id);

    return c.json({
      success: true,
      project: updatedProject
        ? {
            id: updatedProject.id,
            name: updatedProject.name,
            paths: updatedProject.paths,
            description: updatedProject.description
          }
        : null
    });
  });

  app.delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const success = removeProject(id);

    if (!success) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({ success: true });
  });

  // =========== Share/Export ===========
  app.get("/api/share/status", async (c) => {
    return c.json({
      configured: false,
      authenticated: false,
      dataset_url: null
    });
  });

  app.post("/api/share/export", async (c) => {
    return c.json(
      {
        error: "Not implemented"
      },
      501
    );
  });

  // =========== Static File Serving ===========
  // Look for built web UI in multiple locations
  const staticDirs = [
    join(process.cwd(), "web", "dist", "analyzer"),
    join(process.cwd(), "web", "dist"),
    "/usr/share/agentwatch/web/analyzer",
    join(homedir(), ".agentwatch", "web", "analyzer")
  ];

  for (const staticDir of staticDirs) {
    const indexPath = join(staticDir, "index.html");
    if (existsSync(indexPath)) {
      // Serve static assets
      app.use("/assets/*", serveStatic({ root: staticDir }));

      // Serve index.html for root
      app.get("/", serveStatic({ path: indexPath }));

      // SPA fallback - serve index.html for all non-API routes
      app.get("*", async (c) => {
        const path = c.req.path;
        if (path.startsWith("/api/")) {
          return c.notFound();
        }
        const file = Bun.file(indexPath);
        return new Response(file, {
          headers: { "Content-Type": "text/html" }
        });
      });

      break;
    }
  }

  return app;
}
