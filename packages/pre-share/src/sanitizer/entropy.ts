/**
 * Shannon entropy detection for high-entropy strings that might be secrets.
 */

/**
 * Calculate Shannon entropy of a string.
 * Higher entropy indicates more randomness (potential secret).
 *
 * @param s - The string to analyze
 * @returns Entropy value (0 to ~8 for ASCII)
 */
export function calculateEntropy(s: string): number {
  if (!s) return 0.0;

  // Count character frequencies
  const freq = new Map<string, number>();
  for (const char of s) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  // Calculate Shannon entropy: -sum(p * log2(p))
  const length = s.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Check if a string has suspiciously high entropy (likely a secret).
 *
 * @param s - The string to check
 * @param minLength - Minimum length to consider (default: 20)
 * @param minEntropy - Minimum entropy threshold (default: 4.0)
 * @returns True if the string appears to be a high-entropy secret
 */
export function isHighEntropy(
  s: string,
  minLength = 20,
  minEntropy = 4.0
): boolean {
  if (s.length < minLength) {
    return false;
  }

  // Skip if it looks like a hash (pure hex)
  if (/^[a-f0-9]+$/i.test(s)) {
    return false;
  }

  // Skip if it's pure numbers or pure letters
  if (/^\d+$/.test(s) || /^[a-zA-Z]+$/.test(s)) {
    return false;
  }

  // Check for base64/key-like character set
  const keyChars = new Set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_"
  );
  if (![...s].every((c) => keyChars.has(c))) {
    return false;
  }

  return calculateEntropy(s) >= minEntropy;
}

/**
 * Find and redact high-entropy strings that might be secrets.
 *
 * @param text - The text to scan
 * @param getPlaceholder - Function to generate placeholder for a matched value
 * @param minLength - Minimum length for entropy check
 * @param minEntropy - Minimum entropy threshold
 * @returns Text with high-entropy strings replaced and count
 */
export function redactHighEntropyStrings(
  text: string,
  getPlaceholder: (value: string) => string,
  minLength = 20,
  minEntropy = 4.0
): { text: string; count: number } {
  // Look for long alphanumeric strings
  const pattern = /\b[A-Za-z0-9+/=_-]{20,}\b/g;
  let count = 0;

  const result = text.replace(pattern, (match) => {
    if (isHighEntropy(match, minLength, minEntropy)) {
      count++;
      return getPlaceholder(match);
    }
    return match;
  });

  return { text: result, count };
}
