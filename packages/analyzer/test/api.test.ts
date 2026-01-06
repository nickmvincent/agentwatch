/**
 * Analyzer API Tests
 *
 * Tests for the analyzer REST API endpoints.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createAnalyzerApp, type AnalyzerAppState } from "../src/api";

describe("Analyzer API", () => {
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

  describe("Health & Status", () => {
    it("GET /api/health returns ok", async () => {
      const res = await app.request("/api/health");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });

    it("GET /api/status returns analyzer status", async () => {
      const res = await app.request("/api/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.component).toBe("analyzer");
      expect(typeof data.uptime_seconds).toBe("number");
      expect(data.watcher_url).toBe("http://localhost:8420");
    });
  });

  describe("Browser Lifecycle", () => {
    it("POST /api/heartbeat returns ok", async () => {
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

      // Wait for setTimeout
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(shutdownCalled).toBe(true);
    });
  });

  describe("Enrichments API", () => {
    it("GET /api/enrichments returns empty list", async () => {
      const res = await app.request("/api/enrichments");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toEqual([]);
      expect(data.stats.total).toBe(0);
    });

    it("GET /api/enrichments/workflow-stats returns stats", async () => {
      const res = await app.request("/api/enrichments/workflow-stats");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.total).toBe("number");
      expect(typeof data.reviewed).toBe("number");
    });

    it("GET /api/enrichments/:sessionId returns 501 (placeholder)", async () => {
      const res = await app.request("/api/enrichments/test-session");
      expect(res.status).toBe(501);
    });
  });

  describe("Transcripts API", () => {
    it("GET /api/transcripts returns empty list", async () => {
      const res = await app.request("/api/transcripts");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.transcripts).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("GET /api/transcripts/:id returns 501 (placeholder)", async () => {
      const res = await app.request("/api/transcripts/test-id");
      expect(res.status).toBe(501);
    });
  });

  describe("Analytics API", () => {
    it("GET /api/analytics/overview returns structure", async () => {
      const res = await app.request("/api/analytics/overview");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toBeDefined();
      expect(data.quality).toBeDefined();
      expect(data.costs).toBeDefined();
    });

    it("GET /api/analytics/daily returns empty list", async () => {
      const res = await app.request("/api/analytics/daily");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.days).toEqual([]);
    });
  });

  describe("Annotations API", () => {
    it("GET /api/annotations returns empty list", async () => {
      const res = await app.request("/api/annotations");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.annotations).toEqual([]);
    });

    it("POST /api/annotations/:sessionId returns 501 (placeholder)", async () => {
      const res = await app.request("/api/annotations/test-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: 5 })
      });
      expect(res.status).toBe(501);
    });
  });

  describe("Share API", () => {
    it("GET /api/share/status returns unconfigured", async () => {
      const res = await app.request("/api/share/status");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(false);
      expect(data.authenticated).toBe(false);
    });

    it("POST /api/share/export returns 501 (placeholder)", async () => {
      const res = await app.request("/api/share/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(501);
    });
  });
});
