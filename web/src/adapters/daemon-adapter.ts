/**
 * DaemonAdapter - Implements BackendAdapter for the agentwatch daemon API
 *
 * This adapter wraps the daemon API client to conform to the shared UI's
 * BackendAdapter interface, allowing the web app to use shared components.
 */

import type { ContributorMeta, RedactionConfig } from "@agentwatch/pre-share";
import type {
  BackendAdapter,
  BundleResult,
  ContributionHistoryEntry,
  ContributorSettings,
  FieldSchemasResult,
  GistResult,
  HFOAuthConfig,
  HuggingFaceUploadResult,
  PreparationResult,
  RedactionReport,
  Session
} from "@agentwatch/ui";
import {
  getHFOAuthConfig as apiGetHFOAuthConfig,
  prepareSessions as apiPrepareSessions,
  recordContribution as apiRecordContribution,
  startHFOAuth as apiStartHFOAuth,
  uploadToHuggingFace as apiUploadToHuggingFace,
  exportBundle,
  fetchContributionHistory,
  fetchContributorSettings,
  fetchFieldSchemas,
  fetchLocalLogs,
  fetchTranscripts,
  saveContributorSettings
} from "../api/client";
import type { LocalTranscript, TranscriptInfo } from "../api/types";

/**
 * Convert hook transcript to unified Session format
 */
function hookToSession(t: TranscriptInfo): Session {
  // Use end_time if available, otherwise start_time
  const modifiedAt = t.end_time || t.start_time;
  return {
    id: `hooks-${t.session_id}`,
    source: "hooks",
    agent: "claude",
    name: t.cwd.split("/").pop() || t.session_id.slice(0, 8),
    projectDir: t.cwd,
    modifiedAt: modifiedAt * 1000,
    messageCount: t.tool_count,
    sizeBytes: null,
    active: t.active
  };
}

/**
 * Convert local transcript to unified Session format
 */
function localToSession(log: LocalTranscript): Session {
  return {
    id: `local-${log.id}`,
    source: "local",
    agent: log.agent,
    name: log.name,
    projectDir: log.project_dir,
    modifiedAt: log.modified_at,
    messageCount: log.message_count,
    sizeBytes: log.size_bytes
  };
}

/**
 * Create a DaemonAdapter instance
 */
export function createDaemonAdapter(options?: {
  /** Whether to include local transcripts (requires opt-in) */
  includeLocalLogs?: boolean;
}): BackendAdapter {
  const includeLocalLogs = options?.includeLocalLogs ?? false;

  return {
    type: "daemon",

    async loadSessions(): Promise<Session[]> {
      const [hookSessions, localLogs] = await Promise.all([
        fetchTranscripts().catch(() => [] as TranscriptInfo[]),
        includeLocalLogs
          ? fetchLocalLogs().catch(() => [] as LocalTranscript[])
          : Promise.resolve([] as LocalTranscript[])
      ]);

      const sessions: Session[] = [
        ...hookSessions.map(hookToSession),
        ...localLogs.map(localToSession)
      ];

      // Sort by modification time (newest first)
      sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);

      return sessions;
    },

    async refreshSessions(): Promise<Session[]> {
      return this.loadSessions();
    },

    async getFieldSchemas(source = "all"): Promise<FieldSchemasResult> {
      const result = await fetchFieldSchemas(source);

      // Flatten the schemas object into a single array
      // Cast source to the union type expected by FieldSchema
      type SourceType = "claude" | "all" | "codex" | "opencode" | undefined;
      const fields = [
        ...result.schemas.essential.map((f) => ({
          ...f,
          category: "essential" as const,
          source: f.source as SourceType
        })),
        ...result.schemas.recommended.map((f) => ({
          ...f,
          category: "recommended" as const,
          source: f.source as SourceType
        })),
        ...result.schemas.optional.map((f) => ({
          ...f,
          category: "optional" as const,
          source: f.source as SourceType
        }))
      ];

      return {
        fields,
        defaultSelected: result.default_selected
      };
    },

    async prepareSessions(
      sessionIds: string[],
      config: RedactionConfig,
      selectedFields: string[] | undefined,
      contributor: ContributorMeta
    ): Promise<PreparationResult> {
      // Use sessionIds directly as correlation IDs
      // The daemon will look up the appropriate hook/transcript data
      const result = await apiPrepareSessions(
        sessionIds,
        {
          redactSecrets: config.redactSecrets,
          redactPii: config.redactPii,
          redactPaths: config.redactPaths,
          maskCodeBlocks: config.maskCodeBlocks,
          customRegex: config.customRegex,
          enableHighEntropy: true
        },
        selectedFields,
        {
          contributor_id: contributor.contributorId,
          license: contributor.license,
          ai_preference: contributor.aiPreference,
          rights_statement: contributor.rightsStatement,
          rights_confirmed: contributor.rightsConfirmed,
          reviewed_confirmed: contributor.reviewedConfirmed
        }
      );

      // Count stripped fields from the stripped_fields array
      const fieldsStrippedRecord: Record<string, number> = {};
      for (const field of result.stripped_fields || []) {
        fieldsStrippedRecord[field] = (fieldsStrippedRecord[field] || 0) + 1;
      }

      return {
        sessions: result.sessions.map((s) => ({
          sessionId: s.session_id,
          source: s.source,
          score: s.score,
          approxChars: s.approx_chars,
          previewOriginal: s.preview_original,
          previewRedacted: s.preview_redacted,
          rawSha256: s.raw_sha256
        })),
        redactionReport: {
          counts: result.redaction_report.counts_by_category,
          totalStringsTouched: result.redaction_report.total_redactions,
          enabledCategories: result.redaction_report.enabled_categories,
          customRegexHashes: [],
          residueWarnings: result.redaction_report.residue_warnings,
          blocked: result.redaction_report.blocked,
          fieldsStripped: result.stats?.totalFieldsStripped
        },
        fieldsPresent: result.fields_present,
        fieldsStripped: fieldsStrippedRecord
      };
    },

    async buildBundle(
      sessionIds: string[],
      _contributor: ContributorMeta,
      redactionReport: RedactionReport,
      _annotations?: Record<string, { rating?: string; notes?: string }>,
      format?: "zip" | "jsonl" | "auto"
    ): Promise<BundleResult> {
      // Use sessionIds directly as correlation IDs
      const result = await exportBundle(sessionIds, {
        redactSecrets: true,
        redactPii: true,
        redactPaths: true
      });

      // The API returns content as base64-encoded string
      // Convert to Uint8Array
      const binaryString = atob(result.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return {
        bundleBytes: bytes,
        bundleId: result.bundle_id,
        bundleFormat: (format === "auto" ? "zip" : format) || "zip",
        transcriptsCount: result.session_count,
        manifest: {
          bundle_id: result.bundle_id,
          created_at_utc: new Date().toISOString(),
          files: [],
          tooling: { app_version: "1.0.0", schema_version: "1.0.0" }
        },
        prepReport: { redactionReport }
      };
    },

    async downloadBundle(bundle: BundleResult): Promise<void> {
      const blob = new Blob([bundle.bundleBytes] as BlobPart[], {
        type:
          bundle.bundleFormat === "zip"
            ? "application/zip"
            : "application/jsonl"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bundle.bundleId}.${bundle.bundleFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async uploadToHuggingFace(
      _bundle: BundleResult,
      repoId: string,
      token?: string,
      createPr?: boolean
    ): Promise<HuggingFaceUploadResult> {
      // The daemon API expects session IDs, not a pre-built bundle
      // For now, we pass an empty array and let the daemon rebuild
      // TODO: Add an endpoint that accepts a pre-built bundle
      const result = await apiUploadToHuggingFace(
        [], // Would need to track original session IDs
        token || "",
        repoId,
        { createPr }
      );

      // Construct PR URL from repo and PR number if available
      const prUrl =
        result.pr_number && repoId
          ? `https://huggingface.co/datasets/${repoId}/pull/${result.pr_number}`
          : undefined;

      return {
        success: result.success,
        url: result.url,
        prUrl,
        error: result.error
      };
    },

    async createGist(
      _bundle: BundleResult,
      _token: string
    ): Promise<GistResult> {
      // The daemon API expects a session ID, not a bundle
      // For now, return an error
      // TODO: Add an endpoint that accepts bundle data
      return {
        success: false,
        error: "Gist creation from bundle not yet supported"
      };
    },

    async loadSettings(): Promise<ContributorSettings> {
      const settings = await fetchContributorSettings();
      return {
        contributorId: settings.contributor_id || "",
        license: settings.license || "CC-BY-4.0",
        aiPreference: settings.ai_preference || "train-genai=ok",
        hfDataset: settings.hf_dataset,
        hfTokenSaved: settings.hf_token === "***saved***"
      };
    },

    async saveSettings(settings: Partial<ContributorSettings>): Promise<void> {
      await saveContributorSettings({
        contributor_id: settings.contributorId,
        license: settings.license,
        ai_preference: settings.aiPreference,
        hf_dataset: settings.hfDataset
      });
    },

    async getHistory(): Promise<ContributionHistoryEntry[]> {
      const history = await fetchContributionHistory();
      return history.recent.map((r) => ({
        bundleId: r.bundle_id,
        createdAt: r.timestamp,
        sessionCount: r.session_count,
        destination: r.destination,
        url: undefined // API doesn't store URLs yet
      }));
    },

    async recordContribution(entry: ContributionHistoryEntry): Promise<void> {
      await apiRecordContribution({
        session_count: entry.sessionCount,
        total_chars: 0, // Not tracked in entry
        destination: entry.destination,
        bundle_id: entry.bundleId,
        status: "success"
      });
    },

    async getHFOAuthConfig(): Promise<HFOAuthConfig> {
      const config = await apiGetHFOAuthConfig();
      return {
        enabled: config.configured,
        clientId: config.clientId || undefined,
        redirectUri: config.redirectUri,
        scopes: config.scopes
      };
    },

    async startHFOAuth(): Promise<{ authUrl: string; state: string }> {
      const result = await apiStartHFOAuth();
      if (!result.success || !result.url || !result.state) {
        throw new Error(result.error || "Failed to start OAuth");
      }
      return { authUrl: result.url, state: result.state };
    }
  };
}
