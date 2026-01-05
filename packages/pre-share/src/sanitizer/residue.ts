/**
 * Residue check - detects if sensitive material remains after sanitization.
 */

import type { ResidueCheckResult } from "../types/sanitizer";

/**
 * Patterns that indicate dangerous residue requiring blocking.
 */
const BLOCKING_PATTERNS = {
  privateKey:
    /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]+?-----END [^-]+ PRIVATE KEY-----/
};

/**
 * Patterns that warrant warnings but don't block submission.
 */
const WARNING_PATTERNS = {
  tokenLike:
    /(sk-[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{10,}|hf_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})/,
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
};

/**
 * Check sanitized strings for residual sensitive content.
 *
 * @param strings - Array of strings from sanitized output
 * @returns Result indicating whether submission should be blocked
 */
export function residueCheck(strings: string[]): ResidueCheckResult {
  const warnings: string[] = [];
  let blocked = false;
  let tokenHits = 0;
  let emailHits = 0;

  for (const text of strings) {
    // Check for blocking patterns (always block)
    if (BLOCKING_PATTERNS.privateKey.test(text)) {
      blocked = true;
    }

    // Check for warning patterns (count occurrences)
    if (WARNING_PATTERNS.tokenLike.test(text)) {
      tokenHits++;
    }
    if (WARNING_PATTERNS.email.test(text)) {
      emailHits++;
    }
  }

  // Generate warning messages
  if (blocked) {
    warnings.push(
      "Private key material still detected. Submission is blocked."
    );
  }
  if (tokenHits > 0) {
    warnings.push("Token-like strings remain. Review sanitized output.");
  }
  if (emailHits > 0) {
    warnings.push("Email-like strings remain. Review sanitized output.");
  }

  return { blocked, warnings };
}

/**
 * Collect all strings from a nested object structure.
 *
 * @param value - The value to extract strings from
 * @param bucket - Array to collect strings into
 */
export function collectStrings(value: unknown, bucket: string[]): void {
  if (typeof value === "string") {
    bucket.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, bucket);
    }
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectStrings(entry, bucket);
    }
  }
}

/**
 * Perform residue check on a sanitized object.
 *
 * @param obj - The sanitized object to check
 * @returns Result indicating whether submission should be blocked
 */
export function checkSanitizedObject(obj: unknown): ResidueCheckResult {
  const strings: string[] = [];
  collectStrings(obj, strings);
  return residueCheck(strings);
}
