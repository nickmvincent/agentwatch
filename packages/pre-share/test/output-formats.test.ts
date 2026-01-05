import { describe, expect, test } from "bun:test";
import {
  generateJsonl,
  generateSessionJsonl,
  redactPathUsername
} from "../src/output/jsonl";
import { generateMarkdown, generateSafeFilename } from "../src/output/markdown";
import { TranscriptSanitizer } from "../src";

describe("JSONL Output", () => {
  describe("generateJsonl", () => {
    test("generates JSONL from entries", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" }
      ];

      const result = generateJsonl(entries, sanitizer);
      const lines = result.trim().split("\n");

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!)).toEqual({ role: "user", content: "Hello" });
      expect(JSON.parse(lines[1]!)).toEqual({
        role: "assistant",
        content: "Hi there!"
      });
    });

    test("sanitizes sensitive content", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "user", content: "My API key is sk-1234567890abcdefghij" }
      ];

      const result = generateJsonl(entries, sanitizer);
      expect(result).not.toContain("sk-1234567890");
      expect(result).toContain("<API_KEY_");
    });

    test("handles empty entries array", () => {
      const sanitizer = new TranscriptSanitizer();
      const result = generateJsonl([], sanitizer);
      expect(result).toBe("\n");
    });

    test("handles entries with nested objects", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me help" },
            { type: "tool_use", name: "Bash", input: { command: "ls" } }
          ]
        }
      ];

      const result = generateJsonl(entries, sanitizer);
      const parsed = JSON.parse(result.trim());

      expect(parsed.content).toHaveLength(2);
      expect(parsed.content[0].type).toBe("text");
      expect(parsed.content[1].type).toBe("tool_use");
    });

    test("handles special characters in content", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "user", content: 'Line 1\nLine 2\t"quoted"' }];

      const result = generateJsonl(entries, sanitizer);
      const parsed = JSON.parse(result.trim());

      expect(parsed.content).toBe('Line 1\nLine 2\t"quoted"');
    });
  });

  describe("generateSessionJsonl", () => {
    test("generates session JSONL with metadata", () => {
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/Users/test/project",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "abc123",
          score: 0.85,
          approxChars: 1000,
          preview: "This is a preview of the session content...",
          sanitized: { messages: [] }
        }
      ];

      const result = generateSessionJsonl(sessions, {
        schemaVersion: "test.v1",
        bundleId: "test-bundle-123",
        contributor: {
          contributorId: "user123",
          license: "CC-BY-4.0",
          aiPreference: "train-genai=yes"
        }
      });

      const parsed = JSON.parse(result.trim());

      expect(parsed.schema_version).toBe("test.v1");
      expect(parsed.bundle_id).toBe("test-bundle-123");
      expect(parsed.source).toBe("claude");
      expect(parsed.contributor.contributor_id).toBe("user123");
      expect(parsed.contributor.license).toBe("CC-BY-4.0");
      expect(parsed.selection.score).toBe(0.85);
    });

    test("redacts username from source path hint", () => {
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/Users/realuser/project/file.jsonl",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "abc123",
          score: 0.5,
          approxChars: 500,
          preview: "preview",
          sanitized: {}
        }
      ];

      const result = generateSessionJsonl(sessions);
      const parsed = JSON.parse(result.trim());

      expect(parsed.source_path_hint).not.toContain("realuser");
      expect(parsed.source_path_hint).toContain("[REDACTED]");
    });

    test("handles multiple sessions", () => {
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/path1",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "hash1",
          score: 0.9,
          approxChars: 1000,
          preview: "preview1",
          sanitized: { id: 1 }
        },
        {
          source: "claude",
          sourcePathHint: "/path2",
          mtimeUtc: "2024-01-02T00:00:00Z",
          rawSha256: "hash2",
          score: 0.8,
          approxChars: 2000,
          preview: "preview2",
          sanitized: { id: 2 }
        }
      ];

      const result = generateSessionJsonl(sessions, { bundleId: "test" });
      const lines = result.trim().split("\n");

      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).data.id).toBe(1);
      expect(JSON.parse(lines[1]!).data.id).toBe(2);
    });

    test("generates unique bundle ID when not provided", () => {
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/path",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "hash",
          score: 0.5,
          approxChars: 100,
          preview: "preview",
          sanitized: {}
        }
      ];

      const result1 = generateSessionJsonl(sessions);
      const result2 = generateSessionJsonl(sessions);

      const bundleId1 = JSON.parse(result1.trim()).bundle_id;
      const bundleId2 = JSON.parse(result2.trim()).bundle_id;

      // Bundle IDs should be different (include random component)
      expect(bundleId1).not.toBe(bundleId2);
    });

    test("truncates long previews in selection", () => {
      const longPreview = "x".repeat(500);
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/path",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "hash",
          score: 0.5,
          approxChars: 100,
          preview: longPreview,
          sanitized: {}
        }
      ];

      const result = generateSessionJsonl(sessions);
      const parsed = JSON.parse(result.trim());

      expect(parsed.selection.preview_redacted.length).toBeLessThanOrEqual(240);
    });

    test("handles missing contributor", () => {
      const sessions = [
        {
          source: "claude",
          sourcePathHint: "/path",
          mtimeUtc: "2024-01-01T00:00:00Z",
          rawSha256: "hash",
          score: 0.5,
          approxChars: 100,
          preview: "preview",
          sanitized: {}
        }
      ];

      const result = generateSessionJsonl(sessions);
      const parsed = JSON.parse(result.trim());

      expect(parsed.contributor).toBeUndefined();
    });
  });

  describe("redactPathUsername", () => {
    test("redacts Unix paths", () => {
      expect(redactPathUsername("/Users/john/project")).toBe(
        "/Users/[REDACTED]/project"
      );
      expect(redactPathUsername("/home/jane/code")).toBe(
        "/home/[REDACTED]/code"
      );
    });

    test("redacts Windows paths", () => {
      expect(redactPathUsername("C:\\Users\\john\\project")).toBe(
        "C:\\Users\\[REDACTED]\\project"
      );
      expect(redactPathUsername("D:\\Users\\Admin\\work")).toBe(
        "D:\\Users\\[REDACTED]\\work"
      );
    });

    test("handles paths without usernames", () => {
      expect(redactPathUsername("/var/log/app.log")).toBe("/var/log/app.log");
      expect(redactPathUsername("/tmp/test")).toBe("/tmp/test");
    });

    test("handles empty or falsy paths", () => {
      expect(redactPathUsername("")).toBe("");
      expect(redactPathUsername(null as unknown as string)).toBe(null);
    });

    test("handles multiple username occurrences", () => {
      const path = "/Users/john/project and /home/jane/code";
      const result = redactPathUsername(path);
      expect(result).not.toContain("john");
      expect(result).not.toContain("jane");
    });
  });
});

describe("Markdown Output", () => {
  describe("generateMarkdown", () => {
    test("generates markdown header", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "user", content: "Hello" }];

      const result = generateMarkdown(entries, sanitizer, {
        sourcePath: "/test/path",
        projectName: "TestProject"
      });

      expect(result).toContain("# Claude Code Session Transcript (Redacted)");
      expect(result).toContain("**Project:** TestProject");
      expect(result).toContain("**Generated:**");
    });

    test("formats user messages", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "user", content: "How do I fix this bug?" }];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## User");
      expect(result).toContain("How do I fix this bug?");
    });

    test("formats assistant messages", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "assistant", content: "I can help you with that." }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## Assistant");
      expect(result).toContain("I can help you with that.");
    });

    test("formats tool messages with tool name", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "tool", name: "Bash", content: "ls output" }];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## Tool: Bash");
    });

    test("formats system messages", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "system", content: "System prompt here" }];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## System");
    });

    test("handles content blocks array", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me run a command" },
            { type: "tool_use", name: "Bash", input: { command: "ls -la" } }
          ]
        }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("Let me run a command");
      expect(result).toContain("**Tool Call: Bash**");
      expect(result).toContain('"command": "ls -la"');
    });

    test("handles tool_result blocks", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        {
          role: "assistant",
          content: [{ type: "tool_result", content: "file1.txt\nfile2.txt" }]
        }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("**Tool Result:**");
      expect(result).toContain("file1.txt");
    });

    test("handles JSON content strings", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "assistant", content: '{"key": "value", "count": 42}' }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("```json");
      expect(result).toContain('"key": "value"');
    });

    test("handles object content", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "assistant", content: { data: "structured", value: 123 } }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("```json");
      expect(result).toContain('"data": "structured"');
    });

    test("sanitizes sensitive content", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "user", content: "My API key is sk-1234567890abcdefghij" }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).not.toContain("sk-1234567890");
      expect(result).toContain("<API_KEY_");
    });

    test("sanitizes source path", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "user", content: "test" }];

      const result = generateMarkdown(entries, sanitizer, {
        sourcePath: "/Users/realuser/project/transcript.jsonl"
      });

      expect(result).not.toContain("realuser");
    });

    test("includes redaction summary", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        { role: "user", content: "Email: user@example.com and sk-apikey123456" }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## Redaction Summary");
      expect(result).toContain("**Total redactions:**");
    });

    test("handles empty entries array", () => {
      const sanitizer = new TranscriptSanitizer();
      const result = generateMarkdown([], sanitizer);

      expect(result).toContain("# Claude Code Session Transcript");
      expect(result).toContain("## Redaction Summary");
      expect(result).toContain("**Total redactions:** 0");
    });

    test("handles unknown role types", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [{ role: "custom_role", content: "Custom content" }];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("## Custom_role");
      expect(result).toContain("Custom content");
    });

    test("handles string blocks in content array", () => {
      const sanitizer = new TranscriptSanitizer();
      const entries = [
        {
          role: "assistant",
          content: ["Plain string block 1", "Plain string block 2"]
        }
      ];

      const result = generateMarkdown(entries, sanitizer);

      expect(result).toContain("Plain string block 1");
      expect(result).toContain("Plain string block 2");
    });

    test("includes warning note at end", () => {
      const sanitizer = new TranscriptSanitizer();
      const result = generateMarkdown([], sanitizer);

      expect(result).toContain(
        "This transcript has been automatically sanitized"
      );
      expect(result).toContain("review manually before sharing");
    });
  });

  describe("generateSafeFilename", () => {
    test("generates filename with timestamp", () => {
      const result = generateSafeFilename("myproject", "session1");

      // Should have format: YYYYMMDD_HHMMSS_project_session
      expect(result).toMatch(/^\d{8}_\d{6}_myproject_session1$/);
    });

    test("sanitizes special characters", () => {
      const result = generateSafeFilename("my/project!", "test@session#1");

      expect(result).not.toContain("/");
      expect(result).not.toContain("!");
      expect(result).not.toContain("@");
      expect(result).not.toContain("#");
    });

    test("truncates long names", () => {
      const longProject = "a".repeat(50);
      const longSession = "b".repeat(50);

      const result = generateSafeFilename(longProject, longSession);

      // Project max 30, session max 20, plus timestamp ~15
      expect(result.length).toBeLessThanOrEqual(80);
    });

    test("handles empty strings", () => {
      const result = generateSafeFilename("", "");

      // Should still generate timestamp
      expect(result).toMatch(/^\d{8}_\d{6}__$/);
    });

    test("preserves dashes and underscores", () => {
      const result = generateSafeFilename("my-project", "test_session");

      expect(result).toContain("my-project");
      expect(result).toContain("test_session");
    });
  });
});
