/**
 * Main TranscriptSanitizer class.
 *
 * Combines pattern-based redaction with high-entropy detection.
 */

import type {
  ITranscriptSanitizer,
  PatternConfig,
  PatternSet,
  RedactionReport,
  SanitizerConfig
} from "../types/sanitizer";
import { redactHighEntropyStrings } from "./entropy";
import { DEFAULT_PATTERNS, createCustomPattern } from "./patterns";

/**
 * Main class for sanitizing transcript content.
 *
 * Features:
 * - Pattern-based redaction for known secret/PII formats
 * - High-entropy string detection for unknown secrets
 * - Stable placeholders (same value -> same placeholder)
 * - Custom regex pattern support
 * - Detailed redaction reporting
 */
/**
 * Information about a single redaction for UI display.
 */
export interface RedactionInfo {
  placeholder: string;
  category: string;
  ruleName: string;
  originalLength: number;
}

export class TranscriptSanitizer implements ITranscriptSanitizer {
  private patterns: PatternSet;
  private customPatterns: PatternConfig[] = [];
  private placeholderCounters: Map<string, number> = new Map();
  private valueToPlaceholder: Map<string, string> = new Map();
  private placeholderToInfo: Map<string, RedactionInfo> = new Map();
  private redactionCounts: Map<string, number> = new Map();
  private warnings: Set<string> = new Set();
  private config: Required<SanitizerConfig>;
  private totalStringsTouched = 0;

  constructor(config: SanitizerConfig = {}) {
    this.patterns = config.patterns ?? DEFAULT_PATTERNS;
    this.config = {
      patterns: this.patterns,
      enableHighEntropy: config.enableHighEntropy ?? true,
      highEntropyMinLength: config.highEntropyMinLength ?? 20,
      highEntropyThreshold: config.highEntropyThreshold ?? 4.0,
      enableResidueCheck: config.enableResidueCheck ?? true,
      customRegex: config.customRegex ?? []
    };

    // Compile custom regex patterns
    for (const custom of this.config.customRegex) {
      const pattern = createCustomPattern(custom.label, custom.pattern);
      if (pattern) {
        this.customPatterns.push(pattern);
      } else {
        this.warnings.add(`Invalid custom regex: ${custom.pattern}`);
      }
    }
  }

  /**
   * Get or create a stable placeholder for a matched value.
   * Same input value always produces the same placeholder.
   */
  private getPlaceholder(
    category: string,
    value: string,
    prefix: string,
    ruleName: string = category
  ): string {
    if (this.valueToPlaceholder.has(value)) {
      return this.valueToPlaceholder.get(value)!;
    }

    const count = (this.placeholderCounters.get(prefix) || 0) + 1;
    this.placeholderCounters.set(prefix, count);

    const placeholder = `<${prefix}_${count}>`;
    this.valueToPlaceholder.set(value, placeholder);
    this.redactionCounts.set(
      category,
      (this.redactionCounts.get(category) || 0) + 1
    );

    // Track info about this redaction for UI display
    this.placeholderToInfo.set(placeholder, {
      placeholder,
      category,
      ruleName,
      originalLength: value.length
    });

    return placeholder;
  }

  /**
   * Redact sensitive information from a string.
   */
  redactText(text: string): string {
    if (typeof text !== "string") {
      return text;
    }

    let result = text;
    let touched = false;

    // Apply pattern-based redaction
    for (const [patternName, config] of Object.entries(this.patterns)) {
      for (const regex of config.regex) {
        // Clone regex to reset lastIndex for global patterns
        const re = new RegExp(regex.source, regex.flags);
        const before = result;
        result = result.replace(re, (match) =>
          this.getPlaceholder(
            config.category,
            match,
            config.placeholder,
            patternName
          )
        );
        if (result !== before) {
          touched = true;
        }
      }
    }

    // Apply custom regex patterns
    for (const config of this.customPatterns) {
      for (const regex of config.regex) {
        const re = new RegExp(regex.source, regex.flags);
        const before = result;
        result = result.replace(re, (match) =>
          this.getPlaceholder(
            "custom",
            match,
            config.placeholder,
            config.placeholder
          )
        );
        if (result !== before) {
          touched = true;
        }
      }
    }

    // Apply high-entropy detection
    if (this.config.enableHighEntropy) {
      const { text: entropyResult, count } = redactHighEntropyStrings(
        result,
        (value) => {
          this.warnings.add("High-entropy token detected and redacted");
          return this.getPlaceholder(
            "high_entropy",
            value,
            "KEY",
            "high_entropy"
          );
        },
        this.config.highEntropyMinLength,
        this.config.highEntropyThreshold
      );
      if (count > 0) {
        touched = true;
      }
      result = entropyResult;
    }

    if (touched) {
      this.totalStringsTouched++;
    }

    return result;
  }

  /**
   * Recursively redact sensitive information from an object.
   */
  redactObject(obj: unknown): unknown {
    if (typeof obj === "string") {
      return this.redactText(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item));
    }

    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactObject(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * Get the redaction report.
   */
  getReport(): RedactionReport {
    return {
      totalRedactions: [...this.redactionCounts.values()].reduce(
        (a, b) => a + b,
        0
      ),
      countsByCategory: Object.fromEntries(this.redactionCounts),
      placeholderCount: this.valueToPlaceholder.size,
      warnings: [...this.warnings],
      timestamp: new Date().toISOString(),
      enabledCategories: [
        ...Object.keys(this.patterns),
        ...(this.customPatterns.length > 0 ? ["custom"] : []),
        ...(this.config.enableHighEntropy ? ["high_entropy"] : [])
      ],
      residueWarnings: [],
      blocked: false
    };
  }

  /**
   * Get total number of strings that were modified.
   */
  getTotalStringsTouched(): number {
    return this.totalStringsTouched;
  }

  /**
   * Get information about all redactions for UI display.
   * Returns a map from placeholder string to RedactionInfo.
   */
  getRedactionInfoMap(): Record<string, RedactionInfo> {
    return Object.fromEntries(this.placeholderToInfo);
  }

  /**
   * Reset counters and mappings for a new sanitization run.
   */
  reset(): void {
    this.placeholderCounters.clear();
    this.valueToPlaceholder.clear();
    this.placeholderToInfo.clear();
    this.redactionCounts.clear();
    this.warnings.clear();
    this.totalStringsTouched = 0;
  }
}

/**
 * Create a sanitizer with only specific categories enabled.
 */
export function createSanitizer(config: {
  redactSecrets?: boolean;
  redactPii?: boolean;
  redactPaths?: boolean;
  maskCodeBlocks?: boolean;
  customRegex?: string[];
  enableHighEntropy?: boolean;
}): TranscriptSanitizer {
  // Build pattern subset based on config
  const patterns: PatternSet = {};

  for (const [name, pattern] of Object.entries(DEFAULT_PATTERNS)) {
    const include =
      (config.redactSecrets &&
        (pattern.category === "secrets" ||
          pattern.category === "credentials")) ||
      (config.redactPii &&
        (pattern.category === "pii" || pattern.category === "network")) ||
      (config.redactPaths && pattern.category === "paths");

    if (include) {
      patterns[name] = pattern;
    }
  }

  // Add code block masking if enabled
  if (config.maskCodeBlocks) {
    patterns["code_block"] = {
      placeholder: "CODE_BLOCK",
      regex: [/```[\s\S]*?```/g],
      category: "secrets" // Treat as secrets for reporting
    };
  }

  // Convert custom regex strings to labeled patterns
  const customRegex = (config.customRegex || [])
    .filter(Boolean)
    .map((pattern, index) => ({
      label: `USER_REGEX_${index + 1}`,
      pattern
    }));

  return new TranscriptSanitizer({
    patterns,
    customRegex,
    enableHighEntropy: config.enableHighEntropy ?? true
  });
}
