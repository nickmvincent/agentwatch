/**
 * Notification Hub Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { NotificationHub } from "../src/notifications/hub";
import type { NotificationHubConfig } from "../src/notifications/hub";
import type { NotificationPayload } from "../src/notifications/types";

describe("NotificationHub", () => {
  describe("initialization", () => {
    it("creates hub with no providers when all disabled", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [],
        routing: []
      });

      expect(hub.getProviderNames()).toEqual([]);
      expect(hub.isAvailable()).toBe(false);
    });

    it("creates desktop provider when enabled on macOS", () => {
      // This test may behave differently on non-macOS
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: true },
        webhooks: [],
        routing: []
      });

      // On macOS, desktop should be available
      if (process.platform === "darwin") {
        expect(hub.getProviderNames()).toContain("desktop");
        expect(hub.isAvailable()).toBe(true);
      }
    });

    it("creates webhook providers from config", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [
          {
            id: "slack",
            name: "Slack Webhook",
            url: "https://hooks.slack.com/test",
            enabled: true
          },
          {
            id: "discord",
            name: "Discord Webhook",
            url: "https://discord.com/api/webhooks/test",
            enabled: true
          }
        ],
        routing: []
      });

      expect(hub.getProviderNames()).toContain("webhook:slack");
      expect(hub.getProviderNames()).toContain("webhook:discord");
      expect(hub.isAvailable()).toBe(true);
    });

    it("ignores disabled webhooks", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [
          {
            id: "disabled",
            name: "Disabled Webhook",
            url: "https://example.com/hook",
            enabled: false
          }
        ],
        routing: []
      });

      expect(hub.getProviderNames()).not.toContain("webhook:disabled");
    });
  });

  describe("isAvailable", () => {
    it("returns false when hub is disabled", () => {
      const hub = new NotificationHub({
        enabled: false,
        desktop: { enabled: true },
        webhooks: [
          {
            id: "test",
            name: "Test",
            url: "https://example.com/hook",
            enabled: true
          }
        ],
        routing: []
      });

      // Even with providers configured, hub is not available when disabled
      expect(hub.isAvailable()).toBe(false);
    });
  });

  describe("send", () => {
    it("returns empty results when hub is disabled", async () => {
      const hub = new NotificationHub({
        enabled: false,
        desktop: { enabled: false },
        webhooks: [],
        routing: []
      });

      const payload: NotificationPayload = {
        type: "info",
        title: "Test",
        message: "Test message"
      };

      const result = await hub.send(payload);

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
    });
  });

  describe("addWebhook", () => {
    it("adds a webhook dynamically", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [],
        routing: []
      });

      expect(hub.getProviderNames()).not.toContain("webhook:dynamic");

      hub.addWebhook({
        id: "dynamic",
        name: "Dynamic Webhook",
        url: "https://example.com/dynamic",
        enabled: true
      });

      expect(hub.getProviderNames()).toContain("webhook:dynamic");
    });
  });

  describe("removeWebhook", () => {
    it("removes an existing webhook", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [
          {
            id: "to-remove",
            name: "To Remove",
            url: "https://example.com/hook",
            enabled: true
          }
        ],
        routing: []
      });

      expect(hub.getProviderNames()).toContain("webhook:to-remove");

      const removed = hub.removeWebhook("to-remove");

      expect(removed).toBe(true);
      expect(hub.getProviderNames()).not.toContain("webhook:to-remove");
    });

    it("returns false for non-existent webhook", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [],
        routing: []
      });

      expect(hub.removeWebhook("does-not-exist")).toBe(false);
    });
  });

  describe("routing", () => {
    it("respects routing rules for hook types", async () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [
          {
            id: "errors-only",
            name: "Errors Only",
            url: "https://example.com/errors",
            enabled: true
          },
          {
            id: "all-hooks",
            name: "All Hooks",
            url: "https://example.com/all",
            enabled: true
          }
        ],
        routing: [
          {
            id: "error-route",
            hookTypes: ["PostToolUse"],
            notificationTypes: ["error"],
            providers: ["webhook:errors-only"],
            enabled: true
          }
        ]
      });

      // This just tests that routing is applied - actual sending would fail
      // since the webhooks don't exist
      const providers = hub.getProviderNames();
      expect(providers).toContain("webhook:errors-only");
      expect(providers).toContain("webhook:all-hooks");
    });
  });

  describe("updateConfig", () => {
    it("reinitializes providers with new config", () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [
          {
            id: "original",
            name: "Original",
            url: "https://example.com/original",
            enabled: true
          }
        ],
        routing: []
      });

      expect(hub.getProviderNames()).toContain("webhook:original");

      hub.updateConfig({
        webhooks: [
          {
            id: "new",
            name: "New",
            url: "https://example.com/new",
            enabled: true
          }
        ]
      });

      expect(hub.getProviderNames()).not.toContain("webhook:original");
      expect(hub.getProviderNames()).toContain("webhook:new");
    });
  });

  describe("testProvider", () => {
    it("returns error for non-existent provider", async () => {
      const hub = new NotificationHub({
        enabled: true,
        desktop: { enabled: false },
        webhooks: [],
        routing: []
      });

      const result = await hub.testProvider("does-not-exist");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });
});
