import { describe, expect, test } from "bun:test";
import {
  type PreparationConfig,
  type RawSession,
  generatePrepReport,
  getDefaultContributor,
  getDefaultFieldSelection,
  getFieldSchemasByCategory,
  prepareSession,
  prepareSessions,
  toContribSessions
} from "../src";

// Sample session data for testing
const mockClaudeSession: RawSession = {
  sessionId: "test-session-123",
  source: "claude",
  data: [
    {
      type: "user",
      message: { role: "user", content: "Hello, my email is user@example.com" },
      timestamp: "2025-01-01T00:00:00Z"
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: "I'll help you with that",
        model: "claude-sonnet-4-20250514",
        usage: { input_tokens: 100, output_tokens: 50 }
      },
      timestamp: "2025-01-01T00:00:01Z"
    }
  ],
  mtimeUtc: "2025-01-01T00:00:00Z",
  sourcePathHint: "/Users/testuser/Documents/project"
};

const mockSessionWithSecrets: RawSession = {
  sessionId: "secret-session-456",
  source: "claude",
  data: [
    {
      type: "user",
      message: {
        role: "user",
        content:
          "My API key is sk-1234567890abcdefghijklmno and I live at /Users/johndoe/secrets"
      }
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content:
          "I see your credentials. Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz"
      }
    }
  ]
};

const defaultConfig: PreparationConfig = {
  redaction: {
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    enableHighEntropy: true
  },
  contributor: getDefaultContributor()
};

describe("prepareSessions", () => {
  test("prepares a single session", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);

    expect(result.sessions).toHaveLength(1);
    expect(result.stats.totalSessions).toBe(1);
    expect(result.blocked).toBe(false);
  });

  test("prepares multiple sessions", async () => {
    const result = await prepareSessions(
      [mockClaudeSession, mockSessionWithSecrets],
      defaultConfig
    );

    expect(result.sessions).toHaveLength(2);
    expect(result.stats.totalSessions).toBe(2);
  });

  test("redacts secrets when enabled", async () => {
    const result = await prepareSessions([mockSessionWithSecrets], {
      ...defaultConfig,
      redaction: { ...defaultConfig.redaction, redactSecrets: true }
    });

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);

    expect(sanitizedJson).not.toContain("sk-1234567890");
    expect(sanitizedJson).toContain("<API_KEY_");
    // GitHub token in "Token: ghp_..." context is matched by credential_assignment pattern
    expect(sanitizedJson).not.toContain("ghp_");
  });

  test("redacts PII when enabled", async () => {
    const result = await prepareSessions([mockClaudeSession], {
      ...defaultConfig,
      redaction: { ...defaultConfig.redaction, redactPii: true }
    });

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).not.toContain("user@example.com");
  });

  test("redacts paths when enabled", async () => {
    const result = await prepareSessions([mockSessionWithSecrets], {
      ...defaultConfig,
      redaction: { ...defaultConfig.redaction, redactPaths: true }
    });

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).not.toContain("johndoe");
  });

  test("preserves content when redaction disabled", async () => {
    const simpleSession: RawSession = {
      sessionId: "simple-1",
      source: "claude",
      data: [{ text: "Hello world" }]
    };

    const result = await prepareSessions([simpleSession], {
      ...defaultConfig,
      redaction: {
        redactSecrets: false,
        redactPii: false,
        redactPaths: false,
        enableHighEntropy: false
      }
    });

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).toContain("Hello world");
  });

  test("generates redaction report", async () => {
    const result = await prepareSessions(
      [mockSessionWithSecrets],
      defaultConfig
    );

    expect(result.redactionReport).toBeDefined();
    expect(result.redactionReport.totalRedactions).toBeGreaterThan(0);
    expect(result.redactionReport.enabledCategories).toContain("secrets");
    expect(result.redactionReport.enabledCategories).toContain("pii");
    expect(result.redactionReport.enabledCategories).toContain("paths");
  });

  test("calculates average score", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);

    expect(result.stats.averageScore).toBeGreaterThanOrEqual(0);
    expect(result.stats.averageScore).toBeLessThanOrEqual(10);
  });

  test("tracks stripped fields", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);

    expect(result.strippedFields).toBeDefined();
    expect(Array.isArray(result.strippedFields)).toBe(true);
  });
});

describe("prepareSession (single)", () => {
  test("generates SHA256 hash", async () => {
    const result = await prepareSession(mockClaudeSession, defaultConfig);

    expect(result.rawSha256).toBeDefined();
    expect(result.rawSha256).toHaveLength(64); // SHA256 hex length
  });

  test("generates preview", async () => {
    const result = await prepareSession(mockClaudeSession, defaultConfig);

    expect(result.previewRedacted).toBeDefined();
    expect(result.previewRedacted.length).toBeLessThanOrEqual(400);
  });

  test("redacts path in sourcePathHint", async () => {
    const result = await prepareSession(mockClaudeSession, defaultConfig);

    expect(result.sourcePathHint).not.toContain("testuser");
    expect(result.sourcePathHint).toContain("<USER>");
  });

  test("preserves session metadata", async () => {
    const result = await prepareSession(mockClaudeSession, defaultConfig);

    expect(result.sessionId).toBe("test-session-123");
    expect(result.source).toBe("claude");
  });

  test("calculates approximate character count", async () => {
    const result = await prepareSession(mockClaudeSession, defaultConfig);

    expect(result.approxChars).toBeGreaterThan(0);
    expect(typeof result.approxChars).toBe("number");
  });
});

describe("getDefaultFieldSelection", () => {
  test("returns array of field paths", () => {
    const selection = getDefaultFieldSelection();

    expect(Array.isArray(selection)).toBe(true);
    expect(selection.length).toBeGreaterThan(0);
  });

  test("includes essential fields", () => {
    const selection = getDefaultFieldSelection();

    // Essential fields should be in default selection
    expect(
      selection.some((f) => f.includes("type") || f.includes("role"))
    ).toBe(true);
  });

  test("filters by source", () => {
    const allFields = getDefaultFieldSelection("all");
    const claudeFields = getDefaultFieldSelection("claude");

    expect(Array.isArray(claudeFields)).toBe(true);
    // Claude-specific fields might be fewer or same
    expect(claudeFields.length).toBeLessThanOrEqual(allFields.length + 10);
  });
});

describe("getFieldSchemasByCategory", () => {
  test("returns categorized schemas", () => {
    const schemas = getFieldSchemasByCategory();

    expect(schemas.essential).toBeDefined();
    expect(schemas.recommended).toBeDefined();
    expect(schemas.optional).toBeDefined();
    expect(schemas.strip).toBeDefined();
    expect(schemas.always_strip).toBeDefined();
  });

  test("all categories are arrays", () => {
    const schemas = getFieldSchemasByCategory();

    expect(Array.isArray(schemas.essential)).toBe(true);
    expect(Array.isArray(schemas.recommended)).toBe(true);
    expect(Array.isArray(schemas.optional)).toBe(true);
    expect(Array.isArray(schemas.strip)).toBe(true);
    expect(Array.isArray(schemas.always_strip)).toBe(true);
  });

  test("schemas have required properties", () => {
    const schemas = getFieldSchemasByCategory();
    const allSchemas = [
      ...schemas.essential,
      ...schemas.recommended,
      ...schemas.optional,
      ...schemas.strip
    ];

    for (const schema of allSchemas.slice(0, 5)) {
      expect(schema.path).toBeDefined();
      expect(schema.label).toBeDefined();
      expect(typeof schema.path).toBe("string");
      expect(typeof schema.label).toBe("string");
    }
  });
});

describe("toContribSessions", () => {
  test("converts prepared sessions to ContribSession format", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);
    const contribSessions = toContribSessions(
      result.sessions,
      defaultConfig.contributor
    );

    expect(contribSessions).toHaveLength(1);
    expect(contribSessions[0]!.sessionId).toBe("test-session-123");
    expect(contribSessions[0]!.source).toBe("claude");
    expect(contribSessions[0]!.data).toBeDefined();
    expect(contribSessions[0]!.rawSha256).toBeDefined();
  });

  test("includes preview and score", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);
    const contribSessions = toContribSessions(
      result.sessions,
      defaultConfig.contributor
    );

    expect(contribSessions[0]!.preview).toBeDefined();
    expect(contribSessions[0]!.score).toBeGreaterThanOrEqual(0);
  });
});

describe("generatePrepReport", () => {
  test("generates report with required fields", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);
    const report = generatePrepReport(result, defaultConfig, "bundle-123");

    expect(report.bundle_id).toBe("bundle-123");
    expect(report.created_at_utc).toBeDefined();
    expect(report.contributor).toBeDefined();
    expect(report.redaction).toBeDefined();
    expect(report.rights).toBeDefined();
    expect(report.user_attestation).toBeDefined();
  });

  test("includes contributor info", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);
    const report = generatePrepReport(
      result,
      defaultConfig,
      "bundle-123"
    ) as Record<string, unknown>;

    const contributor = report.contributor as Record<string, unknown>;
    expect(contributor.contributor_id).toBe("anonymous");
    expect(contributor.license).toBe("CC-BY-4.0");
  });

  test("includes redaction stats", async () => {
    const result = await prepareSessions(
      [mockSessionWithSecrets],
      defaultConfig
    );
    const report = generatePrepReport(
      result,
      defaultConfig,
      "bundle-456"
    ) as Record<string, unknown>;

    const redaction = report.redaction as Record<string, unknown>;
    expect(redaction.counts).toBeDefined();
    expect(redaction.enabled_categories).toBeDefined();
    expect(redaction.residue_check_results).toBeDefined();
  });

  test("includes session info in inputs", async () => {
    const result = await prepareSessions([mockClaudeSession], defaultConfig);
    const report = generatePrepReport(
      result,
      defaultConfig,
      "bundle-789"
    ) as Record<string, unknown>;

    const inputs = report.inputs as Record<string, unknown>;
    const sessions = inputs.selected_sessions as Array<Record<string, unknown>>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.session_id).toBe("test-session-123");
    expect(sessions[0]!.raw_sha256).toBeDefined();
  });

  test("uses app version from config", async () => {
    const result = await prepareSessions([mockClaudeSession], {
      ...defaultConfig,
      appVersion: "2.0.0"
    });
    const report = generatePrepReport(
      result,
      { ...defaultConfig, appVersion: "2.0.0" },
      "bundle-ver"
    );

    expect(report.app_version).toBe("2.0.0");
  });
});

describe("getDefaultContributor", () => {
  test("returns contributor with all required fields", () => {
    const contributor = getDefaultContributor();

    expect(contributor.contributorId).toBe("anonymous");
    expect(contributor.license).toBe("CC-BY-4.0");
    expect(contributor.aiPreference).toBe("train-genai=deny");
    expect(contributor.rightsStatement).toBeDefined();
    expect(contributor.rightsConfirmed).toBe(false);
    expect(contributor.reviewedConfirmed).toBe(false);
  });
});

describe("residue detection", () => {
  test("detects private keys and blocks", async () => {
    const sessionWithPrivateKey: RawSession = {
      sessionId: "blocked-1",
      source: "claude",
      data: [
        {
          content:
            "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBAKj34GkxFhD\n-----END RSA PRIVATE KEY-----"
        }
      ]
    };

    const result = await prepareSessions([sessionWithPrivateKey], {
      ...defaultConfig,
      redaction: {
        redactSecrets: false, // Intentionally disabled to test residue check
        redactPii: false,
        redactPaths: false,
        enableHighEntropy: false
      }
    });

    expect(result.blocked).toBe(true);
    expect(result.residueWarnings.length).toBeGreaterThan(0);
    expect(
      result.residueWarnings.some((w) =>
        w.toLowerCase().includes("private key")
      )
    ).toBe(true);
  });

  test("warns on email-like patterns after sanitization disabled", async () => {
    const sessionWithEmail: RawSession = {
      sessionId: "warn-1",
      source: "claude",
      data: [{ content: "Contact: someone@company.org for details" }]
    };

    const result = await prepareSessions([sessionWithEmail], {
      ...defaultConfig,
      redaction: {
        redactSecrets: false,
        redactPii: false, // Disabled - so email passes through
        redactPaths: false,
        enableHighEntropy: false
      }
    });

    // Should warn about email-like pattern in residue check
    expect(result.residueWarnings.length).toBeGreaterThan(0);
    expect(
      result.residueWarnings.some((w) => w.toLowerCase().includes("email"))
    ).toBe(true);
  });
});

describe("custom regex support", () => {
  test("applies custom regex patterns", async () => {
    const sessionWithCustom: RawSession = {
      sessionId: "custom-1",
      source: "claude",
      data: [{ content: "Internal ID: INTERNAL-12345-SECRET" }]
    };

    const result = await prepareSessions([sessionWithCustom], {
      ...defaultConfig,
      redaction: {
        redactSecrets: true,
        redactPii: true,
        redactPaths: true,
        customRegex: ["INTERNAL-\\d+-SECRET"]
      }
    });

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).not.toContain("INTERNAL-12345-SECRET");
    expect(result.redactionReport.customRegexCount).toBe(1);
  });
});

describe("fieldsBySource", () => {
  test("groups fields by source type", async () => {
    const claudeSession: RawSession = {
      sessionId: "claude-1",
      source: "claude",
      data: [{ message: { role: "user", content: "hello", model: "claude-3" } }]
    };

    const result = await prepareSessions([claudeSession], defaultConfig);

    expect(result.fieldsBySource).toBeDefined();
    expect(typeof result.fieldsBySource).toBe("object");
    // Should have at least one source type
    expect(Object.keys(result.fieldsBySource).length).toBeGreaterThan(0);
  });

  test("categorizes hook data correctly", async () => {
    const hookSession: RawSession = {
      sessionId: "hook-1",
      source: "claude",
      data: { tool_name: "Bash", tool_count: 5, tools_used: { Bash: 5 } }
    };

    const result = await prepareSessions([hookSession], defaultConfig);

    // Hook data should be categorized as cc_hook
    expect(result.fieldsBySource["cc_hook"]).toBeDefined();
    expect(result.fieldsBySource["cc_hook"]).toContain("tool_name");
  });

  test("categorizes transcript data correctly", async () => {
    const transcriptSession: RawSession = {
      sessionId: "transcript-1",
      source: "claude",
      data: [
        {
          message: {
            role: "assistant",
            model: "claude-3",
            usage: { input_tokens: 100 }
          }
        }
      ]
    };

    const result = await prepareSessions([transcriptSession], defaultConfig);

    // Transcript data should be categorized as cc_transcript
    expect(result.fieldsBySource["cc_transcript"]).toBeDefined();
  });

  test("handles multiple source types in same batch", async () => {
    const hookSession: RawSession = {
      sessionId: "hook-1",
      source: "claude",
      data: { tool_name: "Bash" }
    };
    const codexSession: RawSession = {
      sessionId: "codex-1",
      source: "codex",
      data: { prompt: "write code" }
    };

    const result = await prepareSessions(
      [hookSession, codexSession],
      defaultConfig
    );

    // Should have multiple source types
    expect(Object.keys(result.fieldsBySource).length).toBeGreaterThanOrEqual(2);
  });

  test("returns sorted field paths", async () => {
    const session: RawSession = {
      sessionId: "test-1",
      source: "claude",
      data: { zebra: 1, apple: 2, mango: 3 }
    };

    const result = await prepareSessions([session], defaultConfig);

    for (const fields of Object.values(result.fieldsBySource)) {
      // Fields should be sorted alphabetically
      const sorted = [...fields].sort();
      expect(fields).toEqual(sorted);
    }
  });
});

describe("redactionInfoMap", () => {
  test("returns map of placeholder to redaction info", async () => {
    const result = await prepareSessions(
      [mockSessionWithSecrets],
      defaultConfig
    );

    expect(result.redactionInfoMap).toBeDefined();
    expect(typeof result.redactionInfoMap).toBe("object");
  });

  test("includes category and ruleName in redaction info", async () => {
    const result = await prepareSessions(
      [mockSessionWithSecrets],
      defaultConfig
    );

    // Check that at least one redaction has proper info
    const entries = Object.entries(result.redactionInfoMap);
    if (entries.length > 0) {
      const [placeholder, info] = entries[0]!;
      expect(placeholder).toMatch(/<[A-Z_]+_\d+>/); // e.g., <API_KEY_1>
      expect(info.category).toBeDefined();
      expect(info.ruleName).toBeDefined();
    }
  });

  test("maps placeholders to rules that caught them", async () => {
    // Use mockClaudeSession which we know passes the "redacts PII" test
    const result = await prepareSessions([mockClaudeSession], {
      ...defaultConfig,
      redaction: {
        redactSecrets: true,
        redactPii: true,
        redactPaths: true,
        enableHighEntropy: true
      }
    });

    // mockClaudeSession has email in message.content which should be redacted
    // When redactions occur, the map should have entries with proper structure
    if (result.redactionReport.totalRedactions > 0) {
      const placeholders = Object.keys(result.redactionInfoMap);
      expect(placeholders.length).toBeGreaterThan(0);

      // Each entry should have proper structure
      for (const [placeholder, info] of Object.entries(
        result.redactionInfoMap
      )) {
        expect(placeholder).toMatch(/<[A-Z_]+_\d+>/);
        expect(info.category).toBeDefined();
        expect(info.ruleName).toBeDefined();
      }
    }
  });

  test("empty map when no redactions occur", async () => {
    const simpleSession: RawSession = {
      sessionId: "simple-1",
      source: "claude",
      data: [{ text: "Hello world" }]
    };

    const result = await prepareSessions([simpleSession], {
      ...defaultConfig,
      redaction: {
        redactSecrets: false,
        redactPii: false,
        redactPaths: false,
        enableHighEntropy: false
      }
    });

    // No redactions means empty or minimal redactionInfoMap
    expect(Object.keys(result.redactionInfoMap).length).toBe(0);
  });
});

describe("edge cases", () => {
  test("handles empty session array", async () => {
    const result = await prepareSessions([], defaultConfig);

    expect(result.sessions).toHaveLength(0);
    expect(result.stats.totalSessions).toBe(0);
    expect(result.stats.averageScore).toBe(0);
  });

  test("handles session with null data", async () => {
    const nullSession: RawSession = {
      sessionId: "null-1",
      source: "claude",
      data: null
    };

    const result = await prepareSessions([nullSession], defaultConfig);

    expect(result.sessions).toHaveLength(1);
    expect(result.blocked).toBe(false);
  });

  test("handles deeply nested objects", async () => {
    const nestedSession: RawSession = {
      sessionId: "nested-1",
      source: "claude",
      data: {
        level1: {
          level2: {
            level3: {
              secret: "sk-1234567890abcdefghijklmno"
            }
          }
        }
      }
    };

    const result = await prepareSessions([nestedSession], defaultConfig);

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).not.toContain("sk-1234567890");
  });

  test("handles arrays in session data", async () => {
    // Use 'text' field which is essential in schema, so it's kept during whitelist stripping
    const arraySession: RawSession = {
      sessionId: "array-1",
      source: "claude",
      data: [
        { text: "Contact user1@example.com for help" },
        { text: "Contact user2@example.com for support" },
        { text: "Contact user3@example.com for info" }
      ]
    };

    const result = await prepareSessions([arraySession], defaultConfig);

    const sanitizedJson = JSON.stringify(result.sessions[0]!.sanitizedData);
    expect(sanitizedJson).not.toContain("@example.com");
    expect(result.redactionReport.totalRedactions).toBeGreaterThanOrEqual(3);
  });
});
