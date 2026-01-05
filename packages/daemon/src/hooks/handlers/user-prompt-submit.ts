/**
 * UserPromptSubmit Hook Handler
 *
 * Handles UserPromptSubmit events with:
 * - Prompt validation
 * - Context injection
 * - Pattern matching
 */

import type { PatternRule } from "../../config";
import type {
  HookHandlerContext,
  UserPromptSubmitInput,
  UserPromptSubmitResponse
} from "../types";

/**
 * Check if a prompt matches a pattern rule.
 */
function matchesPattern(prompt: string, rule: PatternRule): boolean {
  if (rule.isRegex) {
    try {
      const flags = rule.caseSensitive ? "" : "i";
      const regex = new RegExp(rule.pattern, flags);
      return regex.test(prompt);
    } catch {
      return false;
    }
  } else {
    const normalizedPrompt = rule.caseSensitive ? prompt : prompt.toLowerCase();
    const normalizedPattern = rule.caseSensitive
      ? rule.pattern
      : rule.pattern.toLowerCase();
    return normalizedPrompt.includes(normalizedPattern);
  }
}

/**
 * Get recent errors from the session for context injection.
 */
function getRecentErrors(
  ctx: HookHandlerContext,
  sessionId: string,
  maxLines: number
): string | null {
  const usages = ctx.hookStore.getSessionToolUsages(sessionId);
  const errors = usages
    .filter((u) => !u.success && u.error)
    .slice(-5) // Last 5 errors
    .map((u) => `[${u.toolName}] ${u.error}`)
    .join("\n");

  if (!errors) return null;

  const lines = errors.split("\n").slice(0, maxLines);
  return `Recent errors:\n${lines.join("\n")}`;
}

/**
 * Handle UserPromptSubmit event.
 */
export async function handleUserPromptSubmit(
  input: UserPromptSubmitInput,
  ctx: HookHandlerContext
): Promise<UserPromptSubmitResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;
  const prompt = input.prompt ?? input.user_message ?? "";
  const promptLength = prompt.length;

  // Update session as not awaiting (user just submitted)
  hookStore.updateSessionAwaiting(input.session_id, false);

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_user_prompt_submit",
    session_id: input.session_id,
    prompt_length: promptLength,
    timestamp: Date.now()
  });

  // Send notification
  if (
    config.notifications.enable &&
    config.notifications.hookUserPromptSubmit
  ) {
    await notify({
      type: "info",
      title: "Prompt Submitted",
      message: `Prompt received (${promptLength} chars)`,
      hookType: "UserPromptSubmit",
      sessionId: input.session_id,
      cwd: input.cwd
    });
  }

  // Validate prompt if enabled
  const validation = config.hookEnhancements.promptValidation;

  if (validation.enabled) {
    // Check length constraints
    if (promptLength < validation.minLength) {
      return {
        decision: "block",
        reason: `Prompt too short (minimum ${validation.minLength} characters)`
      };
    }

    if (promptLength > validation.maxLength) {
      return {
        decision: "block",
        reason: `Prompt too long (maximum ${validation.maxLength} characters)`
      };
    }

    // Check block patterns
    for (const pattern of validation.blockPatterns) {
      if (matchesPattern(prompt, pattern)) {
        return {
          decision: "block",
          reason: pattern.message || "Prompt blocked by pattern rule"
        };
      }
    }

    // Check warn patterns
    const warnings: string[] = [];
    for (const pattern of validation.warnPatterns) {
      if (matchesPattern(prompt, pattern)) {
        warnings.push(pattern.message || "Warning: prompt matches pattern");
      }
    }

    if (warnings.length > 0) {
      // Continue but include warnings in context
      const contextParts: string[] = [];

      // Add context injection
      const ci = config.hookEnhancements.contextInjection;
      if (ci.injectRecentErrors) {
        const errors = getRecentErrors(
          ctx,
          input.session_id,
          ci.maxContextLines
        );
        if (errors) {
          contextParts.push(errors);
        }
      }

      return {
        status: "ok",
        warnings,
        additionalContext:
          contextParts.length > 0 ? contextParts.join("\n\n") : undefined
      };
    }
  }

  // Context injection
  const contextParts: string[] = [];
  const ci = config.hookEnhancements.contextInjection;

  if (ci.injectRecentErrors) {
    const errors = getRecentErrors(ctx, input.session_id, ci.maxContextLines);
    if (errors) {
      contextParts.push(errors);
    }
  }

  return {
    status: "ok",
    additionalContext:
      contextParts.length > 0 ? contextParts.join("\n\n") : undefined
  };
}
