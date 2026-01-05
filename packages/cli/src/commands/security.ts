import { DAEMON } from "@agentwatch/core";
import { Command } from "commander";
import pc from "picocolors";

const DEFAULT_HOST = DAEMON.HOST;
const DEFAULT_PORT = DAEMON.PORT;

/**
 * Test Gate CLI Commands
 *
 * The Test Gate feature requires tests to pass before allowing git commits.
 * This is a workflow enforcement feature with no equivalent in Claude Code's
 * native permission system.
 *
 * Note: Pattern-based security gates were removed. Use Claude Code's native
 * deny rules in ~/.claude/settings.json for blocking dangerous commands.
 */
export const securityCommand = new Command("security")
  .description("Test Gate - require tests to pass before git commits")
  .alias("test-gate");

securityCommand
  .command("status")
  .description("Check Test Gate status")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    const daemonUrl = `http://${options.host}:${options.port}`;

    console.log(pc.cyan("Test Gate Status"));
    console.log(pc.gray("-".repeat(50)));

    try {
      const res = await fetch(`${daemonUrl}/api/test-gate`);
      if (res.ok) {
        const data = (await res.json()) as {
          enabled: boolean;
          test_command?: string;
          pass_file?: string;
          pass_file_max_age_seconds?: number;
          tests_passed?: boolean;
          reason?: string;
        };

        console.log(
          `  Enabled: ${data.enabled ? pc.green("yes") : pc.gray("no")}`
        );
        if (data.enabled) {
          console.log(
            `  Test command: ${pc.blue(data.test_command || "(not set)")}`
          );
          console.log(
            `  Pass file: ${pc.gray(data.pass_file || "~/.agentwatch/test-pass")}`
          );
          console.log(
            `  Max age: ${pc.gray(String(data.pass_file_max_age_seconds || 300) + "s")}`
          );
          console.log(
            `  Tests passed: ${data.tests_passed ? pc.green("yes") : pc.yellow("no")}`
          );
          if (!data.tests_passed && data.reason) {
            console.log(`  Reason: ${pc.yellow(data.reason)}`);
          }
        }
      } else {
        console.log(pc.gray("  (daemon not running)"));
      }
    } catch {
      console.log(pc.gray("  (daemon not running)"));
    }

    console.log("");
    console.log(
      pc.gray("Note: For blocking dangerous commands, use Claude Code's native")
    );
    console.log(
      pc.gray(
        "deny rules in ~/.claude/settings.json instead of security gates."
      )
    );
  });

securityCommand
  .command("enable")
  .description("Enable Test Gate")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    const daemonUrl = `http://${options.host}:${options.port}`;

    try {
      const res = await fetch(`${daemonUrl}/api/test-gate/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });

      if (res.ok) {
        console.log(pc.green("Test Gate enabled"));
        console.log(pc.gray("Git commits will be blocked until tests pass."));
      } else {
        console.log(pc.red("Failed to enable Test Gate"));
      }
    } catch {
      console.log(pc.red("Error: Daemon not running"));
    }
  });

securityCommand
  .command("disable")
  .description("Disable Test Gate")
  .option("-H, --host <host>", "Daemon host", DEFAULT_HOST)
  .option("-p, --port <port>", "Daemon port", String(DEFAULT_PORT))
  .action(async (options) => {
    const daemonUrl = `http://${options.host}:${options.port}`;

    try {
      const res = await fetch(`${daemonUrl}/api/test-gate/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });

      if (res.ok) {
        console.log(pc.green("Test Gate disabled"));
      } else {
        console.log(pc.red("Failed to disable Test Gate"));
      }
    } catch {
      console.log(pc.red("Error: Daemon not running"));
    }
  });
