/**
 * @agentwatch/daemon - HTTP daemon for agentwatch
 *
 * @deprecated Use @agentwatch/watcher and @agentwatch/analyzer instead.
 *
 * The combined daemon is deprecated. The new architecture splits functionality:
 * - @agentwatch/watcher - Real-time monitoring daemon (port 8420)
 * - @agentwatch/analyzer - On-demand analysis dashboard (port 8421)
 *
 * This package remains for backwards compatibility but will be removed
 * in a future release.
 */

// Log deprecation warning when module is imported
if (process.env.NODE_ENV !== "test") {
  console.warn(
    "[@agentwatch/daemon] DEPRECATED: Use @agentwatch/watcher and @agentwatch/analyzer instead"
  );
}

export {
  DaemonServer,
  daemonStatus,
  daemonStop,
  type DaemonServerOptions
} from "./server";
export { createApp, type AppState } from "./api";
export { PidFile } from "./pid-file";
export { SessionLogger, type SessionInfo } from "./session-logger";
export { ConnectionManager, type BroadcastMessage } from "./connection-manager";
export {
  loadConfig,
  saveConfig,
  type Config,
  type DaemonConfig,
  type TestGateConfig,
  type NotificationsConfig,
  type AgentsConfig,
  type AgentMatcherConfig,
  type RepoConfig,
  type WrapperConfig
} from "./config";
export {
  checkTestGate,
  recordTestPass,
  clearTestPass,
  isGitCommit,
  type TestGateDecision
} from "./security-gates";
export {
  analyzeSession,
  analyzeToolStats,
  analyzeRecentSessions,
  suggestionToDict,
  type Suggestion
} from "./suggestions";
export {
  correlateSessionsWithTranscripts,
  getCorrelationStats,
  type Conversation,
  type CorrelationConfig,
  type MatchType,
  type MatchDetails
} from "./correlation";
export {
  loadContributorSettings,
  saveContributorSettings,
  loadContributionHistory,
  addContributionRecord,
  getContributionStats,
  getDestinationInfo,
  KNOWN_DESTINATIONS,
  type ContributorSettings,
  type ContributionRecord,
  type ContributionHistory
} from "./contributor-settings";
