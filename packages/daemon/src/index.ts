/**
 * @agentwatch/daemon - HTTP daemon for agentwatch
 *
 * Provides REST API and WebSocket endpoints for monitoring
 * coding agents and git repositories.
 */

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
