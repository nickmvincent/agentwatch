import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

export const tuiCommand = new Command("tui")
  .description("Start the TUI dashboard")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
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

    // Start TUI
    const subprocess = Bun.spawn(
      ["bun", "run", findTuiBin(), "--daemon-url", daemonUrl],
      {
        cwd: process.cwd(),
        stdio: ["inherit", "inherit", "inherit"]
      }
    );

    await subprocess.exited;
  });

function findTuiBin(): string {
  // Try to find the TUI package
  const paths = [
    import.meta.dir + "/../../tui/src/bin.tsx",
    import.meta.dir + "/../../../tui/src/bin.tsx"
  ];

  for (const p of paths) {
    try {
      const file = Bun.file(p);
      if (file.size > 0) return p;
    } catch {
      // Ignore
    }
  }

  // Fall back to package name
  return "@agentwatch/tui/src/bin.tsx";
}

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
