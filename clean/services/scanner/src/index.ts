import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import { join } from "path";
import {
  createRegistry,
  createVerboseLogger,
  resolveDataDir,
  type RouteDoc
} from "@aw-clean/core";

const SERVICE_NAME = "scanner";
const PORT = Number(process.env.PORT ?? 8701);
const dataDir = resolveDataDir();
const logPath = join(dataDir, "verbose", `${SERVICE_NAME}.jsonl`);
const logger = createVerboseLogger({ service: SERVICE_NAME, logPath });

const ROUTES: RouteDoc[] = [
  {
    id: "scanner.health",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/health",
    summary: "Health check"
  },
  {
    id: "scanner.agents",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/agents",
    summary: "List detected agent processes"
  },
  {
    id: "scanner.scan",
    service: SERVICE_NAME,
    method: "POST",
    path: "/api/scan",
    summary: "Trigger a scan and emit verbose log entries"
  },
  {
    id: "scanner.registry",
    service: SERVICE_NAME,
    method: "GET",
    path: "/api/registry",
    summary: "Self-documenting route registry"
  }
];

type AgentProcess = {
  pid: number;
  command: string;
  agent: string;
};

const AGENT_MATCHERS: { agent: string; regex: RegExp }[] = [
  { agent: "claude", regex: /claude/i },
  { agent: "codex", regex: /codex/i },
  { agent: "gemini", regex: /gemini/i },
  { agent: "cursor", regex: /cursor/i },
  { agent: "opencode", regex: /opencode/i }
];

async function scanAgentProcesses(): Promise<AgentProcess[]> {
  const proc = Bun.spawn(["ps", "-axo", "pid=,command="]);
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const agents: AgentProcess[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2] ?? "";
    const agent = AGENT_MATCHERS.find(({ regex }) => regex.test(command));
    if (agent) {
      agents.push({ pid, command, agent: agent.agent });
    }
  }

  return agents;
}

const app = new Hono();

if (process.env.AWC_VERBOSE === "1") {
  app.use("*", requestLogger());
  console.log(`[${SERVICE_NAME}] verbose logging enabled`);
}

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: SERVICE_NAME, time: new Date().toISOString() })
);

app.get("/api/agents", async (c) => {
  const emit = c.req.query("emit") === "true";
  const agents = await scanAgentProcesses();
  if (emit) {
    await Promise.all(
      agents.map((agent) =>
        logger.log("process.discovered", {
          pid: agent.pid,
          command: agent.command,
          agent: agent.agent
        })
      )
    );
  }
  return c.json({ agents, scannedAt: new Date().toISOString() });
});

app.post("/api/scan", async (c) => {
  const agents = await scanAgentProcesses();
  await Promise.all(
    agents.map((agent) =>
      logger.log("process.discovered", {
        pid: agent.pid,
        command: agent.command,
        agent: agent.agent
      })
    )
  );
  return c.json({ agents, scannedAt: new Date().toISOString() });
});

app.get("/api/registry", (c) => c.json(createRegistry(SERVICE_NAME, ROUTES)));

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[${SERVICE_NAME}] log file: ${logPath}`);
console.log(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`);
