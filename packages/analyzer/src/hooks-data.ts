/**
 * Hook session + tool usage readers.
 *
 * Shared helper for analyzer routes that need hook data without a watcher.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { HookSession, ToolUsage } from "@agentwatch/core";

const HOOKS_DIR = join(homedir(), ".agentwatch", "hooks");

export function readHookSessions(days = 30): HookSession[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = new Map<string, HookSession>();

  if (!existsSync(HOOKS_DIR)) return [];

  const loadSessionsFromFile = (filepath: string) => {
    try {
      const content = readFileSync(filepath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const session = JSON.parse(line) as HookSession;
          if (session.startTime >= cutoff) {
            sessions.set(session.sessionId, session);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore file errors.
    }
  };

  const legacyFile = join(HOOKS_DIR, "sessions.jsonl");
  if (existsSync(legacyFile)) {
    loadSessionsFromFile(legacyFile);
  }

  try {
    for (const name of readdirSync(HOOKS_DIR)) {
      if (name.startsWith("sessions_") && name.endsWith(".jsonl")) {
        loadSessionsFromFile(join(HOOKS_DIR, name));
      }
    }
  } catch {
    // Ignore listing errors.
  }

  return [...sessions.values()];
}

export function readToolUsages(days = 30): Map<string, ToolUsage[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const usagesBySession = new Map<string, ToolUsage[]>();

  if (!existsSync(HOOKS_DIR)) return usagesBySession;

  const loadUsagesFromFile = (filepath: string) => {
    try {
      const content = readFileSync(filepath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const usage = JSON.parse(line) as ToolUsage;
          if (usage.timestamp >= cutoff) {
            const existing = usagesBySession.get(usage.sessionId) || [];
            existing.push(usage);
            usagesBySession.set(usage.sessionId, existing);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore file errors.
    }
  };

  const legacyFile = join(HOOKS_DIR, "tool_usages.jsonl");
  if (existsSync(legacyFile)) {
    loadUsagesFromFile(legacyFile);
  }

  try {
    for (const name of readdirSync(HOOKS_DIR)) {
      if (name.startsWith("tool_usages_") && name.endsWith(".jsonl")) {
        loadUsagesFromFile(join(HOOKS_DIR, name));
      }
    }
  } catch {
    // Ignore listing errors.
  }

  return usagesBySession;
}
