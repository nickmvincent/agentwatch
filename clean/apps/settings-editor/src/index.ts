import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { dirname, join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import {
  createRegistry,
  createVerboseLogger,
  expandHome,
  resolveDataDir,
  type RouteDoc
} from "@aw-clean/core";

const SERVICE_NAME = "settings-editor";
const PORT = Number(process.env.PORT ?? 8704);
const dataDir = resolveDataDir();
const logPath = join(dataDir, "verbose", `${SERVICE_NAME}.jsonl`);
const logger = createVerboseLogger({ service: SERVICE_NAME, logPath });

const CLAUDE_PATH = expandHome(
  process.env.CLAUDE_SETTINGS_PATH ?? "~/.claude/settings.json"
);
const CODEX_PATH = expandHome(
  process.env.CODEX_SETTINGS_PATH ?? "~/.codex/config.json"
);

const ROUTES: RouteDoc[] = [
  {
    id: "settings.health",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/health",
    summary: "Health check"
  },
  {
    id: "settings.paths",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/settings/paths",
    summary: "Return resolved settings file paths"
  },
  {
    id: "settings.read.claude",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/settings/claude",
    summary: "Read Claude settings.json"
  },
  {
    id: "settings.write.claude",
    service: SERVICE_NAME,
    method: "PUT",
    path: "/api/settings/claude",
    summary: "Write Claude settings.json"
  },
  {
    id: "settings.read.codex",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/settings/codex",
    summary: "Read Codex config.json"
  },
  {
    id: "settings.write.codex",
    service: SERVICE_NAME,
    method: "PUT",
    path: "/api/settings/codex",
    summary: "Write Codex config.json"
  },
  {
    id: "settings.registry",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/registry",
    summary: "Self-documenting route registry"
  }
];

async function readSettings(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function writeSettings(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function normalizeJson(content: string): string {
  const parsed = JSON.parse(content);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

const app = new Hono();

if (process.env.AWC_VERBOSE === "1") {
  app.use("*", requestLogger());
  console.log(`[${SERVICE_NAME}] verbose logging enabled`);
}

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: SERVICE_NAME, time: new Date().toISOString() })
);

app.get("/api/settings/paths", (c) =>
  c.json({ claude: CLAUDE_PATH, codex: CODEX_PATH })
);

app.get("/api/settings/claude", async (c) => {
  try {
    const content = await readSettings(CLAUDE_PATH);
    await logger.log("settings.read", { path: CLAUDE_PATH, target: "claude" });
    return c.json({ ok: true, path: CLAUDE_PATH, content });
  } catch (error) {
    return c.json({ ok: false, error: "not_found" }, 404);
  }
});

app.put("/api/settings/claude", async (c) => {
  let payload: { content?: string };
  try {
    payload = (await c.req.json()) as { content?: string };
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!payload.content) {
    return c.json({ ok: false, error: "content_required" }, 400);
  }

  try {
    const normalized = normalizeJson(payload.content);
    await writeSettings(CLAUDE_PATH, normalized);
    await logger.log("settings.write", { path: CLAUDE_PATH, target: "claude" });
    return c.json({ ok: true, path: CLAUDE_PATH });
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }
});

app.get("/api/settings/codex", async (c) => {
  try {
    const content = await readSettings(CODEX_PATH);
    await logger.log("settings.read", { path: CODEX_PATH, target: "codex" });
    return c.json({ ok: true, path: CODEX_PATH, content });
  } catch (error) {
    return c.json({ ok: false, error: "not_found" }, 404);
  }
});

app.put("/api/settings/codex", async (c) => {
  let payload: { content?: string };
  try {
    payload = (await c.req.json()) as { content?: string };
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!payload.content) {
    return c.json({ ok: false, error: "content_required" }, 400);
  }

  try {
    const normalized = normalizeJson(payload.content);
    await writeSettings(CODEX_PATH, normalized);
    await logger.log("settings.write", { path: CODEX_PATH, target: "codex" });
    return c.json({ ok: true, path: CODEX_PATH });
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }
});

app.get("/api/registry", (c) => c.json(createRegistry(SERVICE_NAME, ROUTES)));

app.use("/*", serveStatic({ root: "./apps/settings-editor/public" }));

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[${SERVICE_NAME}] log file: ${logPath}`);
console.log(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`);
