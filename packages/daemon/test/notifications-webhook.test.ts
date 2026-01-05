/**
 * Webhook Notification Provider Tests
 *
 * Tests for the WebhookNotificationProvider with mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { WebhookNotificationProvider } from "../src/notifications/providers/webhook";
import type {
  NotificationPayload,
  WebhookConfig
} from "../src/notifications/types";

// Store original fetch
const originalFetch = globalThis.fetch;

// Test payload
const testPayload: NotificationPayload = {
  type: "warning",
  title: "Test Alert",
  message: "This is a test message",
  subtitle: "Test Subtitle",
  hookType: "PreToolUse",
  sessionId: "session-123",
  toolName: "Bash",
  metadata: { key: "value" }
};

// Mock successful fetch response
function mockFetchSuccess() {
  return mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK"
    } as Response)
  );
}

// Mock failed fetch response
function mockFetchError(status: number, statusText: string) {
  return mock(() =>
    Promise.resolve({
      ok: false,
      status,
      statusText
    } as Response)
  );
}

describe("WebhookNotificationProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("isAvailable", () => {
    it("returns true when enabled and URL is set", () => {
      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      expect(provider.isAvailable()).toBe(true);
    });

    it("returns false when disabled", () => {
      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: false,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      expect(provider.isAvailable()).toBe(false);
    });

    it("returns false when URL is empty", () => {
      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: ""
      };

      const provider = new WebhookNotificationProvider(config);
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe("send", () => {
    it("sends notification successfully", async () => {
      globalThis.fetch = mockFetchSuccess();

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(true);
      expect(result.provider).toBe("webhook:test-webhook");
      expect(result.error).toBeUndefined();
    });

    it("returns error when not available", async () => {
      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: false,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available");
    });

    it("skips notification when hook type not in filter", async () => {
      globalThis.fetch = mockFetchSuccess();

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        hookTypes: ["Stop", "PostToolUse"] // Not PreToolUse
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload); // testPayload has hookType: PreToolUse

      expect(result.success).toBe(true);
      expect(result.error).toContain("Skipped");
    });

    it("sends notification when hook type matches filter", async () => {
      globalThis.fetch = mockFetchSuccess();

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        hookTypes: ["PreToolUse", "Stop"]
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("sends notification when no hook type filter", async () => {
      globalThis.fetch = mockFetchSuccess();

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook"
        // No hookTypes filter
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(true);
    });

    it("handles HTTP error response", async () => {
      globalThis.fetch = mockFetchError(500, "Internal Server Error");

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        retryCount: 0 // No retries for faster test
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
      expect(result.error).toContain("Internal Server Error");
    });

    it("handles network errors", async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error("Connection refused"))
      );

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        retryCount: 0
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection refused");
    });

    it("handles timeout", async () => {
      globalThis.fetch = mock(
        () =>
          new Promise((_, reject) => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            setTimeout(() => reject(error), 10);
          })
      );

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        retryCount: 0
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Request timeout");
    });

    it("retries on failure", async () => {
      let attempts = 0;
      globalThis.fetch = mock(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: "Server Error"
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK"
        } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        retryCount: 2
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.send(testPayload);

      expect(result.success).toBe(true);
      expect(attempts).toBe(2);
    }, 10000); // Longer timeout for retry delays

    it("sends correct payload format", async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = mock((url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return Promise.resolve({ ok: true } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      await provider.send(testPayload);

      expect(capturedBody).toBeDefined();
      const body = JSON.parse(capturedBody!);

      expect(body.type).toBe("warning");
      expect(body.title).toBe("Test Alert");
      expect(body.message).toBe("This is a test message");
      expect(body.subtitle).toBe("Test Subtitle");
      expect(body.hookType).toBe("PreToolUse");
      expect(body.sessionId).toBe("session-123");
      expect(body.toolName).toBe("Bash");
      expect(body.metadata).toEqual({ key: "value" });
      expect(body.source).toBe("agentwatch");
      expect(body.timestamp).toBeDefined();
    });

    it("uses custom HTTP method", async () => {
      let capturedMethod: string | undefined;
      globalThis.fetch = mock((url: string, init?: RequestInit) => {
        capturedMethod = init?.method;
        return Promise.resolve({ ok: true } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        method: "PUT"
      };

      const provider = new WebhookNotificationProvider(config);
      await provider.send(testPayload);

      expect(capturedMethod).toBe("PUT");
    });

    it("includes custom headers", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = mock((url: string, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return Promise.resolve({ ok: true } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://example.com/webhook",
        headers: {
          Authorization: "Bearer secret-token",
          "X-Custom-Header": "custom-value"
        }
      };

      const provider = new WebhookNotificationProvider(config);
      await provider.send(testPayload);

      expect(capturedHeaders).toBeDefined();
      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Authorization"]).toBe("Bearer secret-token");
      expect(headers["X-Custom-Header"]).toBe("custom-value");
    });

    it("sends to correct URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = mock((url: string) => {
        capturedUrl = url;
        return Promise.resolve({ ok: true } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "Test Webhook",
        enabled: true,
        url: "https://hooks.slack.com/services/xxx/yyy/zzz"
      };

      const provider = new WebhookNotificationProvider(config);
      await provider.send(testPayload);

      expect(capturedUrl).toBe("https://hooks.slack.com/services/xxx/yyy/zzz");
    });
  });

  describe("test", () => {
    it("sends test notification", async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = mock((url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return Promise.resolve({ ok: true } as Response);
      });

      const config: WebhookConfig = {
        id: "test-webhook",
        name: "My Test Webhook",
        enabled: true,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      const result = await provider.test();

      expect(result.success).toBe(true);

      const body = JSON.parse(capturedBody!);
      expect(body.type).toBe("info");
      expect(body.title).toBe("AgentWatch");
      expect(body.message).toBe("Webhook test notification");
      expect(body.subtitle).toContain("My Test Webhook");
      expect(body.metadata.test).toBe(true);
    });
  });

  describe("provider name", () => {
    it("includes webhook ID in name", () => {
      const config: WebhookConfig = {
        id: "slack-alerts",
        name: "Slack Alerts",
        enabled: true,
        url: "https://example.com/webhook"
      };

      const provider = new WebhookNotificationProvider(config);
      expect(provider.name).toBe("webhook:slack-alerts");
    });
  });
});
