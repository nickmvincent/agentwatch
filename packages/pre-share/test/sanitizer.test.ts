import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PATTERNS,
  TranscriptSanitizer,
  calculateEntropy,
  checkSanitizedObject,
  createSanitizer,
  isHighEntropy,
  residueCheck
} from "../src";

describe("TranscriptSanitizer", () => {
  test("redacts OpenAI API keys", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = "My key is sk-1234567890abcdefghijklmno";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("sk-1234567890");
    expect(result).toContain("<API_KEY_");
  });

  test("redacts Anthropic API keys", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = "Using sk-ant-api03-abcdef123456";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("sk-ant-");
    expect(result).toContain("<API_KEY_");
  });

  test("redacts GitHub tokens", () => {
    const sanitizer = new TranscriptSanitizer();
    // Use a format that won't be caught by credential_assignment first
    const input = "Using ghp_1234567890abcdefghijklmnopqrstuvwxyz for auth";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("ghp_");
    expect(result).toContain("<GITHUB_TOKEN_");
  });

  test("redacts email addresses", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = "Contact me at user@example.com";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("user@example.com");
    expect(result).toContain("<EMAIL_");
  });

  test("redacts Unix paths with usernames", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = "File at /Users/johndoe/Documents/secret.txt";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("johndoe");
    expect(result).toContain("<PATH_");
  });

  test("redacts Windows paths with usernames", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = "File at C:\\Users\\johndoe\\Documents\\secret.txt";
    const result = sanitizer.redactText(input);

    expect(result).not.toContain("johndoe");
    expect(result).toContain("<PATH_");
  });

  test("uses stable placeholders for same value", () => {
    const sanitizer = new TranscriptSanitizer();
    const key = "sk-1234567890abcdefghijklmno";
    const input = `First: ${key}, Second: ${key}`;
    const result = sanitizer.redactText(input);

    // Both occurrences should use the same placeholder
    const matches = result.match(/<API_KEY_\d+>/g);
    expect(matches).toHaveLength(2);
    expect(matches![0]).toBe(matches![1]);
  });

  test("generates report with counts", () => {
    const sanitizer = new TranscriptSanitizer();
    sanitizer.redactText("sk-1234567890abcdefghijklmno");
    sanitizer.redactText("user@example.com");

    const report = sanitizer.getReport();

    expect(report.totalRedactions).toBe(2);
    expect(report.placeholderCount).toBe(2);
  });

  test("reset clears state", () => {
    const sanitizer = new TranscriptSanitizer();
    sanitizer.redactText("sk-1234567890abcdefghijklmno");
    sanitizer.reset();

    const report = sanitizer.getReport();
    expect(report.totalRedactions).toBe(0);
    expect(report.placeholderCount).toBe(0);
  });

  test("redacts nested objects", () => {
    const sanitizer = new TranscriptSanitizer();
    const input = {
      config: {
        apiKey: "sk-1234567890abcdefghijklmno",
        email: "user@example.com"
      },
      items: ["ghp_1234567890abcdefghijklmnopqrstuvwxyz"]
    };

    const result = sanitizer.redactObject(input) as typeof input;

    expect(result.config.apiKey).toContain("<API_KEY_");
    expect(result.config.email).toContain("<EMAIL_");
    expect(result.items[0]).toContain("<GITHUB_TOKEN_");
  });
});

describe("createSanitizer", () => {
  test("respects redactSecrets option", () => {
    const sanitizer = createSanitizer({
      redactSecrets: true,
      redactPii: false,
      redactPaths: false
    });

    // Should redact secrets
    expect(sanitizer.redactText("sk-1234567890abcdefghijklmno")).toContain(
      "<API_KEY_"
    );

    // Should NOT redact PII
    expect(sanitizer.redactText("user@example.com")).toBe("user@example.com");
  });

  test("respects redactPii option", () => {
    const sanitizer = createSanitizer({
      redactSecrets: false,
      redactPii: true,
      redactPaths: false,
      enableHighEntropy: false // Disable entropy to test pattern-only
    });

    // Should redact PII
    expect(sanitizer.redactText("user@example.com")).toContain("<EMAIL_");

    // Should NOT redact secrets (with entropy disabled)
    expect(sanitizer.redactText("sk-1234567890abcdefghijklmno")).toBe(
      "sk-1234567890abcdefghijklmno"
    );
  });

  test("respects maskCodeBlocks option", () => {
    const sanitizer = createSanitizer({
      redactSecrets: false,
      redactPii: false,
      redactPaths: false,
      maskCodeBlocks: true
    });

    const input = "Here is code:\n```python\nprint('hello')\n```\nEnd.";
    const result = sanitizer.redactText(input);

    expect(result).toContain("<CODE_BLOCK_");
    expect(result).not.toContain("print");
  });

  test("supports custom regex", () => {
    const sanitizer = createSanitizer({
      customRegex: ["SECRET_[A-Z0-9]+"]
    });

    const result = sanitizer.redactText("Using SECRET_ABC123 here");

    expect(result).not.toContain("SECRET_ABC123");
    expect(result).toContain("<USER_REGEX_1_");
  });
});

describe("calculateEntropy", () => {
  test("returns 0 for empty string", () => {
    expect(calculateEntropy("")).toBe(0);
  });

  test("returns 0 for single character", () => {
    expect(calculateEntropy("aaaa")).toBe(0);
  });

  test("returns higher entropy for random-looking strings", () => {
    const lowEntropy = calculateEntropy("aaaaaaaaaa");
    const highEntropy = calculateEntropy("aB3$xY9!qZ");

    expect(highEntropy).toBeGreaterThan(lowEntropy);
  });

  test("typical API key has high entropy", () => {
    const entropy = calculateEntropy("sk-proj-abc123XYZ789def456");
    expect(entropy).toBeGreaterThan(3.5);
  });
});

describe("isHighEntropy", () => {
  test("returns false for short strings", () => {
    expect(isHighEntropy("abc123", 20, 4.0)).toBe(false);
  });

  test("returns false for pure hex", () => {
    expect(isHighEntropy("abcdef1234567890abcdef", 20, 4.0)).toBe(false);
  });

  test("returns false for pure letters", () => {
    expect(isHighEntropy("abcdefghijklmnopqrstuvwxyz", 20, 4.0)).toBe(false);
  });

  test("returns true for key-like strings", () => {
    expect(isHighEntropy("aBcDeF123456_-XyZabc", 20, 3.5)).toBe(true);
  });
});

describe("residueCheck", () => {
  test("blocks private keys", () => {
    const strings = [
      "-----BEGIN RSA PRIVATE KEY-----\nbase64content\n-----END RSA PRIVATE KEY-----"
    ];
    const result = residueCheck(strings);

    expect(result.blocked).toBe(true);
    expect(result.warnings).toContain(
      "Private key material still detected. Submission is blocked."
    );
  });

  test("warns on token-like strings", () => {
    const strings = ["sk-abc1234567890123456789"];
    const result = residueCheck(strings);

    expect(result.blocked).toBe(false);
    expect(result.warnings.some((w) => w.includes("Token-like"))).toBe(true);
  });

  test("warns on email-like strings", () => {
    const strings = ["contact: someone@company.org"];
    const result = residueCheck(strings);

    expect(result.blocked).toBe(false);
    expect(result.warnings.some((w) => w.includes("Email-like"))).toBe(true);
  });

  test("returns clean for safe content", () => {
    const strings = ["Hello world", "This is safe content"];
    const result = residueCheck(strings);

    expect(result.blocked).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("checkSanitizedObject", () => {
  test("collects strings from nested objects", () => {
    const obj = {
      a: "sk-abc1234567890123456789",
      b: {
        c: "normal text",
        d: ["array item", "another@email.com"]
      }
    };

    const result = checkSanitizedObject(obj);

    expect(result.blocked).toBe(false);
    // Should warn about both token-like and email-like
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("DEFAULT_PATTERNS", () => {
  test("has expected pattern categories", () => {
    const categories = new Set(
      Object.values(DEFAULT_PATTERNS).map((p) => p.category)
    );

    expect(categories.has("secrets")).toBe(true);
    expect(categories.has("pii")).toBe(true);
    expect(categories.has("paths")).toBe(true);
    expect(categories.has("credentials")).toBe(true);
  });

  test("has patterns for common API keys", () => {
    expect(DEFAULT_PATTERNS.openai_key).toBeDefined();
    expect(DEFAULT_PATTERNS.anthropic_key).toBeDefined();
    expect(DEFAULT_PATTERNS.github_token).toBeDefined();
    expect(DEFAULT_PATTERNS.huggingface_token).toBeDefined();
  });
});
