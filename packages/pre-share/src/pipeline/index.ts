/**
 * Pipeline module for session preparation and scoring.
 */

export {
  scoreText,
  scoreSession,
  rankSessions,
  selectTopSessions
} from "./scoring";

export {
  prepareSession,
  prepareSessions,
  toContribSessions,
  generatePrepReport,
  getDefaultFieldSelection,
  getFieldSchemasByCategory,
  getDefaultContributor,
  type PreparationRedactionReport,
  type RawSession,
  type PreparationConfig,
  type PreparedSession,
  type PreparationResult
} from "./preparation";

// Re-export utility functions for use by static sites
// Note: redactPathUsername and makeBundleId are exported from ./output to avoid duplicates
export {
  safePreview,
  formatChatPreview,
  formatUtcNow,
  randomUuid,
  sha256Hex,
  parseJsonLines,
  inferSource,
  extractEntryTypes
} from "./utils";
