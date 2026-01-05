import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

export const webCommand = new Command("web")
  .description("Open the web dashboard")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .option("--no-open", "Don't open browser automatically")
  .action(async (options) => {
    const daemonUrl = `http://${options.host}:${options.port}`;

    // Check if daemon is running
    try {
      const res = await fetch(`${daemonUrl}/api/status`);
      if (!res.ok) {
        const health = await fetch(`${daemonUrl}/api/health`);
        if (!health.ok) {
          console.log(pc.yellow("Daemon not responding. Starting daemon..."));
          await startDaemon(options.host, options.port);
        }
      }
    } catch {
      console.log(pc.yellow("Daemon not running. Starting daemon..."));
      await startDaemon(options.host, options.port);
    }

    console.log(pc.green(`Web dashboard available at ${daemonUrl}`));

    if (options.open !== false) {
      // Open browser
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";

      Bun.spawn([openCmd, daemonUrl], {
        stdio: ["ignore", "ignore", "ignore"]
      });
    }
  });

async function startDaemon(host: string, port: string) {
  Bun.spawn(
    [
      "bun",
      "run",
      import.meta.dir + "/../daemon-runner.ts",
      "--host",
      host,
      "--port",
      port
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "ignore", "ignore"]
    }
  );

  // Wait for daemon to start
  await new Promise((r) => setTimeout(r, 1000));
}
