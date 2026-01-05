/**
 * Process Runner: Daemon-side agent process spawning
 *
 * Enables the web UI to launch agent runs by handling:
 * - Agent command construction (always print mode from web)
 * - Principles injection into prompts
 * - Process lifecycle tracking
 * - Output collection
 */

import type { SessionStore } from "@agentwatch/monitor";

/** Supported agent types */
export type AgentType = "claude" | "codex" | "gemini";

/** Agent command configurations (relative names - will be resolved to full paths) */
export const AGENT_COMMANDS: Record<
  AgentType,
  { interactive: string[]; print: string[] }
> = {
  claude: {
    interactive: ["claude"],
    print: ["claude", "--print"]
  },
  codex: {
    interactive: ["codex"],
    print: ["codex", "--quiet"]
  },
  gemini: {
    interactive: ["gemini"],
    print: ["gemini"]
  }
};

/** Cache for resolved binary paths */
const resolvedBinaryPaths: Map<string, string | null> = new Map();

/**
 * Resolve a binary name to its full path using common installation locations.
 * Caches results for efficiency.
 */
async function resolveBinaryPath(binaryName: string): Promise<string | null> {
  if (resolvedBinaryPaths.has(binaryName)) {
    return resolvedBinaryPaths.get(binaryName)!;
  }

  // Common paths where CLI tools are installed
  const searchPaths = [
    `/opt/homebrew/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    `${process.env.HOME}/.bun/bin/${binaryName}`,
    `${process.env.HOME}/.local/bin/${binaryName}`,
    `${process.env.HOME}/.nvm/versions/node/*/bin/${binaryName}`,
    `/usr/bin/${binaryName}`
  ];

  for (const path of searchPaths) {
    // Handle glob patterns in paths
    if (path.includes("*")) {
      try {
        const glob = new Bun.Glob(path);
        for await (const match of glob.scan({ absolute: true })) {
          const file = Bun.file(match);
          if (await file.exists()) {
            resolvedBinaryPaths.set(binaryName, match);
            return match;
          }
        }
      } catch {
        // Ignore glob errors
      }
    } else {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          resolvedBinaryPaths.set(binaryName, path);
          return path;
        }
      } catch {
        // Ignore file check errors
      }
    }
  }

  // Try using 'which' as fallback (works if PATH is set)
  try {
    const proc = Bun.spawn(["which", binaryName], {
      stdout: "pipe",
      stderr: "pipe"
    });
    const exitCode = await proc.exited;
    if (exitCode === 0 && proc.stdout) {
      const output = await new Response(proc.stdout).text();
      const path = output.trim();
      if (path) {
        resolvedBinaryPaths.set(binaryName, path);
        return path;
      }
    }
  } catch {
    // Ignore which errors
  }

  resolvedBinaryPaths.set(binaryName, null);
  return null;
}

/** Options for launching a run */
export interface RunOptions {
  /** Session ID (from SessionStore) */
  sessionId: string;
  /** User prompt */
  prompt: string;
  /** Agent to use */
  agent: AgentType;
  /** Working directory */
  cwd: string;
  /** Optional principles to inject into prompt */
  principlesInjection?: string;
  /** Optional intentions to inject into prompt */
  intentions?: string;
}

/** Result from a completed run */
export interface RunResult {
  /** Session ID */
  sessionId: string;
  /** Exit code */
  exitCode: number;
  /** Collected stdout (for print mode) */
  output?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/** Callback for when a run completes */
export type RunCompleteCallback = (result: RunResult) => void;

/**
 * Builds a prompt with injected principles and intentions.
 */
export function buildEnhancedPrompt(
  prompt: string,
  principlesInjection?: string,
  intentions?: string
): string {
  const parts: string[] = [];

  if (principlesInjection) {
    parts.push("[PRINCIPLES - Keep these in mind]");
    parts.push(principlesInjection);
    parts.push("");
  }

  if (intentions) {
    parts.push("[INTENTION]");
    parts.push(intentions);
    parts.push("");
  }

  if (parts.length > 0) {
    parts.push("---");
    parts.push("");
    parts.push("[USER PROMPT BELOW]");
  }

  parts.push(prompt);

  return parts.join("\n");
}

/**
 * Process Runner for daemon-side agent spawning.
 */
export class ProcessRunner {
  private sessionStore: SessionStore;
  private runningProcesses: Map<
    string,
    { proc: ReturnType<typeof Bun.spawn>; startedAt: number }
  > = new Map();
  private onRunComplete?: RunCompleteCallback;

  constructor(sessionStore: SessionStore) {
    this.sessionStore = sessionStore;
  }

  /**
   * Set callback for run completion.
   */
  setCallback(callback: RunCompleteCallback): void {
    this.onRunComplete = callback;
  }

  /**
   * Check if an agent type is supported.
   */
  isValidAgent(agent: string): agent is AgentType {
    return agent in AGENT_COMMANDS;
  }

  /**
   * Get list of supported agents.
   */
  getSupportedAgents(): AgentType[] {
    return Object.keys(AGENT_COMMANDS) as AgentType[];
  }

  /**
   * Get list of available agents (installed and found on system).
   */
  async getAvailableAgents(): Promise<
    { agent: AgentType; path: string; available: true }[]
  > {
    const available: { agent: AgentType; path: string; available: true }[] = [];
    for (const agent of this.getSupportedAgents()) {
      const binaryName = AGENT_COMMANDS[agent].print[0] as string;
      const path = await resolveBinaryPath(binaryName);
      if (path) {
        available.push({ agent, path, available: true });
      }
    }
    return available;
  }

  /**
   * Launch an agent run (always print mode from web).
   * Returns immediately; monitors completion in background.
   */
  async run(options: RunOptions): Promise<{ pid: number }> {
    const { sessionId, prompt, agent, cwd, principlesInjection, intentions } =
      options;

    if (!this.isValidAgent(agent)) {
      throw new Error(`Unknown agent: ${agent}`);
    }

    // Build enhanced prompt with principles/intentions
    const fullPrompt = buildEnhancedPrompt(
      prompt,
      principlesInjection,
      intentions
    );

    // Get agent command (always print mode for web)
    const agentConfig = AGENT_COMMANDS[agent];
    const binaryName = agentConfig.print[0] as string;

    // Resolve binary to full path (daemon may not have user's PATH)
    const binaryPath = await resolveBinaryPath(binaryName);
    if (!binaryPath) {
      throw new Error(
        `Agent '${agent}' not found. Searched common paths for '${binaryName}'. ` +
          `Please ensure the agent CLI is installed.`
      );
    }

    // Verify cwd exists and is a directory
    try {
      const { statSync } = await import("fs");
      const stats = statSync(cwd);
      if (!stats.isDirectory()) {
        throw new Error(`Working directory is not a directory: ${cwd}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("is not a directory")) {
        throw e;
      }
      // statSync throws ENOENT if path doesn't exist
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    // Build command args with resolved path
    const cmdArgs = [binaryPath, ...agentConfig.print.slice(1), fullPrompt];

    // Spawn the process
    // Use "ignore" for stdin since we're in print mode (no interactive input needed)
    // and the daemon may not have a TTY when running in background
    const startedAt = Date.now();
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(cmdArgs, {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // Ensure PATH includes common locations
          PATH: [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            process.env.HOME + "/.bun/bin",
            process.env.HOME + "/.local/bin",
            "/usr/bin",
            process.env.PATH
          ]
            .filter(Boolean)
            .join(":")
        }
      });
    } catch (spawnError) {
      throw new Error(
        `Failed to spawn '${binaryPath}' in '${cwd}': ${spawnError}`
      );
    }

    // Update session with PID
    this.sessionStore.updateSession(sessionId, { pid: proc.pid });

    // Track running process
    this.runningProcesses.set(sessionId, { proc, startedAt });

    // Monitor completion in background
    this.monitorProcess(sessionId, proc, startedAt);

    return { pid: proc.pid };
  }

  /**
   * Monitor process completion and update session.
   */
  private async monitorProcess(
    sessionId: string,
    proc: ReturnType<typeof Bun.spawn>,
    startedAt: number
  ): Promise<void> {
    try {
      const exitCode = await proc.exited;
      const durationMs = Date.now() - startedAt;

      // Collect output
      let output: string | undefined;
      if (proc.stdout && typeof proc.stdout !== "number") {
        try {
          output = await new Response(proc.stdout).text();
        } catch {
          // Ignore output collection errors
        }
      }

      // End session
      this.sessionStore.endSession(sessionId, exitCode);

      // Remove from tracking
      this.runningProcesses.delete(sessionId);

      // Notify callback
      if (this.onRunComplete) {
        try {
          this.onRunComplete({
            sessionId,
            exitCode,
            output,
            durationMs
          });
        } catch {
          // Ignore callback errors
        }
      }
    } catch (error) {
      // Process monitoring failed - mark session as failed
      this.sessionStore.endSession(sessionId, -1);
      this.runningProcesses.delete(sessionId);
    }
  }

  /**
   * Get running process info for a session.
   */
  getRunningProcess(
    sessionId: string
  ): { pid: number; durationMs: number } | null {
    const running = this.runningProcesses.get(sessionId);
    if (!running) return null;

    return {
      pid: running.proc.pid,
      durationMs: Date.now() - running.startedAt
    };
  }

  /**
   * Get all running sessions.
   */
  getRunningSessionIds(): string[] {
    return [...this.runningProcesses.keys()];
  }

  /**
   * Kill a running process by session ID.
   */
  async kill(sessionId: string): Promise<boolean> {
    const running = this.runningProcesses.get(sessionId);
    if (!running) return false;

    try {
      running.proc.kill();
      return true;
    } catch {
      return false;
    }
  }
}
