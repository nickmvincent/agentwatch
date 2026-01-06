/**
 * Stub audit log for analyzer.
 *
 * The analyzer runs on-demand and doesn't need persistent audit logging.
 * This stub provides the interface expected by copied modules.
 */

export type AuditCategory =
  | "enrichment"
  | "annotation"
  | "share"
  | "transcript"
  | "settings"
  | "contributor";

export type AuditSource = "api" | "hook" | "system" | "user" | "inferred";

/**
 * Log an audit event (no-op in analyzer).
 */
export function logAuditEvent(
  _category: AuditCategory,
  _action: string,
  _entityId: string,
  _description: string,
  _details?: Record<string, unknown>,
  _source?: AuditSource
): void {
  // No-op - analyzer doesn't need persistent audit logging
}
