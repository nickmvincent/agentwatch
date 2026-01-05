/**
 * Tests for bundle creation functionality.
 */

import { describe, expect, it } from "bun:test";
import { unzipSync } from "fflate";
import { createBundle, makeBundleId } from "../src/output/bundle";
import type { ContribSession, ContributorMeta } from "../src/types/contrib";
import type { RedactionReport } from "../src/types/sanitizer";

describe("makeBundleId", () => {
  it("generates ID with timestamp and contributor", () => {
    const id = makeBundleId("TestUser");
    expect(id).toMatch(/^\d{8}T\d{6}Z_testuser_[a-z0-9]+$/);
  });

  it("handles empty contributor ID", () => {
    const id = makeBundleId("");
    expect(id).toContain("anonymous");
  });

  it("sanitizes special characters", () => {
    const id = makeBundleId("user@example.com");
    expect(id).not.toContain("@");
    expect(id).not.toContain(".");
  });
});

describe("createBundle", () => {
  const mockSession: ContribSession & {
    sanitized: unknown;
    previewRedacted: string;
  } = {
    sessionId: "test-session-123",
    source: "claude",
    rawSha256: "abc123def456",
    mtimeUtc: "2024-01-15T10:30:00Z",
    preview: "This is a test preview",
    previewRedacted: "This is a redacted preview",
    score: 8.5,
    approxChars: 1000,
    sourcePathHint: "/Users/testuser/project/.claude/test.jsonl",
    filePath: "test.jsonl",
    sanitized: { messages: [{ role: "user", content: "Hello" }] }
  };

  const mockContributor: ContributorMeta = {
    contributorId: "test-contributor",
    license: "CC-BY-4.0",
    aiPreference: "train-genai=ok",
    rightsStatement: "I have the right to share this data",
    rightsConfirmed: true,
    reviewedConfirmed: true
  };

  const mockRedaction: RedactionReport = {
    totalRedactions: 5,
    countsByCategory: { secrets: 3, pii: 2 },
    enabledCategories: ["secrets", "pii"],
    residueWarnings: [],
    blocked: false
  };

  it("creates a valid ZIP bundle", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    expect(result.bundleBytes).toBeInstanceOf(Uint8Array);
    expect(result.bundleBytes.length).toBeGreaterThan(0);
    expect(result.bundleId).toBeTruthy();
    expect(result.transcriptsCount).toBe(1);
  });

  it("includes required files in ZIP", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    const unzipped = unzipSync(result.bundleBytes);
    expect(unzipped["transcripts.jsonl"]).toBeDefined();
    expect(unzipped["prep_report.json"]).toBeDefined();
    expect(unzipped["manifest.json"]).toBeDefined();
  });

  it("generates valid manifest with file hashes", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    expect(result.manifest.bundle_id).toBe(result.bundleId);
    expect(result.manifest.files).toHaveLength(3);

    for (const file of result.manifest.files) {
      expect(file.path).toBeTruthy();
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
  });

  it("generates valid prep report", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    expect(result.prepReport.app_version).toBe("1.0.0");
    expect(result.prepReport.bundle_id).toBe(result.bundleId);
    expect(result.prepReport.contributor.contributor_id).toBe(
      "test-contributor"
    );
    expect(result.prepReport.contributor.license).toBe("CC-BY-4.0");
    expect(result.prepReport.inputs.selected_sessions).toHaveLength(1);
    expect(result.prepReport.redaction.counts).toEqual({ secrets: 3, pii: 2 });
    expect(result.prepReport.user_attestation.attestation_id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
  });

  it("redacts username from source path hint", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    const unzipped = unzipSync(result.bundleBytes);
    const transcripts = new TextDecoder().decode(unzipped["transcripts.jsonl"]);
    const parsed = JSON.parse(transcripts.trim());

    expect(parsed.source_path_hint).not.toContain("testuser");
    expect(parsed.source_path_hint).toContain("[REDACTED]");
  });

  it("handles multiple sessions", async () => {
    const session2 = {
      ...mockSession,
      sessionId: "test-session-456",
      rawSha256: "xyz789abc"
    };

    const result = await createBundle({
      sessions: [mockSession, session2],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction
    });

    expect(result.transcriptsCount).toBe(2);

    const unzipped = unzipSync(result.bundleBytes);
    const transcripts = new TextDecoder().decode(unzipped["transcripts.jsonl"]);
    const lines = transcripts.trim().split("\n");
    expect(lines).toHaveLength(2);
  });

  it("throws on empty sessions", async () => {
    await expect(
      createBundle({
        sessions: [],
        contributor: mockContributor,
        appVersion: "1.0.0",
        redaction: mockRedaction
      })
    ).rejects.toThrow("No sanitized sessions to bundle");
  });

  it("includes manifest SHA256 if provided", async () => {
    const result = await createBundle({
      sessions: [mockSession],
      contributor: mockContributor,
      appVersion: "1.0.0",
      redaction: mockRedaction,
      manifestSha256: "abc123456789"
    });

    expect(result.prepReport.inputs.raw_export_manifest_sha256).toBe(
      "abc123456789"
    );
  });
});
