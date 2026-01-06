/**
 * @agentwatch/shared-api
 *
 * Shared API utilities for converting types to JSON format.
 * Used by both watcher and analyzer packages.
 */

// Dict converters
export {
  repoToDict,
  agentToDict,
  hookSessionToDict,
  toolUsageToDict,
  toolStatsToDict,
  dailyStatsToDict,
  gitCommitToDict,
  processSnapshotToDict,
  processEventToDict,
  portToDict,
  type ProcessSnapshot,
  type ProcessLifecycleEvent
} from "./dict-converters";

// Sanitizers
export {
  redactUserFromPath,
  sanitizeCmdline,
  sanitizeProcessSnapshot,
  sanitizeProcessEvent
} from "./sanitizers";

// Extractors
export { extractCommitHash, extractCommitMessage } from "./extractors";
