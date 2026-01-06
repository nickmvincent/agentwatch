/**
 * Analytics routes.
 *
 * Provides endpoints for:
 * - Overview statistics
 * - Daily breakdowns
 * - Quality distribution
 * - Per-project analytics
 *
 * @module routes/analytics
 */

import type { Hono } from "hono";
import {
  loadTranscriptIndex,
  getIndexedTranscripts,
  getIndexStats
} from "../transcript-index";
import { getAllEnrichments, getEnrichmentStats } from "../enrichment-store";
import { loadAnalyzerConfig } from "../config";

/**
 * Register analytics routes.
 *
 * @param app - The Hono app instance
 */
export function registerAnalyticsRoutes(app: Hono): void {
  /**
   * GET /api/analytics/overview
   *
   * Get overview statistics.
   *
   * @returns {
   *   sessions: { total, with_enrichments, with_feedback },
   *   quality: { average_score, distribution },
   *   costs: { total_usd, average_per_session }
   * }
   */
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

  /**
   * GET /api/analytics/daily
   *
   * Get daily breakdown of sessions and quality.
   *
   * @query days - Number of days to include (default: 30)
   * @returns { days, daily: Array, summary }
   */
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

  /**
   * GET /api/analytics/quality-distribution
   *
   * Get quality score distribution across sessions.
   *
   * @returns {
   *   total_scored: number,
   *   distribution: Array<{ range, min, max, count, percentage }>,
   *   percentiles: { p25, p50, p75, p90 }
   * }
   */
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

  /**
   * GET /api/analytics/by-project
   *
   * Get analytics grouped by project.
   *
   * @returns {
   *   projects: Array<{ project_id, project_name, session_count, avg_quality }>,
   *   unassigned: { session_count, avg_quality }
   * }
   */
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
}
