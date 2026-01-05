/**
 * Backend Adapter Interface
 *
 * This interface defines the contract between UI components and their data sources.
 * Both the daemon API client and the web worker implement this interface,
 * allowing the same UI components to work in both environments.
 */

import type {
  ContributorMeta,
  FieldSchema,
  RedactionConfig
} from "@agentwatch/pre-share";

// ============================================================================
// Session Types
// ============================================================================

/** A transcript session that can be selected for contribution */
export interface Session {
  /** Unique identifier for the session */
  id: string;
  /** Source of the session (e.g., 'claude', 'codex', 'opencode', 'local', 'hooks') */
  source: string;
  /** Agent type (e.g., 'claude', 'codex') */
  agent: string;
  /** Display name for the session */
  name: string;
  /** Project directory path (may be redacted) */
  projectDir: string | null;
  /** Last modification timestamp (ms since epoch) */
  modifiedAt: number;
  /** Number of messages/exchanges */
  messageCount: number | null;
  /** Raw file size in bytes */
  sizeBytes: number | null;
  /** Privacy score (0-10) */
  score?: number;
  /** Short preview of content */
  preview?: string;
  /** Entry type breakdown */
  entryTypes?: Record<string, number>;
  /** Primary entry type */
  primaryType?: string;
  /** Whether session is currently active (for live hooks) */
  active?: boolean;
  /** Original file path hint */
  sourcePathHint?: string;
}

/** Group of sessions organized by date or category */
export interface SessionGroup {
  label: string;
  sessions: Session[];
}

// ============================================================================
// Redaction/Preparation Types
// ============================================================================

/** Result of preparing/sanitizing sessions */
export interface PreparationResult {
  /** Prepared session data with before/after previews */
  sessions: PreparedSession[];
  /** Redaction statistics */
  redactionReport: RedactionReport;
  /** Field paths that were present in the data */
  fieldsPresent?: string[];
  /** Fields that were stripped */
  fieldsStripped?: Record<string, number>;
}

/** A session that has been prepared for contribution */
export interface PreparedSession {
  sessionId: string;
  source: string;
  score: number;
  approxChars: number;
  previewOriginal: string;
  previewRedacted: string;
  rawSha256: string;
  /** Raw JSON of the sanitized data (for raw view) */
  rawJson?: string;
}

/** Statistics about redactions performed */
export interface RedactionReport {
  counts: Record<string, number>;
  totalStringsTouched: number;
  enabledCategories: string[];
  customRegexHashes: string[];
  residueWarnings: string[];
  blocked: boolean;
  fieldsStripped?: number;
}

// ============================================================================
// Export/Bundle Types
// ============================================================================

/** Result of building a bundle */
export interface BundleResult {
  bundleBytes: Uint8Array;
  bundleId: string;
  bundleFormat: "zip" | "jsonl";
  transcriptsCount: number;
  manifest: BundleManifest;
  prepReport: object;
}

/** Bundle manifest */
export interface BundleManifest {
  bundle_id: string;
  created_at_utc: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  tooling: { app_version: string; schema_version: string };
}

/** Result of uploading to HuggingFace */
export interface HuggingFaceUploadResult {
  success: boolean;
  url?: string;
  prUrl?: string;
  error?: string;
}

/** HuggingFace OAuth configuration */
export interface HFOAuthConfig {
  enabled: boolean;
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
}

/** Result of GitHub Gist creation */
export interface GistResult {
  success: boolean;
  url?: string;
  error?: string;
}

// ============================================================================
// Field Schema Types
// ============================================================================

/** Field schemas result from backend */
export interface FieldSchemasResult {
  fields: FieldSchema[];
  defaultSelected: string[];
}

// ============================================================================
// Contributor Settings Types
// ============================================================================

/** Saved contributor settings */
export interface ContributorSettings {
  contributorId: string;
  license: string;
  aiPreference: string;
  hfDataset?: string;
  hfTokenSaved?: boolean;
}

/** Contribution history entry */
export interface ContributionHistoryEntry {
  bundleId: string;
  createdAt: string;
  sessionCount: number;
  destination: string;
  url?: string;
}

// ============================================================================
// Backend Adapter Interface
// ============================================================================

/**
 * The main adapter interface that backends must implement.
 * This allows UI components to work with both daemon API and web worker.
 */
export interface BackendAdapter {
  /** Unique identifier for this backend type */
  readonly type: "daemon" | "worker" | "static";

  // Session management
  /** Load available sessions */
  loadSessions(): Promise<Session[]>;
  /** Refresh/reload sessions */
  refreshSessions(): Promise<Session[]>;

  // Field schemas
  /** Get field schemas for a source type */
  getFieldSchemas(source?: string): Promise<FieldSchemasResult>;

  // Preparation/redaction
  /** Prepare selected sessions with redaction */
  prepareSessions(
    sessionIds: string[],
    config: RedactionConfig,
    selectedFields: string[] | undefined,
    contributor: ContributorMeta
  ): Promise<PreparationResult>;

  // Bundle creation
  /** Build a contribution bundle */
  buildBundle(
    sessionIds: string[],
    contributor: ContributorMeta,
    redactionReport: RedactionReport,
    annotations?: Record<string, { rating?: string; notes?: string }>,
    format?: "zip" | "jsonl" | "auto"
  ): Promise<BundleResult>;

  // Export destinations
  /** Download bundle to local file */
  downloadBundle(bundle: BundleResult): Promise<void>;

  /** Upload to HuggingFace */
  uploadToHuggingFace?(
    bundle: BundleResult,
    repoId: string,
    token?: string,
    createPr?: boolean
  ): Promise<HuggingFaceUploadResult>;

  /** Create GitHub Gist */
  createGist?(bundle: BundleResult, token: string): Promise<GistResult>;

  // Contributor settings (optional - only daemon has persistent storage)
  /** Load saved contributor settings */
  loadSettings?(): Promise<ContributorSettings>;
  /** Save contributor settings */
  saveSettings?(settings: Partial<ContributorSettings>): Promise<void>;

  // Contribution history (optional)
  /** Get contribution history */
  getHistory?(): Promise<ContributionHistoryEntry[]>;
  /** Record a new contribution */
  recordContribution?(entry: ContributionHistoryEntry): Promise<void>;

  // HuggingFace OAuth (optional)
  /** Get OAuth configuration */
  getHFOAuthConfig?(): Promise<HFOAuthConfig>;
  /** Start OAuth flow */
  startHFOAuth?(): Promise<{ authUrl: string; state: string }>;
  /** Handle OAuth callback */
  handleHFOAuthCallback?(
    code: string,
    state: string
  ): Promise<{ username: string }>;
}

// ============================================================================
// Adapter Context
// ============================================================================

/** Context value for providing adapter to components */
export interface AdapterContextValue {
  adapter: BackendAdapter;
  /** Whether the adapter supports persistent settings */
  hasPersistentSettings: boolean;
  /** Whether the adapter supports HuggingFace upload */
  hasHuggingFaceUpload: boolean;
  /** Whether the adapter supports Gist creation */
  hasGistCreation: boolean;
  /** Whether the adapter supports OAuth */
  hasOAuth: boolean;
  /** Whether the adapter supports contribution history */
  hasHistory: boolean;
}
