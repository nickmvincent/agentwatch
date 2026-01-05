/**
 * aw run - Launch an agent with a tracked prompt
 */

import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

// Agent CLI commands
const AGENT_COMMANDS: Record<
  string,
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

export const runCommand = new Command("run")
  .description("Launch an agent session with a tracked prompt")
  .argument("<prompt>", "The prompt to send to the agent")
  .option(
    "-a, --agent <agent>",
    "Agent to use (claude, codex, gemini)",
    "claude"
  )
  .option("-p, --print", "Non-interactive mode (agent outputs and exits)")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("--port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (prompt: string, options) => {
    const { agent, print, host, port } = options;
    const daemonUrl = `http://${host}:${port}`;

    // Validate agent
    if (!AGENT_COMMANDS[agent]) {
      console.log(pc.red(`Unknown agent: ${agent}`));
      console.log(
        pc.gray(`Supported agents: ${Object.keys(AGENT_COMMANDS).join(", ")}`)
      );
      process.exit(1);
    }

    const cwd = process.cwd();

    // Create session via daemon API
    let sessionId: string | null = null;
    try {
      const res = await fetch(`${daemonUrl}/api/managed-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, agent, cwd })
      });

      if (res.ok) {
        const session = (await res.json()) as { id: string };
        sessionId = session.id;
        console.log(pc.gray(`Session ${sessionId} created`));
      } else {
        console.log(
          pc.yellow(
            "Warning: Could not create session (daemon may not be running)"
          )
        );
      }
    } catch {
      console.log(
        pc.yellow("Warning: Could not connect to daemon. Session not tracked.")
      );
    }

    // Build command
    const agentConfig = AGENT_COMMANDS[agent];
    const cmdArgs = print
      ? [...agentConfig.print, prompt]
      : [...agentConfig.interactive, prompt];

    console.log(
      pc.cyan(`Starting ${agent}${print ? " (non-interactive)" : ""}...`)
    );
    console.log(
      pc.gray(
        `Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}`
      )
    );

    // Spawn the agent
    const proc = Bun.spawn(cmdArgs, {
      cwd,
      stdio: print
        ? ["inherit", "pipe", "pipe"]
        : ["inherit", "inherit", "inherit"],
      env: process.env
    });

    // Update session with PID
    if (sessionId) {
      try {
        await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: proc.pid })
        });
      } catch {
        // Ignore errors
      }
    }

    // Wait for process to complete
    const exitCode = await proc.exited;

    // If print mode, show output
    if (print && proc.stdout) {
      const output = await new Response(proc.stdout).text();
      if (output.trim()) {
        console.log();
        console.log(output);
      }
    }

    // End session
    if (sessionId) {
      try {
        await fetch(`${daemonUrl}/api/managed-sessions/${sessionId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exit_code: exitCode })
        });
      } catch {
        // Ignore errors
      }
    }

    // Report status
    if (exitCode === 0) {
      console.log(pc.green(`\n${agent} completed successfully`));
    } else {
      console.log(pc.red(`\n${agent} exited with code ${exitCode}`));
    }

    process.exit(exitCode);
  });
