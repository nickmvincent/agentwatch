/**
 * Conversation metadata store for persistent naming.
 *
 * Stores user-defined names for conversations, persisted across
 * daemon restarts and shared across browser tabs via the API.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type {
  ConversationMetadata,
  ConversationMetadataInput,
  ConversationMetadataStore
} from "@agentwatch/core";
import { logAuditEvent } from "./audit-log";

const METADATA_PATH = "~/.agentwatch/conversation-metadata.json";

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
 * Load conversation metadata from disk.
 */
export function loadConversationMetadata(): ConversationMetadataStore {
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
 * Save conversation metadata to disk.
 */
export function saveConversationMetadata(
  store: ConversationMetadataStore
): void {
  const path = expandPath(METADATA_PATH);
  ensureDir(path);
  store.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2));
}

/**
 * Get metadata for a specific conversation by ID.
 */
export function getConversationMetadata(
  conversationId: string
): ConversationMetadata | null {
  const store = loadConversationMetadata();
  return store.metadata[conversationId] || null;
}

/**
 * Set or update metadata for a conversation.
 */
export function setConversationMetadata(
  conversationId: string,
  input: ConversationMetadataInput
): ConversationMetadata {
  const store = loadConversationMetadata();
  const now = new Date().toISOString();

  const existing = store.metadata[conversationId];
  const isNew = !existing;
  const previousName = existing?.customName;

  const metadata: ConversationMetadata = {
    conversationId,
    customName:
      input.customName === null
        ? undefined
        : (input.customName ?? existing?.customName),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  store.metadata[conversationId] = metadata;
  saveConversationMetadata(store);

  // Audit logging
  if (isNew) {
    logAuditEvent(
      "conversation",
      "create",
      conversationId,
      `Conversation metadata created${metadata.customName ? `: "${metadata.customName}"` : ""}`,
      { customName: metadata.customName },
      "api"
    );
  } else if (
    input.customName !== undefined &&
    input.customName !== previousName
  ) {
    logAuditEvent(
      "conversation",
      "rename",
      conversationId,
      `Conversation renamed: "${previousName || "(none)"}" → "${input.customName || "(cleared)"}"`,
      { previousName, newName: input.customName },
      "api"
    );
  } else {
    logAuditEvent(
      "conversation",
      "update",
      conversationId,
      "Conversation metadata updated",
      { customName: metadata.customName },
      "api"
    );
  }

  return metadata;
}

/**
 * Delete metadata for a conversation.
 */
export function deleteConversationMetadata(conversationId: string): boolean {
  const store = loadConversationMetadata();
  const existing = store.metadata[conversationId];
  if (existing) {
    delete store.metadata[conversationId];
    saveConversationMetadata(store);

    logAuditEvent(
      "conversation",
      "delete",
      conversationId,
      `Conversation metadata deleted${existing.customName ? `: "${existing.customName}"` : ""}`,
      { previousName: existing.customName },
      "api"
    );

    return true;
  }
  return false;
}

/**
 * Get all conversation metadata.
 */
export function getAllConversationMetadata(): Record<
  string,
  ConversationMetadata
> {
  const store = loadConversationMetadata();
  return store.metadata;
}
