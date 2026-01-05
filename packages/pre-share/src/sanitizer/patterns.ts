/**
 * Redaction patterns for detecting and redacting sensitive information.
 *
 * Patterns are organized by category:
 * - secrets: API keys, tokens, private keys
 * - credentials: Passwords, connection strings
 * - pii: Emails, phone numbers, SSN
 * - network: IP addresses
 * - paths: File system paths with usernames
 */

import type {
  PatternDefinition,
  PatternSetDefinition
} from "../types/patterns";
import type { PatternConfig, PatternSet } from "../types/sanitizer";

// Import patterns from JSON for auditability
import patternsJson from "./patterns.json";

/**
 * Convert a PatternDefinition (JSON-serializable) to PatternConfig (with RegExp).
 */
function definitionToConfig(def: PatternDefinition): PatternConfig {
  return {
    placeholder: def.placeholder,
    regex: def.regex.map((r) => new RegExp(r, "g")),
    category: def.category
  };
}

/**
 * Load patterns from the JSON file.
 */
function loadPatternsFromJson(): PatternSet {
  const data = patternsJson as PatternSetDefinition;
  const result: PatternSet = {};

  for (const pattern of data.patterns) {
    if (pattern.enabled !== false) {
      result[pattern.name] = definitionToConfig(pattern);
    }
  }

  return result;
}

/**
 * Default patterns for detecting and redacting sensitive information.
 * Loaded from patterns.json for auditability.
 */
export const DEFAULT_PATTERNS: PatternSet = loadPatternsFromJson();

/**
 * Get all pattern definitions (JSON-serializable format).
 */
export function getPatternDefinitions(): PatternDefinition[] {
  const data = patternsJson as PatternSetDefinition;
  return data.patterns;
}

/**
 * Get pattern definitions by category.
 */
export function getPatternDefinitionsByCategory(): Record<
  string,
  PatternDefinition[]
> {
  const result: Record<string, PatternDefinition[]> = {};

  for (const pattern of getPatternDefinitions()) {
    const category = pattern.category;
    if (!result[category]) {
      result[category] = [];
    }
    result[category]!.push(pattern);
  }

  return result;
}

/**
 * Build a subset of patterns based on redaction config.
 */
export function buildPatternSubset(config: {
  redactSecrets?: boolean;
  redactPii?: boolean;
  redactPaths?: boolean;
}): PatternSet {
  const subset: PatternSet = {};

  for (const [name, pattern] of Object.entries(DEFAULT_PATTERNS)) {
    const include =
      (config.redactSecrets &&
        (pattern.category === "secrets" ||
          pattern.category === "credentials")) ||
      (config.redactPii &&
        (pattern.category === "pii" || pattern.category === "network")) ||
      (config.redactPaths && pattern.category === "paths");

    if (include) {
      subset[name] = pattern;
    }
  }

  return subset;
}

/**
 * Create custom pattern from user-provided regex.
 */
export function createCustomPattern(
  label: string,
  pattern: string
): PatternConfig | null {
  try {
    const regex = new RegExp(pattern, "g");
    return {
      placeholder: label.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      regex: [regex],
      category: "secrets" // Custom patterns treated as secrets
    };
  } catch {
    return null;
  }
}

/**
 * Get all pattern names by category.
 */
export function getPatternsByCategory(
  patterns: PatternSet = DEFAULT_PATTERNS
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const [name, config] of Object.entries(patterns)) {
    const category = config.category;
    if (!result[category]) {
      result[category] = [];
    }
    result[category]!.push(name);
  }

  return result;
}

/**
 * Convert PatternConfig back to PatternDefinition for serialization.
 */
export function configToDefinition(
  name: string,
  config: PatternConfig,
  description?: string
): PatternDefinition {
  return {
    name,
    placeholder: config.placeholder,
    regex: config.regex.map((r) => r.source),
    category: config.category,
    description
  };
}

/**
 * Merge custom patterns with default patterns.
 */
export function mergePatterns(
  base: PatternSet,
  custom: PatternSet
): PatternSet {
  return { ...base, ...custom };
}
