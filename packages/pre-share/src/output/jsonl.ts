/**
 * JSONL output formatter.
 */

import type { TranscriptSanitizer } from "../sanitizer/sanitizer";
import type { ContribSession, TranscriptEntry } from "../types/contrib";

/**
 * Generate sanitized JSONL output from entries.
 */
export function generateJsonl(
  entries: TranscriptEntry[],
  sanitizer: TranscriptSanitizer
): string {
  const lines: string[] = [];

  for (const entry of entries) {
    const sanitized = sanitizer.redactObject(entry);
    lines.push(JSON.stringify(sanitized));
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate sanitized JSONL from sessions with metadata.
 */
export function generateSessionJsonl(
  sessions: Array<ContribSession & { sanitized: unknown }>,
  options: {
    schemaVersion?: string;
    bundleId?: string;
    contributor?: {
      contributorId: string;
      license: string;
      aiPreference: string;
    };
  } = {}
): string {
  const {
    schemaVersion = "donated_coding_agent_transcripts.v0",
    bundleId = generateBundleId(),
    contributor
  } = options;

  const lines: string[] = [];

  for (const session of sessions) {
    const entry = {
      schema_version: schemaVersion,
      bundle_id: bundleId,
      source: session.source,
      source_path_hint: redactPathUsername(session.sourcePathHint),
      source_mtime_utc: session.mtimeUtc,
      raw_sha256: session.rawSha256,
      selection: {
        score: session.score,
        approx_chars: session.approxChars,
        preview_redacted: session.preview.slice(0, 240)
      },
      contributor: contributor
        ? {
            contributor_id: contributor.contributorId,
            license: contributor.license,
            ai_use_preference: contributor.aiPreference
          }
        : undefined,
      data: session.sanitized
    };

    lines.push(JSON.stringify(entry));
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate a bundle ID.
 */
function generateBundleId(contributorId?: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(".", "");
  const safe = (contributorId || "anonymous")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  const short = Math.random().toString(36).slice(2, 8);
  return `${now}_${safe}_${short}`;
}

/**
 * Redact usernames from paths.
 */
export function redactPathUsername(path: string): string {
  if (!path) return path;
  let redacted = path.replace(/\/(Users|home)\/[^/\s]+/g, "/$1/[REDACTED]");
  redacted = redacted.replace(
    /([A-Z]):\\Users\\[^\\]+/gi,
    "$1:\\Users\\[REDACTED]"
  );
  return redacted;
}
