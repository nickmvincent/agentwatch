/**
 * File system utilities for agentwatch storage.
 *
 * These utilities handle common file operations with consistent
 * error handling and path expansion.
 */

import { existsSync, mkdirSync, writeFileSync, renameSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

/**
 * Expand ~ to home directory in paths.
 *
 * @example
 * expandPath("~/.agentwatch/hooks") // => "/Users/john/.agentwatch/hooks"
 */
export function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Ensure the parent directory of a file path exists.
 * Creates directories recursively if needed.
 *
 * @example
 * ensureDir("/path/to/file.json") // Creates /path/to/ if needed
 */
export function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @example
 * ensureDirectory("~/.agentwatch/hooks")
 */
export function ensureDirectory(dirPath: string): void {
  const expanded = expandPath(dirPath);
  if (!existsSync(expanded)) {
    mkdirSync(expanded, { recursive: true });
  }
}

/**
 * Get today's date string in YYYY-MM-DD format.
 * Used for date-partitioned log files.
 */
export function getDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get a date-partitioned file path.
 *
 * @example
 * getDatePartitionedPath("~/.agentwatch/hooks/sessions_*.jsonl")
 * // => "/Users/john/.agentwatch/hooks/sessions_2024-01-15.jsonl"
 */
export function getDatePartitionedPath(
  pattern: string,
  date: Date = new Date()
): string {
  const dateStr = getDateString(date);
  const expanded = expandPath(pattern);
  return expanded.replace("*", dateStr);
}

/**
 * Write a file atomically by writing to a temp file first.
 * This prevents partial writes if the process crashes.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const expanded = expandPath(filePath);
  ensureDir(expanded);

  const tempPath = `${expanded}.tmp.${process.pid}`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, expanded);
}

/**
 * Check if a file or directory exists.
 */
export function pathExists(path: string): boolean {
  return existsSync(expandPath(path));
}
