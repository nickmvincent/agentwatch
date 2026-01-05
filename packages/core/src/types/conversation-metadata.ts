/**
 * Conversation metadata types for persistent naming.
 *
 * Conversations are identified by their correlation_id which is stable
 * across daemon restarts.
 */

/**
 * User-defined metadata for a conversation.
 */
export interface ConversationMetadata {
  /** Correlation ID for the conversation */
  conversationId: string;
  /** User-provided custom name for the conversation */
  customName?: string;
  /** When the metadata was created */
  createdAt: string;
  /** When the metadata was last updated */
  updatedAt: string;
}

/**
 * Input for creating/updating conversation metadata.
 */
export interface ConversationMetadataInput {
  /** Custom name (optional, null to clear) */
  customName?: string | null;
}

/**
 * Conversation metadata store persisted to disk.
 */
export interface ConversationMetadataStore {
  /** Map of conversation ID to metadata */
  metadata: Record<string, ConversationMetadata>;
  /** When the store was last updated */
  updatedAt: string;
  /** Schema version for migrations */
  version: number;
}
