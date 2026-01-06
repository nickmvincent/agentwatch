/**
 * Configuration and settings routes.
 *
 * Provides endpoints for:
 * - Watcher configuration (roots, refresh intervals)
 * - Claude Code settings management (~/.claude/settings.json)
 *
 * @module routes/config
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { Hono } from "hono";
import type { WatcherConfig } from "../config";

/**
 * Path to Claude Code's settings file.
 */
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

/**
 * Register watcher configuration routes.
 *
 * @param app - The Hono app instance
 * @param config - Current watcher configuration
 */
export function registerConfigRoutes(app: Hono, config: WatcherConfig): void {
  /**
   * GET /api/config
   *
   * Get current watcher configuration.
   *
   * @returns Configuration object (roots, repo settings, server settings)
   */
  app.get("/api/config", (c) => {
    return c.json({
      roots: config.roots,
      repo: {
        refresh_fast_seconds: config.repo.refreshFastSeconds,
        refresh_slow_seconds: config.repo.refreshSlowSeconds,
        include_untracked: config.repo.includeUntracked,
        show_clean: config.repo.showClean
      },
      watcher: {
        host: config.watcher.host,
        port: config.watcher.port,
        log_dir: config.watcher.logDir
      }
    });
  });
}

/**
 * Register Claude Code settings routes.
 *
 * These endpoints manage Claude Code's settings.json file, allowing
 * reading and modifying hooks, permissions, and other settings.
 *
 * @param app - The Hono app instance
 */
export function registerClaudeSettingsRoutes(app: Hono): void {
  /**
   * GET /api/claude/settings
   *
   * Read Claude Code settings.
   *
   * @returns {
   *   exists: boolean,
   *   path: string,
   *   settings: object | null,
   *   raw: string | null,
   *   error: string | null
   * }
   */
  app.get("/api/claude/settings", (c) => {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return c.json({
        exists: false,
        path: CLAUDE_SETTINGS_PATH,
        settings: null,
        raw: null,
        error: null
      });
    }

    try {
      const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
      const settings = JSON.parse(content) as Record<string, unknown>;
      return c.json({
        exists: true,
        path: CLAUDE_SETTINGS_PATH,
        settings,
        raw: content,
        error: null
      });
    } catch (e) {
      try {
        const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
        return c.json({
          exists: true,
          path: CLAUDE_SETTINGS_PATH,
          settings: null,
          raw: content,
          error:
            e instanceof Error ? e.message : "Failed to parse settings.json"
        });
      } catch {
        return c.json(
          {
            exists: true,
            path: CLAUDE_SETTINGS_PATH,
            settings: null,
            raw: null,
            error: "Failed to read settings.json"
          },
          400
        );
      }
    }
  });

  /**
   * PUT /api/claude/settings
   *
   * Replace Claude Code settings entirely.
   *
   * @body raw - Raw JSON string to write
   * @body settings - Settings object to write (alternative to raw)
   * @returns { success: boolean, path: string, settings: object }
   */
  app.put("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      raw?: string;
      settings?: Record<string, unknown>;
    };

    try {
      let settingsToWrite: Record<string, unknown>;

      if (body.raw !== undefined) {
        try {
          settingsToWrite = JSON.parse(body.raw);
        } catch (e) {
          return c.json(
            {
              success: false,
              error:
                "Invalid JSON: " +
                (e instanceof Error ? e.message : "Parse error")
            },
            400
          );
        }
      } else if (body.settings !== undefined) {
        settingsToWrite = body.settings;
      } else {
        return c.json(
          {
            success: false,
            error: "Either 'raw' or 'settings' must be provided"
          },
          400
        );
      }

      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settingsToWrite, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings: settingsToWrite
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to write settings"
        },
        500
      );
    }
  });

  /**
   * PATCH /api/claude/settings
   *
   * Merge updates into existing Claude Code settings.
   *
   * Deep merges for known keys (hooks, permissions, env).
   * Shallow merges for other keys.
   *
   * @body Any settings keys to merge
   * @returns { success: boolean, path: string, settings: object }
   *
   * @example
   * ```bash
   * # Add a hook while preserving existing ones
   * curl -X PATCH http://localhost:8420/api/claude/settings \
   *   -H "Content-Type: application/json" \
   *   -d '{"hooks": {"PreToolUse": [{"type": "url", "url": "..."}]}}'
   * ```
   */
  app.patch("/api/claude/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    try {
      let settings: Record<string, unknown> = {};
      if (existsSync(CLAUDE_SETTINGS_PATH)) {
        try {
          settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
        } catch {
          return c.json(
            {
              success: false,
              error:
                "Existing settings.json is invalid JSON. Use PUT to replace entirely."
            },
            400
          );
        }
      }

      // Deep merge for specific known keys
      if (body.hooks !== undefined) {
        const existingHooks = (settings.hooks ?? {}) as Record<string, unknown>;
        const newHooks = body.hooks as Record<string, unknown>;
        settings.hooks = { ...existingHooks, ...newHooks };
      }

      if (body.permissions !== undefined) {
        const existingPerms = (settings.permissions ?? {}) as Record<
          string,
          unknown
        >;
        const newPerms = body.permissions as Record<string, unknown>;
        settings.permissions = { ...existingPerms, ...newPerms };
      }

      if (body.env !== undefined) {
        const existingEnv = (settings.env ?? {}) as Record<string, unknown>;
        const newEnv = body.env as Record<string, unknown>;
        settings.env = { ...existingEnv, ...newEnv };
      }

      // Shallow merge for other keys
      for (const key of Object.keys(body)) {
        if (!["hooks", "permissions", "env"].includes(key)) {
          settings[key] = body[key];
        }
      }

      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(settings, null, 2) + "\n"
      );

      return c.json({
        success: true,
        path: CLAUDE_SETTINGS_PATH,
        settings
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to update settings"
        },
        500
      );
    }
  });
}
