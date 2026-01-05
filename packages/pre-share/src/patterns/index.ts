/**
 * Pattern management module for editing and testing redaction patterns.
 */

export { PatternManager, createPatternManager } from "./manager";
export {
  validatePattern,
  validatePatterns,
  normalizePattern
} from "./validator";
export {
  testPattern,
  testAllPatterns,
  highlightMatches,
  summarizeTestResults,
  generateSampleText
} from "./tester";
