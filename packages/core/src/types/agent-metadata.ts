/**
 * Agent metadata types for persistent naming and annotations.
 *
 * Agents are identified by a stable ID computed from their properties
 * (label, exe path) so they can be recognized across restarts.
 */

/**
 * User-defined metadata for an agent.
 */
export interface AgentMetadata {
  /** Stable agent identifier (hash of label + exe) */
  agentId: string;
  /** User-provided custom name for the agent */
  customName?: string;
  /** Alternative names/aliases for searching */
  aliases?: string[];
  /** User notes about this agent */
  notes?: string;
  /** User-defined tags for categorization */
  tags?: string[];
  /** Color for UI display (hex or named color) */
  color?: string;
  /** When the metadata was created */
  createdAt: string;
  /** When the metadata was last updated */
  updatedAt: string;
}

/**
 * Input for creating/updating agent metadata.
 */
export interface AgentMetadataInput {
  /** Custom name (optional, null to clear) */
  customName?: string | null;
  /** Aliases (optional, null to clear) */
  aliases?: string[] | null;
  /** Notes (optional, null to clear) */
  notes?: string | null;
  /** Tags (optional, null to clear) */
  tags?: string[] | null;
  /** Color (optional, null to clear) */
  color?: string | null;
}

/**
 * Agent metadata store persisted to disk.
 */
export interface AgentMetadataStore {
  /** Map of agent ID to metadata */
  metadata: Record<string, AgentMetadata>;
  /** When the store was last updated */
  updatedAt: string;
  /** Schema version for migrations */
  version: number;
}

/**
 * Generates a stable agent ID from agent properties.
 *
 * The ID is based on label and exe path, making it consistent
 * across daemon restarts as long as the agent executable is the same.
 */
export function generateAgentId(label: string, exe: string): string {
  // Simple stable hash: base64 of label + exe
  // This allows the same agent instance to be recognized across restarts
  const input = `${label.toLowerCase()}:${exe}`;
  // Use a simple hash function that works in both browser and Node
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to base36 for a compact string
  const base = Math.abs(hash).toString(36);
  return `${label.toLowerCase()}-${base}`;
}

/**
 * Event for tracking agent rename history (for audit trail).
 */
export interface AgentRenameEvent {
  /** When the rename occurred */
  timestamp: string;
  /** Agent ID that was renamed */
  agentId: string;
  /** Previous name (null if first name) */
  previousName: string | null;
  /** New name */
  newName: string;
  /** Reason for the rename (optional) */
  reason?: string;
}
