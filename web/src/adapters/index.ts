/**
 * Web App Adapters
 *
 * Re-exports adapter utilities for the web application.
 */

export { createDaemonAdapter } from "./daemon-adapter";

// Re-export shared adapter context and types
export {
  AdapterProvider,
  useAdapter,
  useBackend,
  type BackendAdapter,
  type AdapterContextValue,
  type Session,
  type SessionGroup,
  type PreparationResult,
  type PreparedSession,
  type RedactionReport,
  type BundleResult,
  type BundleManifest,
  type HuggingFaceUploadResult,
  type HFOAuthConfig,
  type GistResult,
  type FieldSchemasResult,
  type ContributorSettings,
  type ContributionHistoryEntry
} from "@agentwatch/ui";
