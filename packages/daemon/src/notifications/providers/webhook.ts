/**
 * Webhook Notification Provider
 *
 * Sends notifications to configured webhook endpoints.
 * Users can integrate with Slack, Discord, or any webhook-compatible service.
 */

import { NOTIFICATION_HUB } from "@agentwatch/core";
import type {
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
  WebhookConfig
} from "../types";

/**
 * Webhook Notification Provider
 */
export class WebhookNotificationProvider implements NotificationProvider {
  readonly name: string;

  private readonly config: WebhookConfig;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(config: WebhookConfig) {
    this.config = config;
    this.name = `webhook:${config.id}`;
    this.timeoutMs = NOTIFICATION_HUB.WEBHOOK_TIMEOUT_MS;
    this.maxRetries = config.retryCount ?? NOTIFICATION_HUB.WEBHOOK_MAX_RETRIES;
  }

  isAvailable(): boolean {
    return this.config.enabled && Boolean(this.config.url);
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        provider: this.name,
        error: "Webhook not available or disabled"
      };
    }

    // Check if this hook type should trigger this webhook
    if (
      this.config.hookTypes &&
      this.config.hookTypes.length > 0 &&
      payload.hookType &&
      !this.config.hookTypes.includes(payload.hookType)
    ) {
      return {
        success: true,
        provider: this.name,
        error: "Skipped: hook type not in filter"
      };
    }

    const body = this.formatPayload(payload);
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(this.config.url, {
          method: this.config.method ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.config.headers
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return {
            success: true,
            provider: this.name
          };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          lastError = "Request timeout";
        } else {
          lastError = error instanceof Error ? error.message : "Unknown error";
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }

    return {
      success: false,
      provider: this.name,
      error: lastError
    };
  }

  async test(): Promise<NotificationResult> {
    return this.send({
      type: "info",
      title: "AgentWatch",
      message: "Webhook test notification",
      subtitle: `Testing ${this.config.name}`,
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Format payload for the webhook.
   * Can be customized per-webhook using templates in the future.
   */
  private formatPayload(payload: NotificationPayload): Record<string, unknown> {
    // Generic format that works with most webhook services
    return {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      subtitle: payload.subtitle,
      hookType: payload.hookType,
      sessionId: payload.sessionId,
      toolName: payload.toolName,
      metadata: payload.metadata,
      timestamp: new Date().toISOString(),
      source: "agentwatch"
    };
  }
}
