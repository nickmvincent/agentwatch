/**
 * Web Worker for processing transcript files in the browser.
 * Handles ZIP parsing, sanitization, and bundle creation.
 *
 * Uses @agentwatch/pre-share for sanitization, field stripping, scoring, and utilities.
 * Shared utilities are imported from pre-share to avoid duplication.
 */

import {
  type ContribSession,
  type ContributorMeta,
  type ExportManifest,
  // Field stripping
  FIELD_SCHEMAS,
  // Types
  type FieldSchema,
  type RedactionConfig,
  buildStripSet,
  collectStrings,
  // Sanitizer
  createSanitizer,
  extractEntryTypes,
  formatUtcNow,
  getFieldsForSource,
  inferSource,
  makeBundleId,
  parseJsonLines,
  randomUuid,
  redactPathUsername,
  residueCheck,
  // Shared utilities (single source of truth)
  safePreview,
  // Scoring
  scoreText,
  sha256Hex,
  stripFields
} from "@agentwatch/pre-share";
import { unzipSync, zipSync } from "fflate";

// ============================================================================
// LOCAL TYPES (Worker-specific extensions)
// ============================================================================

/** Extended session with worker-specific fields */
interface Session extends ContribSession {
  /** Raw parsed data before sanitization */
  data: unknown;
  /** Count of each entry type in the session */
  entryTypes: Record<string, number>;
  /** Most common entry type */
  primaryType: string;
}

/** Redaction report for display */
interface RedactionReport {
  counts: Record<string, number>;
  totalStringsTouched: number;
  enabledCategories: string[];
  customRegexHashes: string[];
  residueWarnings: string[];
  blocked: boolean;
  fieldsStripped?: number;
}

/** Worker state */
interface WorkerState {
  manifest: ExportManifest | null;
  manifestBytes: Uint8Array | null;
  files: Record<string, Uint8Array>;
  sessions: Session[];
  sanitizedSessions: Record<
    string,
    Session & {
      sanitized: unknown;
      previewOriginal: string;
      previewRedacted: string;
    }
  >;
}

// ============================================================================
// LOCAL UTILITIES (only what can't be imported from pre-share)
// ============================================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Note: All shared utilities (safePreview, formatUtcNow, randomUuid, redactPathUsername,
// sha256Hex, parseJsonLines, inferSource, extractEntryTypes, makeBundleId) are now
// imported from @agentwatch/pre-share to ensure a single source of truth.

// ============================================================================
// WORKER STATE
// ============================================================================

const state: WorkerState = {
  manifest: null,
  manifestBytes: null,
  files: {},
  sessions: [],
  sanitizedSessions: {}
};

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data || {};

  // Get field schema
  if (type === "getSchema") {
    const source = payload?.source || "all";
    const fields = getFieldsForSource(source);
    const defaultSelected = fields
      .filter(
        (f: FieldSchema) =>
          f.category === "essential" || f.category === "recommended"
      )
      .map((f: FieldSchema) => f.path);
    self.postMessage({
      type: "schema",
      payload: { fields, defaultSelected }
    });
    return;
  }

  // Import ZIP file
  if (type === "import") {
    try {
      const zipBytes = new Uint8Array(payload.bytes);
      const entries = unzipSync(zipBytes);
      const manifestBytes = entries["export_manifest.json"];
      if (!manifestBytes) {
        throw new Error("export_manifest.json not found in zip.");
      }
      const manifest = JSON.parse(
        decoder.decode(manifestBytes)
      ) as ExportManifest;
      state.manifest = manifest;
      state.manifestBytes = manifestBytes;
      state.files = {};
      const sessions: Session[] = [];

      for (const entry of manifest.files) {
        const fileBytes = entries[entry.path_in_zip];
        if (!fileBytes) continue;
        state.files[entry.path_in_zip] = fileBytes;
        const rawText = decoder.decode(fileBytes);
        const parsed = entry.path_in_zip.endsWith(".jsonl")
          ? parseJsonLines(rawText)
          : JSON.parse(rawText);
        const preview = safePreview(parsed);
        const score = scoreText(preview);
        const approxChars = rawText.length;
        const sessionId = await sha256Hex(fileBytes);
        const { types: entryTypes, primary: primaryType } =
          extractEntryTypes(parsed);
        sessions.push({
          sessionId,
          source: inferSource(entry.path_in_zip),
          rawSha256: entry.sha256 || sessionId,
          mtimeUtc: entry.mtime_utc,
          data: parsed,
          preview,
          score,
          approxChars,
          sourcePathHint: entry.original_path_hint,
          filePath: entry.path_in_zip,
          entryTypes,
          primaryType
        });
      }

      state.sessions = sessions;
      state.sanitizedSessions = {};
      const totalBytes = manifest.files.reduce((acc, f) => acc + f.bytes, 0);
      self.postMessage({
        type: "imported",
        payload: {
          manifest: {
            fileCount: manifest.files.length,
            totalBytes,
            sources: manifest.sources || []
          },
          sessions,
          fileTree: manifest.files.map((f) => `- ${f.path_in_zip}`).join("\n"),
          source: payload.source
        }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  // Redact selected sessions
  if (type === "redact") {
    try {
      if (!state.sessions.length) {
        throw new Error("No sessions loaded.");
      }
      const config = payload.config as RedactionConfig;
      const selectedIds = new Set<string>(payload.selectedIds as string[]);
      // If selectedFields is undefined/null, use defaults (essential + recommended)
      // Empty array [] means explicitly select nothing - use defaults instead
      let selectedFields = payload.selectedFields as string[] | undefined;
      if (!selectedFields || selectedFields.length === 0) {
        // Get default fields (essential + recommended)
        const allFields = getFieldsForSource("all");
        selectedFields = allFields
          .filter(
            (f: FieldSchema) =>
              f.category === "essential" || f.category === "recommended"
          )
          .map((f: FieldSchema) => f.path);
      }
      const fieldsStripped: Record<string, number> = {};

      const sanitizer = createSanitizer(config);
      const sanitizedSessions: WorkerState["sanitizedSessions"] = {};
      const sanitizedList: Array<
        Session & {
          sanitized: unknown;
          previewOriginal: string;
          previewRedacted: string;
        }
      > = [];

      for (const session of state.sessions) {
        if (!selectedIds.has(session.sessionId)) continue;

        const stripSet = buildStripSet(selectedFields, session.source);
        let processed = session.data;

        if (stripSet.size > 0) {
          processed = stripFields(session.data, stripSet);
          for (const pattern of stripSet) {
            fieldsStripped[pattern] = (fieldsStripped[pattern] || 0) + 1;
          }
        }

        const sanitized = sanitizer.redactObject(processed);
        // Generate preview from RAW data (before stripping) so diff shows field removal
        const previewOriginal = safePreview(session.data);
        // Generate redacted preview from stripped + sanitized data
        const previewRedacted = safePreview(sanitized);
        const enriched = {
          ...session,
          sanitized,
          previewOriginal,
          previewRedacted
        };
        sanitizedSessions[session.sessionId] = enriched;
        sanitizedList.push(enriched);
      }

      state.sanitizedSessions = sanitizedSessions;

      const sanitizerReport = sanitizer.getReport();
      const allStrings: string[] = [];
      sanitizedList.forEach((session) =>
        collectStrings(session.sanitized, allStrings)
      );
      const residue = residueCheck(allStrings);

      const enabledCategories: string[] = [];
      if (config.redactSecrets) enabledCategories.push("secrets");
      if (config.redactPii) enabledCategories.push("pii");
      if (config.redactPaths) enabledCategories.push("paths");
      if (config.maskCodeBlocks) enabledCategories.push("code_blocks");

      const customRegexHashes = await Promise.all(
        (config.customRegex || [])
          .filter(Boolean)
          .map((pattern) => sha256Hex(pattern))
      );

      const report: RedactionReport = {
        counts: sanitizerReport.countsByCategory,
        totalStringsTouched: sanitizerReport.totalRedactions,
        enabledCategories,
        customRegexHashes,
        residueWarnings: residue.warnings,
        blocked: residue.blocked,
        fieldsStripped: Object.keys(fieldsStripped).length
      };

      self.postMessage({
        type: "redacted",
        payload: { report, sanitizedSessions: sanitizedList, fieldsStripped }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  // Create bundle
  if (type === "bundle") {
    try {
      const selectedIds = new Set<string>(payload.selectedIds as string[]);
      const contributor = payload.contributor as ContributorMeta;
      const appVersion = payload.appVersion as string;
      const redaction = payload.redaction as RedactionReport;
      const annotations = (payload.annotations || {}) as Record<
        string,
        { rating?: string; notes?: string }
      >;
      const requestedFormat =
        (payload.format as "zip" | "jsonl" | "auto") || "auto";
      const bundleId = makeBundleId(contributor.contributorId);
      const now = formatUtcNow();
      const schemaVersion = "donated_coding_agent_transcripts.v0";

      const selectedSessions = Object.values(state.sanitizedSessions).filter(
        (session) => selectedIds.has(session.sessionId)
      );
      if (!selectedSessions.length) {
        throw new Error("No sanitized sessions selected.");
      }

      const transcriptsLines: string[] = [];
      const selectedSessionReport: Array<{
        session_id: string;
        raw_sha256: string;
        source_path_hint: string;
        score: number;
      }> = [];

      for (const session of selectedSessions) {
        const selection = {
          score: session.score,
          approx_chars: session.approxChars,
          preview_redacted: session.previewRedacted
        };
        const sessionAnnotation = annotations[session.sessionId];
        const transcriptEntry: Record<string, unknown> = {
          schema_version: schemaVersion,
          bundle_id: bundleId,
          source: session.source,
          source_path_hint: redactPathUsername(session.sourcePathHint),
          source_mtime_utc: session.mtimeUtc,
          raw_sha256: session.rawSha256,
          selection,
          contributor: {
            contributor_id: contributor.contributorId,
            license: contributor.license,
            ai_use_preference: contributor.aiPreference
          },
          data: session.sanitized
        };
        if (sessionAnnotation?.rating || sessionAnnotation?.notes) {
          transcriptEntry.annotation = {
            ...(sessionAnnotation.rating && {
              rating: sessionAnnotation.rating
            }),
            ...(sessionAnnotation.notes && { notes: sessionAnnotation.notes })
          };
        }
        transcriptsLines.push(JSON.stringify(transcriptEntry));
        selectedSessionReport.push({
          session_id: session.sessionId,
          raw_sha256: session.rawSha256,
          source_path_hint: redactPathUsername(session.sourcePathHint),
          score: session.score
        });
      }

      const transcriptsJsonl = transcriptsLines.join("\n") + "\n";
      const prepReport = {
        app_version: appVersion,
        created_at_utc: now,
        bundle_id: bundleId,
        contributor: {
          contributor_id: contributor.contributorId,
          license: contributor.license,
          ai_use_preference: contributor.aiPreference
        },
        inputs: {
          raw_export_manifest_sha256: state.manifestBytes
            ? await sha256Hex(state.manifestBytes)
            : "",
          selected_sessions: selectedSessionReport
        },
        redaction: {
          counts: redaction.counts,
          total_strings_touched: redaction.totalStringsTouched,
          enabled_categories: redaction.enabledCategories,
          custom_regexes: redaction.customRegexHashes,
          residue_check_results: {
            warnings: redaction.residueWarnings,
            blocked: redaction.blocked
          }
        },
        rights: {
          rights_statement: contributor.rightsStatement,
          rights_confirmed: contributor.rightsConfirmed
        },
        user_attestation: {
          reviewed: contributor.reviewedConfirmed,
          reviewed_at_utc: now,
          attestation_id: randomUuid()
        }
      };

      const transcriptsBytes = encoder.encode(transcriptsJsonl);
      const prepReportBytes = encoder.encode(
        JSON.stringify(prepReport, null, 2)
      );

      const manifestEntries: Array<{
        path: string;
        sha256: string;
        bytes: number;
      }> = [];
      manifestEntries.push({
        path: "transcripts.jsonl",
        sha256: await sha256Hex(transcriptsBytes),
        bytes: transcriptsBytes.length
      });
      manifestEntries.push({
        path: "prep_report.json",
        sha256: await sha256Hex(prepReportBytes),
        bytes: prepReportBytes.length
      });

      const manifest = {
        bundle_id: bundleId,
        created_at_utc: now,
        files: manifestEntries,
        tooling: { app_version: appVersion, schema_version: schemaVersion }
      };
      const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
      manifestEntries.push({
        path: "manifest.json",
        sha256: await sha256Hex(manifestBytes),
        bytes: manifestBytes.length
      });

      // Determine bundle format
      let bundleFormat: "zip" | "jsonl";
      if (requestedFormat === "auto") {
        // Use JSONL for small contributions (≤3 sessions)
        bundleFormat = selectedSessions.length <= 3 ? "jsonl" : "zip";
      } else {
        bundleFormat = requestedFormat;
      }

      let bundleBytes: Uint8Array;
      if (bundleFormat === "jsonl") {
        // JSONL format - just the transcripts, more readable
        bundleBytes = transcriptsBytes;
      } else {
        // ZIP format - includes manifest and prep report
        bundleBytes = zipSync({
          "transcripts.jsonl": transcriptsBytes,
          "prep_report.json": prepReportBytes,
          "manifest.json": manifestBytes
        });
      }

      self.postMessage({
        type: "bundle",
        payload: {
          bundleBytes,
          bundleId,
          bundleFormat,
          manifest,
          prepReport,
          transcriptsCount: selectedSessions.length
        }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
};
