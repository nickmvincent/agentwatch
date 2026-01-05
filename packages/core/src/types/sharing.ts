/**
 * Sharing and export types for transcript contribution
 */

/** Supported sharing providers */
export type ShareProvider = "huggingface" | "gist" | "download";

/** Credentials for sharing operations */
export interface ShareCredentials {
  provider: ShareProvider;
  token?: string;
  username?: string;
  isOAuth?: boolean;
}

/** HuggingFace upload configuration */
export interface HuggingFaceConfig {
  repoId: string;
  repoType: "dataset";
  createPr: boolean;
  branch?: string;
  commitMessage?: string;
}

/** GitHub Gist configuration */
export interface GistConfig {
  description: string;
  isPublic: boolean;
  filename: string;
}

/** Request to share sessions */
export interface ShareRequest {
  provider: ShareProvider;
  sessionIds: string[];
  credentials?: ShareCredentials;
  huggingface?: HuggingFaceConfig;
  gist?: GistConfig;
  sanitizeOptions?: {
    redactSecrets: boolean;
    redactPii: boolean;
    redactPaths: boolean;
  };
}

/** Result of a sharing operation */
export interface ShareResult {
  success: boolean;
  provider: ShareProvider;
  url?: string;
  prUrl?: string;
  error?: string;
  shareId?: string;
}

/** Export bundle metadata */
export interface ExportBundleManifest {
  version: string;
  bundleId: string;
  exportedAt: string;
  sessionCount: number;
  toolUsageCount: number;
  sanitization: {
    totalRedactions: number;
    categories: Record<string, number>;
  };
}

/** Session data within an export bundle */
export interface ExportBundleSession {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  startTime: number;
  endTime?: number;
  toolCount: number;
  costEstimate?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
  };
}

/** Complete export bundle structure */
export interface ExportBundle {
  manifest: ExportBundleManifest;
  sessions: ExportBundleSession[];
  toolUsages: Array<Record<string, unknown>>;
}

/** OAuth state for HuggingFace */
export interface HuggingFaceOAuthState {
  accessToken: string;
  username: string;
  expiresAt?: number;
}

/** Result of creating a GitHub gist */
export interface GistResult {
  success: boolean;
  url?: string;
  gistId?: string;
  error?: string;
}

/** Result of uploading to HuggingFace */
export interface HuggingFaceUploadResult {
  success: boolean;
  repoUrl?: string;
  prUrl?: string;
  commitSha?: string;
  error?: string;
}

// =============================================================================
// AI Preference Signaling (evolving standard)
// =============================================================================

/**
 * Structured AI preference signal.
 *
 * This is an evolving space - the AI Preference Signal format is still being
 * developed by the community. See: https://www.w3.org/community/tdmrep/
 *
 * The goal is to provide machine-readable signals about how contributed data
 * may be used for AI/ML purposes.
 */
export interface AIPreferenceSignal {
  /**
   * Core preference for generative AI model training.
   * - "ok": Allow use for training AI models
   * - "no": Do not use for training AI models
   * - "conditional": Allow with specific conditions
   */
  trainGenAI: "ok" | "no" | "conditional";

  /**
   * Conditions that apply when trainGenAI is "conditional".
   * These are additive - all specified conditions must be met.
   */
  conditions?: AIPreferenceCondition[];

  /**
   * Specific purposes this data may be used for.
   * If not specified, all purposes are allowed (when trainGenAI is "ok" or "conditional").
   */
  allowedPurposes?: AIPurpose[];

  /**
   * Whether commercial use is permitted.
   * Defaults to true if not specified.
   */
  commercialUse?: boolean;

  /**
   * Whether to require attribution when data is used.
   * Defaults to depending on the license.
   */
  requireAttribution?: boolean;
}

/**
 * Conditions for conditional AI training permission.
 */
export type AIPreferenceCondition =
  | "public-models-only" // Only for models that will be publicly released
  | "open-weights-only" // Only for open-weight models
  | "attribution-required" // Must provide attribution
  | "research-only" // Only for non-commercial research
  | "evaluation-ok" // Can be used for evaluation even if training is restricted
  | "no-synthetic-data" // Don't use to generate synthetic training data
  | "no-direct-output"; // Don't reproduce directly in model outputs

/**
 * Purposes for which data may be used.
 */
export type AIPurpose =
  | "training" // Training AI models
  | "fine-tuning" // Fine-tuning existing models
  | "evaluation" // Evaluating model performance
  | "benchmarking" // Creating benchmarks
  | "display" // Public display/visualization
  | "research"; // Academic research

/**
 * Convert structured preference to canonical string format.
 * Format: "train-genai=<value>[;conditions=<comma-sep>][;purposes=<comma-sep>]"
 *
 * Examples:
 * - "train-genai=ok"
 * - "train-genai=no"
 * - "train-genai=conditional;conditions=public-models-only,attribution-required"
 * - "train-genai=ok;purposes=training,evaluation;commercial=no"
 */
export function aiPreferenceToString(pref: AIPreferenceSignal): string {
  const parts: string[] = [`train-genai=${pref.trainGenAI}`];

  if (pref.conditions && pref.conditions.length > 0) {
    parts.push(`conditions=${pref.conditions.join(",")}`);
  }

  if (pref.allowedPurposes && pref.allowedPurposes.length > 0) {
    parts.push(`purposes=${pref.allowedPurposes.join(",")}`);
  }

  if (pref.commercialUse === false) {
    parts.push("commercial=no");
  }

  if (pref.requireAttribution === true) {
    parts.push("attribution=required");
  }

  return parts.join(";");
}

/**
 * Parse canonical string format to structured preference.
 */
export function parseAIPreference(str: string): AIPreferenceSignal {
  const parts = str.split(";");
  const result: AIPreferenceSignal = { trainGenAI: "ok" };

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (!value) continue;

    switch (key) {
      case "train-genai":
        result.trainGenAI = value as "ok" | "no" | "conditional";
        break;
      case "conditions":
        result.conditions = value.split(",") as AIPreferenceCondition[];
        break;
      case "purposes":
        result.allowedPurposes = value.split(",") as AIPurpose[];
        break;
      case "commercial":
        result.commercialUse = value !== "no";
        break;
      case "attribution":
        result.requireAttribution = value === "required";
        break;
    }
  }

  // Legacy format support
  if (str === "train-genai=deny") {
    result.trainGenAI = "no";
  }

  return result;
}

/**
 * Default preference presets for common use cases.
 */
export const AI_PREFERENCE_PRESETS: Record<
  string,
  { label: string; description: string; preference: AIPreferenceSignal }
> = {
  permissive: {
    label: "Permissive",
    description: "Allow all AI uses including commercial training",
    preference: { trainGenAI: "ok" }
  },
  openOnly: {
    label: "Open Models Only",
    description: "Only for open-weight, publicly released models",
    preference: {
      trainGenAI: "conditional",
      conditions: ["public-models-only", "open-weights-only"]
    }
  },
  researchOnly: {
    label: "Research Only",
    description: "Only for non-commercial academic research",
    preference: {
      trainGenAI: "conditional",
      conditions: ["research-only"],
      commercialUse: false
    }
  },
  evaluationOnly: {
    label: "Evaluation Only",
    description: "Only for evaluation/benchmarking, no training",
    preference: {
      trainGenAI: "no",
      allowedPurposes: ["evaluation", "benchmarking"]
    }
  },
  noAI: {
    label: "No AI Training",
    description: "Do not use for any AI training purposes",
    preference: { trainGenAI: "no" }
  }
};
