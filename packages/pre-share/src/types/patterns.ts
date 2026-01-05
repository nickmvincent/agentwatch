/**
 * Pattern management types for the pattern editing API.
 */

import type { PatternCategory } from "./sanitizer";

/**
 * A pattern definition that can be serialized to JSON.
 * Unlike PatternConfig, regex is stored as strings for portability.
 */
export interface PatternDefinition {
  /** Unique name for this pattern */
  name: string;
  /** Placeholder prefix used in redacted output (e.g., "API_KEY" -> "<API_KEY_1>") */
  placeholder: string;
  /** Array of regex pattern strings */
  regex: string[];
  /** Category for grouping and reporting */
  category: PatternCategory;
  /** Human-readable description */
  description?: string;
  /** Whether this pattern is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Result of testing a pattern against sample text.
 */
export interface PatternTestResult {
  /** Name of the pattern tested */
  patternName: string;
  /** All matches found */
  matches: Array<{
    /** The matched text */
    match: string;
    /** Index in the source text */
    index: number;
    /** Length of the match */
    length: number;
  }>;
  /** Total number of matches */
  matchCount: number;
}

/**
 * Result of validating a pattern definition.
 */
export interface PatternValidationResult {
  /** Whether the pattern is valid */
  valid: boolean;
  /** Errors that must be fixed */
  errors: string[];
  /** Warnings that should be reviewed */
  warnings: string[];
}

/**
 * A collection of patterns with version info.
 */
export interface PatternSetDefinition {
  /** Version of this pattern set */
  version: string;
  /** Built-in patterns */
  patterns: PatternDefinition[];
  /** User-added custom patterns */
  customPatterns?: PatternDefinition[];
}

/**
 * Options for the PatternManager constructor.
 */
export interface PatternManagerOptions {
  /** Whether to load default patterns (default: true) */
  loadDefaults?: boolean;
  /** Path to a custom patterns JSON file */
  customPatternsPath?: string;
  /** Initial custom patterns to add */
  initialCustomPatterns?: PatternDefinition[];
}

/**
 * Options for building a pattern subset.
 */
export interface PatternSubsetOptions {
  /** Categories to include */
  categories?: PatternCategory[];
  /** Specific pattern names to include */
  names?: string[];
  /** Whether to include custom patterns (default: true) */
  includeCustom?: boolean;
}
