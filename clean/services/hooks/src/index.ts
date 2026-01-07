import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import { join } from "path";
import {
  createRegistry,
  createVerboseLogger,
  resolveDataDir,
  type RouteDoc
} from "@aw-clean/core";

const SERVICE_NAME = "hooks";
const PORT = Number(process.env.PORT ?? 8702);
const dataDir = resolveDataDir();
const logPath = join(dataDir, "verbose", `${SERVICE_NAME}.jsonl`);
const logger = createVerboseLogger({ service: SERVICE_NAME, logPath });

const HOOK_EVENTS = [
  "session-start",
  "session-end",
  "pre-tool-use",
  "post-tool-use",
  "notification",
  "permission-request",
  "user-prompt-submit",
  "stop",
  "subagent-stop",
  "pre-compact"
] as const;

type HookEvent = (typeof HOOK_EVENTS)[number];

const ROUTES: RouteDoc[] = [
  {
    id: "hooks.health",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/health",
    summary: "Health check"
  },
  ...HOOK_EVENTS.map((event) => ({
    id: `hooks.${event}`,
    service: SERVICE_NAME,
    method: "POST" as const,
    path: `/api/hooks/${event}`,
    summary: `Receive hook event: ${event}`
  })),
  {
    id: "hooks.registry",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/registry",
    summary: "Self-documenting route registry"
  }
];

const app = new Hono();

if (process.env.AWC_VERBOSE === "1") {
  app.use("*", requestLogger());
  console.log(`[${SERVICE_NAME}] verbose logging enabled`);
}

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: SERVICE_NAME, time: new Date().toISOString() })
);

HOOK_EVENTS.forEach((event) => {
  app.post(`/api/hooks/${event}`, async (c) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = (await c.req.json()) as Record<string, unknown>;
    } catch (error) {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }

    await logger.log(`hook.${event}`, payload);
    return c.json({ ok: true });
  });
});

app.get("/api/registry", (c) => c.json(createRegistry(SERVICE_NAME, ROUTES)));

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[${SERVICE_NAME}] log file: ${logPath}`);
console.log(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`);
