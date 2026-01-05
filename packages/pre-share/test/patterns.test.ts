import { beforeEach, describe, expect, test } from "bun:test";
import {
  type PatternDefinition,
  PatternManager,
  createPatternManager,
  generateSampleText,
  highlightMatches,
  normalizePattern,
  summarizeTestResults,
  testAllPatterns,
  testPattern,
  validatePattern,
  validatePatterns
} from "../src";

describe("PatternManager", () => {
  let manager: PatternManager;

  beforeEach(() => {
    manager = new PatternManager();
  });

  describe("constructor", () => {
    test("loads default patterns by default", () => {
      const patterns = manager.getDefaultPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.name === "openai_key")).toBe(true);
    });

    test("can skip loading defaults", () => {
      const emptyManager = new PatternManager({ loadDefaults: false });
      expect(emptyManager.getDefaultPatterns()).toHaveLength(0);
    });

    test("accepts initial custom patterns", () => {
      const customManager = new PatternManager({
        initialCustomPatterns: [
          {
            name: "my_pattern",
            placeholder: "MY_SECRET",
            regex: ["SECRET_[A-Z]+"],
            category: "secrets"
          }
        ]
      });
      expect(customManager.getCustomPatterns()).toHaveLength(1);
    });
  });

  describe("getPattern", () => {
    test("returns default patterns by name", () => {
      const pattern = manager.getPattern("openai_key");
      expect(pattern).toBeDefined();
      expect(pattern?.placeholder).toBe("API_KEY");
    });

    test("returns undefined for unknown patterns", () => {
      expect(manager.getPattern("nonexistent")).toBeUndefined();
    });

    test("custom patterns override defaults", () => {
      manager.addCustomPattern({
        name: "openai_key",
        placeholder: "CUSTOM_KEY",
        regex: ["custom-pattern"],
        category: "secrets"
      });
      const pattern = manager.getPattern("openai_key");
      expect(pattern?.placeholder).toBe("CUSTOM_KEY");
    });
  });

  describe("addCustomPattern", () => {
    test("adds valid custom pattern", () => {
      const result = manager.addCustomPattern({
        name: "test_pattern",
        placeholder: "TEST",
        regex: ["test_[0-9]+"],
        category: "secrets"
      });
      expect(result.valid).toBe(true);
      expect(manager.hasPattern("test_pattern")).toBe(true);
    });

    test("rejects invalid patterns", () => {
      const result = manager.addCustomPattern({
        name: "",
        placeholder: "",
        regex: [],
        category: "invalid" as any
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("warns when overriding default pattern", () => {
      const result = manager.addCustomPattern({
        name: "openai_key",
        placeholder: "OVERRIDE",
        regex: ["override"],
        category: "secrets"
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("overrides"))).toBe(true);
    });
  });

  describe("editCustomPattern", () => {
    beforeEach(() => {
      manager.addCustomPattern({
        name: "editable",
        placeholder: "ORIGINAL",
        regex: ["original"],
        category: "secrets"
      });
    });

    test("edits existing custom pattern", () => {
      const result = manager.editCustomPattern("editable", {
        placeholder: "UPDATED"
      });
      expect(result.valid).toBe(true);
      expect(manager.getPattern("editable")?.placeholder).toBe("UPDATED");
    });

    test("cannot edit default patterns", () => {
      const result = manager.editCustomPattern("openai_key", {
        placeholder: "HACKED"
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Cannot edit default pattern");
    });

    test("returns error for nonexistent pattern", () => {
      const result = manager.editCustomPattern("nonexistent", {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });
  });

  describe("removeCustomPattern", () => {
    test("removes custom pattern", () => {
      manager.addCustomPattern({
        name: "removable",
        placeholder: "REMOVE",
        regex: ["remove"],
        category: "secrets"
      });
      expect(manager.removeCustomPattern("removable")).toBe(true);
      expect(manager.hasPattern("removable")).toBe(false);
    });

    test("returns false for nonexistent pattern", () => {
      expect(manager.removeCustomPattern("nonexistent")).toBe(false);
    });
  });

  describe("getPatternsByCategory", () => {
    test("returns patterns filtered by category", () => {
      const secretPatterns = manager.getPatternsByCategory("secrets");
      expect(secretPatterns.length).toBeGreaterThan(0);
      expect(secretPatterns.every((p) => p.category === "secrets")).toBe(true);
    });
  });

  describe("buildPatternSet", () => {
    test("builds pattern set with all patterns", () => {
      const set = manager.buildPatternSet();
      expect(Object.keys(set).length).toBeGreaterThan(0);
      expect(set.openai_key).toBeDefined();
      expect(set.openai_key.regex[0]).toBeInstanceOf(RegExp);
    });

    test("filters by category", () => {
      const set = manager.buildPatternSet({ categories: ["pii"] });
      expect(Object.values(set).every((p) => p.category === "pii")).toBe(true);
    });

    test("filters by name", () => {
      const set = manager.buildPatternSet({ names: ["openai_key", "email"] });
      expect(Object.keys(set)).toContain("openai_key");
      expect(Object.keys(set)).toContain("email");
      expect(Object.keys(set).length).toBe(2);
    });

    test("excludes disabled patterns", () => {
      manager.addCustomPattern({
        name: "disabled_pattern",
        placeholder: "DISABLED",
        regex: ["disabled"],
        category: "secrets",
        enabled: false
      });
      const set = manager.buildPatternSet();
      expect(set.disabled_pattern).toBeUndefined();
    });
  });

  describe("importFromJson/exportToJson", () => {
    test("exports and imports custom patterns", () => {
      manager.addCustomPattern({
        name: "exportable",
        placeholder: "EXPORT",
        regex: ["export_[0-9]+"],
        category: "secrets"
      });

      const json = manager.exportToJson();
      const newManager = new PatternManager({ loadDefaults: false });
      const result = newManager.importFromJson(json);

      expect(result.valid).toBe(true);
      expect(newManager.hasPattern("exportable")).toBe(true);
    });

    test("handles invalid JSON", () => {
      const result = manager.importFromJson("not valid json");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid JSON");
    });

    test("replaces existing patterns when specified", () => {
      manager.addCustomPattern({
        name: "existing",
        placeholder: "OLD",
        regex: ["old"],
        category: "secrets"
      });

      const json = JSON.stringify({
        version: "1.0.0",
        customPatterns: [
          {
            name: "new_pattern",
            placeholder: "NEW",
            regex: ["new"],
            category: "secrets"
          }
        ]
      });

      manager.importFromJson(json, true);
      expect(manager.hasPattern("existing")).toBe(false);
      expect(manager.hasPattern("new_pattern")).toBe(true);
    });
  });

  describe("getSummary", () => {
    test("returns pattern counts", () => {
      manager.addCustomPattern({
        name: "custom1",
        placeholder: "C1",
        regex: ["c1"],
        category: "secrets"
      });

      const summary = manager.getSummary();
      expect(summary.defaultCount).toBeGreaterThan(0);
      expect(summary.customCount).toBe(1);
      expect(summary.byCategory.secrets).toBeGreaterThan(0);
    });
  });
});

describe("createPatternManager", () => {
  test("creates a PatternManager instance", () => {
    const manager = createPatternManager();
    expect(manager).toBeInstanceOf(PatternManager);
  });
});

describe("validatePattern", () => {
  test("validates correct pattern", () => {
    const result = validatePattern({
      name: "valid_pattern",
      placeholder: "VALID",
      regex: ["\\bvalid_[0-9]+\\b"],
      category: "secrets"
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects empty name", () => {
    const result = validatePattern({
      name: "",
      placeholder: "TEST",
      regex: ["test"],
      category: "secrets"
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  test("rejects invalid name format", () => {
    const result = validatePattern({
      name: "123invalid",
      placeholder: "TEST",
      regex: ["test"],
      category: "secrets"
    });
    expect(result.valid).toBe(false);
  });

  test("rejects empty placeholder", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "",
      regex: ["test"],
      category: "secrets"
    });
    expect(result.valid).toBe(false);
  });

  test("warns on placeholder with special characters", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "has-dash",
      regex: ["test"],
      category: "secrets"
    });
    expect(result.warnings.some((w) => w.includes("uppercase"))).toBe(true);
  });

  test("rejects invalid category", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "TEST",
      regex: ["test"],
      category: "invalid" as any
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("category"))).toBe(true);
  });

  test("rejects empty regex array", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "TEST",
      regex: [],
      category: "secrets"
    });
    expect(result.valid).toBe(false);
  });

  test("rejects invalid regex syntax", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "TEST",
      regex: ["[invalid(regex"],
      category: "secrets"
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid regex"))).toBe(true);
  });

  test("warns on catastrophic backtracking patterns", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "TEST",
      regex: ["(a+)+"],
      category: "secrets"
    });
    expect(result.warnings.some((w) => w.includes("backtracking"))).toBe(true);
  });

  test("warns on overly broad patterns", () => {
    const result = validatePattern({
      name: "test",
      placeholder: "TEST",
      regex: [".*"],
      category: "secrets"
    });
    expect(result.warnings.some((w) => w.includes("broad"))).toBe(true);
  });
});

describe("validatePatterns", () => {
  test("validates multiple patterns", () => {
    const result = validatePatterns([
      { name: "p1", placeholder: "P1", regex: ["p1"], category: "secrets" },
      { name: "p2", placeholder: "P2", regex: ["p2"], category: "pii" }
    ]);
    expect(result.valid).toBe(true);
  });

  test("detects duplicate names", () => {
    const result = validatePatterns([
      { name: "dup", placeholder: "D1", regex: ["d1"], category: "secrets" },
      { name: "dup", placeholder: "D2", regex: ["d2"], category: "secrets" }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  test("prefixes errors with pattern name", () => {
    const result = validatePatterns([
      { name: "bad", placeholder: "", regex: [], category: "secrets" }
    ]);
    expect(result.errors.some((e) => e.startsWith("[bad]"))).toBe(true);
  });
});

describe("normalizePattern", () => {
  test("trims whitespace", () => {
    const normalized = normalizePattern({
      name: "  test  ",
      placeholder: "  test  ",
      regex: ["  pattern  "],
      category: "secrets"
    });
    expect(normalized.name).toBe("test");
    expect(normalized.placeholder).toBe("TEST");
    expect(normalized.regex[0]).toBe("pattern");
  });

  test("uppercases placeholder", () => {
    const normalized = normalizePattern({
      name: "test",
      placeholder: "lowercase",
      regex: ["test"],
      category: "secrets"
    });
    expect(normalized.placeholder).toBe("LOWERCASE");
  });

  test("defaults enabled to true", () => {
    const normalized = normalizePattern({
      name: "test",
      placeholder: "TEST",
      regex: ["test"],
      category: "secrets"
    });
    expect(normalized.enabled).toBe(true);
  });

  test("respects explicit enabled: false", () => {
    const normalized = normalizePattern({
      name: "test",
      placeholder: "TEST",
      regex: ["test"],
      category: "secrets",
      enabled: false
    });
    expect(normalized.enabled).toBe(false);
  });
});

describe("testPattern", () => {
  const samplePattern: PatternDefinition = {
    name: "test_numbers",
    placeholder: "NUMBER",
    regex: ["\\b\\d{4}\\b"],
    category: "secrets"
  };

  test("finds matches in text", () => {
    const result = testPattern(samplePattern, "Code 1234 and 5678");
    expect(result.matchCount).toBe(2);
    expect(result.matches[0].match).toBe("1234");
    expect(result.matches[1].match).toBe("5678");
  });

  test("returns empty matches for no matches", () => {
    const result = testPattern(samplePattern, "No numbers here");
    expect(result.matchCount).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  test("includes match index and length", () => {
    const result = testPattern(samplePattern, "Number 1234 here");
    expect(result.matches[0].index).toBe(7);
    expect(result.matches[0].length).toBe(4);
  });

  test("removes duplicate matches", () => {
    const multiRegexPattern: PatternDefinition = {
      name: "multi",
      placeholder: "MULTI",
      regex: ["test", "test"], // Same pattern twice
      category: "secrets"
    };
    const result = testPattern(multiRegexPattern, "test value");
    expect(result.matchCount).toBe(1);
  });
});

describe("testAllPatterns", () => {
  test("tests multiple patterns", () => {
    const patterns: PatternDefinition[] = [
      { name: "p1", placeholder: "P1", regex: ["aaa"], category: "secrets" },
      { name: "p2", placeholder: "P2", regex: ["bbb"], category: "secrets" }
    ];
    const results = testAllPatterns(patterns, "aaa bbb ccc");
    expect(results).toHaveLength(2);
    expect(results[0].matchCount).toBe(1);
    expect(results[1].matchCount).toBe(1);
  });
});

describe("highlightMatches", () => {
  test("highlights matches with default markers", () => {
    const matches = [{ index: 6, length: 4 }]; // "test" starts at index 6 in "Hello test world"
    const result = highlightMatches("Hello test world", matches);
    expect(result).toBe("Hello >>>test<<< world");
  });

  test("uses custom markers", () => {
    const matches = [{ index: 0, length: 5 }];
    const result = highlightMatches("Hello", matches, "[", "]");
    expect(result).toBe("[Hello]");
  });

  test("handles multiple matches", () => {
    const matches = [
      { index: 0, length: 1 }, // "a" at index 0
      { index: 4, length: 1 } // "c" at index 4 in "a b c"
    ];
    const result = highlightMatches("a b c", matches);
    expect(result).toBe(">>>a<<< b >>>c<<<");
  });

  test("returns original text for no matches", () => {
    const result = highlightMatches("no matches", []);
    expect(result).toBe("no matches");
  });
});

describe("summarizeTestResults", () => {
  test("summarizes test results", () => {
    const results: PatternTestResult[] = [
      { patternName: "p1", matches: [], matchCount: 0 },
      {
        patternName: "p2",
        matches: [{ match: "x", index: 0, length: 1 }],
        matchCount: 1
      },
      {
        patternName: "p3",
        matches: [
          { match: "y", index: 0, length: 1 },
          { match: "z", index: 2, length: 1 }
        ],
        matchCount: 2
      }
    ];

    const summary = summarizeTestResults(results);
    expect(summary.totalPatterns).toBe(3);
    expect(summary.patternsWithMatches).toBe(2);
    expect(summary.totalMatches).toBe(3);
    expect(summary.matchesByPattern.p1).toBe(0);
    expect(summary.matchesByPattern.p2).toBe(1);
    expect(summary.matchesByPattern.p3).toBe(2);
  });
});

describe("generateSampleText", () => {
  test("generates sample text with common patterns", () => {
    const sample = generateSampleText();
    expect(sample.length).toBeGreaterThan(0);
    expect(sample).toContain("sk-"); // OpenAI key prefix
    expect(sample).toContain("@"); // Email
    expect(sample).toContain("/Users/"); // Unix path
  });

  test("sample text triggers common patterns", () => {
    const manager = new PatternManager();
    const sample = generateSampleText();
    const patterns = manager.getDefaultPatterns();
    const results = testAllPatterns(patterns, sample);
    const summary = summarizeTestResults(results);

    // Sample text should trigger multiple patterns
    expect(summary.patternsWithMatches).toBeGreaterThan(5);
  });
});

// Type for PatternTestResult (inferred from exports)
interface PatternTestResult {
  patternName: string;
  matches: Array<{ match: string; index: number; length: number }>;
  matchCount: number;
}
