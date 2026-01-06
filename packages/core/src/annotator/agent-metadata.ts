/**
 * Agent metadata store for persistent naming and annotations.
 *
 * Stores user-defined names, notes, and tags for agents, persisted
 * across watcher restarts.
 *
 * Storage: ~/.agentwatch/agent-metadata.json
 */

import type {
  AgentMetadata,
  AgentMetadataInput,
  AgentMetadataStore,
  AgentRenameEvent
} from "../types";
import { generateAgentId } from "../types";
import { AGENT_METADATA_FILE } from "../storage/paths";
import { expandPath, loadJson, saveJson } from "../storage";

/**
 * Get the path to the agent metadata store file.
 */
export function getAgentMetadataStorePath(): string {
  return expandPath(AGENT_METADATA_FILE);
}

/**
 * Load agent metadata store from disk.
 */
export function loadAgentMetadata(): AgentMetadataStore {
  const defaultStore: AgentMetadataStore = {
    metadata: {},
    updatedAt: new Date().toISOString(),
    version: 1
  };

  const data = loadJson<Partial<AgentMetadataStore>>(
    AGENT_METADATA_FILE,
    defaultStore
  );

  return {
    metadata: data.metadata || {},
    updatedAt: data.updatedAt || new Date().toISOString(),
    version: data.version || 1
  };
}

/**
 * Save agent metadata store to disk.
 */
export function saveAgentMetadata(store: AgentMetadataStore): void {
  store.updatedAt = new Date().toISOString();
  saveJson(AGENT_METADATA_FILE, store);
}

/**
 * Get all agent metadata entries.
 */
export function getAllAgentMetadata(): Record<string, AgentMetadata> {
  const store = loadAgentMetadata();
  return store.metadata;
}

/**
 * Get agent metadata by agent ID.
 */
export function getAgentMetadataById(agentId: string): AgentMetadata | null {
  const store = loadAgentMetadata();
  return store.metadata[agentId] || null;
}

/**
 * Get agent metadata by label and exe path.
 */
export function getAgentMetadata(
  label: string,
  exe: string
): AgentMetadata | null {
  const agentId = generateAgentId(label, exe);
  return getAgentMetadataById(agentId);
}

/**
 * Set agent metadata by label and exe path.
 */
export function setAgentMetadata(
  label: string,
  exe: string,
  input: AgentMetadataInput
): AgentMetadata {
  const agentId = generateAgentId(label, exe);
  return setAgentMetadataById(agentId, input);
}

/**
 * Set agent metadata by agent ID.
 */
export function setAgentMetadataById(
  agentId: string,
  input: AgentMetadataInput
): AgentMetadata {
  const store = loadAgentMetadata();
  const now = new Date().toISOString();
  const existing = store.metadata[agentId];

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

  return metadata;
}

/**
 * Delete agent metadata by agent ID.
 */
export function deleteAgentMetadata(agentId: string): boolean {
  const store = loadAgentMetadata();
  if (store.metadata[agentId]) {
    delete store.metadata[agentId];
    saveAgentMetadata(store);
    return true;
  }
  return false;
}

/**
 * Search agent metadata by query string.
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
 * Get agent rename history (placeholder for future implementation).
 */
export function getAgentRenameHistory(_agentId?: string): AgentRenameEvent[] {
  return [];
}
