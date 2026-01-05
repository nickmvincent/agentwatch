/**
 * Contribution API Tests
 *
 * Tests for the contribution preparation endpoints.
 * These tests verify that session IDs are properly handled
 * when preparing data for contribution.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { HookSession } from "@agentwatch/core";
import { Hono } from "hono";

// =============================================================================
// MOCK DATA STORES
// =============================================================================

class MockHookStore {
  private sessions: Map<string, HookSession> = new Map();

  startSession(
    sessionId: string,
    cwd: string,
    permissionMode: string,
    transcriptPath?: string
  ) {
    const session: HookSession = {
      sessionId,
      cwd,
      permissionMode,
      transcriptPath,
      startTime: Date.now(),
      active: true,
      toolCount: 0,
      commits: [],
      toolsUsed: [],
      toolUsages: []
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getSessionToolUsages(sessionId: string) {
    return [];
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

// =============================================================================
// TEST SETUP
// =============================================================================

function createContribTestApp() {
  const app = new Hono();
  const hookStore = new MockHookStore();

  // Mock the contrib/prepare endpoint to verify ID handling
  app.post("/api/contrib/prepare", async (c) => {
    const body = (await c.req.json()) as {
      session_ids?: string[];
      local_ids?: string[];
      redaction: {
        redactSecrets?: boolean;
        redactPii?: boolean;
        redactPaths?: boolean;
      };
      selected_fields?: string[];
      contributor: {
        contributor_id?: string;
        license?: string;
      };
    };

    // Validate session_ids are actual session IDs, not prefixed
    for (const id of body.session_ids ?? []) {
      if (id.startsWith("hooks-") || id.startsWith("local-")) {
        return c.json(
          {
            error: "Invalid session ID format - should not have prefix",
            invalid_id: id
          },
          400
        );
      }
    }

    // Validate local_ids are actual transcript IDs, not prefixed
    for (const id of body.local_ids ?? []) {
      if (id.startsWith("hooks-") || id.startsWith("local-")) {
        return c.json(
          {
            error: "Invalid local ID format - should not have prefix",
            invalid_id: id
          },
          400
        );
      }
    }

    // Check that at least one ID type is provided
    if (
      (!body.session_ids || body.session_ids.length === 0) &&
      (!body.local_ids || body.local_ids.length === 0)
    ) {
      return c.json({ error: "No valid sessions found" }, 400);
    }

    // Check if sessions exist in mock store
    const foundSessions = [];
    for (const id of body.session_ids ?? []) {
      const session = hookStore.getSession(id);
      if (session) {
        foundSessions.push({
          session_id: id,
          source: "claude",
          preview_original: "test content",
          preview_redacted: "test content",
          score: 10,
          approx_chars: 100
        });
      }
    }

    // For local_ids, we just validate format (actual transcripts not mocked)
    for (const id of body.local_ids ?? []) {
      foundSessions.push({
        session_id: id,
        source: "local",
        preview_original: "local content",
        preview_redacted: "local content",
        score: 10,
        approx_chars: 50
      });
    }

    return c.json({
      sessions: foundSessions,
      redaction_report: {
        total_redactions: 0,
        counts_by_category: {},
        enabled_categories: [],
        residue_warnings: [],
        blocked: false
      },
      fields_present: [],
      stats: { totalFieldsStripped: 0 }
    });
  });

  return { app, hookStore };
}

// =============================================================================
// TESTS
// =============================================================================

describe("Contrib API", () => {
  describe("POST /api/contrib/prepare", () => {
    it("accepts valid hook session IDs without prefix", async () => {
      const { app, hookStore } = createContribTestApp();
      hookStore.startSession("abc123", "/project", "default");

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_ids: ["abc123"],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].session_id).toBe("abc123");
    });

    it("accepts valid local transcript IDs without prefix", async () => {
      const { app } = createContribTestApp();

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_ids: ["transcript-xyz"],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].source).toBe("local");
    });

    it("rejects session IDs with hooks- prefix", async () => {
      const { app } = createContribTestApp();

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_ids: ["hooks-abc123"],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("should not have prefix");
    });

    it("rejects local IDs with local- prefix", async () => {
      const { app } = createContribTestApp();

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_ids: ["local-transcript-xyz"],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("should not have prefix");
    });

    it("returns error when no session IDs provided", async () => {
      const { app } = createContribTestApp();

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_ids: [],
          local_ids: [],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("No valid sessions found");
    });

    it("handles mixed hook and local session IDs", async () => {
      const { app, hookStore } = createContribTestApp();
      hookStore.startSession("session-abc", "/project", "default");

      const res = await app.request("/api/contrib/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_ids: ["session-abc"],
          local_ids: ["transcript-xyz"],
          redaction: { redactSecrets: true },
          contributor: { contributor_id: "test" }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toHaveLength(2);
    });
  });
});

// =============================================================================
// ID Mapping Regression Tests
// =============================================================================

describe("ID Mapping Regression Prevention", () => {
  /**
   * This test documents the regression that occurred when ContribPane was
   * refactored to use correlation_id but still filtered by "hooks-"/"local-"
   * prefixes. The frontend should map correlation_ids to backend-specific IDs.
   */
  it("documents the ID mapping requirement", () => {
    // Frontend receives conversations with correlation_id
    const conversation = {
      correlation_id: "corr-123",
      hook_session: { session_id: "hook-abc" },
      transcript: { id: "transcript-xyz" }
    };

    // Frontend should extract backend-specific IDs for API calls
    const hookId = conversation.hook_session?.session_id; // "hook-abc"
    const localId = conversation.transcript?.id; // "transcript-xyz"

    // API expects these IDs WITHOUT prefixes
    expect(hookId).not.toMatch(/^hooks-/);
    expect(localId).not.toMatch(/^local-/);

    // The correlation_id is for frontend selection only
    expect(conversation.correlation_id).not.toBe(hookId);
  });

  /**
   * This test ensures we understand the ID flow:
   * 1. ConversationContext provides conversations with correlation_id
   * 2. User selects by correlation_id
   * 3. extractBackendIds maps correlation_id -> hook_session.session_id / transcript.id
   * 4. API receives the backend-specific IDs
   */
  it("demonstrates correct ID extraction pattern", () => {
    const conversations = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "session-a" },
        transcript: null
      },
      {
        correlation_id: "corr-2",
        hook_session: null,
        transcript: { id: "transcript-b" }
      },
      {
        correlation_id: "corr-3",
        hook_session: { session_id: "session-c" },
        transcript: { id: "transcript-c" }
      }
    ];

    const selectedIds = new Set(["corr-1", "corr-3"]);

    // Extract backend IDs (simulating extractBackendIds helper)
    const hookIds: string[] = [];
    const localIds: string[] = [];

    for (const correlationId of selectedIds) {
      const conv = conversations.find(
        (c) => c.correlation_id === correlationId
      );
      if (!conv) continue;

      if (conv.hook_session?.session_id) {
        hookIds.push(conv.hook_session.session_id);
      }
      if (conv.transcript?.id) {
        localIds.push(conv.transcript.id);
      }
    }

    // Should have extracted the correct IDs
    expect(hookIds).toEqual(["session-a", "session-c"]);
    expect(localIds).toEqual(["transcript-c"]);

    // None should have prefixes
    for (const id of [...hookIds, ...localIds]) {
      expect(id).not.toMatch(/^(hooks-|local-)/);
    }
  });
});

// =============================================================================
// extractBackendIds Unit Tests
// =============================================================================

/**
 * These tests verify the exact logic of extractBackendIds helper function
 * that exists in ContribPane.tsx. The implementation is duplicated here
 * to ensure the contract is maintained.
 */
describe("extractBackendIds Unit Tests", () => {
  // Replicate the extractBackendIds function for testing
  interface MockConversation {
    correlation_id: string;
    hook_session: { session_id: string } | null;
    transcript: { id: string } | null;
  }

  function extractBackendIds(
    ids: Set<string> | string[],
    conversations: MockConversation[]
  ) {
    const hookIds: string[] = [];
    const localIds: string[] = [];

    for (const correlationId of ids) {
      const conv = conversations.find(
        (c) => c.correlation_id === correlationId
      );
      if (!conv) continue;

      if (conv.hook_session?.session_id) {
        hookIds.push(conv.hook_session.session_id);
      }
      if (conv.transcript?.id) {
        localIds.push(conv.transcript.id);
      }
    }

    return { hookIds, localIds };
  }

  it("extracts hook session IDs from conversations", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-sess-1" },
        transcript: null
      }
    ];

    const result = extractBackendIds(new Set(["corr-1"]), conversations);

    expect(result.hookIds).toEqual(["hook-sess-1"]);
    expect(result.localIds).toEqual([]);
  });

  it("extracts transcript IDs from conversations", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: null,
        transcript: { id: "transcript-1" }
      }
    ];

    const result = extractBackendIds(new Set(["corr-1"]), conversations);

    expect(result.hookIds).toEqual([]);
    expect(result.localIds).toEqual(["transcript-1"]);
  });

  it("extracts both hook and transcript IDs when both exist", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-sess-1" },
        transcript: { id: "transcript-1" }
      }
    ];

    const result = extractBackendIds(new Set(["corr-1"]), conversations);

    expect(result.hookIds).toEqual(["hook-sess-1"]);
    expect(result.localIds).toEqual(["transcript-1"]);
  });

  it("ignores correlation IDs not found in conversations", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-sess-1" },
        transcript: null
      }
    ];

    const result = extractBackendIds(
      new Set(["corr-1", "corr-not-found"]),
      conversations
    );

    expect(result.hookIds).toEqual(["hook-sess-1"]);
    expect(result.localIds).toEqual([]);
  });

  it("handles empty selection", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-sess-1" },
        transcript: null
      }
    ];

    const result = extractBackendIds(new Set(), conversations);

    expect(result.hookIds).toEqual([]);
    expect(result.localIds).toEqual([]);
  });

  it("handles empty conversations", () => {
    const result = extractBackendIds(new Set(["corr-1"]), []);

    expect(result.hookIds).toEqual([]);
    expect(result.localIds).toEqual([]);
  });

  it("handles array input instead of Set", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-sess-1" },
        transcript: null
      },
      {
        correlation_id: "corr-2",
        hook_session: null,
        transcript: { id: "transcript-2" }
      }
    ];

    const result = extractBackendIds(["corr-1", "corr-2"], conversations);

    expect(result.hookIds).toEqual(["hook-sess-1"]);
    expect(result.localIds).toEqual(["transcript-2"]);
  });

  it("preserves order of IDs based on selection order", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-a" },
        transcript: null
      },
      {
        correlation_id: "corr-2",
        hook_session: { session_id: "hook-b" },
        transcript: null
      },
      {
        correlation_id: "corr-3",
        hook_session: { session_id: "hook-c" },
        transcript: null
      }
    ];

    // Using array to preserve order
    const result = extractBackendIds(
      ["corr-3", "corr-1", "corr-2"],
      conversations
    );

    expect(result.hookIds).toEqual(["hook-c", "hook-a", "hook-b"]);
  });

  it("handles conversations with null hook_session and transcript", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: null,
        transcript: null
      }
    ];

    const result = extractBackendIds(new Set(["corr-1"]), conversations);

    expect(result.hookIds).toEqual([]);
    expect(result.localIds).toEqual([]);
  });

  it("handles multiple selections with mixed data", () => {
    const conversations: MockConversation[] = [
      {
        correlation_id: "corr-1",
        hook_session: { session_id: "hook-1" },
        transcript: null
      },
      {
        correlation_id: "corr-2",
        hook_session: null,
        transcript: { id: "trans-2" }
      },
      {
        correlation_id: "corr-3",
        hook_session: { session_id: "hook-3" },
        transcript: { id: "trans-3" }
      },
      {
        correlation_id: "corr-4",
        hook_session: null,
        transcript: null
      }
    ];

    const result = extractBackendIds(
      new Set(["corr-1", "corr-2", "corr-3", "corr-4"]),
      conversations
    );

    expect(result.hookIds).toContain("hook-1");
    expect(result.hookIds).toContain("hook-3");
    expect(result.hookIds).toHaveLength(2);

    expect(result.localIds).toContain("trans-2");
    expect(result.localIds).toContain("trans-3");
    expect(result.localIds).toHaveLength(2);
  });
});
