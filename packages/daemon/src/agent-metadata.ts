/**
 * Agent metadata store for persistent naming and annotations.
 *
 * Stores user-defined names, notes, and tags for agents, persisted
 * across daemon restarts. Similar pattern to annotations.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type {
  AgentMetadata,
  AgentMetadataInput,
  AgentMetadataStore,
  AgentRenameEvent
} from "@agentwatch/core";
import { generateAgentId } from "@agentwatch/core";
import { logAuditEvent } from "./audit-log";

const METADATA_PATH = "~/.agentwatch/agent-metadata.json";
// Legacy file - no longer written to, but kept for reading old rename history
const LEGACY_RENAME_HISTORY_PATH = "~/.agentwatch/agent-renames.jsonl";

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load agent metadata from disk.
 */
export function loadAgentMetadata(): AgentMetadataStore {
  const path = expandPath(METADATA_PATH);
  if (!existsSync(path)) {
    return {
      metadata: {},
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return {
      metadata: data.metadata || {},
      updatedAt: data.updatedAt || new Date().toISOString(),
      version: data.version || 1
    };
  } catch {
    return {
      metadata: {},
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }
}

/**
 * Save agent metadata to disk.
 */
export function saveAgentMetadata(store: AgentMetadataStore): void {
  const path = expandPath(METADATA_PATH);
  ensureDir(path);
  store.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2));
}

/**
 * Get metadata for a specific agent by ID.
 */
export function getAgentMetadataById(agentId: string): AgentMetadata | null {
  const store = loadAgentMetadata();
  return store.metadata[agentId] || null;
}

/**
 * Get metadata for an agent by label and exe (computes ID).
 */
export function getAgentMetadata(
  label: string,
  exe: string
): AgentMetadata | null {
  const agentId = generateAgentId(label, exe);
  return getAgentMetadataById(agentId);
}

/**
 * Set or update metadata for an agent.
 */
export function setAgentMetadata(
  label: string,
  exe: string,
  input: AgentMetadataInput
): AgentMetadata {
  const store = loadAgentMetadata();
  const agentId = generateAgentId(label, exe);
  const now = new Date().toISOString();

  // Get existing or create new
  const existing = store.metadata[agentId];
  const isNew = !existing;
  const previousName = existing?.customName || null;

  // Build updated metadata
  const metadata: AgentMetadata = {
    agentId,
    customName:
      input.customName === null
        ? undefined
        : (input.customName ?? existing?.customName),
    aliases:
      input.aliases === null ? undefined : (input.aliases ?? existing?.aliases),
    notes: input.notes === null ? undefined : (input.notes ?? existing?.notes),
    tags: input.tags === null ? undefined : (input.tags ?? existing?.tags),
    color: input.color === null ? undefined : (input.color ?? existing?.color),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  store.metadata[agentId] = metadata;
  saveAgentMetadata(store);

  // Audit logging
  if (isNew) {
    logAuditEvent(
      "agent",
      "create",
      agentId,
      `Agent metadata created: ${label}${metadata.customName ? ` ("${metadata.customName}")` : ""}`,
      { label, exe, customName: metadata.customName },
      "api"
    );
  } else if (
    input.customName !== undefined &&
    input.customName !== previousName
  ) {
    logAuditEvent(
      "agent",
      "rename",
      agentId,
      `Agent renamed: "${previousName || "(none)"}" → "${input.customName || "(cleared)"}"`,
      { label, previousName, newName: input.customName },
      "api"
    );
  } else {
    logAuditEvent(
      "agent",
      "update",
      agentId,
      `Agent metadata updated: ${label}`,
      {
        label,
        changes: Object.keys(input).filter(
          (k) => input[k as keyof AgentMetadataInput] !== undefined
        )
      },
      "api"
    );
  }

  return metadata;
}

/**
 * Set metadata by agent ID directly.
 */
export function setAgentMetadataById(
  agentId: string,
  input: AgentMetadataInput
): AgentMetadata {
  const store = loadAgentMetadata();
  const now = new Date().toISOString();

  const existing = store.metadata[agentId];
  const isNew = !existing;
  const previousName = existing?.customName || null;

  const metadata: AgentMetadata = {
    agentId,
    customName:
      input.customName === null
        ? undefined
        : (input.customName ?? existing?.customName),
    aliases:
      input.aliases === null ? undefined : (input.aliases ?? existing?.aliases),
    notes: input.notes === null ? undefined : (input.notes ?? existing?.notes),
    tags: input.tags === null ? undefined : (input.tags ?? existing?.tags),
    color: input.color === null ? undefined : (input.color ?? existing?.color),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  store.metadata[agentId] = metadata;
  saveAgentMetadata(store);

  // Audit logging
  if (isNew) {
    logAuditEvent(
      "agent",
      "create",
      agentId,
      `Agent metadata created${metadata.customName ? `: "${metadata.customName}"` : ""}`,
      { customName: metadata.customName },
      "api"
    );
  } else if (
    input.customName !== undefined &&
    input.customName !== previousName
  ) {
    logAuditEvent(
      "agent",
      "rename",
      agentId,
      `Agent renamed: "${previousName || "(none)"}" → "${input.customName || "(cleared)"}"`,
      { previousName, newName: input.customName },
      "api"
    );
  } else {
    logAuditEvent(
      "agent",
      "update",
      agentId,
      "Agent metadata updated",
      {
        changes: Object.keys(input).filter(
          (k) => input[k as keyof AgentMetadataInput] !== undefined
        )
      },
      "api"
    );
  }

  return metadata;
}

/**
 * Delete metadata for an agent.
 */
export function deleteAgentMetadata(agentId: string): boolean {
  const store = loadAgentMetadata();
  const existing = store.metadata[agentId];
  if (existing) {
    delete store.metadata[agentId];
    saveAgentMetadata(store);

    logAuditEvent(
      "agent",
      "delete",
      agentId,
      `Agent metadata deleted${existing.customName ? `: "${existing.customName}"` : ""}`,
      { previousName: existing.customName },
      "api"
    );

    return true;
  }
  return false;
}

/**
 * Get all agent metadata.
 */
export function getAllAgentMetadata(): Record<string, AgentMetadata> {
  const store = loadAgentMetadata();
  return store.metadata;
}

/**
 * Search agent metadata by name or alias.
 */
export function searchAgentMetadata(query: string): AgentMetadata[] {
  const store = loadAgentMetadata();
  const lowerQuery = query.toLowerCase();

  return Object.values(store.metadata).filter((m) => {
    if (m.customName?.toLowerCase().includes(lowerQuery)) return true;
    if (m.aliases?.some((a) => a.toLowerCase().includes(lowerQuery)))
      return true;
    if (m.tags?.some((t) => t.toLowerCase().includes(lowerQuery))) return true;
    return false;
  });
}

/**
 * Get rename history for an agent.
 * Note: This reads from a legacy file that is no longer written to.
 * New rename events are logged to the main events.jsonl via logAuditEvent.
 */
export function getAgentRenameHistory(agentId?: string): AgentRenameEvent[] {
  const path = expandPath(LEGACY_RENAME_HISTORY_PATH);
  if (!existsSync(path)) {
    return [];
  }

  try {
    const content = readFileSync(path, "utf-8");
    const events: AgentRenameEvent[] = [];

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as AgentRenameEvent;
        if (!agentId || event.agentId === agentId) {
          events.push(event);
        }
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  } catch {
    return [];
  }
}
