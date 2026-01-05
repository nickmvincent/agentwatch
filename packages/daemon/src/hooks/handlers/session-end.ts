/**
 * SessionEnd Hook Handler
 */

import {
  setAutoTags,
  setDiffSnapshot,
  setLoopDetection,
  setOutcomeSignals,
  setQualityScore
} from "../../enrichment-store";
import { computeAllEnrichments } from "../../enrichments";
import type {
  BaseHookResponse,
  HookHandlerContext,
  SessionEndInput
} from "../types";

/**
 * Handle SessionEnd event.
 */
export async function handleSessionEnd(
  input: SessionEndInput,
  ctx: HookHandlerContext
): Promise<BaseHookResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;

  // End the session
  const session = hookStore.sessionEnd(input.session_id);

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_session_end",
    session_id: input.session_id,
    reason: input.reason,
    timestamp: Date.now()
  });

  // Send notification
  if (
    config.notifications.enable &&
    config.notifications.hookSessionEnd &&
    session
  ) {
    const duration = session.endTime
      ? Math.round((session.endTime - session.startTime) / 1000)
      : 0;
    const durationStr =
      duration >= 60
        ? `${Math.floor(duration / 60)}m ${duration % 60}s`
        : `${duration}s`;

    await notify({
      type: "info",
      title: "Session Ended",
      message: `Session ended (${durationStr})`,
      hookType: "SessionEnd",
      sessionId: input.session_id,
      cwd: session.cwd,
      toolCount: session.toolCount,
      inputTokens: session.totalInputTokens,
      outputTokens: session.totalOutputTokens
    });
  }

  // Auto-enrichment: compute and save enrichments for this session
  if (session && session.cwd) {
    try {
      const toolUsages = hookStore.getSessionToolUsages(input.session_id);
      const enrichments = computeAllEnrichments(
        input.session_id,
        session,
        toolUsages,
        session.cwd
      );

      const ref = { hookSessionId: input.session_id };

      // Save each enrichment type
      if (enrichments.autoTags) {
        setAutoTags(ref, enrichments.autoTags, "auto");
      }
      if (enrichments.outcomeSignals) {
        setOutcomeSignals(ref, enrichments.outcomeSignals, "auto");
      }
      if (enrichments.qualityScore) {
        setQualityScore(ref, enrichments.qualityScore, "auto");
      }
      if (enrichments.loopDetection) {
        setLoopDetection(ref, enrichments.loopDetection, "auto");
      }
      if (enrichments.diffSnapshot) {
        setDiffSnapshot(ref, enrichments.diffSnapshot, "auto");
      }
    } catch (err) {
      // Log but don't fail the hook - enrichment is best-effort
      console.error("Auto-enrichment failed:", err);
    }
  }

  return { status: "ok" };
}
