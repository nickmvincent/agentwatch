/**
 * Conversation metadata store for persistent naming.
 *
 * Stores user-defined conversation names on disk so they survive restarts.
 *
 * Storage: ~/.agentwatch/conversation-metadata.json
 */

import type {
  ConversationMetadata,
  ConversationMetadataInput,
  ConversationMetadataStore
} from "../types";
import { CONVERSATION_METADATA_FILE } from "../storage/paths";
import { expandPath, loadJson, saveJson } from "../storage";

/**
 * Get the path to the conversation metadata store file.
 */
export function getConversationMetadataStorePath(): string {
  return expandPath(CONVERSATION_METADATA_FILE);
}

/**
 * Load conversation metadata store from disk.
 */
export function loadConversationMetadataStore(): ConversationMetadataStore {
  const defaultStore: ConversationMetadataStore = {
    metadata: {},
    updatedAt: new Date().toISOString(),
    version: 1
  };

  const data = loadJson<Partial<ConversationMetadataStore>>(
    CONVERSATION_METADATA_FILE,
    defaultStore
  );

  return {
    metadata: data.metadata ?? {},
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    version: data.version ?? 1
  };
}

/**
 * Save conversation metadata store to disk.
 */
export function saveConversationMetadataStore(
  store: ConversationMetadataStore
): void {
  store.updatedAt = new Date().toISOString();
  saveJson(CONVERSATION_METADATA_FILE, store);
}

/**
 * Get all conversation metadata entries.
 */
export function getAllConversationMetadata(): Record<
  string,
  ConversationMetadata
> {
  const store = loadConversationMetadataStore();
  return store.metadata;
}

/**
 * Get conversation metadata by ID.
 */
export function getConversationMetadata(
  conversationId: string
): ConversationMetadata | null {
  const store = loadConversationMetadataStore();
  return store.metadata[conversationId] ?? null;
}

/**
 * Set conversation metadata.
 */
export function setConversationMetadata(
  conversationId: string,
  input: ConversationMetadataInput
): ConversationMetadata {
  const store = loadConversationMetadataStore();
  const now = new Date().toISOString();
  const existing = store.metadata[conversationId];

  const metadata: ConversationMetadata = {
    conversationId,
    customName:
      input.customName === null ? undefined : input.customName?.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  store.metadata[conversationId] = metadata;
  saveConversationMetadataStore(store);
  return metadata;
}

/**
 * Delete conversation metadata by ID.
 */
export function deleteConversationMetadata(conversationId: string): boolean {
  const store = loadConversationMetadataStore();
  if (!store.metadata[conversationId]) {
    return false;
  }

  delete store.metadata[conversationId];
  saveConversationMetadataStore(store);
  return true;
}
