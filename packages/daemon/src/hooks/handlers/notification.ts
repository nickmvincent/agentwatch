/**
 * Notification Hook Handler
 */

import type {
  BaseHookResponse,
  HookHandlerContext,
  NotificationInput
} from "../types";

/**
 * Handle Notification event.
 */
export async function handleNotification(
  input: NotificationInput,
  ctx: HookHandlerContext
): Promise<BaseHookResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;

  // Update session awaiting status based on notification type
  if (input.notification_type === "permission_prompt") {
    hookStore.updateSessionAwaiting(input.session_id, true);
  }

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_notification",
    session_id: input.session_id,
    notification_type: input.notification_type,
    message: input.message,
    timestamp: Date.now()
  });

  // Send notification
  if (config.notifications.enable && config.notifications.hookNotification) {
    await notify({
      type: "info",
      title: "Claude Notification",
      message: input.notification_type,
      subtitle: input.message?.slice(0, 100),
      hookType: "Notification",
      sessionId: input.session_id,
      cwd: input.cwd
    });
  }

  return { status: "ok" };
}
