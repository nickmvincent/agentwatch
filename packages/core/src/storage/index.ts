/**
 * Storage module for agentwatch.
 *
 * Provides:
 * - Centralized storage path constants
 * - File system utilities (expandPath, ensureDir, etc.)
 * - JSON store for structured data
 * - JSONL store for append-only logs
 */

// Path constants
export * from "./paths";

// File utilities
export {
  expandPath,
  ensureDir,
  ensureDirectory,
  getDateString,
  getDatePartitionedPath,
  writeFileAtomic,
  pathExists
} from "./file-utils";

// JSON store
export {
  loadJson,
  saveJson,
  updateJson,
  createJsonStore,
  createVersionedStore,
  type JsonStoreOptions,
  type VersionedStore
} from "./json-store";

// JSONL store
export {
  appendJsonl,
  appendJsonlPartitioned,
  readJsonl,
  readJsonlPartitioned,
  getTodayPartitionPath,
  cleanupOldPartitions,
  createJsonlStore,
  createPartitionedJsonlStore
} from "./jsonl-store";
