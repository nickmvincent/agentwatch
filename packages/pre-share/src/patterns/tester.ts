/**
 * Pattern testing utilities.
 */

import type { PatternDefinition, PatternTestResult } from "../types/patterns";

/**
 * Test a single pattern against sample text.
 *
 * @param pattern - The pattern to test
 * @param sampleText - Text to test against
 * @returns Test result with all matches found
 */
export function testPattern(
  pattern: PatternDefinition,
  sampleText: string
): PatternTestResult {
  const matches: Array<{ match: string; index: number; length: number }> = [];

  for (const regexStr of pattern.regex) {
    try {
      const regex = new RegExp(regexStr, "g");
      let match;
      while ((match = regex.exec(sampleText)) !== null) {
        matches.push({
          match: match[0],
          index: match.index,
          length: match[0].length
        });
        // Prevent infinite loops on zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    } catch {
      // Skip invalid regex
    }
  }

  // Remove duplicates (same match at same position)
  const unique = matches.filter(
    (m, i, arr) =>
      arr.findIndex((x) => x.index === m.index && x.match === m.match) === i
  );

  return {
    patternName: pattern.name,
    matches: unique,
    matchCount: unique.length
  };
}

/**
 * Test multiple patterns against sample text.
 *
 * @param patterns - Array of patterns to test
 * @param sampleText - Text to test against
 * @returns Array of test results
 */
export function testAllPatterns(
  patterns: PatternDefinition[],
  sampleText: string
): PatternTestResult[] {
  return patterns.map((p) => testPattern(p, sampleText));
}

/**
 * Highlight matches in text for display.
 *
 * @param text - Original text
 * @param matches - Array of matches to highlight
 * @param highlightStart - Start marker (default: ">>>")
 * @param highlightEnd - End marker (default: "<<<")
 * @returns Text with matches highlighted
 */
export function highlightMatches(
  text: string,
  matches: Array<{ index: number; length: number }>,
  highlightStart = ">>>",
  highlightEnd = "<<<"
): string {
  if (matches.length === 0) return text;

  // Sort matches by index (descending) to insert markers from end to start
  const sorted = [...matches].sort((a, b) => b.index - a.index);

  let result = text;
  for (const match of sorted) {
    const before = result.slice(0, match.index);
    const matched = result.slice(match.index, match.index + match.length);
    const after = result.slice(match.index + match.length);
    result = `${before}${highlightStart}${matched}${highlightEnd}${after}`;
  }

  return result;
}

/**
 * Get a summary of test results.
 *
 * @param results - Array of test results
 * @returns Summary object
 */
export function summarizeTestResults(results: PatternTestResult[]): {
  totalPatterns: number;
  patternsWithMatches: number;
  totalMatches: number;
  matchesByPattern: Record<string, number>;
} {
  const matchesByPattern: Record<string, number> = {};
  let totalMatches = 0;
  let patternsWithMatches = 0;

  for (const result of results) {
    matchesByPattern[result.patternName] = result.matchCount;
    totalMatches += result.matchCount;
    if (result.matchCount > 0) {
      patternsWithMatches++;
    }
  }

  return {
    totalPatterns: results.length,
    patternsWithMatches,
    totalMatches,
    matchesByPattern
  };
}

/**
 * Generate sample text for testing common patterns.
 */
export function generateSampleText(): string {
  return `
# Sample Text for Pattern Testing

## API Keys and Tokens
OpenAI key: sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
Anthropic key: sk-ant-api03-abcdefghij1234567890
GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwx
HuggingFace token: hf_abcdefghijklmnopqrstuvwxyz1234567890

## AWS Credentials
AWS Key ID: AKIAIOSFODNN7EXAMPLE
AWS Secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

## Database Connections
MongoDB: mongodb://admin:secret123@localhost:27017/mydb
PostgreSQL: postgres://user:password@db.example.com:5432/production

## Personal Information
Email: john.doe@example.com
Phone: +1 (555) 123-4567
SSN: 123-45-6789

## IP Addresses
IPv4: 192.168.1.100
IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334

## File Paths
Unix: /Users/johndoe/Documents/project/secrets.json
Windows: C:\\Users\\johndoe\\AppData\\Local\\config.yaml

## URLs with Auth
Authenticated: https://user:password123@api.example.com/data

## JWT Token
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
`.trim();
}
