/**
 * @agentwatch/ui - Shared React components for the agentwatch contribution interface
 *
 * This package provides reusable UI components that work with different backends
 * (daemon API or web worker) via the adapter pattern.
 */

// Components
export * from "./components";

// Adapters
export {
  // Context
  AdapterProvider,
  useAdapter,
  useBackend,
  // Worker adapter
  createWorkerAdapter,
  type WorkerAdapter,
  // Types
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
} from "./adapters";
