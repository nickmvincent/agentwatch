/**
 * Append-only JSONL (JSON Lines) store for agentwatch.
 *
 * JSONL format is ideal for:
 * - Audit logs and event streams
 * - Session and tool usage tracking
 * - Any append-only data that grows over time
 *
 * Each line is a valid JSON object, making it easy to:
 * - Append without reading the whole file
 * - Stream/process large files line by line
 * - Recover from partial writes (only lose the last line)
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync
} from "fs";
import { join, basename } from "path";
import {
  expandPath,
  ensureDir,
  getDateString,
  getDatePartitionedPath
} from "./file-utils";

/**
 * Append a single record to a JSONL file.
 *
 * @example
 * appendJsonl("~/.agentwatch/events.jsonl", { type: "session_start", ts: Date.now() });
 */
export function appendJsonl<T>(filePath: string, record: T): void {
  const expanded = expandPath(filePath);
  ensureDir(expanded);
  appendFileSync(expanded, JSON.stringify(record) + "\n");
}

/**
 * Append a record to a date-partitioned JSONL file.
 * The pattern should contain a * that will be replaced with the date.
 *
 * @example
 * appendJsonlPartitioned("~/.agentwatch/hooks/sessions_*.jsonl", session);
 * // Writes to sessions_2024-01-15.jsonl
 */
export function appendJsonlPartitioned<T>(
  pattern: string,
  record: T,
  date: Date = new Date()
): void {
  const filePath = getDatePartitionedPath(pattern, date);
  appendJsonl(filePath, record);
}

/**
 * Read all records from a JSONL file.
 * Invalid lines are skipped.
 *
 * @example
 * const events = readJsonl<Event>("~/.agentwatch/events.jsonl");
 */
export function readJsonl<T>(filePath: string): T[] {
  const expanded = expandPath(filePath);

  if (!existsSync(expanded)) {
    return [];
  }

  try {
    const content = readFileSync(expanded, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((record): record is T => record !== null);
  } catch {
    return [];
  }
}

/**
 * Read records from all date-partitioned JSONL files matching a pattern.
 * Optionally filter by date range.
 *
 * @example
 * const sessions = readJsonlPartitioned<Session>("~/.agentwatch/hooks/sessions_*.jsonl", {
 *   startDate: new Date("2024-01-01"),
 *   endDate: new Date("2024-01-31")
 * });
 */
export function readJsonlPartitioned<T>(
  pattern: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
): T[] {
  const { startDate, endDate, limit } = options;
  const expanded = expandPath(pattern);
  const dir = expanded.substring(0, expanded.lastIndexOf("/"));
  const filePattern = basename(expanded).replace("*", "");

  if (!existsSync(dir)) {
    return [];
  }

  // Find all matching files
  const prefix = filePattern.split("*")[0] || "";
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))
    .map((f) => {
      // Extract date from filename (e.g., sessions_2024-01-15.jsonl)
      const match = f.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = match?.[1];
      return {
        name: f,
        path: join(dir, f),
        date: dateStr ? new Date(dateStr) : null
      };
    })
    .filter((f) => {
      if (!f.date) return true;
      if (startDate && f.date < startDate) return false;
      if (endDate && f.date > endDate) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by date descending (newest first)
      if (!a.date || !b.date) return 0;
      return b.date.getTime() - a.date.getTime();
    });

  // Read records from each file
  const records: T[] = [];
  for (const file of files) {
    const fileRecords = readJsonl<T>(file.path);
    records.push(...fileRecords);

    if (limit && records.length >= limit) {
      return records.slice(0, limit);
    }
  }

  return limit ? records.slice(0, limit) : records;
}

/**
 * Get the file path for today's date-partitioned file.
 *
 * @example
 * getTodayPartitionPath("~/.agentwatch/hooks/sessions_*.jsonl")
 * // => "/home/user/.agentwatch/hooks/sessions_2024-01-15.jsonl"
 */
export function getTodayPartitionPath(pattern: string): string {
  return getDatePartitionedPath(pattern);
}

/**
 * Clean up old date-partitioned files.
 *
 * @example
 * cleanupOldPartitions("~/.agentwatch/hooks/sessions_*.jsonl", { maxAgeDays: 30 });
 */
export function cleanupOldPartitions(
  pattern: string,
  options: {
    maxAgeDays?: number;
    maxFiles?: number;
  } = {}
): { deleted: string[]; kept: string[] } {
  const { maxAgeDays = 30, maxFiles = 100 } = options;
  const expanded = expandPath(pattern);
  const dir = expanded.substring(0, expanded.lastIndexOf("/"));
  const prefix = basename(expanded).split("*")[0] || "";

  if (!existsSync(dir)) {
    return { deleted: [], kept: [] };
  }

  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  // Find all matching files with their stats
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"))
    .map((f) => {
      const path = join(dir, f);
      try {
        const stats = statSync(path);
        return { name: f, path, mtime: stats.mtime.getTime() };
      } catch {
        return null;
      }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  const deleted: string[] = [];
  const kept: string[] = [];

  files.forEach((file, index) => {
    const age = now - file.mtime;
    const tooOld = age > maxAgeMs;
    const tooMany = index >= maxFiles;

    if (tooOld || tooMany) {
      try {
        unlinkSync(file.path);
        deleted.push(file.name);
      } catch {
        kept.push(file.name);
      }
    } else {
      kept.push(file.name);
    }
  });

  return { deleted, kept };
}

/**
 * Create a typed JSONL store for a specific file path.
 *
 * @example
 * const eventLog = createJsonlStore<AuditEvent>("~/.agentwatch/events.jsonl");
 * eventLog.append({ type: "session_start", ts: Date.now() });
 * const events = eventLog.readAll();
 */
export function createJsonlStore<T>(filePath: string) {
  return {
    /** Path to the JSONL file */
    path: expandPath(filePath),

    /** Append a record */
    append: (record: T): void => appendJsonl(filePath, record),

    /** Read all records */
    readAll: (): T[] => readJsonl(filePath),

    /** Check if the file exists */
    exists: (): boolean => existsSync(expandPath(filePath))
  };
}

/**
 * Create a date-partitioned JSONL store.
 *
 * @example
 * const sessionLog = createPartitionedJsonlStore<Session>("~/.agentwatch/hooks/sessions_*.jsonl");
 * sessionLog.append(session); // Writes to today's file
 * const sessions = sessionLog.readAll({ startDate: lastWeek });
 */
export function createPartitionedJsonlStore<T>(pattern: string) {
  return {
    /** Pattern for the JSONL files */
    pattern: expandPath(pattern),

    /** Append a record to today's partition */
    append: (record: T, date?: Date): void =>
      appendJsonlPartitioned(pattern, record, date),

    /** Read all records from matching partitions */
    readAll: (options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }): T[] => readJsonlPartitioned(pattern, options),

    /** Get today's partition path */
    todayPath: (): string => getTodayPartitionPath(pattern),

    /** Clean up old partitions */
    cleanup: (options?: { maxAgeDays?: number; maxFiles?: number }) =>
      cleanupOldPartitions(pattern, options)
  };
}
