/**
 * Research-oriented redaction profiles.
 *
 * This is the SINGLE SOURCE OF TRUTH for profile definitions.
 * Edit this file to add/modify/remove profiles.
 *
 * Design principles:
 * - Profiles are framed around RESEARCH QUESTIONS they enable
 * - Each profile clearly communicates what data is shared vs. stripped
 * - Profiles are ordered from most restrictive to most permissive
 */

import type { RedactionConfig } from "./contributor-settings";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A research question that a profile helps answer.
 */
export interface ResearchQuestion {
  /** Short question text */
  question: string;
  /** Why this matters to researchers */
  context?: string;
}

/**
 * Research-oriented profile definition.
 */
export interface ResearchProfile {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short tagline for the profile */
  tagline: string;
  /** Detailed description */
  description: string;
  /** Research questions this profile helps answer */
  enablesResearch: ResearchQuestion[];
  /** Human-readable summary of what's shared */
  sharedSummary: string[];
  /** Human-readable summary of what's stripped */
  strippedSummary: string[];
  /** Field paths to KEEP (whitelist) - "*" means all */
  keptFields: string[];
  /** Redaction config */
  redactionConfig: RedactionConfig;
  /** Whether this requires manual review before sharing */
  requiresReview?: boolean;
  /** UI hints */
  ui?: {
    /** Badge/label to show (e.g., "Recommended", "Careful") */
    badge?: string;
    /** Badge color variant */
    badgeVariant?: "default" | "success" | "warning" | "danger";
    /** Icon name (for future use) */
    icon?: string;
  };
}

/**
 * Artifact link types for connecting transcripts to outcomes.
 */
export type ArtifactType =
  | "github_repo"
  | "github_pr"
  | "github_commit"
  | "github_issue"
  | "file"
  | "url"
  | "other";

/**
 * A link to an artifact produced during a session.
 */
export interface ArtifactLink {
  /** Type of artifact */
  type: ArtifactType;
  /** URL or path to the artifact */
  url: string;
  /** Human-readable label */
  label?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** When the link was added */
  addedAt: string;
}

// =============================================================================
// DEFAULT REDACTION CONFIG
// =============================================================================

const DEFAULT_REDACTION: RedactionConfig = {
  redactSecrets: true,
  redactPii: true,
  redactPaths: true,
  enableHighEntropy: true
};

// =============================================================================
// FIELD DEFINITIONS (for reference)
// =============================================================================

/**
 * Field groups for easier profile composition.
 * Add new fields here as the schema evolves.
 */
export const FIELD_GROUPS = {
  /** Minimal session metadata */
  sessionBasic: [
    "session",
    "session.session_id",
    "session.start_time",
    "session.end_time"
  ],

  /** Session statistics */
  sessionStats: [
    "session.tool_count",
    "session.tools_used",
    "session.total_input_tokens",
    "session.total_output_tokens",
    "session.estimated_cost_usd"
  ],

  /** Tool usage metadata (no content) */
  toolMetadata: [
    "tool_usages",
    "tool_usages[].tool_use_id",
    "tool_usages[].tool_name",
    "tool_usages[].timestamp",
    "tool_usages[].session_id",
    "tool_usages[].success",
    "tool_usages[].duration_ms"
  ],

  /** Tool usage content (sensitive) */
  toolContent: [
    "tool_usages[].tool_input",
    "tool_usages[].tool_response",
    "tool_usages[].cwd"
  ],

  /** Message metadata (no content) */
  messageMetadata: [
    "messages",
    "messages[].uuid",
    "messages[].role",
    "messages[].timestamp",
    "messages[].parentUuid",
    "messages[].message.role",
    "messages[].message.model",
    "messages[].message.stop_reason"
  ],

  /** Message token usage */
  messageTokens: ["messages[].message.usage"],

  /** Message content (sensitive) */
  messageContent: ["messages[].message.content", "messages[].content"],

  /** Root-level metadata */
  rootMeta: ["type", "total_input_tokens", "total_output_tokens"],

  /** Session context (somewhat sensitive) */
  sessionContext: ["session.permission_mode", "session.source"]
} as const;

/**
 * Helper to combine field groups.
 */
export function combineFields(
  ...groups: (keyof typeof FIELD_GROUPS)[]
): string[] {
  const fields: string[] = [];
  for (const group of groups) {
    fields.push(...FIELD_GROUPS[group]);
  }
  return fields;
}

// =============================================================================
// RESEARCH PROFILES
// =============================================================================

/**
 * Built-in research-oriented profiles.
 *
 * ORDER MATTERS: Listed from most restrictive to most permissive.
 * The first profile with `ui.badge === "Recommended"` is the default.
 */
export const RESEARCH_PROFILES: ResearchProfile[] = [
  // -------------------------------------------------------------------------
  // Tool Usage Patterns (Most restrictive with useful data)
  // -------------------------------------------------------------------------
  {
    id: "tool-usage",
    name: "Tool Usage Patterns",
    tagline: "Which tools, how often, success rates",
    description:
      "Share tool usage patterns without any code or conversation content. " +
      "Ideal for research on agent tool selection and failure modes.",
    enablesResearch: [
      {
        question: "Which tools do coding agents use most frequently?",
        context: "Understanding tool popularity helps improve agent design"
      },
      {
        question: "What's the success/failure rate for different tools?",
        context: "Identifying failure modes improves reliability"
      },
      {
        question: "How long do different operations take?",
        context: "Duration benchmarks help set user expectations"
      }
    ],
    sharedSummary: [
      "Tool names and types",
      "Success/failure status",
      "Operation durations",
      "Session timestamps"
    ],
    strippedSummary: [
      "All code and file contents",
      "Prompts and responses",
      "File paths",
      "Personal information"
    ],
    keptFields: combineFields("sessionBasic", "sessionStats", "toolMetadata"),
    redactionConfig: DEFAULT_REDACTION,
    ui: {
      badge: "Recommended",
      badgeVariant: "success"
    }
  },

  // -------------------------------------------------------------------------
  // Workflow & Efficiency
  // -------------------------------------------------------------------------
  {
    id: "workflow",
    name: "Workflow & Efficiency",
    tagline: "Task structure, conversation flow, turn patterns",
    description:
      "Share conversation structure and flow patterns. " +
      "Helps researchers understand how agents decompose tasks and interact with users.",
    enablesResearch: [
      {
        question: "How do agents structure multi-step tasks?",
        context: "Task decomposition patterns inform better agent architectures"
      },
      {
        question: "What's the typical back-and-forth pattern?",
        context: "Understanding conversation flow improves UX design"
      },
      {
        question: "How do agents handle errors and retries?",
        context: "Recovery patterns help build more robust agents"
      }
    ],
    sharedSummary: [
      "Everything in Tool Usage, plus:",
      "Message ordering and turn counts",
      "Model information",
      "Conversation structure"
    ],
    strippedSummary: [
      "All code and file contents",
      "Actual prompts and responses",
      "File paths",
      "Personal information"
    ],
    keptFields: combineFields(
      "sessionBasic",
      "sessionStats",
      "sessionContext",
      "toolMetadata",
      "messageMetadata",
      "rootMeta"
    ),
    redactionConfig: DEFAULT_REDACTION
  },

  // -------------------------------------------------------------------------
  // Token Economics
  // -------------------------------------------------------------------------
  {
    id: "token-economics",
    name: "Token Economics",
    tagline: "Costs, token ratios, model comparisons",
    description:
      "Share detailed token usage and cost data. " +
      "Enables research on AI cost optimization and resource efficiency.",
    enablesResearch: [
      {
        question: "What do different types of operations cost?",
        context: "Cost modeling helps teams budget for AI tools"
      },
      {
        question: "What's the input/output token ratio by task type?",
        context: "Understanding token patterns enables optimization"
      },
      {
        question: "How do different models compare on efficiency?",
        context: "Model comparisons inform tool selection"
      }
    ],
    sharedSummary: [
      "Everything in Workflow, plus:",
      "Detailed token counts per message",
      "Cost estimates",
      "Model identifiers"
    ],
    strippedSummary: [
      "All code and file contents",
      "Actual prompts and responses",
      "File paths",
      "Personal information"
    ],
    keptFields: combineFields(
      "sessionBasic",
      "sessionStats",
      "sessionContext",
      "toolMetadata",
      "messageMetadata",
      "messageTokens",
      "rootMeta"
    ),
    redactionConfig: DEFAULT_REDACTION
  },

  // -------------------------------------------------------------------------
  // Full Transcript (Most permissive)
  // -------------------------------------------------------------------------
  {
    id: "full-transcript",
    name: "Full Transcript",
    tagline: "Complete conversation for reasoning analysis",
    description:
      "Share the complete transcript including code and prompts. " +
      "Enables deep research on agent reasoning and prompt engineering. " +
      "Requires careful manual review before sharing.",
    enablesResearch: [
      {
        question: "How do agents reason through complex problems?",
        context: "Understanding reasoning enables better model training"
      },
      {
        question: "What prompting patterns lead to better outcomes?",
        context: "Prompt engineering research improves agent effectiveness"
      },
      {
        question: "How do agents use context from files?",
        context: "Context usage patterns inform retrieval strategies"
      }
    ],
    sharedSummary: [
      "Complete conversation content",
      "All tool inputs and outputs",
      "Code snippets and file contents",
      "Full prompts and responses"
    ],
    strippedSummary: [
      "Detected secrets (API keys, tokens)",
      "PII (emails, phone numbers)",
      "File paths are anonymized"
    ],
    keptFields: ["*"],
    redactionConfig: DEFAULT_REDACTION,
    requiresReview: true,
    ui: {
      badge: "Requires Review",
      badgeVariant: "warning"
    }
  }
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the default profile (first one with "Recommended" badge, or first profile).
 */
export function getDefaultProfileId(): string {
  const recommended = RESEARCH_PROFILES.find(
    (p) => p.ui?.badge === "Recommended"
  );
  return recommended?.id ?? RESEARCH_PROFILES[0]?.id ?? "tool-usage";
}

/**
 * Get a profile by ID.
 */
export function getProfileById(id: string): ResearchProfile | undefined {
  return RESEARCH_PROFILES.find((p) => p.id === id);
}

/**
 * Check if a profile ID is a built-in research profile.
 */
export function isResearchProfile(id: string): boolean {
  return RESEARCH_PROFILES.some((p) => p.id === id);
}

/**
 * Convert a ResearchProfile to the legacy RedactionProfile format.
 */
export function toRedactionProfile(profile: ResearchProfile) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    keptFields: profile.keptFields,
    redactionConfig: profile.redactionConfig,
    isDefault: profile.ui?.badge === "Recommended",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

/**
 * Get all profiles in legacy format for backwards compatibility.
 */
export function getLegacyProfiles() {
  return RESEARCH_PROFILES.map(toRedactionProfile);
}
