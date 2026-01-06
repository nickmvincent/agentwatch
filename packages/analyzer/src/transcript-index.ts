/**
 * Durable transcript index for fast discovery of local AI agent transcripts.
 *
 * Replaces time-window based scanning with a persistent index that:
 * - Does full scans every 24h to catch new files
 * - Does incremental updates every 5min for changed files
 * - Persists to disk for fast startup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { discoverLocalTranscripts, type LocalTranscript } from "./local-logs";
import { logAuditEvent } from "./audit-log";

const DATA_DIR = join(homedir(), ".agentwatch");
const INDEX_DIR = join(DATA_DIR, "transcripts");
const INDEX_PATH = join(INDEX_DIR, "index.json");

/** How long before a full rescan (24 hours) */
const FULL_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How often to do incremental updates (5 minutes) */
const INCREMENTAL_INTERVAL_MS = 5 * 60 * 1000;

/** Index entry stored for each transcript */
export interface TranscriptIndexEntry {
  id: string;
  agent: string;
  path: string;
  modifiedAt: number;
  sizeBytes: number;
  discoveredAt: string;
  name: string;
  projectDir: string | null;
  messageCount: number | null;
  startTime: number | null;
  endTime: number | null;
}

/** The full index structure */
export interface TranscriptIndex {
  version: 1;
  lastFullScan: string;
  lastIncrementalUpdate: string;
  entries: Record<string, TranscriptIndexEntry>;
}

/** Options for updating the index */
export interface UpdateIndexOptions {
  /** Force a full scan even if not due */
  forceFullScan?: boolean;
  /** Agent types to scan (default: all) */
  agents?: string[];
}

/** Options for querying the index */
export interface QueryIndexOptions {
  /** Filter by agent types */
  agents?: string[];
  /** Only transcripts modified after this timestamp (ms) */
  since?: number;
  /** Only transcripts modified before this timestamp (ms) */
  until?: number;
  /** Maximum number of results */
  limit?: number;
  /** Sort order (default: newest first) */
  order?: "newest" | "oldest";
}

/**
 * Ensure the index directory exists.
 */
function ensureIndexDir(): void {
  if (!existsSync(INDEX_DIR)) {
    mkdirSync(INDEX_DIR, { recursive: true });
  }
}

/**
 * Create an empty index.
 */
function createEmptyIndex(): TranscriptIndex {
  const now = new Date().toISOString();
  return {
    version: 1,
    lastFullScan: "1970-01-01T00:00:00.000Z",
    lastIncrementalUpdate: now,
    entries: {}
  };
}

/**
 * Check if a Gemini ID uses the old format (without project hash).
 * Old format: gemini:session-1
 * New format: gemini:<hash>:session-1
 */
function isOldGeminiId(id: string): boolean {
  if (!id.startsWith("gemini:")) return false;
  // Old format has exactly one colon, new format has two
  const parts = id.split(":");
  return parts.length === 2;
}

/**
 * Load the transcript index from disk.
 * Migrates old Gemini IDs by forcing a full rescan.
 */
export function loadTranscriptIndex(): TranscriptIndex {
  if (!existsSync(INDEX_PATH)) {
    return createEmptyIndex();
  }

  try {
    const data = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
    // Validate version
    if (data.version !== 1) {
      console.log(
        `[transcript-index] Index version ${data.version} not supported, creating new index`
      );
      return createEmptyIndex();
    }

    // Migrate old Gemini IDs: remove them so they get rediscovered with new format
    const oldGeminiIds = Object.keys(data.entries).filter(isOldGeminiId);
    if (oldGeminiIds.length > 0) {
      console.log(
        `[transcript-index] Migrating ${oldGeminiIds.length} old Gemini transcript IDs`
      );
      for (const id of oldGeminiIds) {
        delete data.entries[id];
      }
      // Force full rescan to rediscover with new IDs
      data.lastFullScan = "1970-01-01T00:00:00.000Z";
      saveTranscriptIndex(data);
    }

    return data;
  } catch (err) {
    console.error("[transcript-index] Failed to load index:", err);
    return createEmptyIndex();
  }
}

/**
 * Save the transcript index to disk.
 */
export function saveTranscriptIndex(index: TranscriptIndex): void {
  ensureIndexDir();
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

/**
 * Update the transcript index.
 * - Does a full scan if due (every 24h) or forced
 * - Otherwise does incremental update (check for changed files)
 */
export async function updateTranscriptIndex(
  index: TranscriptIndex,
  options: UpdateIndexOptions = {}
): Promise<{
  index: TranscriptIndex;
  added: number;
  updated: number;
  removed: number;
}> {
  const now = new Date();
  const nowStr = now.toISOString();
  const lastFullScan = new Date(index.lastFullScan).getTime();
  const timeSinceFullScan = now.getTime() - lastFullScan;

  let added = 0;
  let updated = 0;
  let removed = 0;

  // Determine if we need a full scan
  const needsFullScan =
    options.forceFullScan || timeSinceFullScan >= FULL_SCAN_INTERVAL_MS;

  if (needsFullScan) {
    // Full scan: discover all transcripts
    const transcripts = await discoverLocalTranscripts(options.agents);

    // Build new entries map
    const newEntries: Record<string, TranscriptIndexEntry> = {};
    const existingIds = new Set(Object.keys(index.entries));

    for (const t of transcripts) {
      const existing = index.entries[t.id];

      if (!existing) {
        // New transcript
        newEntries[t.id] = {
          ...t,
          discoveredAt: nowStr
        };
        added++;

        logAuditEvent(
          "transcript",
          "discover",
          t.id,
          `Discovered transcript: ${t.name.slice(0, 50)}`,
          { agent: t.agent, path: t.path },
          "inferred"
        );
      } else if (t.modifiedAt > existing.modifiedAt) {
        // Updated transcript
        newEntries[t.id] = {
          ...t,
          discoveredAt: existing.discoveredAt
        };
        updated++;
      } else {
        // Unchanged - keep existing
        newEntries[t.id] = existing;
      }

      existingIds.delete(t.id);
    }

    // Remaining IDs are removed transcripts
    removed = existingIds.size;

    const updatedIndex: TranscriptIndex = {
      version: 1,
      lastFullScan: nowStr,
      lastIncrementalUpdate: nowStr,
      entries: newEntries
    };

    saveTranscriptIndex(updatedIndex);

    if (added > 0 || updated > 0 || removed > 0) {
      console.log(
        `[transcript-index] Full scan: ${added} added, ${updated} updated, ${removed} removed`
      );
    }

    return { index: updatedIndex, added, updated, removed };
  } else {
    // Incremental update: just check existing files for changes
    // and scan for new files in the same locations

    const transcripts = await discoverLocalTranscripts(options.agents);
    const newEntries = { ...index.entries };

    for (const t of transcripts) {
      const existing = newEntries[t.id];

      if (!existing) {
        // New transcript
        newEntries[t.id] = {
          ...t,
          discoveredAt: nowStr
        };
        added++;

        logAuditEvent(
          "transcript",
          "discover",
          t.id,
          `Discovered transcript: ${t.name.slice(0, 50)}`,
          { agent: t.agent, path: t.path },
          "inferred"
        );
      } else if (t.modifiedAt > existing.modifiedAt) {
        // Updated transcript
        newEntries[t.id] = {
          ...t,
          discoveredAt: existing.discoveredAt
        };
        updated++;
      }
    }

    // Note: Incremental update doesn't remove entries (that happens on full scan)

    const updatedIndex: TranscriptIndex = {
      version: 1,
      lastFullScan: index.lastFullScan,
      lastIncrementalUpdate: nowStr,
      entries: newEntries
    };

    saveTranscriptIndex(updatedIndex);

    if (added > 0 || updated > 0) {
      console.log(
        `[transcript-index] Incremental: ${added} added, ${updated} updated`
      );
    }

    return { index: updatedIndex, added, updated, removed: 0 };
  }
}

/**
 * Query the index for transcripts matching the given criteria.
 */
export function getIndexedTranscripts(
  index: TranscriptIndex,
  options: QueryIndexOptions = {}
): LocalTranscript[] {
  let results = Object.values(index.entries);

  // Filter by agents
  if (options.agents && options.agents.length > 0) {
    const agentSet = new Set(options.agents);
    results = results.filter((t) => agentSet.has(t.agent));
  }

  // Filter by time range
  if (options.since !== undefined) {
    results = results.filter((t) => t.modifiedAt >= options.since!);
  }
  if (options.until !== undefined) {
    results = results.filter((t) => t.modifiedAt <= options.until!);
  }

  // Sort
  if (options.order === "oldest") {
    results.sort((a, b) => a.modifiedAt - b.modifiedAt);
  } else {
    results.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  // Limit
  if (options.limit !== undefined && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

/**
 * Get the count of indexed transcripts.
 */
export function getIndexStats(index: TranscriptIndex): {
  total: number;
  byAgent: Record<string, number>;
  lastFullScan: string;
  lastIncrementalUpdate: string;
} {
  const byAgent: Record<string, number> = {};

  for (const entry of Object.values(index.entries)) {
    byAgent[entry.agent] = (byAgent[entry.agent] || 0) + 1;
  }

  return {
    total: Object.keys(index.entries).length,
    byAgent,
    lastFullScan: index.lastFullScan,
    lastIncrementalUpdate: index.lastIncrementalUpdate
  };
}

/**
 * Check if an incremental update is due.
 */
export function isIncrementalUpdateDue(index: TranscriptIndex): boolean {
  const lastUpdate = new Date(index.lastIncrementalUpdate).getTime();
  const now = Date.now();
  return now - lastUpdate >= INCREMENTAL_INTERVAL_MS;
}

/**
 * Check if a full scan is due.
 */
export function isFullScanDue(index: TranscriptIndex): boolean {
  const lastScan = new Date(index.lastFullScan).getTime();
  const now = Date.now();
  return now - lastScan >= FULL_SCAN_INTERVAL_MS;
}

/**
 * Remove a transcript from the index (e.g., when file is deleted).
 */
export function removeFromIndex(
  index: TranscriptIndex,
  transcriptId: string
): TranscriptIndex {
  const { [transcriptId]: removed, ...remaining } = index.entries;

  if (removed) {
    const updatedIndex: TranscriptIndex = {
      ...index,
      lastIncrementalUpdate: new Date().toISOString(),
      entries: remaining
    };
    saveTranscriptIndex(updatedIndex);
    return updatedIndex;
  }

  return index;
}

/**
 * Force rebuild the entire index.
 */
export async function rebuildTranscriptIndex(
  agents?: string[]
): Promise<TranscriptIndex> {
  const { index } = await updateTranscriptIndex(createEmptyIndex(), {
    forceFullScan: true,
    agents
  });
  return index;
}
