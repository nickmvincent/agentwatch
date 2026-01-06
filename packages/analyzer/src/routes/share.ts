/**
 * Share and export routes.
 *
 * Provides endpoints for:
 * - Checking share configuration status
 * - Exporting data to external services
 *
 * @module routes/share
 */

import type { Hono } from "hono";

/**
 * Register share routes.
 *
 * @param app - The Hono app instance
 */
export function registerShareRoutes(app: Hono): void {
  /**
   * GET /api/share/status
   *
   * Check share configuration status.
   *
   * @returns {
   *   configured: boolean,
   *   authenticated: boolean,
   *   dataset_url: string | null
   * }
   */
  app.get("/api/share/status", async (c) => {
    return c.json({
      configured: false,
      authenticated: false,
      dataset_url: null
    });
  });

  /**
   * POST /api/share/export
   *
   * Export data to configured destination.
   *
   * @returns 501 Not Implemented (placeholder)
   */
  app.post("/api/share/export", async (c) => {
    return c.json(
      {
        error: "Not implemented"
      },
      501
    );
  });
}
