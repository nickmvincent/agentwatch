/**
 * Stub audit log for analyzer.
 *
 * The analyzer runs on-demand and doesn't need persistent audit logging.
 * Re-exports the stub from core for consistent interface.
 */

export {
  logAuditEventStub as logAuditEvent,
  type AuditCategory,
  type AuditAction,
  type AuditSource
} from "@agentwatch/core";
