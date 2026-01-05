/**
 * Notification Hub Types
 */

/**
 * Notification payload that can be sent through any provider.
 */
export interface NotificationPayload {
  /** Notification type/severity */
  type: "info" | "warning" | "error" | "success";
  /** Main title */
  title: string;
  /** Main message body */
  message: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Hook type that triggered this notification */
  hookType?: string;
  /** Associated session ID */
  sessionId?: string;
  /** Associated tool name */
  toolName?: string;
  /** Play sound (for desktop notifications) */
  sound?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  // Rich context fields for enhanced notifications
  /** Working directory (to derive project name) */
  cwd?: string;
  /** Tool input details (for preview) */
  toolInput?: Record<string, unknown>;
  /** Session tool count */
  toolCount?: number;
  /** Session input tokens */
  inputTokens?: number;
  /** Session output tokens */
  outputTokens?: number;
  /**
   * Session cost in USD (ESTIMATE ONLY)
   * @deprecated Use inputTokens/outputTokens instead for display.
   * Cost is calculated locally with hardcoded pricing and may be inaccurate.
   */
  costUsd?: number;
}

/**
 * Result of sending a notification.
 */
export interface NotificationResult {
  /** Whether the notification was sent successfully */
  success: boolean;
  /** Provider that handled the notification */
  provider: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Notification provider interface.
 */
export interface NotificationProvider {
  /** Provider name for identification */
  readonly name: string;
  /** Check if provider is available/configured */
  isAvailable(): boolean;
  /** Send a notification */
  send(payload: NotificationPayload): Promise<NotificationResult>;
  /** Test the provider connection */
  test(): Promise<NotificationResult>;
}

/**
 * Webhook configuration.
 */
export interface WebhookConfig {
  /** Unique identifier for this webhook */
  id: string;
  /** Display name */
  name: string;
  /** Webhook URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: "POST" | "PUT";
  /** Custom headers */
  headers?: Record<string, string>;
  /** Whether webhook is enabled */
  enabled: boolean;
  /** Hook types that trigger this webhook (empty = all) */
  hookTypes?: string[];
  /** Retry count on failure */
  retryCount?: number;
}

/**
 * Routing rule for notifications.
 */
export interface NotificationRoutingRule {
  /** Rule identifier */
  id: string;
  /** Hook types to match (empty = all) */
  hookTypes?: string[];
  /** Notification types to match (empty = all) */
  notificationTypes?: ("info" | "warning" | "error" | "success")[];
  /** Providers to send to */
  providers: string[];
  /** Whether rule is enabled */
  enabled: boolean;
}
