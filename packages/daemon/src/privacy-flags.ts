/**
 * Privacy flags storage - JSONL append-only log for flagging sensitive content
 * in transcripts during review.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PrivacyFlag {
  /** Unique ID for this flag */
  id: string;
  /** Transcript/session ID this flag belongs to */
  sessionId: string;
  /** Message index or UUID within the transcript */
  messageId: string;
  /** Timestamp when flag was created */
  createdAt: string;
  /** Type of concern */
  concernType: "pii" | "secrets" | "proprietary" | "sensitive" | "other";
  /** Freeform notes about the concern */
  notes: string;
  /** Whether to exclude this message from exports */
  excludeFromExport: boolean;
  /** Specific field paths to redact (optional) */
  redactFields?: string[];
  /** Whether this flag has been resolved/addressed */
  resolved?: boolean;
  /** Resolution notes */
  resolvedNotes?: string;
  /** When resolved */
  resolvedAt?: string;
}

interface FlagEvent {
  type: "flag_created" | "flag_updated" | "flag_resolved" | "flag_deleted";
  timestamp: string;
  flag: PrivacyFlag;
}

const DATA_DIR = join(homedir(), ".agentwatch");
const FLAGS_FILE = join(DATA_DIR, "privacy-flags.jsonl");

// In-memory cache of flags
let flagsCache: Map<string, PrivacyFlag> | null = null;

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFlags(): Map<string, PrivacyFlag> {
  if (flagsCache) return flagsCache;

  flagsCache = new Map();

  if (!existsSync(FLAGS_FILE)) {
    return flagsCache;
  }

  try {
    const content = readFileSync(FLAGS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const event: FlagEvent = JSON.parse(line);

        if (event.type === "flag_deleted") {
          flagsCache.delete(event.flag.id);
        } else {
          flagsCache.set(event.flag.id, event.flag);
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // File read error - start fresh
  }

  return flagsCache;
}

function appendEvent(event: FlagEvent): void {
  ensureDataDir();
  appendFileSync(FLAGS_FILE, JSON.stringify(event) + "\n");

  // Update cache
  if (!flagsCache) loadFlags();
  if (event.type === "flag_deleted") {
    flagsCache!.delete(event.flag.id);
  } else {
    flagsCache!.set(event.flag.id, event.flag);
  }
}

/**
 * Get all flags for a session
 */
export function getFlagsForSession(sessionId: string): PrivacyFlag[] {
  const flags = loadFlags();
  return Array.from(flags.values()).filter((f) => f.sessionId === sessionId);
}

/**
 * Get all flags across all sessions
 */
export function getAllFlags(): PrivacyFlag[] {
  const flags = loadFlags();
  return Array.from(flags.values());
}

/**
 * Get a specific flag by ID
 */
export function getFlag(flagId: string): PrivacyFlag | undefined {
  const flags = loadFlags();
  return flags.get(flagId);
}

/**
 * Create a new privacy flag
 */
export function createFlag(
  sessionId: string,
  messageId: string,
  concernType: PrivacyFlag["concernType"],
  notes: string,
  excludeFromExport = false,
  redactFields?: string[]
): PrivacyFlag {
  const flag: PrivacyFlag = {
    id: `flag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    messageId,
    createdAt: new Date().toISOString(),
    concernType,
    notes,
    excludeFromExport,
    redactFields
  };

  appendEvent({
    type: "flag_created",
    timestamp: new Date().toISOString(),
    flag
  });

  return flag;
}

/**
 * Update an existing flag
 */
export function updateFlag(
  flagId: string,
  updates: Partial<
    Pick<
      PrivacyFlag,
      "concernType" | "notes" | "excludeFromExport" | "redactFields"
    >
  >
): PrivacyFlag | null {
  const flags = loadFlags();
  const existing = flags.get(flagId);

  if (!existing) return null;

  const updated: PrivacyFlag = {
    ...existing,
    ...updates
  };

  appendEvent({
    type: "flag_updated",
    timestamp: new Date().toISOString(),
    flag: updated
  });

  return updated;
}

/**
 * Mark a flag as resolved
 */
export function resolveFlag(
  flagId: string,
  resolvedNotes?: string
): PrivacyFlag | null {
  const flags = loadFlags();
  const existing = flags.get(flagId);

  if (!existing) return null;

  const resolved: PrivacyFlag = {
    ...existing,
    resolved: true,
    resolvedNotes,
    resolvedAt: new Date().toISOString()
  };

  appendEvent({
    type: "flag_resolved",
    timestamp: new Date().toISOString(),
    flag: resolved
  });

  return resolved;
}

/**
 * Delete a flag
 */
export function deleteFlag(flagId: string): boolean {
  const flags = loadFlags();
  const existing = flags.get(flagId);

  if (!existing) return false;

  appendEvent({
    type: "flag_deleted",
    timestamp: new Date().toISOString(),
    flag: existing
  });

  return true;
}

/**
 * Get summary stats for flags
 */
export function getFlagStats(): {
  total: number;
  byType: Record<string, number>;
  unresolved: number;
  sessionsWithFlags: number;
} {
  const flags = loadFlags();
  const flagList = Array.from(flags.values());

  const byType: Record<string, number> = {};
  const sessions = new Set<string>();
  let unresolved = 0;

  for (const flag of flagList) {
    byType[flag.concernType] = (byType[flag.concernType] || 0) + 1;
    sessions.add(flag.sessionId);
    if (!flag.resolved) unresolved++;
  }

  return {
    total: flagList.length,
    byType,
    unresolved,
    sessionsWithFlags: sessions.size
  };
}

/**
 * Clear the in-memory cache (useful for testing)
 */
export function clearFlagsCache(): void {
  flagsCache = null;
}
