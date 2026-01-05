import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9850;

export const logsCommand = new Command("logs")
  .description("View session logs")
  .argument("[session_id]", "Session ID to view")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .option("-n, --tail <count>", "Number of recent sessions to list", "20")
  .action(async (sessionId, options) => {
    const daemonUrl = `http://${options.host}:${options.port}`;

    if (sessionId) {
      // View specific session
      try {
        const res = await fetch(
          `${daemonUrl}/api/hooks/sessions/${sessionId}/timeline`
        );
        if (!res.ok) {
          console.log(pc.red(`Session ${sessionId} not found`));
          return;
        }

        const timeline = (await res.json()) as Array<{
          timestamp: number;
          success: boolean | null;
          tool_name: string;
          duration_ms: number | null;
        }>;
        console.log(pc.cyan(`Session: ${sessionId}`));
        console.log(pc.gray("-".repeat(60)));

        for (const entry of timeline) {
          const ts = new Date(entry.timestamp * 1000).toLocaleTimeString();
          const success =
            entry.success === null
              ? "⏳"
              : entry.success
                ? pc.green("✓")
                : pc.red("✗");
          const duration =
            entry.duration_ms !== null ? pc.gray(`${entry.duration_ms}ms`) : "";

          console.log(
            `${pc.gray(ts)} ${success} ${pc.blue(entry.tool_name)} ${duration}`
          );
        }
      } catch (e) {
        console.log(
          pc.red(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
        );
      }
    } else {
      // List recent sessions
      try {
        const res = await fetch(
          `${daemonUrl}/api/hooks/sessions?limit=${options.tail}`
        );
        if (!res.ok) {
          console.log(pc.red("Failed to fetch sessions"));
          return;
        }

        const sessions = (await res.json()) as Array<{
          session_id: string;
          start_time: number;
          active: boolean;
          awaiting_user: boolean;
          tool_count: number;
        }>;

        if (sessions.length === 0) {
          console.log(pc.gray("No sessions found"));
          return;
        }

        console.log(pc.cyan("Recent Sessions"));
        console.log(pc.gray("-".repeat(60)));

        for (const session of sessions) {
          const start = new Date(session.start_time * 1000);
          const status = session.active
            ? session.awaiting_user
              ? pc.yellow("waiting")
              : pc.green("active")
            : pc.gray("ended");

          console.log(
            `${pc.blue(session.session_id.slice(0, 8))} ` +
              `${pc.gray(start.toLocaleString())} ` +
              `${status} ` +
              `${pc.gray(`${session.tool_count} tools`)}`
          );
        }
      } catch (e) {
        console.log(
          pc.red(`Error: ${e instanceof Error ? e.message : "Unknown error"}`)
        );
      }
    }
  });
