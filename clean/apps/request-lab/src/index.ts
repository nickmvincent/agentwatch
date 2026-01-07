import { Hono } from "hono";
import { logger as requestLogger } from "hono/logger";
import { serveStatic } from "hono/bun";

const SERVICE_NAME = "request-lab";
const PORT = Number(process.env.PORT ?? 8705);

const app = new Hono();

if (process.env.AWC_VERBOSE === "1") {
  app.use("*", requestLogger());
  console.log(`[${SERVICE_NAME}] verbose logging enabled`);
}

app.get("/api/health", (c) =>
  c.json({ status: "ok", service: SERVICE_NAME, time: new Date().toISOString() })
);

app.post("/api/proxy", async (c) => {
  let payload: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  try {
    payload = (await c.req.json()) as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
  } catch (error) {
    return c.json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!payload.url) {
    return c.json({ ok: false, error: "url_required" }, 400);
  }

  let target: URL;
  try {
    target = new URL(payload.url);
  } catch (error) {
    return c.json({ ok: false, error: "invalid_url" }, 400);
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return c.json({ ok: false, error: "invalid_protocol" }, 400);
  }

  const method = (payload.method ?? "GET").toUpperCase();
  const headers = new Headers(payload.headers ?? {});
  const body = payload.body ?? "";

  if (body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const started = Date.now();
  try {
    const response = await fetch(target.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body
    });

    const responseText = await response.text();
    const durationMs = Date.now() - started;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return c.json({
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseText,
      durationMs
    });
  } catch (error) {
    return c.json({ ok: false, error: "request_failed", details: String(error) }, 502);
  }
});

app.use("/*", serveStatic({ root: "./apps/request-lab/public" }));

Bun.serve({ port: PORT, fetch: app.fetch });
console.log(`[${SERVICE_NAME}] listening on http://localhost:${PORT}`);
