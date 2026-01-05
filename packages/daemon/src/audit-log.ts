/**
 * Centralized Audit Log for AgentWatch
 *
 * Provides a complete timeline of all CRUD operations on AgentWatch data.
 * Uses append-only JSONL format for durability and easy parsing.
 *
 * Events are both logged in real-time AND inferred from existing data
 * for a stateless reconstruction of history.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync
} from "fs";
import { homedir } from "os";
import { basename, join } from "path";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Categories of audit events.
 */
export type AuditCategory =
  | "transcript" // Local transcript files discovered
  | "hook_session" // Claude Code hook sessions
  | "tool_usage" // Individual tool invocations
  | "enrichment" // Auto-computed enrichments
  | "annotation" // User annotations/feedback
  | "conversation" // Conversation metadata (names)
  | "agent" // Agent metadata (names, notes)
  | "managed_session" // User-managed agent sessions
  | "process" // Agent process lifecycle
  | "config" // Configuration/settings changes
  | "contributor" // Contributor settings/contributions
  | "daemon" // Daemon lifecycle events
  | "system"; // System-level events

/**
 * CRUD action types.
 */
export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "start"
  | "end"
  | "discover"
  | "rename"
  | "annotate"
  | "compute"
  | "export"
  | "import";

/**
 * A single audit log entry.
 */
export interface AuditEntry {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Event category */
  category: AuditCategory;
  /** CRUD action */
  action: AuditAction;
  /** Entity ID (session ID, conversation ID, etc.) */
  entityId: string;
  /** Human-readable description */
  description: string;
  /** Additional context/metadata */
  details?: Record<string, unknown>;
  /** Source of the event (hook, api, inferred, etc.) */
  source: "hook" | "api" | "scanner" | "inferred" | "daemon" | "user";
}

/**
 * Summary statistics for the audit log.
 */
export interface AuditStats {
  totalEvents: number;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  oldestEvent?: string;
  newestEvent?: string;
}

// =============================================================================
// PATHS
// =============================================================================

const DATA_DIR = join(homedir(), ".agentwatch");
const EVENTS_LOG_PATH = join(DATA_DIR, "events.jsonl");
const LEGACY_AUDIT_LOG_PATH = join(DATA_DIR, "audit.jsonl");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Migrate legacy audit.jsonl to events.jsonl if needed.
 * Called automatically when accessing the events log.
 */
function migrateEventsLog(): void {
  if (existsSync(LEGACY_AUDIT_LOG_PATH) && !existsSync(EVENTS_LOG_PATH)) {
    try {
      renameSync(LEGACY_AUDIT_LOG_PATH, EVENTS_LOG_PATH);
      console.log("[audit-log] Migrated audit.jsonl to events.jsonl");
    } catch (err) {
      console.error("[audit-log] Failed to migrate audit.jsonl:", err);
    }
  }
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Append an audit entry to the log.
 */
export function logAuditEvent(
  category: AuditCategory,
  action: AuditAction,
  entityId: string,
  description: string,
  details?: Record<string, unknown>,
  source: AuditEntry["source"] = "api"
): AuditEntry {
  ensureDataDir();

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    category,
    action,
    entityId,
    description,
    details,
    source
  };

  try {
    migrateEventsLog();
    appendFileSync(EVENTS_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("[audit-log] Failed to write audit entry:", err);
  }

  return entry;
}

/**
 * Read audit entries from the log file.
 */
export function readAuditLog(
  options: {
    limit?: number;
    offset?: number;
    category?: AuditCategory;
    action?: AuditAction;
    since?: string;
    until?: string;
  } = {}
): AuditEntry[] {
  migrateEventsLog();

  if (!existsSync(EVENTS_LOG_PATH)) {
    return [];
  }

  try {
    const content = readFileSync(EVENTS_LOG_PATH, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    let entries: AuditEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    // Apply filters
    if (options.category) {
      entries = entries.filter((e) => e.category === options.category);
    }
    if (options.action) {
      entries = entries.filter((e) => e.action === options.action);
    }
    if (options.since) {
      entries = entries.filter((e) => e.timestamp >= options.since!);
    }
    if (options.until) {
      entries = entries.filter((e) => e.timestamp <= options.until!);
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Apply pagination
    if (options.offset) {
      entries = entries.slice(options.offset);
    }
    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  } catch (err) {
    console.error("[audit-log] Failed to read audit log:", err);
    return [];
  }
}

/**
 * Get audit log statistics.
 */
export function getAuditStats(): AuditStats {
  const entries = readAuditLog();

  const stats: AuditStats = {
    totalEvents: entries.length,
    byCategory: {},
    byAction: {}
  };

  for (const entry of entries) {
    stats.byCategory[entry.category] =
      (stats.byCategory[entry.category] || 0) + 1;
    stats.byAction[entry.action] = (stats.byAction[entry.action] || 0) + 1;
  }

  if (entries.length > 0) {
    // Entries are sorted newest first
    stats.newestEvent = entries[0]!.timestamp;
    stats.oldestEvent = entries[entries.length - 1]!.timestamp;
  }

  return stats;
}

// =============================================================================
// INFERENCE FROM EXISTING DATA
// =============================================================================

/**
 * Infer historical events from existing data files.
 * This provides a stateless reconstruction of history from file timestamps
 * and stored metadata.
 */
export async function inferHistoricalEvents(): Promise<AuditEntry[]> {
  const events: AuditEntry[] = [];

  // 1. Infer from local transcripts
  events.push(...(await inferTranscriptEvents()));

  // 2. Infer from hook sessions
  events.push(...inferHookSessionEvents());

  // 2.5. Infer from git commits
  events.push(...inferCommitEvents());

  // 3. Infer from enrichment store
  events.push(...inferEnrichmentEvents());

  // 4. Infer from conversation metadata
  events.push(...inferConversationEvents());

  // 5. Infer from agent metadata
  events.push(...inferAgentMetadataEvents());

  // 6. Infer from process logs
  events.push(...inferProcessEvents());

  // 7. Infer from contributor settings
  events.push(...inferContributorEvents());

  // 8. Infer from config changes
  events.push(...inferConfigEvents());

  // 9. Infer from managed sessions (aw run)
  events.push(...inferManagedSessionEvents());

  // Sort by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return events;
}

/**
 * Infer events from local transcript files.
 */
async function inferTranscriptEvents(): Promise<AuditEntry[]> {
  const events: AuditEntry[] = [];

  try {
    const { discoverLocalTranscripts } = await import("./local-logs");
    const transcripts = await discoverLocalTranscripts();

    for (const transcript of transcripts) {
      events.push({
        timestamp: new Date(transcript.modifiedAt).toISOString(),
        category: "transcript",
        action: "discover",
        entityId: transcript.id,
        description: `Transcript discovered: ${transcript.name.slice(0, 50)}`,
        details: {
          agent: transcript.agent,
          path: transcript.path,
          projectDir: transcript.projectDir,
          messageCount: transcript.messageCount,
          sizeBytes: transcript.sizeBytes
        },
        source: "inferred"
      });
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer transcript events:", err);
  }

  return events;
}

/**
 * Infer events from hook session data.
 */
function inferHookSessionEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const sessionsPath = join(DATA_DIR, "hooks", "sessions.jsonl");
    if (!existsSync(sessionsPath)) return events;

    const content = readFileSync(sessionsPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const session = JSON.parse(line);
        if (!session.sessionId) continue;

        // Session start
        events.push({
          timestamp: new Date(session.startTime).toISOString(),
          category: "hook_session",
          action: "start",
          entityId: session.sessionId,
          description: `Hook session started: ${session.source || "startup"}`,
          details: {
            cwd: session.cwd,
            permissionMode: session.permissionMode,
            transcriptPath: session.transcriptPath
          },
          source: "inferred"
        });

        // Session end (if ended)
        if (session.endTime) {
          events.push({
            timestamp: new Date(session.endTime).toISOString(),
            category: "hook_session",
            action: "end",
            entityId: session.sessionId,
            description: `Hook session ended (${session.toolCount} tools, $${(session.estimatedCostUsd || 0).toFixed(4)})`,
            details: {
              toolCount: session.toolCount,
              estimatedCostUsd: session.estimatedCostUsd,
              commits: session.commits
            },
            source: "inferred"
          });
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer hook session events:", err);
  }

  return events;
}

/**
 * Infer events from git commits (hooks/commits.jsonl).
 */
function inferCommitEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const commitsPath = join(DATA_DIR, "hooks", "commits.jsonl");
    if (!existsSync(commitsPath)) return events;

    const content = readFileSync(commitsPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const commit = JSON.parse(line);
        if (!commit.commitHash) continue;

        events.push({
          timestamp: new Date(commit.timestamp).toISOString(),
          category: "hook_session",
          action: "create",
          entityId: commit.commitHash,
          description: `Git commit: ${(commit.message || "").slice(0, 60)}`,
          details: {
            sessionId: commit.sessionId,
            repoPath: commit.repoPath,
            message: commit.message
          },
          source: "inferred"
        });
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer commit events:", err);
  }

  return events;
}

/**
 * Infer events from enrichment audit log.
 */
function inferEnrichmentEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const auditPath = join(DATA_DIR, "enrichments", "audit.jsonl");
    if (!existsSync(auditPath)) return events;

    const content = readFileSync(auditPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Determine entity ID
        const ref = entry.sessionRef || {};
        const entityId =
          ref.correlationId ||
          ref.hookSessionId ||
          ref.transcriptId ||
          "unknown";

        // Map enrichment types to descriptions
        const typeDescriptions: Record<string, string> = {
          autoTags: "Auto-tags computed",
          outcomeSignals: "Outcome signals extracted",
          qualityScore: "Quality score computed",
          manualAnnotation: "User annotation added",
          loopDetection: "Loop detection computed",
          diffSnapshot: "Git diff captured"
        };

        const description =
          typeDescriptions[entry.enrichmentType] ||
          `Enrichment ${entry.action}`;

        events.push({
          timestamp: entry.timestamp,
          category:
            entry.enrichmentType === "manualAnnotation"
              ? "annotation"
              : "enrichment",
          action: entry.action === "create" ? "compute" : entry.action,
          entityId,
          description: `${description} (${entry.source})`,
          details: {
            enrichmentType: entry.enrichmentType,
            source: entry.source
          },
          source: "inferred"
        });
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer enrichment events:", err);
  }

  return events;
}

/**
 * Infer events from conversation metadata.
 */
function inferConversationEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const metadataPath = join(DATA_DIR, "conversation-metadata.json");
    if (!existsSync(metadataPath)) return events;

    const content = readFileSync(metadataPath, "utf-8");
    const store = JSON.parse(content);

    for (const [id, meta] of Object.entries(store.metadata || {})) {
      const m = meta as {
        customName?: string;
        createdAt?: string;
        updatedAt?: string;
      };

      if (m.createdAt) {
        events.push({
          timestamp: m.createdAt,
          category: "conversation",
          action: "create",
          entityId: id,
          description: "Conversation tracked",
          source: "inferred"
        });
      }

      if (m.customName && m.updatedAt && m.updatedAt !== m.createdAt) {
        events.push({
          timestamp: m.updatedAt,
          category: "conversation",
          action: "rename",
          entityId: id,
          description: `Conversation renamed to "${m.customName}"`,
          details: { customName: m.customName },
          source: "inferred"
        });
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer conversation events:", err);
  }

  return events;
}

/**
 * Infer events from agent metadata and rename history.
 */
function inferAgentMetadataEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    // Read rename history
    const renamePath = join(DATA_DIR, "agent-renames.jsonl");
    if (existsSync(renamePath)) {
      const content = readFileSync(renamePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          events.push({
            timestamp: entry.timestamp,
            category: "agent",
            action: "rename",
            entityId: entry.pid?.toString() || entry.id || "unknown",
            description: `Agent renamed: "${entry.oldName}" → "${entry.newName}"`,
            details: {
              oldName: entry.oldName,
              newName: entry.newName,
              pid: entry.pid
            },
            source: "inferred"
          });
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Read current metadata for creation times
    const metadataPath = join(DATA_DIR, "agent-metadata.json");
    if (existsSync(metadataPath)) {
      const content = readFileSync(metadataPath, "utf-8");
      const store = JSON.parse(content);

      for (const [id, meta] of Object.entries(store.agents || {})) {
        const m = meta as {
          createdAt?: string;
          updatedAt?: string;
          customName?: string;
        };

        if (m.createdAt) {
          events.push({
            timestamp: m.createdAt,
            category: "agent",
            action: "create",
            entityId: id,
            description: `Agent metadata created${m.customName ? `: "${m.customName}"` : ""}`,
            source: "inferred"
          });
        }
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer agent metadata events:", err);
  }

  return events;
}

/**
 * Infer events from process event logs.
 */
function inferProcessEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const processDir = join(DATA_DIR, "processes");
    if (!existsSync(processDir)) return events;

    const files = readdirSync(processDir).filter((f) =>
      f.startsWith("events_")
    );

    for (const file of files.slice(-10)) {
      // Last 10 days
      const filePath = join(processDir, file);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          events.push({
            timestamp: new Date(entry.timestamp).toISOString(),
            category: "process",
            action: entry.event === "started" ? "start" : "end",
            entityId: entry.pid?.toString() || "unknown",
            description: `Process ${entry.event}: ${entry.label || entry.command?.slice(0, 40) || "unknown"}`,
            details: {
              label: entry.label,
              command: entry.command,
              cwd: entry.cwd,
              sandbox: entry.sandbox
            },
            source: "inferred"
          });
        } catch {
          // Skip malformed lines
        }
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer process events:", err);
  }

  return events;
}

/**
 * Infer events from contributor settings.
 */
function inferContributorEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    // Contributions history
    const contributionsPath = join(DATA_DIR, "contributions.json");
    if (existsSync(contributionsPath)) {
      const content = readFileSync(contributionsPath, "utf-8");
      const contributions = JSON.parse(content);

      for (const contrib of contributions.contributions || []) {
        events.push({
          timestamp:
            contrib.timestamp || contrib.createdAt || new Date().toISOString(),
          category: "contributor",
          action: "export",
          entityId: contrib.id || "contribution",
          description: `Data exported: ${contrib.sessionCount || 0} sessions to ${contrib.destination || "unknown"}`,
          details: {
            sessionCount: contrib.sessionCount,
            characterCount: contrib.characterCount,
            destination: contrib.destination,
            status: contrib.status
          },
          source: "inferred"
        });
      }
    }

    // Contributor settings file modification
    const settingsPath = join(DATA_DIR, "contributor.json");
    if (existsSync(settingsPath)) {
      const stats = statSync(settingsPath);
      events.push({
        timestamp: stats.mtime.toISOString(),
        category: "contributor",
        action: "update",
        entityId: "settings",
        description: "Contributor settings modified",
        source: "inferred"
      });
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer contributor events:", err);
  }

  return events;
}

/**
 * Infer events from config file modifications.
 */
function inferConfigEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const configPaths = [
      {
        path: join(homedir(), ".config", "agentwatch", "config.toml"),
        name: "Main config"
      },
      { path: join(DATA_DIR, "rules.jsonl"), name: "Hook rules" }
    ];

    for (const { path, name } of configPaths) {
      if (existsSync(path)) {
        const stats = statSync(path);
        events.push({
          timestamp: stats.mtime.toISOString(),
          category: "config",
          action: "update",
          entityId: basename(path),
          description: `${name} modified`,
          source: "inferred"
        });
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer config events:", err);
  }

  return events;
}

/**
 * Infer events from managed sessions (aw run).
 * Reads from ~/.agentwatch/sessions/ to reconstruct session history.
 */
function inferManagedSessionEvents(): AuditEntry[] {
  const events: AuditEntry[] = [];

  try {
    const sessionsDir = join(DATA_DIR, "sessions");
    if (!existsSync(sessionsDir)) return events;

    const files = readdirSync(sessionsDir).filter(
      (f) => f.endsWith(".json") && f !== "index.json"
    );

    for (const file of files) {
      try {
        const filePath = join(sessionsDir, file);
        const content = readFileSync(filePath, "utf-8");
        const session = JSON.parse(content);

        if (!session.id) continue;

        // Session start event
        events.push({
          timestamp: new Date(session.startedAt).toISOString(),
          category: "managed_session",
          action: "start",
          entityId: session.id,
          description: `Managed session started: ${session.agent} - "${session.prompt.slice(0, 50)}${session.prompt.length > 50 ? "..." : ""}"`,
          details: {
            agent: session.agent,
            prompt: session.prompt,
            cwd: session.cwd,
            pid: session.pid
          },
          source: "inferred"
        });

        // Session end event (if ended)
        if (session.endedAt) {
          const durationSec = Math.round(
            (session.endedAt - session.startedAt) / 1000
          );
          events.push({
            timestamp: new Date(session.endedAt).toISOString(),
            category: "managed_session",
            action: "end",
            entityId: session.id,
            description: `Managed session ${session.status}: ${session.agent} (${durationSec}s, exit ${session.exitCode ?? "?"})`,
            details: {
              agent: session.agent,
              status: session.status,
              exitCode: session.exitCode,
              durationMs: session.endedAt - session.startedAt,
              prompt: session.prompt
            },
            source: "inferred"
          });
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch (err) {
    console.error("[audit-log] Failed to infer managed session events:", err);
  }

  return events;
}

// =============================================================================
// COMBINED TIMELINE
// =============================================================================

/**
 * Get a complete timeline combining logged events and inferred events.
 */
export async function getCompleteTimeline(
  options: {
    limit?: number;
    offset?: number;
    category?: AuditCategory;
    since?: string;
    until?: string;
    includeInferred?: boolean;
  } = {}
): Promise<{
  events: AuditEntry[];
  stats: AuditStats;
  sources: { logged: number; inferred: number };
}> {
  // Get logged events
  const loggedEvents = readAuditLog({
    category: options.category,
    since: options.since,
    until: options.until
  });

  // Get inferred events if requested
  let inferredEvents: AuditEntry[] = [];
  if (options.includeInferred !== false) {
    inferredEvents = await inferHistoricalEvents();

    // Apply filters to inferred events
    if (options.category) {
      inferredEvents = inferredEvents.filter(
        (e) => e.category === options.category
      );
    }
    if (options.since) {
      inferredEvents = inferredEvents.filter(
        (e) => e.timestamp >= options.since!
      );
    }
    if (options.until) {
      inferredEvents = inferredEvents.filter(
        (e) => e.timestamp <= options.until!
      );
    }
  }

  // Merge and deduplicate
  const seenKeys = new Set<string>();
  const allEvents: AuditEntry[] = [];

  // Helper to create a dedup key
  const getKey = (e: AuditEntry) =>
    `${e.timestamp.slice(0, 19)}:${e.category}:${e.action}:${e.entityId}`;

  // Prefer logged events over inferred
  for (const event of loggedEvents) {
    const key = getKey(event);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allEvents.push(event);
    }
  }

  for (const event of inferredEvents) {
    const key = getKey(event);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      allEvents.push(event);
    }
  }

  // Sort by timestamp descending (newest first)
  allEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply pagination
  let result = allEvents;
  if (options.offset) {
    result = result.slice(options.offset);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }

  // Compute stats
  const stats: AuditStats = {
    totalEvents: allEvents.length,
    byCategory: {},
    byAction: {}
  };

  for (const event of allEvents) {
    stats.byCategory[event.category] =
      (stats.byCategory[event.category] || 0) + 1;
    stats.byAction[event.action] = (stats.byAction[event.action] || 0) + 1;
  }

  if (allEvents.length > 0) {
    stats.newestEvent = allEvents[0]!.timestamp;
    stats.oldestEvent = allEvents[allEvents.length - 1]!.timestamp;
  }

  return {
    events: result,
    stats,
    sources: {
      logged: loggedEvents.length,
      inferred: inferredEvents.length
    }
  };
}
