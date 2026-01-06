/**
 * Contribution prep + local transcript routes.
 *
 * These endpoints mirror the legacy daemon API so the analyzer UI can
 * prepare/share data without the daemon.
 */

import type { Hono } from "hono";
import { hookSessionToDict, toolUsageToDict } from "@agentwatch/shared-api";
import {
  createSanitizer,
  getDefaultFieldSelection,
  getFieldSchemasByCategory,
  prepareSessions,
  type PreparationConfig,
  type RawSession
} from "@agentwatch/pre-share";
import { correlateSessionsWithTranscripts } from "../correlation";
import { readHookSessions, readToolUsages } from "../hooks-data";
import {
  discoverLocalTranscripts,
  formatTranscriptForDisplay,
  readTranscript,
  readTranscriptByPath
} from "../local-logs";
import {
  DEFAULT_PROFILE_ID,
  KNOWN_DESTINATIONS,
  RESEARCH_PROFILES,
  addContributionRecord,
  deleteRedactionProfile,
  getActiveProfile,
  getAvailableProfiles,
  getContributionStats,
  isBuiltinProfile,
  loadContributorSettings,
  saveContributorSettings,
  saveRedactionProfile,
  setActiveProfile,
  type RedactionConfig
} from "../contributor-settings";

export function registerContribRoutes(app: Hono): void {
  // ==========================================================================
  // Field schema + preparation endpoints
  // ==========================================================================
  app.get("/api/contrib/fields", (c) => {
    const source = c.req.query("source") || "all";
    const schemas = getFieldSchemasByCategory(source);
    const defaultSelected = getDefaultFieldSelection(source);

    return c.json({
      schemas: {
        essential: schemas.essential.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        recommended: schemas.recommended.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        optional: schemas.optional.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        strip: schemas.strip.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        })),
        always_strip: schemas.always_strip.map((f) => ({
          path: f.path,
          label: f.label,
          description: f.description,
          source: f.source
        }))
      },
      default_selected: defaultSelected
    });
  });

  app.post("/api/contrib/prepare", async (c) => {
    const body = (await c.req.json()) as {
      correlation_ids?: string[];
      session_ids?: string[];
      local_ids?: string[];
      redaction: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
        maskCodeBlocks?: boolean;
        customRegex?: string[];
        enableHighEntropy?: boolean;
      };
      selected_fields?: string[];
      contributor: {
        contributor_id?: string;
        license?: string;
        ai_preference?: string;
        rights_statement?: string;
        rights_confirmed?: boolean;
        reviewed_confirmed?: boolean;
      };
    };

    const rawSessions: RawSession[] = [];

    if (body.correlation_ids?.length) {
      const hookSessions = readHookSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = readToolUsages();

      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );
      const correlationMap = new Map(
        correlated.map((conv) => [conv.correlationId, conv])
      );

      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        const data: Record<string, unknown> = {};
        let source = "unknown";
        let sessionId = correlationId;
        let mtimeUtc = new Date().toISOString();
        let sourcePathHint: string | undefined;

        if (conv.hookSession) {
          data.session = hookSessionToDict(conv.hookSession);
          data.tool_usages = (conv.toolUsages ?? []).map((u) =>
            toolUsageToDict(u)
          );
          source = conv.hookSession.source || "claude";
          sessionId = conv.hookSession.sessionId;
          mtimeUtc = new Date(conv.hookSession.startTime).toISOString();
          sourcePathHint = conv.hookSession.transcriptPath;
        }

        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            data.messages = parsed.messages;
            data.total_input_tokens = parsed.totalInputTokens;
            data.total_output_tokens = parsed.totalOutputTokens;
            data.estimated_cost_usd = parsed.estimatedCostUsd;
            if (!conv.hookSession) {
              source = parsed.agent;
              sessionId = conv.transcript.id;
              mtimeUtc = new Date(
                conv.transcript.modifiedAt ?? Date.now()
              ).toISOString();
              sourcePathHint = parsed.path;
            }
          }
        }

        rawSessions.push({
          sessionId,
          source,
          data,
          mtimeUtc,
          sourcePathHint
        });
      }
    } else {
      const hookSessions = readHookSessions();
      const toolUsagesMap = readToolUsages();
      const hookMap = new Map(
        hookSessions.map((session) => [session.sessionId, session])
      );

      for (const sessionId of body.session_ids ?? []) {
        const session = hookMap.get(sessionId);
        if (!session) continue;

        const toolUsages = toolUsagesMap.get(sessionId) || [];
        const data = {
          session: hookSessionToDict(session),
          tool_usages: toolUsages.map((u) => toolUsageToDict(u))
        };

        rawSessions.push({
          sessionId,
          source: session.source || "claude",
          data,
          mtimeUtc: new Date(session.startTime).toISOString(),
          sourcePathHint: session.transcriptPath
        });
      }

      const localMeta = body.local_ids?.length
        ? await discoverLocalTranscripts()
        : [];

      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;
        const meta = localMeta.find((m) => m.id === localId);

        const data = {
          messages: transcript.messages,
          total_input_tokens: transcript.totalInputTokens,
          total_output_tokens: transcript.totalOutputTokens,
          estimated_cost_usd: transcript.estimatedCostUsd
        };

        rawSessions.push({
          sessionId: localId,
          source: transcript.agent,
          data,
          mtimeUtc: meta?.modifiedAt
            ? new Date(meta.modifiedAt).toISOString()
            : new Date().toISOString(),
          sourcePathHint: transcript.path
        });
      }
    }

    if (rawSessions.length === 0) {
      return c.json({ error: "No valid sessions found" }, 400);
    }

    const redaction = body.redaction ?? {};
    const config: PreparationConfig = {
      redaction: {
        redactSecrets: redaction.redactSecrets ?? true,
        redactPii: redaction.redactPii ?? true,
        redactPaths: redaction.redactPaths ?? true,
        maskCodeBlocks: redaction.maskCodeBlocks ?? false,
        customRegex: redaction.customRegex ?? [],
        enableHighEntropy: redaction.enableHighEntropy ?? true
      },
      selectedFields: body.selected_fields,
      contributor: {
        contributorId: body.contributor.contributor_id ?? "anonymous",
        license: body.contributor.license ?? "CC-BY-4.0",
        aiPreference: body.contributor.ai_preference ?? "train-genai=deny",
        rightsStatement:
          body.contributor.rights_statement ??
          "I have the right to share this data.",
        rightsConfirmed: body.contributor.rights_confirmed ?? false,
        reviewedConfirmed: body.contributor.reviewed_confirmed ?? false
      },
      appVersion: "agentwatch-0.2.0"
    };

    const result = await prepareSessions(rawSessions, config);

    return c.json({
      sessions: result.sessions.map((s) => ({
        session_id: s.sessionId,
        source: s.source,
        preview_original: s.previewOriginal,
        preview_redacted: s.previewRedacted,
        score: s.score,
        approx_chars: s.approxChars,
        raw_sha256: s.rawSha256,
        raw_json_original: JSON.stringify(s.rawData, null, 2),
        raw_json: JSON.stringify(s.sanitizedData, null, 2)
      })),
      redaction_report: {
        total_redactions: result.redactionReport.totalRedactions,
        counts_by_category: result.redactionReport.countsByCategory,
        enabled_categories: result.redactionReport.enabledCategories,
        residue_warnings: result.residueWarnings,
        blocked: result.blocked
      },
      stripped_fields: result.strippedFields,
      fields_present: result.fieldsPresent,
      fields_by_source: result.fieldsBySource,
      redaction_info_map: result.redactionInfoMap,
      stats: result.stats
    });
  });

  // ==========================================================================
  // Hook session and local transcript endpoints
  // ==========================================================================
  app.get("/api/contrib/transcripts", (c) => {
    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const sessions = readHookSessions();
    const toolUsagesMap = readToolUsages();

    return c.json({
      transcripts: sessions.slice(0, limit).map((session) => {
        const usages = toolUsagesMap.get(session.sessionId) || [];
        const estimatedSizeBytes = usages.reduce((sum, u) => {
          const inputSize = JSON.stringify(u.toolInput || {}).length;
          const responseSize = JSON.stringify(u.toolResponse || {}).length;
          return sum + inputSize + responseSize + 200;
        }, 0);

        return {
          session_id: session.sessionId,
          transcript_path: session.transcriptPath,
          cwd: session.cwd,
          start_time: session.startTime,
          end_time: session.endTime,
          tool_count: session.toolCount,
          active: session.endTime === undefined,
          duration_minutes: session.endTime
            ? Math.round((session.endTime - session.startTime) / 60)
            : null,
          estimated_size_bytes: estimatedSizeBytes
        };
      })
    });
  });

  app.get("/api/contrib/local-logs", async (c) => {
    const agents = c.req.query("agents")?.split(",");
    const transcripts = await discoverLocalTranscripts(agents);

    return c.json({
      transcripts: transcripts.map((t) => ({
        id: t.id,
        agent: t.agent,
        path: t.path,
        name: t.name,
        project_dir: t.projectDir,
        modified_at: t.modifiedAt,
        size_bytes: t.sizeBytes,
        message_count: t.messageCount,
        start_time: t.startTime,
        end_time: t.endTime
      })),
      agents_scanned: agents || ["claude", "codex", "opencode", "gemini"]
    });
  });

  app.get("/api/contrib/local-logs/:transcriptId", async (c) => {
    const transcriptId = decodeURIComponent(c.req.param("transcriptId"));
    const format = c.req.query("format") || "full";

    const transcript = await readTranscript(transcriptId);
    if (!transcript) {
      return c.json({ error: "Transcript not found" }, 404);
    }

    if (format === "chat") {
      const messages = formatTranscriptForDisplay(transcript);
      return c.json({
        id: transcript.id,
        agent: transcript.agent,
        name: transcript.name,
        path: transcript.path,
        project_dir: transcript.projectDir,
        messages,
        total_input_tokens: transcript.totalInputTokens,
        total_output_tokens: transcript.totalOutputTokens,
        estimated_cost_usd: transcript.estimatedCostUsd
      });
    }

    return c.json({
      id: transcript.id,
      agent: transcript.agent,
      name: transcript.name,
      path: transcript.path,
      project_dir: transcript.projectDir,
      messages: transcript.messages,
      total_input_tokens: transcript.totalInputTokens,
      total_output_tokens: transcript.totalOutputTokens,
      estimated_cost_usd: transcript.estimatedCostUsd
    });
  });

  app.get("/api/contrib/local-logs/:transcriptId/raw", async (c) => {
    const transcriptId = decodeURIComponent(c.req.param("transcriptId"));
    const transcript = await readTranscript(transcriptId);
    if (!transcript || !transcript.path) {
      return c.json({ error: "Transcript not found" }, 404);
    }

    try {
      const content = await Bun.file(transcript.path).text();
      return c.text(content);
    } catch {
      return c.json({ error: "Failed to read source file" }, 500);
    }
  });

  app.post("/api/contrib/local-logs/read", async (c) => {
    const body = (await c.req.json()) as { path: string; agent?: string };
    const agent = body.agent || "claude";

    const transcript = await readTranscriptByPath(agent, body.path);
    if (!transcript) {
      return c.json({ error: "Failed to read transcript" }, 400);
    }

    const messages = formatTranscriptForDisplay(transcript);
    return c.json({
      id: transcript.id,
      agent: transcript.agent,
      name: transcript.name,
      project_dir: transcript.projectDir,
      messages,
      total_input_tokens: transcript.totalInputTokens,
      total_output_tokens: transcript.totalOutputTokens,
      estimated_cost_usd: transcript.estimatedCostUsd
    });
  });

  // ==========================================================================
  // Simple JSONL bundle export (legacy download path)
  // ==========================================================================
  app.post("/api/contrib/export/bundle", async (c) => {
    const body = (await c.req.json()) as {
      correlation_ids?: string[];
      session_ids?: string[];
      local_ids?: string[];
      include_cost?: boolean;
      options?: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
      };
    };

    const bundleId = crypto.randomUUID();
    const sessions: Array<Record<string, unknown>> = [];
    const allToolUsages: Array<Record<string, unknown>> = [];

    const sanitizer = createSanitizer({
      redactSecrets: body.options?.redactSecrets ?? true,
      redactPii: body.options?.redactPii ?? true,
      redactPaths: body.options?.redactPaths ?? true
    });

    if (body.correlation_ids?.length) {
      const hookSessions = readHookSessions();
      const transcripts = await discoverLocalTranscripts();
      const toolUsagesMap = readToolUsages();

      const correlated = correlateSessionsWithTranscripts(
        hookSessions,
        transcripts,
        toolUsagesMap
      );
      const correlationMap = new Map(
        correlated.map((conv) => [conv.correlationId, conv])
      );

      for (const correlationId of body.correlation_ids) {
        const conv = correlationMap.get(correlationId);
        if (!conv) continue;

        const sessionData: Record<string, unknown> = {
          correlation_id: correlationId
        };

        if (conv.hookSession) {
          Object.assign(sessionData, hookSessionToDict(conv.hookSession));
          const toolUsages = conv.toolUsages ?? [];
          for (const usage of toolUsages) {
            allToolUsages.push(
              sanitizer.redactObject(toolUsageToDict(usage)) as Record<
                string,
                unknown
              >
            );
          }
        }

        if (conv.transcript) {
          const parsed = await readTranscript(conv.transcript.id);
          if (parsed) {
            sessionData.messages = parsed.messages;
            sessionData.agent = parsed.agent;
            sessionData.path = parsed.path;
            if (body.include_cost) {
              sessionData.cost_estimate = {
                total_input_tokens: parsed.totalInputTokens,
                total_output_tokens: parsed.totalOutputTokens,
                estimated_cost_usd: parsed.estimatedCostUsd
              };
            }
          }
        }

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );
      }
    } else {
      const hookSessions = readHookSessions();
      const toolUsagesMap = readToolUsages();
      const hookMap = new Map(
        hookSessions.map((session) => [session.sessionId, session])
      );

      for (const sessionId of body.session_ids ?? []) {
        const session = hookMap.get(sessionId);
        if (!session) continue;
        const toolUsages = toolUsagesMap.get(sessionId) || [];

        const sessionData = {
          ...hookSessionToDict(session),
          tool_usages: toolUsages.map((u) => toolUsageToDict(u))
        };

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );
      }

      const localMeta = body.local_ids?.length
        ? await discoverLocalTranscripts()
        : [];

      for (const localId of body.local_ids ?? []) {
        const transcript = await readTranscript(localId);
        if (!transcript) continue;
        const meta = localMeta.find((m) => m.id === localId);

        const sessionData: Record<string, unknown> = {
          source: "local",
          agent: transcript.agent,
          session_id: localId,
          path: transcript.path,
          messages: transcript.messages
        };

        if (body.include_cost) {
          sessionData.cost_estimate = {
            total_input_tokens: transcript.totalInputTokens,
            total_output_tokens: transcript.totalOutputTokens,
            estimated_cost_usd: transcript.estimatedCostUsd
          };
          sessionData.modified_at = meta?.modifiedAt ?? null;
        }

        sessions.push(
          sanitizer.redactObject(sessionData) as Record<string, unknown>
        );
      }
    }

    const report = sanitizer.getReport();
    const lines: string[] = [];

    lines.push(
      JSON.stringify({
        type: "manifest",
        bundle_id: bundleId,
        version: "1.0.0",
        exported_at: new Date().toISOString(),
        session_count: sessions.length,
        tool_usage_count: allToolUsages.length,
        sanitization: {
          total_redactions: report.totalRedactions,
          categories: report.countsByCategory
        }
      })
    );

    for (const session of sessions) {
      lines.push(JSON.stringify({ type: "session", data: session }));
    }

    for (const usage of allToolUsages) {
      lines.push(JSON.stringify({ type: "tool_usage", data: usage }));
    }

    return c.json({
      bundle_id: bundleId,
      session_count: sessions.length,
      tool_usage_count: allToolUsages.length,
      redaction_count: report.totalRedactions,
      categories: report.countsByCategory,
      content: lines.join("\n")
    });
  });

  // ==========================================================================
  // Contributor settings + profiles + history
  // ==========================================================================
  app.get("/api/contrib/settings", (c) => {
    const settings = loadContributorSettings();
    return c.json({
      contributor_id: settings.contributorId,
      license: settings.license,
      ai_preference: settings.aiPreference,
      rights_statement: settings.rightsStatement,
      hf_token: settings.hfToken ? "***saved***" : null,
      hf_dataset: settings.hfDataset,
      updated_at: settings.updatedAt
    });
  });

  app.post("/api/contrib/settings", async (c) => {
    const body = (await c.req.json()) as {
      contributor_id?: string;
      license?: string;
      ai_preference?: string;
      rights_statement?: string;
      hf_token?: string;
      hf_dataset?: string;
    };

    const updated = saveContributorSettings({
      contributorId: body.contributor_id,
      license: body.license,
      aiPreference: body.ai_preference,
      rightsStatement: body.rights_statement,
      hfToken: body.hf_token,
      hfDataset: body.hf_dataset
    });

    return c.json({
      success: true,
      contributor_id: updated.contributorId,
      license: updated.license,
      ai_preference: updated.aiPreference,
      rights_statement: updated.rightsStatement,
      hf_token: updated.hfToken ? "***saved***" : null,
      hf_dataset: updated.hfDataset,
      updated_at: updated.updatedAt
    });
  });

  app.get("/api/contrib/profiles", (c) => {
    const settings = loadContributorSettings();
    const allProfiles = getAvailableProfiles(settings);

    return c.json({
      profiles: allProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        description: profile.description,
        kept_fields: profile.keptFields,
        redaction_config: {
          redact_secrets: profile.redactionConfig.redactSecrets,
          redact_pii: profile.redactionConfig.redactPii,
          redact_paths: profile.redactionConfig.redactPaths,
          enable_high_entropy: profile.redactionConfig.enableHighEntropy,
          custom_patterns: profile.redactionConfig.customPatterns
        },
        is_default: profile.isDefault,
        is_builtin: isBuiltinProfile(profile.id),
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      })),
      active_profile_id: settings.activeProfileId || DEFAULT_PROFILE_ID
    });
  });

  app.get("/api/contrib/research-profiles", (c) => {
    return c.json({
      profiles: RESEARCH_PROFILES.map((profile) => ({
        id: profile.id,
        name: profile.name,
        tagline: profile.tagline,
        description: profile.description,
        enables_research: profile.enablesResearch.map((q) => ({
          question: q.question,
          context: q.context
        })),
        shared_summary: profile.sharedSummary,
        stripped_summary: profile.strippedSummary,
        kept_fields: profile.keptFields,
        redaction_config: {
          redact_secrets: profile.redactionConfig.redactSecrets,
          redact_pii: profile.redactionConfig.redactPii,
          redact_paths: profile.redactionConfig.redactPaths,
          enable_high_entropy: profile.redactionConfig.enableHighEntropy
        },
        requires_review: profile.requiresReview ?? false,
        ui: profile.ui ?? {}
      })),
      default_profile_id: DEFAULT_PROFILE_ID
    });
  });

  app.post("/api/contrib/profiles", async (c) => {
    const body = (await c.req.json()) as {
      name: string;
      description?: string;
      kept_fields: string[];
      redaction_config?: {
        redact_secrets?: boolean;
        redact_pii?: boolean;
        redact_paths?: boolean;
        enable_high_entropy?: boolean;
        custom_patterns?: string[];
      };
    };

    if (!body.name || !body.kept_fields) {
      return c.json({ error: "name and kept_fields are required" }, 400);
    }

    const redactionConfig: RedactionConfig = {
      redactSecrets: body.redaction_config?.redact_secrets ?? true,
      redactPii: body.redaction_config?.redact_pii ?? true,
      redactPaths: body.redaction_config?.redact_paths ?? true,
      enableHighEntropy: body.redaction_config?.enable_high_entropy ?? true,
      customPatterns: body.redaction_config?.custom_patterns
    };

    const profile = saveRedactionProfile(
      body.name,
      body.kept_fields,
      redactionConfig,
      body.description
    );

    return c.json({
      success: true,
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        kept_fields: profile.keptFields,
        redaction_config: {
          redact_secrets: profile.redactionConfig.redactSecrets,
          redact_pii: profile.redactionConfig.redactPii,
          redact_paths: profile.redactionConfig.redactPaths,
          enable_high_entropy: profile.redactionConfig.enableHighEntropy,
          custom_patterns: profile.redactionConfig.customPatterns
        },
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      }
    });
  });

  app.delete("/api/contrib/profiles/:id", (c) => {
    const profileId = c.req.param("id");

    if (isBuiltinProfile(profileId)) {
      return c.json({ error: "Cannot delete built-in profiles" }, 400);
    }

    const deleted = deleteRedactionProfile(profileId);
    if (!deleted) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ success: true });
  });

  app.put("/api/contrib/profiles/active", async (c) => {
    const body = (await c.req.json()) as { profile_id: string };

    if (!body.profile_id) {
      return c.json({ error: "profile_id is required" }, 400);
    }

    const success = setActiveProfile(body.profile_id);
    if (!success) {
      return c.json({ error: "Profile not found" }, 404);
    }

    const settings = loadContributorSettings();
    const activeProfile = getActiveProfile(settings);

    return c.json({
      success: true,
      active_profile_id: activeProfile.id,
      profile: {
        id: activeProfile.id,
        name: activeProfile.name,
        kept_fields: activeProfile.keptFields,
        redaction_config: {
          redact_secrets: activeProfile.redactionConfig.redactSecrets,
          redact_pii: activeProfile.redactionConfig.redactPii,
          redact_paths: activeProfile.redactionConfig.redactPaths,
          enable_high_entropy: activeProfile.redactionConfig.enableHighEntropy,
          custom_patterns: activeProfile.redactionConfig.customPatterns
        }
      }
    });
  });

  app.get("/api/contrib/history", (c) => {
    const stats = getContributionStats();
    return c.json({
      total_contributions: stats.totalContributions,
      successful_contributions: stats.successfulContributions,
      total_sessions: stats.totalSessions,
      total_chars: stats.totalChars,
      first_contribution: stats.firstContribution,
      last_contribution: stats.lastContribution,
      recent: stats.recentContributions.map((record) => ({
        id: record.id,
        timestamp: record.timestamp,
        session_count: record.sessionCount,
        total_chars: record.totalChars,
        destination: record.destination,
        bundle_id: record.bundleId,
        status: record.status,
        error: record.error,
        session_ids: record.sessionIds
      }))
    });
  });

  app.post("/api/contrib/history", async (c) => {
    const body = (await c.req.json()) as {
      session_count: number;
      total_chars: number;
      destination: string;
      bundle_id: string;
      status: "success" | "failed" | "pending";
      error?: string;
      session_ids?: string[];
    };

    const record = addContributionRecord({
      timestamp: new Date().toISOString(),
      sessionCount: body.session_count,
      totalChars: body.total_chars,
      destination: body.destination,
      bundleId: body.bundle_id,
      status: body.status,
      error: body.error,
      sessionIds: body.session_ids
    });

    return c.json({ success: true, id: record.id });
  });

  app.get("/api/contrib/destinations", (c) => {
    const settings = loadContributorSettings();
    const defaultDataset =
      settings.hfDataset || KNOWN_DESTINATIONS.huggingface.defaultDataset;

    return c.json({
      default: `huggingface:${defaultDataset}`,
      destinations: [
        {
          id: "huggingface",
          name: KNOWN_DESTINATIONS.huggingface.name,
          dataset: defaultDataset,
          url: KNOWN_DESTINATIONS.huggingface.url(defaultDataset),
          description: KNOWN_DESTINATIONS.huggingface.description,
          is_public: true,
          requires_token: true,
          has_token: !!settings.hfToken
        },
        {
          id: "local",
          name: KNOWN_DESTINATIONS.local.name,
          description: KNOWN_DESTINATIONS.local.description,
          is_public: false,
          requires_token: false
        }
      ]
    });
  });
}
