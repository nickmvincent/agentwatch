import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCli(
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(
    [process.execPath, "packages/cli/src/bin.ts", ...args],
    {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe"
    }
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  return { stdout, stderr, exitCode };
}

async function waitForHealthy(url: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agentwatch-cli-"));
}

describe("CLI Integration", () => {
  it("installs, checks, and uninstalls hooks safely", async () => {
    const home = await getTempHome();

    try {
      const install = await runCli(["hooks", "install", "--url", "http://t"], {
        HOME: home
      });
      expect(install.exitCode).toBe(0);

      const settingsPath = join(home, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.hooks).toBeDefined();

      const status = await runCli(["hooks", "status"], { HOME: home });
      expect(status.stdout).toContain("PreToolUse");
      expect(status.stdout).toContain("installed");

      const uninstall = await runCli(["hooks", "uninstall"], { HOME: home });
      expect(uninstall.exitCode).toBe(0);

      const after = JSON.parse(readFileSync(settingsPath, "utf-8"));
      const hooksText = JSON.stringify(after.hooks);
      expect(hooksText.includes("/api/hooks/")).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("reports watcher status against a running server", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) => {
        if (new URL(req.url).pathname === "/api/status") {
          return new Response(
            JSON.stringify({
              agent_count: 2,
              repo_count: 1,
              uptime_seconds: 10
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("not found", { status: 404 });
      }
    });

    try {
      const result = await runCli([
        "watcher",
        "status",
        "--host",
        "127.0.0.1",
        "--port",
        String(server.port)
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Watcher running");
    } finally {
      server.stop();
    }
  });

  it("starts and stops watcher in foreground", async () => {
    const home = await getTempHome();
    const host = "127.0.0.1";

    const tempServer = Bun.serve({
      hostname: host,
      port: 0,
      fetch: () => new Response("ok")
    });
    const port = tempServer.port;
    tempServer.stop();

    const proc = Bun.spawn(
      [
        process.execPath,
        "packages/cli/src/bin.ts",
        "watcher",
        "start",
        "--foreground",
        "--host",
        host,
        "--port",
        String(port)
      ],
      {
        env: { ...process.env, HOME: home },
        stdout: "pipe",
        stderr: "pipe"
      }
    );

    try {
      await waitForHealthy(`http://${host}:${port}/api/status`);
      await fetch(`http://${host}:${port}/api/shutdown`, { method: "POST" });
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      proc.kill();
      await rm(home, { recursive: true, force: true });
    }
  });

  it("starts and stops analyzer in headless mode", async () => {
    const home = await getTempHome();
    const host = "127.0.0.1";

    const tempServer = Bun.serve({
      hostname: host,
      port: 0,
      fetch: () => new Response("ok")
    });
    const port = tempServer.port;
    tempServer.stop();

    const proc = Bun.spawn(
      [
        process.execPath,
        "packages/cli/src/bin.ts",
        "analyze",
        "--headless",
        "--watcher",
        "http://localhost:9999",
        "--port",
        String(port)
      ],
      {
        env: { ...process.env, HOME: home },
        stdout: "pipe",
        stderr: "pipe"
      }
    );

    try {
      await waitForHealthy(`http://${host}:${port}/api/status`);
      await fetch(`http://${host}:${port}/api/shutdown`, { method: "POST" });
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      proc.kill();
      await rm(home, { recursive: true, force: true });
    }
  });
});
