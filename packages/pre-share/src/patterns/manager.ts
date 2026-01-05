/**
 * Pattern manager for CRUD operations on redaction patterns.
 */

import { getPatternDefinitions } from "../sanitizer/patterns";
import type {
  PatternDefinition,
  PatternManagerOptions,
  PatternSetDefinition,
  PatternSubsetOptions,
  PatternValidationResult
} from "../types/patterns";
import type {
  PatternCategory,
  PatternConfig,
  PatternSet
} from "../types/sanitizer";
import { normalizePattern, validatePattern } from "./validator";

/**
 * Manager class for pattern CRUD operations.
 *
 * Provides:
 * - Loading default patterns from patterns.json
 * - Adding/editing/removing custom patterns
 * - Building pattern sets for the sanitizer
 * - Import/export functionality
 */
export class PatternManager {
  private patterns: Map<string, PatternDefinition> = new Map();
  private customPatterns: Map<string, PatternDefinition> = new Map();

  constructor(options: PatternManagerOptions = {}) {
    const { loadDefaults = true, initialCustomPatterns = [] } = options;

    if (loadDefaults) {
      this.loadDefaultPatterns();
    }

    for (const pattern of initialCustomPatterns) {
      this.addCustomPattern(pattern);
    }
  }

  /**
   * Load default patterns from the built-in patterns.json.
   */
  private loadDefaultPatterns(): void {
    const definitions = getPatternDefinitions();
    for (const pattern of definitions) {
      this.patterns.set(pattern.name, pattern);
    }
  }

  // ============================================================================
  // READ OPERATIONS
  // ============================================================================

  /**
   * Get a pattern by name.
   */
  getPattern(name: string): PatternDefinition | undefined {
    return this.customPatterns.get(name) ?? this.patterns.get(name);
  }

  /**
   * Get all default patterns.
   */
  getDefaultPatterns(): PatternDefinition[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get all custom patterns.
   */
  getCustomPatterns(): PatternDefinition[] {
    return Array.from(this.customPatterns.values());
  }

  /**
   * Get all patterns (default + custom).
   */
  getAllPatterns(): PatternDefinition[] {
    const all = new Map(this.patterns);
    for (const [name, pattern] of this.customPatterns) {
      all.set(name, pattern);
    }
    return Array.from(all.values());
  }

  /**
   * Get patterns by category.
   */
  getPatternsByCategory(category: PatternCategory): PatternDefinition[] {
    return this.getAllPatterns().filter((p) => p.category === category);
  }

  /**
   * Check if a pattern exists.
   */
  hasPattern(name: string): boolean {
    return this.patterns.has(name) || this.customPatterns.has(name);
  }

  /**
   * Check if a pattern is custom (user-added).
   */
  isCustomPattern(name: string): boolean {
    return this.customPatterns.has(name);
  }

  // ============================================================================
  // WRITE OPERATIONS
  // ============================================================================

  /**
   * Add a custom pattern.
   *
   * @param pattern - Pattern definition to add
   * @returns Validation result
   */
  addCustomPattern(pattern: PatternDefinition): PatternValidationResult {
    const normalized = normalizePattern(pattern);
    const validation = validatePattern(normalized);

    if (!validation.valid) {
      return validation;
    }

    // Check if name conflicts with default patterns
    if (this.patterns.has(normalized.name)) {
      validation.warnings.push(
        `Pattern '${normalized.name}' overrides a default pattern`
      );
    }

    this.customPatterns.set(normalized.name, normalized);
    return validation;
  }

  /**
   * Edit an existing pattern (custom only).
   *
   * @param name - Pattern name to edit
   * @param updates - Fields to update
   * @returns Validation result
   */
  editCustomPattern(
    name: string,
    updates: Partial<PatternDefinition>
  ): PatternValidationResult {
    const existing = this.customPatterns.get(name);

    if (!existing) {
      if (this.patterns.has(name)) {
        return {
          valid: false,
          errors: [
            `Cannot edit default pattern '${name}'. Create a custom pattern instead.`
          ],
          warnings: []
        };
      }
      return {
        valid: false,
        errors: [`Pattern '${name}' not found`],
        warnings: []
      };
    }

    const updated = normalizePattern({
      ...existing,
      ...updates,
      name: existing.name // Don't allow name changes
    });

    const validation = validatePattern(updated);

    if (validation.valid) {
      this.customPatterns.set(name, updated);
    }

    return validation;
  }

  /**
   * Remove a custom pattern.
   *
   * @param name - Pattern name to remove
   * @returns True if removed, false if not found or is default
   */
  removeCustomPattern(name: string): boolean {
    return this.customPatterns.delete(name);
  }

  /**
   * Clear all custom patterns.
   */
  clearCustomPatterns(): void {
    this.customPatterns.clear();
  }

  // ============================================================================
  // BUILD OPERATIONS
  // ============================================================================

  /**
   * Convert a PatternDefinition to PatternConfig (with compiled RegExp).
   */
  private definitionToConfig(def: PatternDefinition): PatternConfig {
    return {
      placeholder: def.placeholder,
      regex: def.regex.map((r) => new RegExp(r, "g")),
      category: def.category
    };
  }

  /**
   * Build a PatternSet for use with TranscriptSanitizer.
   *
   * @param options - Options for filtering patterns
   * @returns PatternSet ready for the sanitizer
   */
  buildPatternSet(options: PatternSubsetOptions = {}): PatternSet {
    const { categories, names, includeCustom = true } = options;

    const result: PatternSet = {};
    const sources = includeCustom
      ? [this.patterns, this.customPatterns]
      : [this.patterns];

    for (const source of sources) {
      for (const [name, pattern] of source) {
        // Skip disabled patterns
        if (pattern.enabled === false) continue;

        // Filter by category if specified
        if (categories && !categories.includes(pattern.category)) continue;

        // Filter by name if specified
        if (names && !names.includes(name)) continue;

        result[name] = this.definitionToConfig(pattern);
      }
    }

    return result;
  }

  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================

  /**
   * Export patterns to JSON.
   *
   * @param includeDefaults - Whether to include default patterns
   * @returns JSON string
   */
  exportToJson(includeDefaults = false): string {
    const patterns = includeDefaults
      ? this.getAllPatterns()
      : this.getCustomPatterns();

    const data: PatternSetDefinition = {
      version: "1.0.0",
      patterns: includeDefaults ? this.getDefaultPatterns() : [],
      customPatterns: this.getCustomPatterns()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import patterns from JSON.
   *
   * @param json - JSON string to import
   * @param replaceExisting - Whether to replace existing custom patterns
   * @returns Validation result
   */
  importFromJson(
    json: string,
    replaceExisting = false
  ): PatternValidationResult {
    let data: PatternSetDefinition;

    try {
      data = JSON.parse(json);
    } catch (e) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        warnings: []
      };
    }

    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    if (replaceExisting) {
      this.customPatterns.clear();
    }

    // Import custom patterns
    const customPatterns = data.customPatterns ?? data.patterns ?? [];

    for (const pattern of customPatterns) {
      const result = this.addCustomPattern(pattern);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Get a summary of current patterns.
   */
  getSummary(): {
    defaultCount: number;
    customCount: number;
    byCategory: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};

    for (const pattern of this.getAllPatterns()) {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
    }

    return {
      defaultCount: this.patterns.size,
      customCount: this.customPatterns.size,
      byCategory
    };
  }
}

/**
 * Create a new PatternManager instance.
 */
export function createPatternManager(
  options?: PatternManagerOptions
): PatternManager {
  return new PatternManager(options);
}
