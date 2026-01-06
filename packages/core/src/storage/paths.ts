/**
 * Centralized storage paths for agentwatch.
 *
 * All persistent data locations are defined here to ensure consistency
 * across packages and make it easy for users to understand where data lives.
 */

// =============================================================================
// BASE DIRECTORIES
// =============================================================================

/** Primary data directory for all agentwatch runtime data */
export const DATA_DIR = "~/.agentwatch";

/** Configuration directory (follows XDG Base Directory spec) */
export const CONFIG_DIR = "~/.config/agentwatch";

// =============================================================================
// CONFIGURATION FILES
// =============================================================================

/** Main configuration file (TOML) */
export const CONFIG_FILE = `${CONFIG_DIR}/config.toml`;

// =============================================================================
// HOOK DATA
// =============================================================================

/** Directory for hook session and tool usage data */
export const HOOKS_DIR = `${DATA_DIR}/hooks`;

/** Hook session lifecycle logs (JSONL, date-partitioned) */
export const HOOKS_SESSIONS_PATTERN = `${HOOKS_DIR}/sessions_*.jsonl`;

/** Tool usage logs (JSONL, date-partitioned) */
export const HOOKS_TOOL_USAGES_PATTERN = `${HOOKS_DIR}/tool_usages_*.jsonl`;

/** Git commits made during sessions */
export const HOOKS_COMMITS_FILE = `${HOOKS_DIR}/commits.jsonl`;

/** Aggregated hook statistics */
export const HOOKS_STATS_FILE = `${HOOKS_DIR}/stats.json`;

// =============================================================================
// PROCESS MONITORING
// =============================================================================

/** Directory for process monitoring data */
export const PROCESSES_DIR = `${DATA_DIR}/processes`;

/** Process state snapshots (JSONL, date-partitioned) */
export const PROCESSES_SNAPSHOTS_PATTERN = `${PROCESSES_DIR}/snapshots_*.jsonl`;

/** Process lifecycle events (JSONL, date-partitioned) */
export const PROCESSES_EVENTS_PATTERN = `${PROCESSES_DIR}/events_*.jsonl`;

// =============================================================================
// TRANSCRIPTS
// =============================================================================

/** Directory for transcript index and cache */
export const TRANSCRIPTS_DIR = `${DATA_DIR}/transcripts`;

/** Durable transcript index */
export const TRANSCRIPTS_INDEX_FILE = `${TRANSCRIPTS_DIR}/index.json`;

// =============================================================================
// ENRICHMENTS & ANNOTATIONS
// =============================================================================

/** Enrichments store (quality scores, auto-tags, outcomes) */
export const ENRICHMENTS_FILE = `${DATA_DIR}/enrichments/store.json`;

/** User annotations (feedback, ratings, notes) */
export const ANNOTATIONS_FILE = `${DATA_DIR}/annotations.json`;

/** Session to artifact links (PRs, repos, commits) */
export const ARTIFACTS_FILE = `${DATA_DIR}/artifacts.json`;

// =============================================================================
// METADATA
// =============================================================================

/** Agent metadata (custom names, notes, tags) */
export const AGENT_METADATA_FILE = `${DATA_DIR}/agent-metadata.json`;

/** Conversation metadata (custom names, descriptions) */
export const CONVERSATION_METADATA_FILE = `${DATA_DIR}/conversation-metadata.json`;

// =============================================================================
// SHARING & CONTRIBUTION
// =============================================================================

/** Contribution history */
export const CONTRIB_HISTORY_FILE = `${DATA_DIR}/contrib/history.json`;

/** Redaction profiles */
export const CONTRIB_PROFILES_FILE = `${DATA_DIR}/contrib/profiles.json`;

/** Contributor settings */
export const CONTRIBUTOR_SETTINGS_FILE = `${DATA_DIR}/contributor-settings.json`;

// =============================================================================
// PREDICTIONS
// =============================================================================

/** Directory for prediction data */
export const PREDICTIONS_DIR = `${DATA_DIR}/predictions`;

/** Prediction logs (JSONL) */
export const PREDICTIONS_FILE = `${PREDICTIONS_DIR}/predictions.jsonl`;

// =============================================================================
// AUDIT & LOGS
// =============================================================================

/** Master audit log for significant operations */
export const AUDIT_LOG_FILE = `${DATA_DIR}/events.jsonl`;

/** Directory for daemon/server logs */
export const LOGS_DIR = `${DATA_DIR}/logs`;

// =============================================================================
// DAEMON
// =============================================================================

/** Watcher daemon PID file */
export const WATCHER_PID_FILE = `${DATA_DIR}/watcher.pid`;

/** Analyzer server PID file */
export const ANALYZER_PID_FILE = `${DATA_DIR}/analyzer.pid`;

/** Legacy daemon PID file (deprecated) */
export const DAEMON_PID_FILE = `${DATA_DIR}/daemon.pid`;

// =============================================================================
// DEFAULTS (for backwards compatibility with constants.ts)
// =============================================================================

export const STORAGE_PATHS = {
  DATA_DIR,
  CONFIG_DIR,
  CONFIG_FILE,
  HOOKS_DIR,
  HOOKS_COMMITS_FILE,
  HOOKS_STATS_FILE,
  PROCESSES_DIR,
  TRANSCRIPTS_DIR,
  TRANSCRIPTS_INDEX_FILE,
  ENRICHMENTS_FILE,
  ANNOTATIONS_FILE,
  ARTIFACTS_FILE,
  AGENT_METADATA_FILE,
  CONVERSATION_METADATA_FILE,
  CONTRIB_HISTORY_FILE,
  CONTRIB_PROFILES_FILE,
  CONTRIBUTOR_SETTINGS_FILE,
  PREDICTIONS_DIR,
  PREDICTIONS_FILE,
  AUDIT_LOG_FILE,
  LOGS_DIR,
  WATCHER_PID_FILE,
  ANALYZER_PID_FILE,
  DAEMON_PID_FILE
} as const;
