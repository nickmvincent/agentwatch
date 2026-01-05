/**
 * @agentwatch/pre-share
 *
 * Standalone library for sanitizing and preparing coding agent transcripts for sharing.
 *
 * Features:
 * - Pattern-based redaction (API keys, PII, credentials, file paths)
 * - High-entropy string detection for unknown secrets
 * - Field stripping with configurable schemas
 * - Residue checking after sanitization
 * - Quality scoring for session selection
 * - Multiple output formats (JSONL, Markdown, ZIP bundle)
 * - Pattern management API for adding/editing patterns
 *
 * @example Basic sanitization
 * ```typescript
 * import { createSanitizer } from '@agentwatch/pre-share';
 *
 * const sanitizer = createSanitizer({
 *   redactSecrets: true,
 *   redactPii: true,
 *   redactPaths: true,
 * });
 *
 * const sanitized = sanitizer.redactText('My API key is sk-abc123xyz...');
 * // Output: "My API key is <API_KEY_1>"
 * ```
 *
 * @example Pattern management
 * ```typescript
 * import { PatternManager, testPattern } from '@agentwatch/pre-share/patterns';
 *
 * const manager = new PatternManager();
 *
 * // Add custom pattern
 * manager.addCustomPattern({
 *   name: 'company_internal_id',
 *   placeholder: 'INTERNAL_ID',
 *   regex: ['\\bINT-[0-9]{6}\\b'],
 *   category: 'secrets',
 *   description: 'Company internal IDs'
 * });
 *
 * // Test pattern
 * const pattern = manager.getPattern('company_internal_id');
 * const result = testPattern(pattern, 'Found INT-123456 in logs');
 * ```
 */

// Types
export * from "./types";

// Sanitizer
export * from "./sanitizer";

// Fields
export * from "./fields";

// Pipeline
export * from "./pipeline";

// Output formatters
export * from "./output";

// Pattern management
export * from "./patterns";
