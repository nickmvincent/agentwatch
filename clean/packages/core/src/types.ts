export const SCHEMA_VERSION = "v1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

export type VerboseLogEntry = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  source: string;
  kind: string;
  payload: Record<string, unknown>;
  trace?: {
    runId?: string;
    sessionId?: string;
  };
};

export type SignificantEvent = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  source: string;
  event: string;
  summary: string;
  ref?: {
    kind: string;
    id: string;
  };
  payload?: Record<string, unknown>;
};

export type Enrichment = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  subject: {
    kind: string;
    id: string;
  };
  data: Record<string, unknown>;
};

export type RouteDoc = {
  id: string;
  service: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  requestSchema?: string;
  responseSchema?: string;
  /** Example request body for documentation/testing */
  exampleRequest?: unknown;
  /** Example response for documentation/testing */
  exampleResponse?: unknown;
};

/**
 * Session metadata extracted from transcript files.
 * Stored in centralized location: ~/.agentwatch-clean/sessions/data/{id}.json
 *
 * This captures context for ALL sessions (managed runs or random terminals)
 * by parsing the transcript's first user entry.
 */
export type SessionMeta = {
  schema_version: SchemaVersion;
  id: string;
  sessionId: string;
  transcriptPath: string;
  /** SHA-256 hash of transcript path for quick lookup */
  pathHash: string;
  cwd: string | null;
  agent: string;
  firstPrompt: string;
  /** Tags extracted from first prompt (e.g., tag:debug -> ["debug"]) */
  tags: string[];
  /** When the session started (from first transcript entry timestamp) */
  startedAt: string | null;
  discoveredAt: string;
  updatedAt: string;
  /** Transcript file size for change detection */
  transcriptSizeBytes?: number;
  /** Transcript last modified time for change detection */
  transcriptModifiedAt?: string;
  /** Link to managed run if correlated */
  runId?: string;
  /** Confidence level of session-to-agent matching */
  confidence?: "high" | "medium" | "low";
};

/**
 * Index for fast session lookups.
 * Stored at: ~/.agentwatch-clean/sessions/index.json
 */
export type SessionIndex = {
  updatedAt: string;
  count: number;
  /** cwd -> session IDs */
  byCwd: Record<string, string[]>;
  /** agent name -> session IDs */
  byAgent: Record<string, string[]>;
  /** path hash -> session ID */
  byPathHash: Record<string, string>;
  /** run ID -> session ID (for managed run correlation) */
  byRunId: Record<string, string>;
};

/**
 * Index for fast review annotation lookups.
 * Stored at: ~/.agentwatch-clean/reviews/index.json
 */
export type ReviewIndex = {
  updatedAt: string;
  count: number;
  /** verdict -> path hashes */
  byVerdict: Record<string, string[]>;
  /** tag -> path hashes */
  byTag: Record<string, string[]>;
  /** path hashes of quarantined transcripts */
  quarantined: string[];
  /** path hashes of share-approved transcripts */
  shareApproved: string[];
  /** path hash -> review ID */
  byPathHash: Record<string, string>;
};

// ============================================================================
// Shared Transcript and Review Types
// ============================================================================

// TranscriptStats is defined in transcript.ts with Zod schema - use that as canonical source
// Import at runtime to avoid circular deps; type re-exported from transcript.ts

/**
 * Base transcript metadata - common fields for transcript discovery.
 * Services can extend this with additional fields as needed.
 */
export type BaseTranscriptMeta = {
  id: string;
  agent: string;
  path: string;
  name: string;
  projectDir: string | null;
  modifiedAt: number;
  sizeBytes: number;
  messageCount: number | null;
  startTime: number | null;
  endTime: number | null;
  stats?: {
    tokens: { input: number; output: number; cached: number; total: number };
    entryTypes: Record<string, number>;
    tools: Record<string, number>;
    models: Record<string, number>;
    durationMs: number | null;
  };
};

/**
 * Summary of review annotation for display in lists.
 */
export type ReviewSummary = {
  verdict?: string;
  tags?: string[];
  updatedAt?: string;
  shareApproved?: boolean;
  quarantine?: boolean;
};

/**
 * Base review annotation structure.
 * Services can extend with additional enrichment fields.
 */
export type BaseReviewAnnotation = {
  schema_version: "v1" | "v2";
  id: string;
  transcriptId: string;
  transcriptPath: string;
  createdAt: string;
  updatedAt: string;
  verdict: string;
  tags: string[];
  notes?: string;
  shareApproved?: boolean;
  quarantine?: boolean;
};
