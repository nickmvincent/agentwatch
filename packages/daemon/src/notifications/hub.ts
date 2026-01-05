/**
 * Notification Hub
 *
 * Coordinates multiple notification providers and routes notifications
 * based on configured rules.
 */

import type { DesktopFormatConfig } from "../config";
import { DesktopNotificationProvider } from "./providers/desktop";
import { WebhookNotificationProvider } from "./providers/webhook";
import type {
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
  NotificationRoutingRule,
  WebhookConfig
} from "./types";

/**
 * Configuration for the NotificationHub.
 */
export interface NotificationHubConfig {
  /** Whether the hub is enabled */
  enabled: boolean;
  /** Desktop notification settings */
  desktop: {
    enabled: boolean;
    format: DesktopFormatConfig;
  };
  /** Webhook configurations */
  webhooks: WebhookConfig[];
  /** Routing rules */
  routing: NotificationRoutingRule[];
}

/**
 * Aggregated result from sending to multiple providers.
 */
export interface NotificationHubResult {
  /** Overall success (true if at least one provider succeeded) */
  success: boolean;
  /** Results from each provider */
  results: NotificationResult[];
}

/**
 * NotificationHub coordinates multiple notification providers.
 */
export class NotificationHub {
  private readonly config: NotificationHubConfig;
  private readonly providers: Map<string, NotificationProvider>;

  constructor(config: NotificationHubConfig) {
    this.config = config;
    this.providers = new Map();

    this.initializeProviders();
  }

  /**
   * Initialize all configured providers.
   */
  private initializeProviders(): void {
    // Desktop provider
    if (this.config.desktop.enabled) {
      const desktop = new DesktopNotificationProvider(this.config.desktop);
      if (desktop.isAvailable()) {
        this.providers.set(desktop.name, desktop);
      }
    }

    // Webhook providers
    for (const webhookConfig of this.config.webhooks) {
      if (webhookConfig.enabled) {
        const webhook = new WebhookNotificationProvider(webhookConfig);
        this.providers.set(webhook.name, webhook);
      }
    }
  }

  /**
   * Check if the hub is enabled and has at least one available provider.
   */
  isAvailable(): boolean {
    return this.config.enabled && this.providers.size > 0;
  }

  /**
   * Get list of available provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Send a notification through all matching providers.
   */
  async send(payload: NotificationPayload): Promise<NotificationHubResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        results: []
      };
    }

    // Determine which providers to use based on routing rules
    const targetProviders = this.resolveProviders(payload);

    if (targetProviders.length === 0) {
      // No routing rules matched - use all available providers
      targetProviders.push(...this.providers.values());
    }

    // Send to all target providers in parallel
    const results = await Promise.all(
      targetProviders.map((provider) => provider.send(payload))
    );

    return {
      success: results.some((r) => r.success),
      results
    };
  }

  /**
   * Test a specific provider.
   */
  async testProvider(providerName: string): Promise<NotificationResult> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      return {
        success: false,
        provider: providerName,
        error: `Provider '${providerName}' not found`
      };
    }

    return provider.test();
  }

  /**
   * Test all providers.
   */
  async testAll(): Promise<NotificationHubResult> {
    const results = await Promise.all(
      Array.from(this.providers.values()).map((p) => p.test())
    );

    return {
      success: results.some((r) => r.success),
      results
    };
  }

  /**
   * Resolve which providers should receive a notification based on routing rules.
   */
  private resolveProviders(
    payload: NotificationPayload
  ): NotificationProvider[] {
    const providers: NotificationProvider[] = [];

    for (const rule of this.config.routing) {
      if (!rule.enabled) continue;

      // Check hook type filter
      if (
        rule.hookTypes &&
        rule.hookTypes.length > 0 &&
        payload.hookType &&
        !rule.hookTypes.includes(payload.hookType)
      ) {
        continue;
      }

      // Check notification type filter
      if (
        rule.notificationTypes &&
        rule.notificationTypes.length > 0 &&
        !rule.notificationTypes.includes(payload.type)
      ) {
        continue;
      }

      // Add matching providers
      for (const providerName of rule.providers) {
        const provider = this.providers.get(providerName);
        if (provider && !providers.includes(provider)) {
          providers.push(provider);
        }
      }
    }

    return providers;
  }

  /**
   * Add a webhook dynamically.
   */
  addWebhook(config: WebhookConfig): void {
    const webhook = new WebhookNotificationProvider(config);
    this.providers.set(webhook.name, webhook);
    this.config.webhooks.push(config);
  }

  /**
   * Remove a webhook by ID.
   */
  removeWebhook(webhookId: string): boolean {
    const providerName = `webhook:${webhookId}`;
    const deleted = this.providers.delete(providerName);

    if (deleted) {
      const index = this.config.webhooks.findIndex((w) => w.id === webhookId);
      if (index !== -1) {
        this.config.webhooks.splice(index, 1);
      }
    }

    return deleted;
  }

  /**
   * Update hub configuration (for runtime updates).
   */
  updateConfig(newConfig: Partial<NotificationHubConfig>): void {
    Object.assign(this.config, newConfig);
    this.providers.clear();
    this.initializeProviders();
  }
}
