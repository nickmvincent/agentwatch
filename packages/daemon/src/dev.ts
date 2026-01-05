#!/usr/bin/env bun
/**
 * Development entry point - starts the daemon server with hot reload.
 *
 * Usage:
 *   bun run --watch src/dev.ts           # Normal dev mode
 *   DEBUG=1 bun run --watch src/dev.ts   # With request logging
 */

import { DaemonServer } from "./server";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "8420", 10);
const debug = !!process.env.DEBUG;

console.log(
  `[dev] Starting daemon on ${host}:${port}${debug ? " (DEBUG mode)" : ""}...`
);
if (debug) {
  console.log(`[dev] Request logging enabled`);
}

const server = new DaemonServer();
server.run(host, port);
