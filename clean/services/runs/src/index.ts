import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import { join } from "path";
import {
  createId,
  createRegistry,
  createVerboseLogger,
  resolveDataDir,
  type RouteDoc
} from "@aw-clean/core";

const SERVICE_NAME = "runs";
const PORT = Number(process.env.PORT ?? 8703);
const dataDir = resolveDataDir();
const logPath = join(dataDir, "verbose", `${SERVICE_NAME}.jsonl`);
const logger = createVerboseLogger({ service: SERVICE_NAME, logPath });

type RunStatus = "running" | "exited" | "stopped" | "failed";

type RunInfo = {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  pid?: number;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  status: RunStatus;
};

type RunRequest = {
  command: string;
  args?: string[];
  cwd?: string;
};

const runs = new Map<string, RunInfo>();
const processes = new Map<string, Bun.Subprocess>();

const ROUTES: RouteDoc[] = [
  {
    id: "runs.health",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/health",
    summary: "Health check"
  },
  {
    id: "runs.list",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/runs",
    summary: "List managed runs"
  },
  {
    id: "runs.start",
    service: SERVICE_NAME,
    method: "POST",
    path: "/api/runs/start",
    summary: "Start a managed run"
  },
  {
    id: "runs.stop",
    service: SERVICE_NAME,
    method: "POST",
    path: "/api/runs/:id/stop",
    summary: "Stop a managed run"
  },
  {
    id: "runs.registry",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/registry",
    summary: "Self-documenting route registry"
  }
];

async function startRun(request: RunRequest): Promise<RunInfo> {
  const id = createId("run");
  const args = request.args ?? [];
  const startedAt = new Date().toISOString();

  const proc = Bun.spawn([request.command, ...args], {
    cwd: request.cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const run: RunInfo = {
    id,
    command: request.command,
    args,
    cwd: request.cwd,
    pid: proc.pid,
    startedAt,
    status: "running"
  };

  runs.set(id, run);
  processes.set(id, proc);

  await logger.log(
    "run.started",
    {
      id: run.id,
      command: run.command,
      args: run.args,
      cwd: run.cwd,
      pid: run.pid
    },
    { runId: run.id }
  );

  proc.exited
    .then(async (exitCode) => {
      run.status = exitCode === 0 ? "exited" : "failed";
      run.exitCode = exitCode;
      run.endedAt = new Date().toISOString();
      await logger.log(
        "run.exited",
        {
          id: run.id,
          exitCode: run.exitCode,
          status: run.status
        },
        { runId: run.id }
      );
    })
    .catch(async (error) => {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      await logger.log(
        "run.error",
        {
          id: run.id,
          error: String(error)
        },
        { runId: run.id }
      );
    });

  return run;
}

async function stopRun(id: string): Promise<RunInfo | null> {
  const run = runs.get(id);
  if (!run) return null;

  const proc = processes.get(id);
  if (proc) {
    proc.kill("SIGTERM");
  }

  run.status = "stopped";
  run.endedAt = new Date().toISOString();
  await logger.log(
    "run.stopped",
    {
      id: run.id,
      pid: run.pid
    },
    { runId: run.id }
  );

  return run;
}

const app = new Hono();

if (process.env.AWC_VERBOSE === "1") {
  app.use("*", requestLogger());
  console.log(`[${SERVICE_NAME}] verbose logging enabled`);
}

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: SERVICE_NAME, time: new Date().toISOString() })
);

app.get("/api/runs", (c) =>
  c.json({ runs: Array.from(runs.values()) })
);

app.post("/api/runs/start", async (c) => {
  let request: RunRequest;
  try {
    request = (await c.req.json()) as RunRequest;
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!request.command) {
    return c.json({ ok: false, error: "command_required" }, 400);
  }

  const run = await startRun(request);
  return c.json({ ok: true, run });
});

app.post("/api/runs/:id/stop", async (c) => {
  const id = c.req.param("id");
  const run = await stopRun(id);
  if (!run) {
    return c.json({ ok: false, error: "not_found" }, 404);
  }
  return c.json({ ok: true, run });
});

app.get("/api/registry", (c) => c.json(createRegistry(SERVICE_NAME, ROUTES)));

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[${SERVICE_NAME}] log file: ${logPath}`);
console.log(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`);
