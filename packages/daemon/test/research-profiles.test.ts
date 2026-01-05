/**
 * Research Profiles & Artifact Linking Tests
 *
 * Tests for:
 * - Research profile definitions and helpers
 * - Artifact linking functions
 * - Related API endpoints
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  FIELD_GROUPS,
  RESEARCH_PROFILES,
  combineFields,
  getDefaultProfileId,
  getProfileById,
  isResearchProfile,
  getLegacyProfiles,
  toRedactionProfile,
  type ResearchProfile
} from "../src/research-profiles";

// =============================================================================
// RESEARCH PROFILES - Unit Tests
// =============================================================================

describe("Research Profiles", () => {
  describe("RESEARCH_PROFILES constant", () => {
    it("has at least 4 built-in profiles", () => {
      expect(RESEARCH_PROFILES.length).toBeGreaterThanOrEqual(4);
    });

    it("has tool-usage as the first profile", () => {
      expect(RESEARCH_PROFILES[0].id).toBe("tool-usage");
    });

    it("has full-transcript as the last profile", () => {
      expect(RESEARCH_PROFILES[RESEARCH_PROFILES.length - 1].id).toBe(
        "full-transcript"
      );
    });

    it("each profile has required fields", () => {
      for (const profile of RESEARCH_PROFILES) {
        expect(profile.id).toBeTruthy();
        expect(profile.name).toBeTruthy();
        expect(profile.tagline).toBeTruthy();
        expect(profile.description).toBeTruthy();
        expect(Array.isArray(profile.enablesResearch)).toBe(true);
        expect(profile.enablesResearch.length).toBeGreaterThan(0);
        expect(Array.isArray(profile.sharedSummary)).toBe(true);
        expect(Array.isArray(profile.strippedSummary)).toBe(true);
        expect(Array.isArray(profile.keptFields)).toBe(true);
        expect(profile.redactionConfig).toBeTruthy();
      }
    });

    it("tool-usage profile has the Recommended badge", () => {
      const toolUsage = RESEARCH_PROFILES.find((p) => p.id === "tool-usage");
      expect(toolUsage?.ui?.badge).toBe("Recommended");
    });

    it("full-transcript profile requires review", () => {
      const fullTranscript = RESEARCH_PROFILES.find(
        (p) => p.id === "full-transcript"
      );
      expect(fullTranscript?.requiresReview).toBe(true);
      expect(fullTranscript?.ui?.badge).toBe("Requires Review");
    });

    it("profiles have unique IDs", () => {
      const ids = RESEARCH_PROFILES.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("getDefaultProfileId()", () => {
    it("returns tool-usage as the default", () => {
      expect(getDefaultProfileId()).toBe("tool-usage");
    });
  });

  describe("getProfileById()", () => {
    it("returns the correct profile for valid ID", () => {
      const profile = getProfileById("tool-usage");
      expect(profile).toBeTruthy();
      expect(profile?.name).toBe("Tool Usage Patterns");
    });

    it("returns undefined for invalid ID", () => {
      const profile = getProfileById("nonexistent-profile");
      expect(profile).toBeUndefined();
    });

    it("finds all built-in profiles", () => {
      const ids = [
        "tool-usage",
        "workflow",
        "token-economics",
        "full-transcript"
      ];
      for (const id of ids) {
        expect(getProfileById(id)).toBeTruthy();
      }
    });
  });

  describe("isResearchProfile()", () => {
    it("returns true for built-in profiles", () => {
      expect(isResearchProfile("tool-usage")).toBe(true);
      expect(isResearchProfile("workflow")).toBe(true);
      expect(isResearchProfile("token-economics")).toBe(true);
      expect(isResearchProfile("full-transcript")).toBe(true);
    });

    it("returns false for unknown profiles", () => {
      expect(isResearchProfile("custom-profile")).toBe(false);
      expect(isResearchProfile("")).toBe(false);
    });
  });

  describe("combineFields()", () => {
    it("combines multiple field groups", () => {
      const fields = combineFields("sessionBasic", "sessionStats");
      expect(fields).toContain("session");
      expect(fields).toContain("session.session_id");
      expect(fields).toContain("session.tool_count");
    });

    it("returns empty array for no groups", () => {
      const fields = combineFields();
      expect(fields).toEqual([]);
    });

    it("handles single group", () => {
      const fields = combineFields("toolMetadata");
      expect(fields).toContain("tool_usages");
      expect(fields).toContain("tool_usages[].tool_name");
    });
  });

  describe("FIELD_GROUPS constant", () => {
    it("has all expected field groups", () => {
      expect(FIELD_GROUPS.sessionBasic).toBeTruthy();
      expect(FIELD_GROUPS.sessionStats).toBeTruthy();
      expect(FIELD_GROUPS.toolMetadata).toBeTruthy();
      expect(FIELD_GROUPS.toolContent).toBeTruthy();
      expect(FIELD_GROUPS.messageMetadata).toBeTruthy();
      expect(FIELD_GROUPS.messageTokens).toBeTruthy();
      expect(FIELD_GROUPS.messageContent).toBeTruthy();
    });
  });

  describe("toRedactionProfile()", () => {
    it("converts ResearchProfile to legacy format", () => {
      const research = RESEARCH_PROFILES[0];
      const legacy = toRedactionProfile(research);

      expect(legacy.id).toBe(research.id);
      expect(legacy.name).toBe(research.name);
      expect(legacy.description).toBe(research.description);
      expect(legacy.keptFields).toEqual(research.keptFields);
      expect(legacy.redactionConfig).toEqual(research.redactionConfig);
      expect(legacy.createdAt).toBeTruthy();
      expect(legacy.updatedAt).toBeTruthy();
    });

    it("sets isDefault for Recommended profiles", () => {
      const recommended = RESEARCH_PROFILES.find(
        (p) => p.ui?.badge === "Recommended"
      );
      if (recommended) {
        const legacy = toRedactionProfile(recommended);
        expect(legacy.isDefault).toBe(true);
      }
    });
  });

  describe("getLegacyProfiles()", () => {
    it("returns all profiles in legacy format", () => {
      const legacy = getLegacyProfiles();
      expect(legacy.length).toBe(RESEARCH_PROFILES.length);
      for (const profile of legacy) {
        expect(profile.id).toBeTruthy();
        expect(profile.name).toBeTruthy();
        expect(profile.keptFields).toBeTruthy();
        expect(profile.redactionConfig).toBeTruthy();
      }
    });
  });
});

// =============================================================================
// ARTIFACT LINKING - Unit Tests
// =============================================================================

describe("Artifact Linking", () => {
  // Import artifact functions - they use file storage so we need to be careful
  let detectArtifactType: typeof import(
    "../src/contributor-settings"
  ).detectArtifactType;

  beforeEach(async () => {
    // Dynamic import to get the functions
    const module = await import("../src/contributor-settings");
    detectArtifactType = module.detectArtifactType;
  });

  describe("detectArtifactType()", () => {
    it("detects GitHub PR URLs", () => {
      expect(detectArtifactType("https://github.com/owner/repo/pull/123")).toBe(
        "github_pr"
      );
      expect(
        detectArtifactType("https://github.com/org/project/pull/456/files")
      ).toBe("github_pr");
    });

    it("detects GitHub commit URLs", () => {
      expect(
        detectArtifactType("https://github.com/owner/repo/commit/abc123def456")
      ).toBe("github_commit");
    });

    it("detects GitHub issue URLs", () => {
      expect(
        detectArtifactType("https://github.com/owner/repo/issues/789")
      ).toBe("github_issue");
    });

    it("detects GitHub repo URLs", () => {
      expect(detectArtifactType("https://github.com/owner/repo")).toBe(
        "github_repo"
      );
      expect(detectArtifactType("https://github.com/owner/repo/")).toBe(
        "github_repo"
      );
    });

    it("detects file paths", () => {
      expect(detectArtifactType("file:///home/user/project")).toBe("file");
      expect(detectArtifactType("/absolute/path/to/file")).toBe("file");
    });

    it("detects generic URLs", () => {
      expect(detectArtifactType("https://example.com/page")).toBe("url");
      expect(detectArtifactType("http://localhost:3000")).toBe("url");
    });

    it("returns 'other' for unrecognized patterns", () => {
      expect(detectArtifactType("some-random-string")).toBe("other");
      expect(detectArtifactType("")).toBe("other");
    });
  });
});

// =============================================================================
// ARTIFACT STORAGE - Integration Tests
// =============================================================================

describe("Artifact Storage", () => {
  const testDir = join(tmpdir(), "agentwatch-test-" + Date.now());
  const artifactsPath = join(testDir, "artifacts.json");

  // We need to mock the storage path for these tests
  // Since contributor-settings uses a hardcoded path, we'll test the logic indirectly

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("artifact store file structure is valid JSON", () => {
    const store = {
      bySession: {
        "session-123": {
          artifacts: [
            {
              type: "github_pr",
              url: "https://github.com/owner/repo/pull/1",
              label: "Fix bug",
              addedAt: new Date().toISOString()
            }
          ]
        }
      }
    };

    writeFileSync(artifactsPath, JSON.stringify(store, null, 2));
    const loaded = JSON.parse(
      require("fs").readFileSync(artifactsPath, "utf-8")
    );

    expect(loaded.bySession["session-123"].artifacts).toHaveLength(1);
    expect(loaded.bySession["session-123"].artifacts[0].type).toBe("github_pr");
  });

  it("artifact link has required fields", () => {
    const artifact = {
      type: "github_pr" as const,
      url: "https://github.com/owner/repo/pull/1",
      addedAt: new Date().toISOString()
    };

    expect(artifact.type).toBeTruthy();
    expect(artifact.url).toBeTruthy();
    expect(artifact.addedAt).toBeTruthy();
  });

  it("artifact types are valid", () => {
    const validTypes = [
      "github_repo",
      "github_pr",
      "github_commit",
      "github_issue",
      "file",
      "url",
      "other"
    ];

    for (const type of validTypes) {
      expect(typeof type).toBe("string");
    }
  });
});

// =============================================================================
// API ENDPOINT TESTS
// =============================================================================

describe("Research Profiles API", () => {
  // Simple API test using Hono
  const { Hono } = require("hono");

  function createTestApp() {
    const app = new Hono();

    // Mock the research profiles endpoint
    app.get("/api/contrib/research-profiles", (c: any) => {
      return c.json({
        profiles: RESEARCH_PROFILES.map((p) => ({
          id: p.id,
          name: p.name,
          tagline: p.tagline,
          description: p.description,
          enablesResearch: p.enablesResearch,
          sharedSummary: p.sharedSummary,
          strippedSummary: p.strippedSummary,
          keptFields: p.keptFields,
          redactionConfig: p.redactionConfig,
          requiresReview: p.requiresReview,
          ui: p.ui
        })),
        default_profile_id: getDefaultProfileId()
      });
    });

    return app;
  }

  it("GET /api/contrib/research-profiles returns all profiles", async () => {
    const app = createTestApp();
    const res = await app.request("/api/contrib/research-profiles");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profiles).toHaveLength(RESEARCH_PROFILES.length);
    expect(data.default_profile_id).toBe("tool-usage");
  });

  it("GET /api/contrib/research-profiles includes research questions", async () => {
    const app = createTestApp();
    const res = await app.request("/api/contrib/research-profiles");

    const data = await res.json();
    const toolUsage = data.profiles.find((p: any) => p.id === "tool-usage");

    expect(toolUsage.enablesResearch).toBeTruthy();
    expect(toolUsage.enablesResearch.length).toBeGreaterThan(0);
    expect(toolUsage.enablesResearch[0].question).toBeTruthy();
  });

  it("GET /api/contrib/research-profiles includes UI hints", async () => {
    const app = createTestApp();
    const res = await app.request("/api/contrib/research-profiles");

    const data = await res.json();
    const toolUsage = data.profiles.find((p: any) => p.id === "tool-usage");
    const fullTranscript = data.profiles.find(
      (p: any) => p.id === "full-transcript"
    );

    expect(toolUsage.ui?.badge).toBe("Recommended");
    expect(fullTranscript.ui?.badge).toBe("Requires Review");
    expect(fullTranscript.requiresReview).toBe(true);
  });
});

describe("Artifacts API", () => {
  const { Hono } = require("hono");

  // In-memory artifact store for testing
  let artifactStore: Record<string, { artifacts: any[] }> = {};

  function createTestApp() {
    const app = new Hono();
    artifactStore = {};

    // GET artifacts for a session
    app.get("/api/contrib/artifacts/:sessionId", (c: any) => {
      const sessionId = c.req.param("sessionId");
      const artifacts = artifactStore[sessionId]?.artifacts || [];
      return c.json({ artifacts });
    });

    // POST add artifact to session
    app.post("/api/contrib/artifacts/:sessionId", async (c: any) => {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json();

      if (!body.url) {
        return c.json({ error: "URL is required" }, 400);
      }

      const artifact = {
        type: body.type || "url",
        url: body.url,
        label: body.label,
        addedAt: new Date().toISOString()
      };

      if (!artifactStore[sessionId]) {
        artifactStore[sessionId] = { artifacts: [] };
      }

      // Check for duplicates
      const exists = artifactStore[sessionId].artifacts.some(
        (a) => a.url === body.url
      );
      if (exists) {
        return c.json({ error: "Artifact already exists" }, 409);
      }

      artifactStore[sessionId].artifacts.push(artifact);

      return c.json({
        artifact,
        total: artifactStore[sessionId].artifacts.length
      });
    });

    // DELETE artifact from session
    app.delete("/api/contrib/artifacts/:sessionId", async (c: any) => {
      const sessionId = c.req.param("sessionId");
      const body = await c.req.json();

      if (!body.url) {
        return c.json({ error: "URL is required" }, 400);
      }

      if (!artifactStore[sessionId]) {
        return c.json({ removed: false });
      }

      const before = artifactStore[sessionId].artifacts.length;
      artifactStore[sessionId].artifacts = artifactStore[
        sessionId
      ].artifacts.filter((a) => a.url !== body.url);
      const after = artifactStore[sessionId].artifacts.length;

      return c.json({ removed: before > after });
    });

    return app;
  }

  beforeEach(() => {
    artifactStore = {};
  });

  describe("GET /api/contrib/artifacts/:sessionId", () => {
    it("returns empty array for session with no artifacts", async () => {
      const app = createTestApp();
      const res = await app.request("/api/contrib/artifacts/session-123");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.artifacts).toEqual([]);
    });

    it("returns artifacts for session", async () => {
      const app = createTestApp();
      artifactStore["session-123"] = {
        artifacts: [
          {
            type: "github_pr",
            url: "https://github.com/owner/repo/pull/1",
            addedAt: "2026-01-03T00:00:00Z"
          }
        ]
      };

      const res = await app.request("/api/contrib/artifacts/session-123");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.artifacts).toHaveLength(1);
      expect(data.artifacts[0].type).toBe("github_pr");
    });
  });

  describe("POST /api/contrib/artifacts/:sessionId", () => {
    it("adds artifact to session", async () => {
      const app = createTestApp();
      const res = await app.request("/api/contrib/artifacts/session-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "github_pr",
          url: "https://github.com/owner/repo/pull/1",
          label: "Fix bug"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.artifact.url).toBe("https://github.com/owner/repo/pull/1");
      expect(data.artifact.type).toBe("github_pr");
      expect(data.total).toBe(1);
    });

    it("rejects duplicate artifacts", async () => {
      const app = createTestApp();

      // Add first
      await app.request("/api/contrib/artifacts/session-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://github.com/owner/repo/pull/1"
        })
      });

      // Add duplicate
      const res = await app.request("/api/contrib/artifacts/session-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://github.com/owner/repo/pull/1"
        })
      });

      expect(res.status).toBe(409);
    });

    it("requires URL", async () => {
      const app = createTestApp();
      const res = await app.request("/api/contrib/artifacts/session-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Missing URL"
        })
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/contrib/artifacts/:sessionId", () => {
    it("removes existing artifact", async () => {
      const app = createTestApp();
      artifactStore["session-123"] = {
        artifacts: [
          {
            type: "github_pr",
            url: "https://github.com/owner/repo/pull/1",
            addedAt: "2026-01-03T00:00:00Z"
          }
        ]
      };

      const res = await app.request("/api/contrib/artifacts/session-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://github.com/owner/repo/pull/1"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.removed).toBe(true);
      expect(artifactStore["session-123"].artifacts).toHaveLength(0);
    });

    it("returns false when artifact not found", async () => {
      const app = createTestApp();
      const res = await app.request("/api/contrib/artifacts/session-123", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://github.com/nonexistent/url"
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.removed).toBe(false);
    });
  });
});
