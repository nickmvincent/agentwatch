/**
 * Monitoring and lifecycle routes.
 *
 * Provides endpoints for:
 * - Health checks and server status
 * - Browser lifecycle (heartbeat, shutdown)
 * - Watcher proxy
 *
 * @module routes/monitoring
 */

import type { Hono } from "hono";
import type { AnalyzerAppState } from "../api";

/**
 * Register monitoring and lifecycle routes.
 *
 * @param app - The Hono app instance
 * @param state - Analyzer app state
 */
export function registerMonitoringRoutes(
  app: Hono,
  state: AnalyzerAppState
): void {
  /**
   * GET /api/health
   *
   * Simple health check.
   *
   * @returns { status: "ok" }
   */
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  /**
   * GET /api/config
   *
   * Proxy config from watcher.
   *
   * @returns Watcher configuration or error
   */
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

  /**
   * GET /api/status
   *
   * Get analyzer server status including uptime.
   *
   * @returns {
   *   status: "ok",
   *   component: "analyzer",
   *   uptime_seconds: number,
   *   watcher_url: string
   * }
   */
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

  /**
   * POST /api/heartbeat
   *
   * Browser lifecycle heartbeat.
   * Used to detect if the browser is still connected.
   *
   * @returns { status: "ok", timestamp: number }
   */
  app.post("/api/heartbeat", (c) => {
    return c.json({ status: "ok", timestamp: Date.now() });
  });

  /**
   * POST /api/shutdown
   *
   * Trigger graceful server shutdown.
   *
   * @returns { status: "ok" }
   */
  app.post("/api/shutdown", (c) => {
    setTimeout(() => state.shutdown?.(), 10);
    return c.json({ status: "ok" });
  });
}
