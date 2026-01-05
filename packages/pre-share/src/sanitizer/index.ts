/**
 * Sanitizer module for redacting sensitive information from transcripts.
 *
 * Features:
 * - Pattern-based redaction (API keys, PII, paths, credentials)
 * - High-entropy string detection
 * - Residue checking after sanitization
 * - Custom regex patterns
 */

export {
  TranscriptSanitizer,
  createSanitizer,
  type RedactionInfo
} from "./sanitizer";
export {
  DEFAULT_PATTERNS,
  buildPatternSubset,
  createCustomPattern,
  getPatternsByCategory,
  getPatternDefinitions,
  getPatternDefinitionsByCategory,
  configToDefinition,
  mergePatterns
} from "./patterns";
export {
  calculateEntropy,
  isHighEntropy,
  redactHighEntropyStrings
} from "./entropy";
export { residueCheck, collectStrings, checkSanitizedObject } from "./residue";
