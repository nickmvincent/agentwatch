/**
 * Hook Handler Types
 *
 * Shared types for hook handlers.
 */

import type { HookSession, ToolUsage } from "@agentwatch/core";
import type { HookStore } from "@agentwatch/monitor";
import type { Config } from "../config";
import type { ConnectionManager } from "../connection-manager";
import type { DecisionEngine } from "../decisions/engine";
import type { RuleEngine } from "../rules/engine";

// =============================================================================
// Handler Context
// =============================================================================

/**
 * Shared context passed to all hook handlers.
 */
export interface HookHandlerContext {
  /** Current configuration */
  config: Config;
  /** Hook data store */
  hookStore: HookStore;
  /** Rule engine instance */
  ruleEngine: RuleEngine;
  /** Decision engine instance */
  decisionEngine: DecisionEngine;
  /** WebSocket connection manager */
  connectionManager: ConnectionManager;
  /** Notification function */
  notify: (payload: NotificationPayload) => Promise<void>;
}

/**
 * Notification payload for hook events.
 */
export interface NotificationPayload {
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  subtitle?: string;
  hookType?: string;
  sessionId?: string;
  toolName?: string;
  cwd?: string;
  toolInput?: Record<string, unknown>;
  toolCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  /**
   * @deprecated Use inputTokens/outputTokens instead.
   * Cost is an estimate based on hardcoded pricing and may be inaccurate.
   */
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Hook Input Types (from Claude Code)
// =============================================================================

/**
 * Common fields in all hook inputs.
 */
export interface BaseHookInput {
  session_id: string;
  cwd: string;
  permission_mode?: string;
  transcript_path?: string;
}

/**
 * SessionStart hook input.
 */
export interface SessionStartInput extends BaseHookInput {
  source?: "startup" | "resume" | "clear" | "compact";
}

/**
 * SessionEnd hook input.
 */
export interface SessionEndInput extends BaseHookInput {
  reason?: string;
}

/**
 * PreToolUse hook input.
 */
export interface PreToolUseInput extends BaseHookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

/**
 * PostToolUse hook input.
 */
export interface PostToolUseInput extends BaseHookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  tool_response?: Record<string, unknown>;
  error?: string;
}

/**
 * PermissionRequest hook input.
 */
export interface PermissionRequestInput extends BaseHookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  action?: string;
}

/**
 * UserPromptSubmit hook input.
 */
export interface UserPromptSubmitInput extends BaseHookInput {
  prompt?: string;
  user_message?: string;
}

/**
 * Notification hook input.
 */
export interface NotificationInput extends BaseHookInput {
  notification_type: string;
  message?: string;
}

/**
 * Stop hook input.
 */
export interface StopInput extends BaseHookInput {
  stop_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
  stop_hook_active?: boolean;
}

/**
 * SubagentStop hook input.
 */
export interface SubagentStopInput extends BaseHookInput {
  subagent_id?: string;
  tool_use_id?: string;
  stop_reason?: string;
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * PreCompact hook input.
 */
export interface PreCompactInput extends BaseHookInput {
  compact_type?: "manual" | "auto";
  trigger?: "manual" | "auto";
  custom_instructions?: string;
}

// =============================================================================
// Hook Response Types
// =============================================================================

/**
 * Base response type.
 */
export interface BaseHookResponse {
  status?: "ok" | "error" | "blocked";
}

/**
 * SessionStart response.
 */
export interface SessionStartResponse extends BaseHookResponse {
  session_id?: string;
  additionalContext?: string;
}

/**
 * PreToolUse response.
 */
export interface PreToolUseResponse extends BaseHookResponse {
  decision: "approve" | "block" | "deny";
  reason?: string;
  updatedInput?: Record<string, unknown>;
  ruleId?: string;
  source?: string;
}

/**
 * PostToolUse response.
 */
export interface PostToolUseResponse extends BaseHookResponse {
  decision?: "block";
  reason?: string;
  additionalContext?: string;
}

/**
 * PermissionRequest response.
 */
export interface PermissionRequestResponse extends BaseHookResponse {
  decision?: "allow" | "deny";
  reason?: string;
}

/**
 * UserPromptSubmit response.
 */
export interface UserPromptSubmitResponse extends BaseHookResponse {
  decision?: "block";
  reason?: string;
  additionalContext?: string;
  warnings?: string[];
}

/**
 * Stop response.
 */
export interface StopResponse extends BaseHookResponse {
  continue?: boolean;
  systemMessage?: string;
  blockedBy?: string[];
  costWarning?: {
    type: string;
    current: number;
    limit: number;
  };
}

/**
 * SubagentStop response.
 */
export interface SubagentStopResponse extends BaseHookResponse {
  decision?: "block";
  reason?: string;
}

/**
 * PreCompact response.
 */
export interface PreCompactResponse extends BaseHookResponse {
  preserveContext?: string;
  suggestedStrategy?: string;
}

// =============================================================================
// Handler Function Types
// =============================================================================

export type SessionStartHandler = (
  input: SessionStartInput,
  ctx: HookHandlerContext
) => Promise<SessionStartResponse>;

export type SessionEndHandler = (
  input: SessionEndInput,
  ctx: HookHandlerContext
) => Promise<BaseHookResponse>;

export type PreToolUseHandler = (
  input: PreToolUseInput,
  ctx: HookHandlerContext
) => Promise<PreToolUseResponse>;

export type PostToolUseHandler = (
  input: PostToolUseInput,
  ctx: HookHandlerContext
) => Promise<PostToolUseResponse>;

export type PermissionRequestHandler = (
  input: PermissionRequestInput,
  ctx: HookHandlerContext
) => Promise<PermissionRequestResponse>;

export type UserPromptSubmitHandler = (
  input: UserPromptSubmitInput,
  ctx: HookHandlerContext
) => Promise<UserPromptSubmitResponse>;

export type NotificationHandler = (
  input: NotificationInput,
  ctx: HookHandlerContext
) => Promise<BaseHookResponse>;

export type StopHandler = (
  input: StopInput,
  ctx: HookHandlerContext
) => Promise<StopResponse>;

export type SubagentStopHandler = (
  input: SubagentStopInput,
  ctx: HookHandlerContext
) => Promise<SubagentStopResponse>;

export type PreCompactHandler = (
  input: PreCompactInput,
  ctx: HookHandlerContext
) => Promise<PreCompactResponse>;
