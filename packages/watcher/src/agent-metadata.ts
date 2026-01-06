/**
 * Agent metadata store for persistent naming and annotations.
 *
 * Stores user-defined names, notes, and tags for agents, persisted
 * across watcher restarts.
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

const METADATA_PATH = "~/.agentwatch/agent-metadata.json";

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

export function getAgentMetadataStorePath(): string {
  return expandPath(METADATA_PATH);
}

export function loadAgentMetadata(): AgentMetadataStore {
  const path = getAgentMetadataStorePath();
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

export function saveAgentMetadata(store: AgentMetadataStore): void {
  const path = getAgentMetadataStorePath();
  ensureDir(path);
  store.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function getAllAgentMetadata(): Record<string, AgentMetadata> {
  const store = loadAgentMetadata();
  return store.metadata;
}

export function getAgentMetadataById(agentId: string): AgentMetadata | null {
  const store = loadAgentMetadata();
  return store.metadata[agentId] || null;
}

export function getAgentMetadata(
  label: string,
  exe: string
): AgentMetadata | null {
  const agentId = generateAgentId(label, exe);
  return getAgentMetadataById(agentId);
}

export function setAgentMetadata(
  label: string,
  exe: string,
  input: AgentMetadataInput
): AgentMetadata {
  const store = loadAgentMetadata();
  const agentId = generateAgentId(label, exe);
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

export function deleteAgentMetadata(agentId: string): boolean {
  const store = loadAgentMetadata();
  if (store.metadata[agentId]) {
    delete store.metadata[agentId];
    saveAgentMetadata(store);
    return true;
  }
  return false;
}

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

export function getAgentRenameHistory(_agentId?: string): AgentRenameEvent[] {
  return [];
}
