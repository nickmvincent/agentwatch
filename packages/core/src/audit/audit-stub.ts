/**
 * Stub audit log for browser/analyzer contexts.
 *
 * The analyzer runs in browser-like contexts where we don't want
 * to write to the filesystem. This stub provides the same interface
 * but does nothing.
 *
 * Use this when:
 * - Running in a browser context
 * - Running in a context where audit logging is not needed
 * - Testing without side effects
 */

import type {
  AuditCategory,
  AuditAction,
  AuditEntry,
  AuditStats,
  AuditSource,
  ReadAuditLogOptions
} from "./types";

/**
 * No-op audit logging function.
 * Returns an entry object but does not persist it.
 */
export function logAuditEvent(
  category: AuditCategory,
  action: AuditAction,
  entityId: string,
  description: string,
  details?: Record<string, unknown>,
  source: AuditSource = "api"
): AuditEntry {
  return {
    timestamp: new Date().toISOString(),
    category,
    action,
    entityId,
    description,
    details,
    source
  };
}

/**
 * No-op audit log reader.
 * Returns empty array.
 */
export function readAuditLog(_options: ReadAuditLogOptions = {}): AuditEntry[] {
  return [];
}

/**
 * No-op audit stats.
 * Returns empty stats.
 */
export function getAuditStats(): AuditStats {
  return {
    totalEvents: 0,
    byCategory: {},
    byAction: {}
  };
}

/**
 * Returns empty string for stub.
 */
export function getAuditLogPath(): string {
  return "";
}
