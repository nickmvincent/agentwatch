/**
 * Annotator module for agentwatch.
 *
 * Provides persistent storage for user-created metadata and annotations:
 * - Agent metadata (custom names, notes, tags)
 * - Conversation metadata (custom names)
 * - Session annotations (feedback, heuristic scores)
 *
 * All data is stored in ~/.agentwatch/ as JSON files.
 */

// Agent metadata
export {
  getAgentMetadataStorePath,
  loadAgentMetadata,
  saveAgentMetadata,
  getAllAgentMetadata,
  getAgentMetadataById,
  getAgentMetadata,
  setAgentMetadata,
  setAgentMetadataById,
  deleteAgentMetadata,
  searchAgentMetadata,
  getAgentRenameHistory
} from "./agent-metadata";

// Conversation metadata
export {
  getConversationMetadataStorePath,
  loadConversationMetadataStore,
  saveConversationMetadataStore,
  getAllConversationMetadata,
  getConversationMetadata,
  setConversationMetadata,
  deleteConversationMetadata
} from "./conversation-metadata";

// Session annotations
export {
  loadAnnotations,
  saveAnnotations,
  getAnnotation,
  setAnnotation,
  deleteAnnotation,
  getAllAnnotations,
  computeHeuristicScore,
  getAnnotationStats,
  type SessionAnnotation,
  type HeuristicScore,
  type SessionAnnotationData,
  type AnnotationsStore,
  type AnnotationStats
} from "./annotations";
