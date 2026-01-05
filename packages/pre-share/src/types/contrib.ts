/**
 * Contribution/sharing types
 */

// Re-export field stripping types from sanitizer
export type { FieldCategory, FieldSchema } from "./sanitizer";

// =============================================================================
// Session & Transcript (for sharing)
// =============================================================================

/** A transcript session selected for donation */
export interface ContribSession {
  /** SHA256 hash of raw content */
  sessionId: string;
  /** Source tool (claude, codex, opencode, custom) */
  source: string;
  /** Original file hash from manifest */
  rawSha256: string;
  /** File modification timestamp (ISO string) */
  mtimeUtc: string;
  /** Parsed transcript data */
  data: unknown;
  /** First 240 chars of content (for preview) */
  preview: string;
  /** Preview after redaction (optional) */
  previewRedacted?: string;
  /** Quality score (higher = more useful) */
  score: number;
  /** Approximate character count */
  approxChars: number;
  /** Original file path hint */
  sourcePathHint: string;
  /** Path in export zip (optional) */
  filePath?: string;
  /** Count of each entry type (optional) */
  entryTypes?: Record<string, number>;
  /** Most common entry type (optional) */
  primaryType?: string;
}

/** A single entry in a transcript */
export interface TranscriptEntry {
  type?: string;
  role?: string;
  content?: unknown;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    usage?: Record<string, number>;
  };
  timestamp?: string;
  [key: string]: unknown;
}

// =============================================================================
// Export Manifest
// =============================================================================

export interface ExportManifest {
  exporter_version: string;
  created_at_utc: string;
  sources: string[];
  files: Array<{
    path_in_zip: string;
    original_path_hint: string;
    sha256: string;
    bytes: number;
    mtime_utc: string;
  }>;
}

// =============================================================================
// Contribution Bundle
// =============================================================================

export interface ContributorMeta {
  /** Contributor identifier (username, email, etc.) */
  contributorId: string;
  /** License for contributed data */
  license: string;
  /** AI usage preference (e.g., "train-genai=deny") */
  aiPreference: string;
  /** Rights statement text */
  rightsStatement: string;
  /** Whether rights were confirmed */
  rightsConfirmed: boolean;
  /** Whether content was reviewed */
  reviewedConfirmed: boolean;
}

export interface BundleResult {
  /** Bundle file contents (ZIP or JSONL) */
  bundleBytes: Uint8Array;
  /** Unique bundle identifier */
  bundleId: string;
  /** Bundle format */
  bundleFormat: "zip" | "jsonl";
  /** Bundle manifest */
  manifest: BundleManifest;
  /** Preparation report */
  prepReport: PrepReport;
  /** Number of transcripts included */
  transcriptsCount: number;
}

export interface BundleManifest {
  bundle_id: string;
  created_at_utc: string;
  files: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }>;
  tooling: {
    app_version: string;
    schema_version: string;
  };
}

export interface PrepReport {
  app_version: string;
  created_at_utc: string;
  bundle_id: string;
  contributor: {
    contributor_id: string;
    license: string;
    ai_use_preference: string;
  };
  inputs: {
    raw_export_manifest_sha256: string;
    selected_sessions: Array<{
      session_id: string;
      raw_sha256: string;
      source_path_hint: string;
      score: number;
    }>;
  };
  redaction: {
    counts: Record<string, number>;
    total_strings_touched: number;
    enabled_categories: string[];
    custom_regexes: string[];
    residue_check_results: {
      warnings: string[];
      blocked: boolean;
    };
  };
  rights: {
    rights_statement: string;
    rights_confirmed: boolean;
  };
  user_attestation: {
    reviewed: boolean;
    reviewed_at_utc: string;
    attestation_id: string;
  };
  /** Quality scoring configuration used for this bundle */
  quality_config?: {
    dimension_weights: {
      completion: number;
      code_quality: number;
      efficiency: number;
      safety: number;
    };
    signal_weights: {
      no_failures: number;
      has_commits: number;
      normal_end: number;
      reasonable_tool_count: number;
      healthy_pacing: number;
    };
    version: string;
  };
}

// =============================================================================
// JSONL Output Entry
// =============================================================================

export interface DonatedTranscript {
  schema_version: string;
  bundle_id: string;
  source: string;
  source_path_hint: string;
  source_mtime_utc: string;
  raw_sha256: string;
  selection: {
    score: number;
    approx_chars: number;
    preview_redacted: string;
  };
  contributor: {
    contributor_id: string;
    license: string;
    ai_use_preference: string;
  };
  data: unknown;
}

// =============================================================================
// Sharing Targets
// =============================================================================

export type ShareTarget =
  | "download" // Download bundle locally
  | "huggingface" // Submit to HuggingFace dataset
  | "clipboard" // Copy to clipboard
  | "coworker"; // Share with coworker (future)

export interface ShareConfig {
  target: ShareTarget;
  /** HuggingFace repo (if target is huggingface) */
  hfRepo?: string;
  /** Whether to create PR or commit directly */
  createPr?: boolean;
}

// =============================================================================
// Defaults
// =============================================================================

export function defaultContributorMeta(): ContributorMeta {
  return {
    contributorId: "",
    license: "CC-BY-4.0",
    aiPreference: "train-genai=deny",
    rightsStatement: "",
    rightsConfirmed: false,
    reviewedConfirmed: false
  };
}

export const SCHEMA_VERSION = "donated_coding_agent_transcripts.v0";
export const APP_VERSION = "0.1.0";
