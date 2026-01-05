/**
 * Bundle creation for donation workflow.
 */

import { zipSync } from "fflate";
import type {
  BundleManifest,
  BundleResult,
  ContribSession,
  ContributorMeta,
  PrepReport
} from "../types/contrib";
import type { RedactionReport } from "../types/sanitizer";
import { redactPathUsername } from "./jsonl";

const encoder = new TextEncoder();

/**
 * Calculate SHA256 hash.
 */
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  // Create a new ArrayBuffer copy to avoid TypeScript issues with SharedArrayBuffer
  const buffer = new Uint8Array(bytes).buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = new Uint8Array(digest);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a random UUID v4.
 */
function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    ""
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Format current time as UTC ISO string.
 */
function formatUtcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Generate a bundle ID from contributor info.
 */
export function makeBundleId(contributorId: string): string {
  const safe = contributorId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  const now = formatUtcNow().replace(/[-:]/g, "").replace(".", "");
  const short = Math.random().toString(36).slice(2, 8);
  return `${now}_${safe || "anonymous"}_${short}`;
}

/**
 * Create a donation bundle from sanitized sessions.
 *
 * @param options.format - 'zip' for compressed bundle, 'jsonl' for plain JSONL (more readable)
 */
export async function createBundle(options: {
  sessions: Array<
    ContribSession & { sanitized: unknown; previewRedacted?: string }
  >;
  contributor: ContributorMeta;
  appVersion: string;
  redaction: RedactionReport;
  manifestSha256?: string;
  format?: "zip" | "jsonl";
  qualityConfig?: {
    dimensionWeights: {
      completion: number;
      codeQuality: number;
      efficiency: number;
      safety: number;
    };
    signalWeights: {
      noFailures: number;
      hasCommits: number;
      normalEnd: number;
      reasonableToolCount: number;
      healthyPacing: number;
    };
  };
}): Promise<BundleResult> {
  const {
    sessions,
    contributor,
    appVersion,
    redaction,
    manifestSha256,
    format = "zip",
    qualityConfig
  } = options;

  if (sessions.length === 0) {
    throw new Error("No sanitized sessions to bundle.");
  }

  const bundleId = makeBundleId(contributor.contributorId);
  const now = formatUtcNow();
  const schemaVersion = "donated_coding_agent_transcripts.v0";

  // Build transcripts JSONL
  const transcriptsLines: string[] = [];
  const selectedSessionReport: Array<{
    session_id: string;
    raw_sha256: string;
    source_path_hint: string;
    score: number;
  }> = [];

  for (const session of sessions) {
    const selection = {
      score: session.score,
      approx_chars: session.approxChars,
      preview_redacted: session.previewRedacted || session.preview.slice(0, 240)
    };

    transcriptsLines.push(
      JSON.stringify({
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
      })
    );

    selectedSessionReport.push({
      session_id: session.sessionId,
      raw_sha256: session.rawSha256,
      source_path_hint: redactPathUsername(session.sourcePathHint),
      score: session.score
    });
  }

  const transcriptsJsonl = transcriptsLines.join("\n") + "\n";

  // Build prep report
  const prepReport: PrepReport = {
    app_version: appVersion,
    created_at_utc: now,
    bundle_id: bundleId,
    contributor: {
      contributor_id: contributor.contributorId,
      license: contributor.license,
      ai_use_preference: contributor.aiPreference
    },
    inputs: {
      raw_export_manifest_sha256: manifestSha256 || "",
      selected_sessions: selectedSessionReport
    },
    redaction: {
      counts: redaction.countsByCategory,
      total_strings_touched: redaction.totalRedactions,
      enabled_categories: redaction.enabledCategories,
      custom_regexes: [], // Would need to hash custom patterns
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
    },
    // Include quality config if provided
    ...(qualityConfig && {
      quality_config: {
        dimension_weights: {
          completion: qualityConfig.dimensionWeights.completion,
          code_quality: qualityConfig.dimensionWeights.codeQuality,
          efficiency: qualityConfig.dimensionWeights.efficiency,
          safety: qualityConfig.dimensionWeights.safety
        },
        signal_weights: {
          no_failures: qualityConfig.signalWeights.noFailures,
          has_commits: qualityConfig.signalWeights.hasCommits,
          normal_end: qualityConfig.signalWeights.normalEnd,
          reasonable_tool_count:
            qualityConfig.signalWeights.reasonableToolCount,
          healthy_pacing: qualityConfig.signalWeights.healthyPacing
        },
        version: "1.0"
      }
    })
  };

  const prepReportText = JSON.stringify(prepReport, null, 2);

  // Build manifest
  const transcriptsBytes = encoder.encode(transcriptsJsonl);
  const prepReportBytes = encoder.encode(prepReportText);

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

  const manifest: BundleManifest = {
    bundle_id: bundleId,
    created_at_utc: now,
    files: manifestEntries,
    tooling: {
      app_version: appVersion,
      schema_version: schemaVersion
    }
  };

  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));

  // Add manifest to its own entries
  manifestEntries.push({
    path: "manifest.json",
    sha256: await sha256Hex(manifestBytes),
    bytes: manifestBytes.length
  });

  // Create bundle in requested format
  let bundleBytes: Uint8Array;
  let bundleFormat: "zip" | "jsonl";

  if (format === "jsonl") {
    // Plain JSONL - more readable, good for small contributions
    bundleBytes = transcriptsBytes;
    bundleFormat = "jsonl";
  } else {
    // ZIP bundle - includes manifest and prep report
    bundleBytes = zipSync({
      "transcripts.jsonl": transcriptsBytes,
      "prep_report.json": prepReportBytes,
      "manifest.json": manifestBytes
    });
    bundleFormat = "zip";
  }

  return {
    bundleBytes,
    bundleId,
    bundleFormat,
    manifest,
    prepReport,
    transcriptsCount: sessions.length
  };
}
