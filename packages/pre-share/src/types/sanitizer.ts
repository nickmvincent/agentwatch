/**
 * Sanitization and redaction types
 */

// =============================================================================
// Pattern Configuration
// =============================================================================

export type PatternCategory =
  | "secrets"
  | "pii"
  | "paths"
  | "credentials"
  | "network";

export interface PatternConfig {
  /** Placeholder prefix used in redacted output (e.g., "API_KEY" -> "<API_KEY_1>") */
  placeholder: string;
  /** Array of regex patterns to match */
  regex: RegExp[];
  /** Category for grouping and reporting */
  category: PatternCategory;
}

export interface PatternSet {
  [name: string]: PatternConfig;
}

// =============================================================================
// Sanitizer Configuration
// =============================================================================

export interface SanitizerConfig {
  /** Custom patterns to use (defaults to DEFAULT_PATTERNS) */
  patterns?: PatternSet;
  /** Enable high-entropy string detection (default: true) */
  enableHighEntropy?: boolean;
  /** Minimum length for entropy check (default: 20) */
  highEntropyMinLength?: number;
  /** Minimum entropy threshold (default: 4.0) */
  highEntropyThreshold?: number;
  /** Enable residue check after sanitization (default: true) */
  enableResidueCheck?: boolean;
  /** Custom regex patterns from user */
  customRegex?: Array<{ label: string; pattern: string }>;
}

export interface RedactionConfig {
  /** Redact API keys, tokens, private keys */
  redactSecrets: boolean;
  /** Redact emails, phone numbers, SSN, IPs */
  redactPii: boolean;
  /** Redact file paths with usernames */
  redactPaths: boolean;
  /** Replace code blocks with placeholder */
  maskCodeBlocks: boolean;
  /** User-provided regex patterns */
  customRegex: string[];
}

// =============================================================================
// Redaction Results
// =============================================================================

export interface RedactionReport {
  /** Total number of redactions made */
  totalRedactions: number;
  /** Breakdown by pattern category */
  countsByCategory: Record<string, number>;
  /** Number of unique placeholders generated */
  placeholderCount: number;
  /** Warnings generated during sanitization */
  warnings: string[];
  /** When the report was generated */
  timestamp: string;
  /** Which redaction categories were enabled */
  enabledCategories: string[];
  /** Warnings from residue check */
  residueWarnings: string[];
  /** Whether submission should be blocked */
  blocked: boolean;
  /** Number of fields stripped */
  fieldsStripped?: number;
}

// =============================================================================
// Field Stripping
// =============================================================================

export type FieldCategory =
  | "essential" // Cannot be removed
  | "recommended" // Selected by default
  | "optional" // User chooses
  | "strip" // Deselected by default (may contain sensitive data)
  | "content_heavy" // Contains large/sensitive content (file contents, outputs)
  | "always_strip"; // Always removed

export interface FieldSchema {
  /** JSONPath-like pattern (supports * wildcards) */
  path: string;
  /** Category determining default selection */
  category: FieldCategory;
  /** Human-readable label */
  label: string;
  /** Description of the field */
  description: string;
  /** Which source this field applies to */
  source?:
    | "claude"
    | "codex"
    | "opencode"
    | "cc_hook"
    | "cc_transcript"
    | "all";
}

// =============================================================================
// Residue Check
// =============================================================================

export interface ResidueCheckResult {
  /** Whether submission should be blocked */
  blocked: boolean;
  /** Warning messages */
  warnings: string[];
}

// =============================================================================
// Sanitizer Interface
// =============================================================================

export interface ITranscriptSanitizer {
  /** Redact sensitive information from a string */
  redactText(text: string): string;
  /** Recursively redact sensitive information from an object */
  redactObject(obj: unknown): unknown;
  /** Get the redaction report */
  getReport(): RedactionReport;
  /** Reset counters and mappings for a new sanitization run */
  reset(): void;
}

// =============================================================================
// Default Configuration
// =============================================================================

export function defaultRedactionConfig(): RedactionConfig {
  return {
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    maskCodeBlocks: false,
    customRegex: []
  };
}

export function defaultSanitizerConfig(): SanitizerConfig {
  return {
    enableHighEntropy: true,
    highEntropyMinLength: 20,
    highEntropyThreshold: 4.0,
    enableResidueCheck: true,
    customRegex: []
  };
}
