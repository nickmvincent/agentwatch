/**
 * Centralized constants for agentwatch.
 *
 * These values are defaults that can be overridden via configuration.
 * Organized by category for easy discovery and modification.
 */

// =============================================================================
// DAEMON & NETWORKING
// =============================================================================

export const DAEMON = {
  /** Default daemon port */
  PORT: 8420,
  /** Default daemon host */
  HOST: "127.0.0.1",
  /** PID file location (relative to home) */
  PID_FILE: "~/.agentwatch/daemon.pid",
  /** Log directory (relative to home) */
  LOG_DIR: "~/.agentwatch/logs",
  /** Health check endpoint timeout (ms) */
  HEALTH_CHECK_TIMEOUT: 5000,
  /** Startup verification delay (ms) */
  STARTUP_DELAY: 500
} as const;

// =============================================================================
// PROCESS MONITORING
// =============================================================================

export const PROCESS_SCANNER = {
  /** How often to poll for processes (seconds) */
  REFRESH_SECONDS: 1,
  /** Minimum CPU % to consider process "active" (vs "waiting") */
  ACTIVE_CPU_THRESHOLD: 1.0,
  /** Seconds before marking process as "stalled" */
  STALLED_SECONDS: 30,
  /** Grace period for new processes before applying stalled detection (seconds) */
  STARTUP_GRACE_SECONDS: 5.0,
  /** Minimum elapsed time before stalled detection applies (seconds) */
  MIN_ELAPSED_FOR_STALLED: 10,
  /** CWD cache validity (ms) */
  CWD_CACHE_MS: 10000
} as const;

// =============================================================================
// REPOSITORY MONITORING
// =============================================================================

export const REPO_SCANNER = {
  /** Fast refresh interval for dirty repos (seconds) */
  REFRESH_FAST_SECONDS: 3,
  /** Slow refresh interval for clean repos (seconds) */
  REFRESH_SLOW_SECONDS: 45,
  /** Git fast operation timeout (ms) */
  GIT_TIMEOUT_FAST_MS: 800,
  /** Git slow operation timeout (ms) */
  GIT_TIMEOUT_SLOW_MS: 2500,
  /** Max concurrent git operations */
  CONCURRENCY_GIT: 12,
  /** How often to scan for new repos (ms) */
  REPO_DISCOVERY_INTERVAL_MS: 300000, // 5 minutes
  /** Exponential backoff base for failed repos (ms) */
  BACKOFF_BASE_MS: 5000,
  /** Exponential backoff cap (ms) */
  BACKOFF_CAP_MS: 60000
} as const;

// =============================================================================
// PORT MONITORING
// =============================================================================

export const PORT_SCANNER = {
  /** Minimum port to scan (unprivileged ports) */
  MIN_PORT: 1024,
  /** Maximum port to scan */
  MAX_PORT: 65535
} as const;

// =============================================================================
// SESSION & LOGGING
// =============================================================================

export const SESSION = {
  /** How long to keep finished sessions visible (seconds) */
  KEEP_DONE_SECONDS: 60,
  /** Default session list limit */
  DEFAULT_LIMIT: 100,
  /** Max session log files to retain */
  MAX_LOG_FILES: 500,
  /** Max age for session logs (days) */
  MAX_LOG_AGE_DAYS: 30,
  /** Log cleanup interval (ms) */
  LOG_CLEANUP_INTERVAL_MS: 3600000 // 1 hour
} as const;

// =============================================================================
// TEST GATE
// =============================================================================
// Note: Pattern-based security gates were removed. Use Claude Code's native
// deny rules in ~/.claude/settings.json for blocking dangerous commands.
// Only Test Gate remains as it provides unique workflow functionality.

export const SECURITY_GATES = {
  /** Test pass file validity window (seconds) */
  TEST_PASS_MAX_AGE_SECONDS: 300
} as const;

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export const NOTIFICATIONS = {
  /** Seconds before tool is considered "long running" */
  LONG_RUNNING_THRESHOLD_SECONDS: 60
} as const;

// =============================================================================
// SUGGESTIONS & HEURISTICS
// =============================================================================

export const SUGGESTIONS = {
  // Tool failure analysis
  /** Minimum tool calls before calculating failure rate */
  MIN_CALLS_FOR_FAILURE_RATE: 3,
  /** Failure rate threshold for warnings (0-1) */
  HIGH_FAILURE_RATE: 0.5,
  /** Bash failures before warning */
  BASH_FAILURE_WARNING_THRESHOLD: 5,

  // Usage pattern thresholds
  /** Read tool calls to suggest caching */
  HEAVY_READ_THRESHOLD: 30,
  /** Edit operations to note significant changes */
  MANY_EDITS_THRESHOLD: 15,
  /** Grep calls to note heavy searching */
  HEAVY_GREP_THRESHOLD: 20,
  /** Bash calls to note bash-heavy workflow */
  BASH_HEAVY_THRESHOLD: 20,
  /** Read calls to note read-heavy workflow */
  READ_HEAVY_THRESHOLD: 30,

  // Session analysis
  /** Minutes before session is "long" */
  LONG_SESSION_MINUTES: 30,
  /** Tool calls threshold for "few tools" */
  FEW_TOOLS_THRESHOLD: 10,
  /** Slow bash command threshold (ms) */
  SLOW_BASH_MS: 30000,

  // Pattern detection
  /** Sessions without commits before suggesting */
  NO_COMMIT_SESSIONS_THRESHOLD: 5,
  /** Sessions with commits to identify productive patterns */
  PRODUCTIVE_SESSIONS_THRESHOLD: 3,

  // Anomaly severity
  /** Multiplier for severe slow command */
  SEVERE_SLOW_MULTIPLIER: 5,
  /** Count for severe repetition */
  SEVERE_REPETITION_COUNT: 10
} as const;

// =============================================================================
// API DEFAULTS
// =============================================================================

export const API_DEFAULTS = {
  /** Default output lines to fetch */
  OUTPUT_LIMIT: 200,
  /** Default session/event list limit */
  LIST_LIMIT: 100,
  /** Default days for time-based queries */
  DEFAULT_DAYS: 7,
  /** Days for aggregate reports */
  AGGREGATE_DAYS: 30,
  /** Recent usages to fetch for analysis */
  RECENT_USAGES_LIMIT: 100,
  /** Top models limit for cost reports */
  TOP_MODELS_LIMIT: 10,
  /** Preview text truncation length */
  PREVIEW_TRUNCATE_LENGTH: 500,
  /** Error message truncation length */
  ERROR_TRUNCATE_LENGTH: 200
} as const;

// =============================================================================
// UI & POLLING
// =============================================================================

export const UI = {
  /** TUI polling interval (ms) */
  TUI_POLL_INTERVAL_MS: 1000,
  /** WebSocket reconnect delay (ms) */
  WEBSOCKET_RECONNECT_DELAY_MS: 2000,
  /** Max recent tool usages to cache in UI */
  MAX_RECENT_TOOL_USAGES: 100,
  /** Initial fetch limits */
  INITIAL_SESSIONS_LIMIT: 50,
  INITIAL_TOOL_USAGES_LIMIT: 100
} as const;

// =============================================================================
// DOCKER & SANDBOX
// =============================================================================

export const DOCKER = {
  /** Docker version check timeout (ms) */
  VERSION_TIMEOUT_MS: 5000,
  /** Docker info command timeout (ms) */
  INFO_TIMEOUT_MS: 10000,
  /** Docker image inspect timeout (ms) */
  INSPECT_TIMEOUT_MS: 5000
} as const;

// =============================================================================
// SHUTDOWN & CLEANUP
// =============================================================================

export const SHUTDOWN = {
  /** Default graceful shutdown timeout (ms) */
  TIMEOUT_MS: 5000,
  /** Poll interval when waiting for process exit (ms) */
  POLL_INTERVAL_MS: 100,
  /** Delay after force kill (ms) */
  POST_KILL_DELAY_MS: 200
} as const;

// =============================================================================
// HOOK ENHANCEMENTS
// =============================================================================

export const HOOK_ENHANCEMENTS = {
  /** Default max context lines to inject */
  MAX_CONTEXT_LINES: 100,
  /** Default cost warning threshold (USD) */
  COST_WARNING_THRESHOLD_USD: 5.0,
  /** Default max auto-continue attempts */
  MAX_AUTO_CONTINUE_ATTEMPTS: 3,
  /** Default max stop blocking attempts */
  MAX_STOP_BLOCK_ATTEMPTS: 3,
  /** Default prompt min length */
  PROMPT_MIN_LENGTH: 0,
  /** Default prompt max length */
  PROMPT_MAX_LENGTH: 100000,
  /** Default cost alert thresholds (percentages) */
  COST_ALERT_THRESHOLDS: [50, 80, 95] as readonly number[]
} as const;

// =============================================================================
// RULE ENGINE
// =============================================================================

export const RULE_ENGINE = {
  /** Default rule priority (higher = lower priority) */
  DEFAULT_PRIORITY: 50,
  /** Security rules priority */
  SECURITY_PRIORITY: 0,
  /** Auto-approval rules priority */
  AUTO_APPROVAL_PRIORITY: 10,
  /** Cost rules priority */
  COST_PRIORITY: 20,
  /** User rules priority */
  USER_RULES_PRIORITY: 30
} as const;

// =============================================================================
// LLM EVALUATION
// =============================================================================

export const LLM_EVALUATION = {
  /** Default max tokens for LLM evaluation */
  MAX_TOKENS: 500,
  /** Default timeout for LLM evaluation (ms) */
  TIMEOUT_MS: 10000,
  /** Default model for Anthropic */
  DEFAULT_ANTHROPIC_MODEL: "claude-3-haiku-20240307",
  /** Default model for OpenAI */
  DEFAULT_OPENAI_MODEL: "gpt-4o-mini",
  /** Default model for Ollama */
  DEFAULT_OLLAMA_MODEL: "llama3.2"
} as const;

// =============================================================================
// NOTIFICATION HUB
// =============================================================================

export const NOTIFICATION_HUB = {
  /** Default webhook timeout (ms) */
  WEBHOOK_TIMEOUT_MS: 5000,
  /** Max webhook retries */
  WEBHOOK_MAX_RETRIES: 3,
  /** Webhook retry delay (ms) */
  WEBHOOK_RETRY_DELAY_MS: 1000
} as const;

// =============================================================================
// MODEL PRICING
// =============================================================================
// Note: Model pricing is defined in types/cost.ts as MODEL_PRICING
// See that file for pricing per million tokens
