/**
 * Audit module for agentwatch.
 *
 * Provides centralized audit logging for all significant operations.
 *
 * Usage:
 * - Import from "@agentwatch/core" for production logging
 * - Import audit-stub functions when audit logging is not needed
 *
 * Storage: ~/.agentwatch/events.jsonl
 */

// Types (always available)
export * from "./types";

// Production audit log (writes to disk)
export {
  logAuditEvent,
  readAuditLog,
  getAuditStats,
  getAuditLogPath
} from "./audit-log";

// Re-export stub functions with different names for explicit use
export {
  logAuditEvent as logAuditEventStub,
  readAuditLog as readAuditLogStub,
  getAuditStats as getAuditStatsStub,
  getAuditLogPath as getAuditLogPathStub
} from "./audit-stub";
