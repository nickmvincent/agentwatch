/**
 * @deprecated Use `aw watcher` and `aw analyze` instead.
 *
 * The combined daemon is deprecated. The new architecture splits functionality:
 * - `aw watcher start/stop/status` - Real-time monitoring daemon (port 8420)
 * - `aw analyze` - On-demand analysis dashboard (port 8421)
 *
 * This command remains as an alias to watcher for backwards compatibility.
 */

import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

function printDeprecationNotice() {
  console.log();
  console.log(pc.yellow("⚠️  DEPRECATION NOTICE"));
  console.log(
    pc.yellow("    The `aw daemon` command is deprecated. Use instead:")
  );
  console.log(pc.cyan("      aw watcher start    - Real-time monitoring"));
  console.log(pc.cyan("      aw analyze          - Analysis dashboard"));
  console.log();
}

export const daemonCommand = new Command("daemon").description(
  "Manage the daemon process (DEPRECATED: use 'aw watcher' instead)"
);

daemonCommand
  .command("start")
  .description("Start the daemon")
  .option("-H, --host <host>", "Host to bind", DEFAULT_HOST)
  .option("-p, --port <port>", "Port to bind", String(DEFAULT_PORT))
  .option("-f, --foreground", "Run in foreground")
  .action(async (options) => {
    printDeprecationNotice();

    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    if (options.foreground) {
      // Run in foreground
      console.log(pc.cyan(`Starting daemon on ${host}:${port}...`));

      const { DaemonServer } = await import("@agentwatch/daemon");
      const server = new DaemonServer();
      server.run(host, port);
    } else {
      // Start in background
      console.log(
        pc.cyan(`Starting daemon in background on ${host}:${port}...`)
      );

      // Resolve to monorepo root (packages/cli/src/commands -> repo root)
      const repoRoot = import.meta.dir + "/../../../..";
      const subprocess = Bun.spawn(
        [
          process.execPath,
          "run",
          import.meta.dir + "/../daemon-runner.ts",
          "--host",
          host,
          "--port",
          String(port)
        ],
        {
          cwd: repoRoot, // Use monorepo root so web/dist is found
          stdio: ["ignore", "ignore", "ignore"]
        }
      );
      subprocess.unref(); // Detach so CLI can exit

      // Wait briefly and check if it started
      await new Promise((r) => setTimeout(r, 1000));

      try {
        const res = await fetch(`http://${host}:${port}/api/status`);
        if (res.ok) {
          console.log(pc.green("Daemon started successfully"));
          printDataCollectionNotice();
          return;
        }

        const health = await fetch(`http://${host}:${port}/api/health`);
        if (health.ok) {
          console.log(pc.green("Daemon started successfully"));
          printDataCollectionNotice();
        } else {
          console.log(
            pc.yellow(
              "Daemon started but health check failed. Check logs at ~/.agentwatch/logs"
            )
          );
        }
      } catch (e) {
        console.log(
          pc.red(
            `Daemon failed to start or is unreachable at http://${host}:${port}`
          )
        );
        console.log(
          pc.gray(`Error: ${e instanceof Error ? e.message : String(e)}`)
        );
      }
    }
  });

function printDataCollectionNotice() {
  console.log();
  console.log(pc.gray("Data collection:"));
  console.log(pc.gray("  • Process snapshots → ~/.agentwatch/processes/"));
  console.log(pc.gray("  • Hook events (if installed) → ~/.agentwatch/hooks/"));
  console.log(pc.gray("  • Local transcripts are read-only (not modified)"));
  console.log(
    pc.gray(
      "  Learn more: https://github.com/nickmvincent/agentwatch/blob/main/docs/data-sources.md"
    )
  );
}

daemonCommand
  .command("stop")
  .description("Stop the daemon")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    try {
      const res = await fetch(`http://${host}:${port}/api/shutdown`, {
        method: "POST"
      });

      if (res.ok) {
        console.log(pc.green("Daemon stopped"));
      } else {
        console.log(pc.red("Failed to stop daemon"));
      }
    } catch {
      console.log(pc.yellow("Daemon not running or unreachable"));
    }
  });

daemonCommand
  .command("status")
  .description("Check daemon status")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    const host = options.host;
    const port = Number.parseInt(options.port, 10);

    try {
      const res = await fetch(`http://${host}:${port}/api/status`);

      if (res.ok) {
        const data = (await res.json()) as {
          agent_count: number;
          repo_count: number;
          uptime_seconds: number;
        };
        console.log(pc.green("Daemon running"));
        console.log(`  Agents: ${pc.blue(data.agent_count)}`);
        console.log(`  Repos: ${pc.yellow(data.repo_count)}`);
        console.log(`  Uptime: ${pc.gray(formatUptime(data.uptime_seconds))}`);
        return;
      }

      const health = await fetch(`http://${host}:${port}/api/health`);
      if (health.ok) {
        console.log(pc.green("Daemon running"));
        console.log(pc.gray("  (status endpoint not available)"));
      } else {
        console.log(pc.red("Daemon not responding correctly"));
      }
    } catch {
      console.log(pc.red("Daemon not running"));
    }
  });

daemonCommand
  .command("restart")
  .description("Restart the daemon")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    // Stop first
    try {
      await fetch(`http://${options.host}:${options.port}/api/shutdown`, {
        method: "POST"
      });
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Ignore if not running
    }

    // Then start
    console.log(pc.cyan("Restarting daemon..."));

    // Resolve to monorepo root (packages/cli/src/commands -> repo root)
    const repoRoot = import.meta.dir + "/../../../..";
    const subprocess = Bun.spawn(
      [
        process.execPath,
        "run",
        import.meta.dir + "/../daemon-runner.ts",
        "--host",
        options.host,
        "--port",
        options.port
      ],
      {
        cwd: repoRoot, // Use monorepo root so web/dist is found
        stdio: ["ignore", "ignore", "ignore"]
      }
    );
    subprocess.unref(); // Detach so CLI can exit

    await new Promise((r) => setTimeout(r, 1000));

    try {
      const res = await fetch(
        `http://${options.host}:${options.port}/api/status`
      );
      if (res.ok) {
        console.log(pc.green("Daemon restarted"));
        printDataCollectionNotice();
        return;
      }

      const health = await fetch(
        `http://${options.host}:${options.port}/api/health`
      );
      if (health.ok) {
        console.log(pc.green("Daemon restarted"));
        printDataCollectionNotice();
      } else {
        console.log(pc.yellow("Daemon restarted but health check failed"));
      }
    } catch {
      console.log(pc.red("Daemon failed to restart"));
    }
  });

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
