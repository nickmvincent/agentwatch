#!/usr/bin/env bun
/**
 * Agent Wrapper - Emit synthetic hooks for agents without native hook support
 *
 * Usage: bun tools/agent-wrapper/wrap.ts <agent-command> [args...]
 *
 * Example:
 *   bun tools/agent-wrapper/wrap.ts codex "add dark mode"
 *
 * This wrapper:
 * 1. Snapshots git state before
 * 2. Spawns the agent in a PTY
 * 3. Snapshots git state after
 * 4. Emits synthetic hook events for file changes
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const DAEMON_URL = process.env.AGENTWATCH_URL || "http://localhost:8420";

interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

async function getGitStatus(cwd: string): Promise<Map<string, string>> {
  const proc = Bun.spawn(["git", "status", "--porcelain"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const files = new Map<string, string>();
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const status = line.slice(0, 2).trim();
    const path = line.slice(3);
    files.set(path, status);
  }
  return files;
}

async function getGitDiff(cwd: string): Promise<FileChange[]> {
  // Get both staged and unstaged changes
  const proc = Bun.spawn(["git", "diff", "--name-status", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const changes: FileChange[] = [];
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [statusCode, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    let status: FileChange["status"];
    switch (statusCode) {
      case "A":
        status = "added";
        break;
      case "D":
        status = "deleted";
        break;
      default:
        status = "modified";
    }
    changes.push({ path, status });
  }
  return changes;
}

async function postHook(endpoint: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${DAEMON_URL}/api/hooks/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error(`[wrapper] Hook ${endpoint} failed: ${res.status}`);
    }
  } catch (e) {
    // Daemon might not be running - that's ok, we still run the agent
    console.error(`[wrapper] Could not reach daemon: ${e}`);
  }
}

async function emitSessionStart(sessionId: string, cwd: string, agent: string) {
  await postHook("session-start", {
    session_id: sessionId,
    cwd,
    permission_mode: "default",
    source: "startup"
    // No transcript path for non-Claude agents
  });
  console.error(`[wrapper] Session started: ${sessionId} (${agent})`);
}

async function emitSessionEnd(sessionId: string) {
  await postHook("session-end", {
    session_id: sessionId
  });
  console.error(`[wrapper] Session ended: ${sessionId}`);
}

async function emitToolUse(
  sessionId: string,
  cwd: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  success: boolean
) {
  const toolUseId = randomUUID();

  // Pre-tool
  await postHook("pre-tool-use", {
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: toolName,
    tool_input: toolInput,
    cwd
  });

  // Post-tool (immediate, since we're reconstructing after the fact)
  await postHook("post-tool-use", {
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: toolName,
    tool_input: toolInput,
    cwd,
    success,
    duration_ms: 0 // Unknown
  });
}

async function emitFileChanges(
  sessionId: string,
  cwd: string,
  changes: FileChange[]
) {
  for (const change of changes) {
    const toolName = change.status === "added" ? "Write" : "Edit";
    await emitToolUse(
      sessionId,
      cwd,
      toolName,
      { file_path: change.path },
      true
    );
  }
  if (changes.length > 0) {
    console.error(`[wrapper] Emitted ${changes.length} file change events`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: bun wrap.ts <command> [args...]");
    console.error("Example: bun wrap.ts codex 'add dark mode'");
    process.exit(1);
  }

  const cwd = process.cwd();
  const sessionId = randomUUID();
  const agent = args[0];

  // Snapshot git state before
  const beforeStatus = await getGitStatus(cwd);
  console.error(`[wrapper] Git state before: ${beforeStatus.size} dirty files`);

  // Emit session start
  await emitSessionStart(sessionId, cwd, agent);

  // Spawn the agent process with PTY-like behavior
  // Use stdio: "inherit" to pass through terminal
  // Don't use shell: true - it breaks quoted arguments
  const proc = spawn(args[0], args.slice(1), {
    cwd,
    stdio: "inherit"
  });

  // Wait for process to exit
  const exitCode = await new Promise<number>((resolve) => {
    proc.on("exit", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      console.error(`[wrapper] Process error: ${err}`);
      resolve(1);
    });
  });

  // Snapshot git state after
  const afterStatus = await getGitStatus(cwd);
  console.error(`[wrapper] Git state after: ${afterStatus.size} dirty files`);

  // Compute diff and emit synthetic tool events
  const changes: FileChange[] = [];

  // New or modified files
  for (const [path, status] of afterStatus) {
    const wasDirty = beforeStatus.has(path);
    if (!wasDirty || beforeStatus.get(path) !== status) {
      changes.push({
        path,
        status: status.includes("A") || status === "?" ? "added" : "modified"
      });
    }
  }

  // Deleted files (were dirty before, clean now or deleted)
  for (const [path] of beforeStatus) {
    if (!afterStatus.has(path)) {
      // Could be deleted or committed - check if file exists
      const exists = await Bun.file(`${cwd}/${path}`).exists();
      if (!exists) {
        changes.push({ path, status: "deleted" });
      }
    }
  }

  await emitFileChanges(sessionId, cwd, changes);

  // Emit session end
  await emitSessionEnd(sessionId);

  console.error(`[wrapper] Agent exited with code ${exitCode}`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[wrapper] Fatal error: ${err}`);
  process.exit(1);
});
