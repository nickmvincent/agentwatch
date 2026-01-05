/**
 * Pattern validation utilities.
 */

import type {
  PatternDefinition,
  PatternValidationResult
} from "../types/patterns";
import type { PatternCategory } from "../types/sanitizer";

const VALID_CATEGORIES: PatternCategory[] = [
  "secrets",
  "pii",
  "paths",
  "credentials",
  "network"
];

/**
 * Check for potential catastrophic backtracking patterns.
 */
function hasBacktrackingRisk(regex: string): boolean {
  // Look for nested quantifiers that could cause exponential backtracking
  const dangerousPatterns = [
    /\([^)]*[+*][^)]*\)[+*]/, // (a+)+ or (a*)* patterns
    /[+*][+*]/, // consecutive quantifiers
    /\.\*[^?].*\.\*/ // .* ... .* without lazy matching
  ];

  return dangerousPatterns.some((p) => p.test(regex));
}

/**
 * Check if a regex pattern is overly broad.
 */
function isOverlyBroad(regex: string): boolean {
  const broadPatterns = [
    /^\.\*$/, // just .*
    /^\.\+$/, // just .+
    /^\[^\\s\]\+$/, // just [^\s]+
    /^\.\{[0-9]+,\}$/ // .{n,} without more context
  ];

  return broadPatterns.some((p) => p.test(regex));
}

/**
 * Validate a single pattern definition.
 *
 * @param pattern - The pattern to validate
 * @returns Validation result with errors and warnings
 */
export function validatePattern(
  pattern: PatternDefinition
): PatternValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!pattern.name || typeof pattern.name !== "string") {
    errors.push("Pattern name is required and must be a string");
  } else if (!/^[a-z][a-z0-9_]*$/i.test(pattern.name)) {
    errors.push(
      "Pattern name must start with a letter and contain only letters, numbers, and underscores"
    );
  }

  if (!pattern.placeholder || typeof pattern.placeholder !== "string") {
    errors.push("Placeholder is required and must be a string");
  } else if (!/^[A-Z][A-Z0-9_]*$/i.test(pattern.placeholder)) {
    warnings.push(
      "Placeholder should be uppercase with underscores (e.g., 'API_KEY')"
    );
  }

  if (!pattern.category) {
    errors.push("Category is required");
  } else if (!VALID_CATEGORIES.includes(pattern.category)) {
    errors.push(
      `Invalid category '${pattern.category}'. Must be one of: ${VALID_CATEGORIES.join(", ")}`
    );
  }

  if (!Array.isArray(pattern.regex) || pattern.regex.length === 0) {
    errors.push("At least one regex pattern is required");
  } else {
    // Validate each regex
    for (let i = 0; i < pattern.regex.length; i++) {
      const regexStr = pattern.regex[i];

      if (typeof regexStr !== "string") {
        errors.push(`Regex at index ${i} must be a string`);
        continue;
      }

      // Try to compile the regex
      try {
        new RegExp(regexStr, "g");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`Invalid regex at index ${i}: ${message}`);
        continue;
      }

      // Check for performance issues
      if (hasBacktrackingRisk(regexStr)) {
        warnings.push(
          `Regex at index ${i} may have catastrophic backtracking issues: ${regexStr.slice(0, 50)}...`
        );
      }

      // Check for overly broad patterns
      if (isOverlyBroad(regexStr)) {
        warnings.push(
          `Regex at index ${i} is overly broad and may match too much: ${regexStr}`
        );
      }

      // Check for missing word boundaries on key-like patterns
      if (/^[A-Za-z]/.test(regexStr) && !/\\b/.test(regexStr)) {
        warnings.push(
          `Regex at index ${i} may benefit from word boundaries (\\b) to avoid partial matches`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate multiple patterns.
 *
 * @param patterns - Array of patterns to validate
 * @returns Combined validation result
 */
export function validatePatterns(
  patterns: PatternDefinition[]
): PatternValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];
  const seenNames = new Set<string>();

  for (const pattern of patterns) {
    // Check for duplicate names
    if (seenNames.has(pattern.name)) {
      allErrors.push(`Duplicate pattern name: ${pattern.name}`);
    }
    seenNames.add(pattern.name);

    const result = validatePattern(pattern);
    for (const error of result.errors) {
      allErrors.push(`[${pattern.name}] ${error}`);
    }
    for (const warning of result.warnings) {
      allWarnings.push(`[${pattern.name}] ${warning}`);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * Normalize a pattern definition (apply defaults, trim strings).
 *
 * @param pattern - The pattern to normalize
 * @returns Normalized pattern
 */
export function normalizePattern(
  pattern: Partial<PatternDefinition>
): PatternDefinition {
  return {
    name: (pattern.name || "").trim(),
    placeholder: (pattern.placeholder || "").trim().toUpperCase(),
    regex: (pattern.regex || []).map((r) => r.trim()),
    category: pattern.category || "secrets",
    description: pattern.description?.trim(),
    enabled: pattern.enabled !== false
  };
}
