/**
 * Unified session preparation pipeline for pre-share processing.
 *
 * This module provides a consistent processing flow for all sharing targets
 * (HuggingFace, Gist, bundle download, etc.).
 *
 * Pipeline: Session → Field Strip → Sanitize → Score → Residue Check → ContribSession
 */

import {
  FIELD_SCHEMAS,
  buildStripSet,
  getFieldsForSource,
  stripFields,
  stripFieldsWhitelist
} from "../fields";
import { type RedactionInfo, createSanitizer } from "../sanitizer";
import { collectStrings, residueCheck } from "../sanitizer/residue";
import type { ContribSession, ContributorMeta } from "../types/contrib";
import type { FieldSchema } from "../types/sanitizer";
import { scoreText } from "./scoring";
import {
  formatChatPreview,
  formatUtcNow,
  randomUuid,
  redactPathUsername,
  safePreview,
  sha256Hex
} from "./utils";

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Collect all field paths that exist in an object.
 * E.g., { a: { b: 1 }, c: [{ d: 2 }] } returns ["a", "a.b", "c", "c[].d"]
 */
function collectFieldPaths(
  obj: unknown,
  prefix = "",
  paths = new Set<string>()
): Set<string> {
  if (obj === null || obj === undefined) return paths;

  if (Array.isArray(obj)) {
    // For arrays, mark with [] and recurse into first element as representative
    if (obj.length > 0) {
      collectFieldPaths(obj[0], prefix ? `${prefix}[]` : "[]", paths);
    }
  } else if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      collectFieldPaths(value, path, paths);
    }
  }

  return paths;
}

/**
 * Field info with source type for UI grouping.
 */
export interface FieldInfo {
  path: string;
  sourceType: string; // "hook", "claude_transcript", "codex_transcript", etc.
}

/**
 * Collect all field paths grouped by source type.
 * Returns a Map from sourceType to Set of field paths.
 */
function collectFieldsBySource(
  sessions: RawSession[]
): Map<string, Set<string>> {
  const fieldsBySource = new Map<string, Set<string>>();

  for (const session of sessions) {
    // Determine source type for grouping
    const sourceType = categorizeSourceType(session.source, session.data);

    if (!fieldsBySource.has(sourceType)) {
      fieldsBySource.set(sourceType, new Set<string>());
    }

    collectFieldPaths(session.data, "", fieldsBySource.get(sourceType)!);
  }

  return fieldsBySource;
}

/**
 * Categorize a session into a source type for field grouping.
 */
function categorizeSourceType(source: string, data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;

    // Hook session data markers - has "session" and "tool_usages" keys
    // This is the structure from hookSessionToDict + toolUsageToDict
    if ("session" in obj && "tool_usages" in obj) {
      return "cc_hook";
    }

    // Also check for individual tool usage or hook session markers
    if ("tool_name" in obj || "tool_count" in obj || "tools_used" in obj) {
      return "cc_hook";
    }

    // Claude Code transcript markers - has "messages" array with message content
    if ("messages" in obj && Array.isArray(obj.messages)) {
      return "cc_transcript";
    }

    // Single message with model/usage info
    if ("message" in obj && typeof obj.message === "object") {
      const msg = obj.message as Record<string, unknown>;
      if ("model" in msg || "usage" in msg) {
        return "cc_transcript";
      }
    }

    // Array of transcript entries
    if (Array.isArray(obj)) {
      const first = obj[0];
      if (first && typeof first === "object") {
        if ("message" in first) return "cc_transcript";
        if ("tool_name" in first) return "cc_hook";
      }
    }
  }

  // Use source directly as fallback
  switch (source.toLowerCase()) {
    case "claude":
      return "cc_transcript";
    case "codex":
      return "codex_transcript";
    case "gemini":
      return "gemini_transcript";
    case "opencode":
      return "opencode_transcript";
    default:
      return source || "unknown";
  }
}

// Note: safePreview, formatUtcNow, randomUuid, redactPathUsername, sha256Hex
// are imported from ./utils to avoid duplication with static sites

// ============================================================================
// TYPES
// ============================================================================

/**
 * Report of redactions applied during preparation.
 */
export interface PreparationRedactionReport {
  /** Total number of redactions made */
  totalRedactions: number;
  /** Redaction counts by category */
  countsByCategory: Record<string, number>;
  /** Which redaction categories were enabled */
  enabledCategories: string[];
  /** Number of custom regex patterns applied */
  customRegexCount: number;
  /** Warnings from residue check */
  residueWarnings: string[];
  /** Whether residue check blocked sharing */
  blocked: boolean;
}

/**
 * Input session data before processing.
 */
export interface RawSession {
  /** Unique session identifier */
  sessionId: string;
  /** Source tool (claude, codex, opencode) */
  source: string;
  /** Raw data from transcript */
  data: unknown;
  /** Optional modification time */
  mtimeUtc?: string;
  /** Optional source file path hint */
  sourcePathHint?: string;
}

/**
 * Configuration for the preparation pipeline.
 */
export interface PreparationConfig {
  /** Redaction options */
  redaction: {
    redactSecrets: boolean;
    redactPii: boolean;
    redactPaths: boolean;
    maskCodeBlocks?: boolean;
    customRegex?: string[];
    enableHighEntropy?: boolean;
  };
  /** Selected field paths to include (others stripped based on category) */
  selectedFields?: string[];
  /** Contributor metadata */
  contributor: ContributorMeta;
  /** App version for reports */
  appVersion?: string;
}

/**
 * Result of preparing a single session.
 */
export interface PreparedSession {
  /** Original session ID */
  sessionId: string;
  /** Source tool */
  source: string;
  /** Original raw data (before any processing, for JSON diff) */
  rawData: unknown;
  /** Sanitized data (fields stripped + content redacted) */
  sanitizedData: unknown;
  /** Preview of original content (before redaction, for diff comparison) */
  previewOriginal: string;
  /** Preview of sanitized content */
  previewRedacted: string;
  /** Quality score */
  score: number;
  /** Approximate size in characters */
  approxChars: number;
  /** SHA256 of raw data */
  rawSha256: string;
  /** Original modification time */
  mtimeUtc: string;
  /** Redacted source path */
  sourcePathHint: string;
}

/**
 * Result of the full preparation pipeline.
 */
export interface PreparationResult {
  /** Prepared sessions ready for bundling */
  sessions: PreparedSession[];
  /** Full redaction report */
  redactionReport: PreparationRedactionReport;
  /** Fields that were stripped */
  strippedFields: string[];
  /** Field paths that exist in the selected data (for UI filtering) */
  fieldsPresent: string[];
  /** Fields grouped by source type for UI display */
  fieldsBySource: Record<string, string[]>;
  /** Map of placeholder to redaction info for UI display */
  redactionInfoMap: Record<string, RedactionInfo>;
  /** Whether residue check blocked sharing */
  blocked: boolean;
  /** Residue warnings if any */
  residueWarnings: string[];
  /** Summary statistics */
  stats: {
    totalSessions: number;
    totalRedactions: number;
    totalFieldsStripped: number;
    averageScore: number;
  };
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Get default field selection (essential + recommended fields).
 * When source is "all", includes fields from ALL sources (not just source:"all").
 */
export function getDefaultFieldSelection(source = "all"): string[] {
  return FIELD_SCHEMAS.filter(
    (f) =>
      (source === "all" || f.source === "all" || f.source === source) &&
      (f.category === "essential" || f.category === "recommended")
  ).map((f) => f.path);
}

/**
 * Get all field schemas grouped by category.
 */
export function getFieldSchemasByCategory(source = "all"): {
  essential: FieldSchema[];
  recommended: FieldSchema[];
  optional: FieldSchema[];
  strip: FieldSchema[];
  always_strip: FieldSchema[];
} {
  const fields = FIELD_SCHEMAS.filter(
    (f) => f.source === "all" || f.source === source
  );
  return {
    essential: fields.filter((f) => f.category === "essential"),
    recommended: fields.filter((f) => f.category === "recommended"),
    optional: fields.filter((f) => f.category === "optional"),
    strip: fields.filter((f) => f.category === "strip"),
    always_strip: fields.filter((f) => f.category === "always_strip")
  };
}

/**
 * Prepare a single session for sharing.
 */
export async function prepareSession(
  session: RawSession,
  config: PreparationConfig
): Promise<PreparedSession> {
  const selectedFields =
    config.selectedFields ?? getDefaultFieldSelection(session.source);

  // Step 1: Build strip set and strip fields
  const stripSet = buildStripSet(selectedFields, session.source);
  const strippedData = stripFields(session.data, stripSet);

  // Step 2: Sanitize content
  const sanitizer = createSanitizer({
    redactSecrets: config.redaction.redactSecrets,
    redactPii: config.redaction.redactPii,
    redactPaths: config.redaction.redactPaths,
    maskCodeBlocks: config.redaction.maskCodeBlocks ?? false,
    customRegex: config.redaction.customRegex ?? [],
    enableHighEntropy: config.redaction.enableHighEntropy ?? true
  });
  const sanitizedData = sanitizer.redactObject(strippedData);

  // Step 3: Generate previews and score
  // IMPORTANT: previewOriginal from RAW data (before stripping) so diff shows field removal
  // previewRedacted from stripped + sanitized data
  // Use formatChatPreview for rich display, safePreview for compact diff
  const previewOriginal = formatChatPreview(session.data);
  const previewRedacted = formatChatPreview(sanitizedData);
  const score = scoreText(previewRedacted);

  // Step 4: Calculate hash and size
  const rawSha256 = await sha256Hex(session.data);
  const approxChars = JSON.stringify(sanitizedData).length;

  return {
    sessionId: session.sessionId,
    source: session.source,
    rawData: session.data,
    sanitizedData,
    previewOriginal,
    previewRedacted,
    score,
    approxChars,
    rawSha256,
    mtimeUtc: session.mtimeUtc ?? formatUtcNow(),
    sourcePathHint: redactPathUsername(session.sourcePathHint ?? "")
  };
}

/**
 * Prepare multiple sessions for sharing with a unified report.
 */
export async function prepareSessions(
  sessions: RawSession[],
  config: PreparationConfig
): Promise<PreparationResult> {
  // Create sanitizer for aggregate report
  const sanitizer = createSanitizer({
    redactSecrets: config.redaction.redactSecrets,
    redactPii: config.redaction.redactPii,
    redactPaths: config.redaction.redactPaths,
    maskCodeBlocks: config.redaction.maskCodeBlocks ?? false,
    customRegex: config.redaction.customRegex ?? [],
    enableHighEntropy: config.redaction.enableHighEntropy ?? true
  });

  const selectedFields = config.selectedFields ?? getDefaultFieldSelection();
  const strippedFieldsSet = new Set<string>();
  const fieldsPresentSet = new Set<string>();
  const preparedSessions: PreparedSession[] = [];

  // Collect fields grouped by source type for UI display
  const fieldsBySourceMap = collectFieldsBySource(sessions);

  for (const session of sessions) {
    // Collect all field paths that exist in this session's data
    const sessionFieldsPresent = new Set<string>();
    collectFieldPaths(session.data, "", sessionFieldsPresent);
    for (const f of sessionFieldsPresent) {
      fieldsPresentSet.add(f);
    }

    // Build always-strip set (base64 image data, etc.)
    const alwaysStripSet = new Set<string>();
    for (const field of getFieldsForSource(session.source)) {
      if (field.category === "always_strip") {
        alwaysStripSet.add(field.path);
      }
    }

    // Track which fields will be stripped (for UI feedback)
    for (const presentField of sessionFieldsPresent) {
      // Check if field is in always-strip
      let isAlwaysStrip = false;
      for (const pattern of alwaysStripSet) {
        if (
          presentField === pattern ||
          presentField.startsWith(pattern + ".")
        ) {
          isAlwaysStrip = true;
          break;
        }
      }
      // Check if field is NOT in selection (will be stripped)
      const isSelected = selectedFields.some((sel) => {
        const normalizedSel = sel.replace(/\[\]/g, "");
        const normalizedPresent = presentField.replace(/\[\]/g, "");
        return (
          normalizedPresent === normalizedSel ||
          normalizedPresent.startsWith(normalizedSel + ".") ||
          normalizedSel.startsWith(normalizedPresent + ".")
        );
      });
      if (isAlwaysStrip || !isSelected) {
        strippedFieldsSet.add(presentField);
      }
    }

    // Use whitelist-based stripping - only keep selected fields
    const keepSet = new Set(selectedFields);
    const strippedData = stripFieldsWhitelist(
      session.data,
      keepSet,
      alwaysStripSet
    );
    const sanitizedData = sanitizer.redactObject(strippedData);

    // Generate previews for diff comparison:
    // - previewOriginal from RAW data (before stripping) so diff shows field removal
    // - previewRedacted from stripped + sanitized data
    // Use formatChatPreview for rich display
    const previewOriginal = formatChatPreview(session.data);
    const previewRedacted = formatChatPreview(sanitizedData);
    const score = scoreText(previewRedacted);
    const rawSha256 = await sha256Hex(session.data);
    const approxChars = JSON.stringify(sanitizedData).length;

    preparedSessions.push({
      sessionId: session.sessionId,
      source: session.source,
      rawData: session.data,
      sanitizedData,
      previewOriginal,
      previewRedacted,
      score,
      approxChars,
      rawSha256,
      mtimeUtc: session.mtimeUtc ?? formatUtcNow(),
      sourcePathHint: redactPathUsername(session.sourcePathHint ?? "")
    });
  }

  // Collect all strings for residue check
  const allStrings: string[] = [];
  for (const session of preparedSessions) {
    collectStrings(session.sanitizedData, allStrings);
  }
  const residue = residueCheck(allStrings);

  // Build redaction report
  const report = sanitizer.getReport();
  const redactionReport: PreparationRedactionReport = {
    totalRedactions: report.totalRedactions,
    countsByCategory: report.countsByCategory,
    enabledCategories: [
      ...(config.redaction.redactSecrets ? ["secrets"] : []),
      ...(config.redaction.redactPii ? ["pii"] : []),
      ...(config.redaction.redactPaths ? ["paths"] : []),
      ...(config.redaction.maskCodeBlocks ? ["code_blocks"] : [])
    ],
    customRegexCount: config.redaction.customRegex?.length ?? 0,
    residueWarnings: residue.warnings,
    blocked: residue.blocked
  };

  // Calculate stats
  const totalScore = preparedSessions.reduce((sum, s) => sum + s.score, 0);
  const averageScore =
    preparedSessions.length > 0 ? totalScore / preparedSessions.length : 0;

  // Convert fieldsBySourceMap to plain object for serialization
  const fieldsBySource: Record<string, string[]> = {};
  for (const [source, fields] of fieldsBySourceMap) {
    fieldsBySource[source] = Array.from(fields).sort();
  }

  // Get redaction info map for UI display (shows which rule caught each redaction)
  const redactionInfoMap = sanitizer.getRedactionInfoMap();

  return {
    sessions: preparedSessions,
    redactionReport,
    strippedFields: Array.from(strippedFieldsSet),
    fieldsPresent: Array.from(fieldsPresentSet),
    fieldsBySource,
    redactionInfoMap,
    blocked: residue.blocked,
    residueWarnings: residue.warnings,
    stats: {
      totalSessions: preparedSessions.length,
      totalRedactions: report.totalRedactions,
      totalFieldsStripped: strippedFieldsSet.size,
      averageScore: Math.round(averageScore * 10) / 10
    }
  };
}

/**
 * Convert prepared sessions to ContribSession format for bundling.
 */
export function toContribSessions(
  preparedSessions: PreparedSession[],
  contributor: ContributorMeta
): ContribSession[] {
  return preparedSessions.map((session) => ({
    sessionId: session.sessionId,
    source: session.source,
    rawSha256: session.rawSha256,
    mtimeUtc: session.mtimeUtc,
    data: session.sanitizedData,
    preview: session.previewRedacted,
    previewRedacted: session.previewRedacted,
    score: session.score,
    approxChars: session.approxChars,
    sourcePathHint: session.sourcePathHint
  }));
}

/**
 * Generate a prep report for the bundle (snake_case format for JSONL output).
 */
export function generatePrepReport(
  result: PreparationResult,
  config: PreparationConfig,
  bundleId: string,
  manifestSha256?: string
): Record<string, unknown> {
  const now = formatUtcNow();

  return {
    app_version: config.appVersion ?? "0.1.0",
    created_at_utc: now,
    bundle_id: bundleId,
    contributor: {
      contributor_id: config.contributor.contributorId,
      license: config.contributor.license,
      ai_use_preference: config.contributor.aiPreference
    },
    inputs: {
      raw_export_manifest_sha256: manifestSha256 ?? "",
      selected_sessions: result.sessions.map((s) => ({
        session_id: s.sessionId,
        raw_sha256: s.rawSha256,
        source_path_hint: s.sourcePathHint,
        score: s.score
      }))
    },
    redaction: {
      counts: result.redactionReport.countsByCategory,
      total_strings_touched: result.redactionReport.totalRedactions,
      enabled_categories: result.redactionReport.enabledCategories,
      custom_regexes:
        config.redaction.customRegex?.map((r) => r.slice(0, 20) + "...") ?? [],
      residue_check_results: {
        warnings: result.residueWarnings,
        blocked: result.blocked
      }
    },
    rights: {
      rights_statement: config.contributor.rightsStatement,
      rights_confirmed: config.contributor.rightsConfirmed
    },
    user_attestation: {
      reviewed: config.contributor.reviewedConfirmed,
      reviewed_at_utc: now,
      attestation_id: randomUuid()
    }
  };
}

/**
 * Default contributor metadata.
 */
export function getDefaultContributor(): ContributorMeta {
  return {
    contributorId: "anonymous",
    license: "CC-BY-4.0",
    aiPreference: "train-genai=deny",
    rightsStatement:
      "I have the right to share this data and have reviewed it for sensitive information.",
    rightsConfirmed: false,
    reviewedConfirmed: false
  };
}
