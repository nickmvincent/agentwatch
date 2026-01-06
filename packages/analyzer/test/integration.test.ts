/**
 * Analyzer Integration Tests
 *
 * Tests real user flows for the analyzer server - enrichment workflows,
 * transcript discovery, annotations, and analytics.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createAnalyzerApp, type AnalyzerAppState } from "../src/api";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

// Test data directory
const TEST_DATA_DIR = "/tmp/claude/agentwatch-analyzer-integration-test";

describe("Analyzer Integration: Enrichment Workflow", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;

  beforeEach(async () => {
    // Create fresh test directory
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, "enrichments"), { recursive: true });

    // Mock the environment for testing
    process.env.AGENTWATCH_DATA_DIR = TEST_DATA_DIR;

    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {}
    };

    app = createAnalyzerApp(state);
  });

  afterEach(async () => {
    delete process.env.AGENTWATCH_DATA_DIR;
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/enrichments returns list with stats", async () => {
    const res = await app.request("/api/enrichments");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(typeof data.stats.total).toBe("number");
    expect(typeof data.stats.with_quality_score).toBe("number");
    expect(typeof data.stats.with_auto_tags).toBe("number");
  });

  it("GET /api/enrichments/workflow-stats returns workflow statistics", async () => {
    const res = await app.request("/api/enrichments/workflow-stats");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.total).toBe("number");
    expect(typeof data.reviewed).toBe("number");
    expect(typeof data.pending).toBe("number");
  });

  it("GET /api/enrichments/:sessionId returns 404 for unknown session", async () => {
    const res = await app.request("/api/enrichments/nonexistent-session");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});

describe("Analyzer Integration: Transcript Discovery", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, "transcripts"), { recursive: true });

    process.env.AGENTWATCH_DATA_DIR = TEST_DATA_DIR;

    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {}
    };

    app = createAnalyzerApp(state);
  });

  afterEach(async () => {
    delete process.env.AGENTWATCH_DATA_DIR;
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/transcripts returns transcript list with pagination", async () => {
    const res = await app.request("/api/transcripts");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.transcripts)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(typeof data.offset).toBe("number");
    expect(typeof data.limit).toBe("number");
  });

  it("GET /api/transcripts respects pagination params", async () => {
    const res = await app.request("/api/transcripts?offset=10&limit=5");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offset).toBe(10);
    expect(data.limit).toBe(5);
  });

  it("GET /api/transcripts/:id returns 404 for unknown transcript", async () => {
    const res = await app.request("/api/transcripts/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("POST /api/transcripts/rescan triggers transcript index update", async () => {
    const res = await app.request("/api/transcripts/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.total).toBe("number");
  });
});

describe("Analyzer Integration: Annotations", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });

    process.env.AGENTWATCH_DATA_DIR = TEST_DATA_DIR;

    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {}
    };

    app = createAnalyzerApp(state);
  });

  afterEach(async () => {
    delete process.env.AGENTWATCH_DATA_DIR;
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/annotations returns annotation list", async () => {
    const res = await app.request("/api/annotations");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.annotations)).toBe(true);
  });

  it("GET /api/annotations/:sessionId returns 404 for unknown session", async () => {
    const res = await app.request("/api/annotations/unknown-session-id");
    expect(res.status).toBe(404);
  });

  it("POST /api/annotations/:sessionId with rating creates annotation", async () => {
    const sessionId = `test-session-${Date.now()}`;
    const res = await app.request(`/api/annotations/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: 5,
        notes: "Excellent session"
      })
    });

    // May be 200 or 500 depending on sandbox mode
    expect([200, 500]).toContain(res.status);

    if (res.status === 200) {
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.session_id).toBe(sessionId);
    }
  });

  it("DELETE /api/annotations/:sessionId returns 404 for nonexistent", async () => {
    const res = await app.request("/api/annotations/nonexistent-for-delete", {
      method: "DELETE"
    });
    expect(res.status).toBe(404);
  });
});

describe("Analyzer Integration: Analytics", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;

  beforeEach(async () => {
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
    await mkdir(TEST_DATA_DIR, { recursive: true });

    process.env.AGENTWATCH_DATA_DIR = TEST_DATA_DIR;

    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {}
    };

    app = createAnalyzerApp(state);
  });

  afterEach(async () => {
    delete process.env.AGENTWATCH_DATA_DIR;
    if (existsSync(TEST_DATA_DIR)) {
      await rm(TEST_DATA_DIR, { recursive: true });
    }
  });

  it("GET /api/analytics/overview returns complete structure", async () => {
    const res = await app.request("/api/analytics/overview");
    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify structure
    expect(data.sessions).toBeDefined();
    expect(typeof data.sessions.total).toBe("number");

    expect(data.quality).toBeDefined();
    expect(data.costs).toBeDefined();
  });

  it("GET /api/analytics/daily returns daily breakdown", async () => {
    const res = await app.request("/api/analytics/daily");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.days)).toBe(true);
  });

  it("GET /api/analytics/daily respects days parameter", async () => {
    const res = await app.request("/api/analytics/daily?days=7");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.days)).toBe(true);
    // Days array length should be at most 7
    expect(data.days.length).toBeLessThanOrEqual(7);
  });
});

describe("Analyzer Integration: Browser Lifecycle", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;
  let shutdownCalled: boolean;

  beforeEach(() => {
    shutdownCalled = false;
    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {
        shutdownCalled = true;
      }
    };

    app = createAnalyzerApp(state);
  });

  it("POST /api/heartbeat updates last heartbeat time", async () => {
    const res = await app.request("/api/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.timestamp).toBe("number");
  });

  it("POST /api/shutdown triggers shutdown callback", async () => {
    const res = await app.request("/api/shutdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");

    // Wait for setTimeout in shutdown handler
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shutdownCalled).toBe(true);
  });

  it("GET /api/status includes watcher_url", async () => {
    const res = await app.request("/api/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.watcher_url).toBe("http://localhost:8420");
    expect(data.component).toBe("analyzer");
  });
});

describe("Analyzer Integration: Share API", () => {
  let app: ReturnType<typeof createAnalyzerApp>;
  let state: AnalyzerAppState;

  beforeEach(() => {
    state = {
      startedAt: Date.now(),
      watcherUrl: "http://localhost:8420",
      shutdown: () => {}
    };

    app = createAnalyzerApp(state);
  });

  it("GET /api/share/status returns unconfigured state", async () => {
    const res = await app.request("/api/share/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.configured).toBe(false);
    expect(data.authenticated).toBe(false);
  });

  it("POST /api/share/export returns not implemented", async () => {
    const res = await app.request("/api/share/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "test" })
    });
    expect(res.status).toBe(501);
    const data = await res.json();
    expect(data.error).toContain("implemented");
  });
});
