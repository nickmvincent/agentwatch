/**
 * SessionStart Hook Handler
 *
 * Handles SessionStart events with:
 * - Session tracking
 * - Context injection
 * - Env file injection
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import type { SessionSource } from "@agentwatch/core";
import type {
  HookHandlerContext,
  SessionStartInput,
  SessionStartResponse
} from "../types";

const execAsync = promisify(exec);

/**
 * Get git context for context injection.
 */
async function getGitContext(
  cwd: string,
  maxLines: number
): Promise<string | null> {
  try {
    // Get git status
    const { stdout: status } = await execAsync("git status --short", {
      cwd,
      timeout: 5000
    });

    if (!status.trim()) {
      return null;
    }

    const lines = status.split("\n").slice(0, maxLines);
    return `Git status:\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

/**
 * Get project context (README, CLAUDE.md, etc).
 */
function getProjectContext(cwd: string, maxLines: number): string | null {
  const files = [
    ".claude/CLAUDE.md",
    "CLAUDE.md",
    ".claude/README.md",
    "README.md"
  ];

  for (const file of files) {
    const filePath = join(cwd, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").slice(0, maxLines);
        return `Project context (${file}):\n${lines.join("\n")}`;
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Handle SessionStart event.
 */
export async function handleSessionStart(
  input: SessionStartInput,
  ctx: HookHandlerContext
): Promise<SessionStartResponse> {
  const { hookStore, connectionManager, config, notify } = ctx;

  // Validate and normalize source
  const validSources: SessionSource[] = [
    "startup",
    "resume",
    "clear",
    "compact"
  ];
  const source: SessionSource = validSources.includes(
    input.source as SessionSource
  )
    ? (input.source as SessionSource)
    : "startup";

  // Create or update session
  const session = hookStore.sessionStart(
    input.session_id,
    input.transcript_path ?? "",
    input.cwd,
    input.permission_mode ?? "default",
    source
  );

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_session_start",
    session_id: input.session_id,
    cwd: input.cwd,
    source,
    timestamp: Date.now()
  });

  // Send notification
  if (config.notifications.enable && config.notifications.hookSessionStart) {
    await notify({
      type: "info",
      title: "Session Started",
      message: `Session started (${source})`,
      hookType: "SessionStart",
      sessionId: input.session_id,
      cwd: input.cwd
    });
  }

  // Build context to inject
  const contextParts: string[] = [];
  const ci = config.hookEnhancements.contextInjection;

  if (ci.injectGitContext && input.cwd) {
    const gitContext = await getGitContext(input.cwd, ci.maxContextLines);
    if (gitContext) {
      contextParts.push(gitContext);
    }
  }

  if (ci.injectProjectContext && input.cwd) {
    const projectContext = getProjectContext(input.cwd, ci.maxContextLines);
    if (projectContext) {
      contextParts.push(projectContext);
    }
  }

  // Env file injection
  const envInjection = config.hookEnhancements.envFileInjection;
  if (envInjection.enabled && Object.keys(envInjection.staticVars).length > 0) {
    // Note: The actual env file writing would happen here if we had access to $CLAUDE_ENV_FILE
    // For now, we include static vars as additional context
    const envContext = Object.entries(envInjection.staticVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    if (envContext) {
      contextParts.push(`Environment:\n${envContext}`);
    }
  }

  return {
    status: "ok",
    session_id: session.sessionId,
    additionalContext:
      contextParts.length > 0 ? contextParts.join("\n\n") : undefined
  };
}
