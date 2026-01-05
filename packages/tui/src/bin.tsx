#!/usr/bin/env bun
/**
 * TUI entry point for AgentWatch
 */

import { render } from "ink";
import { App } from "./App.js";

const args = process.argv.slice(2);

// Parse --daemon-url flag
let daemonUrl = "http://127.0.0.1:9850";
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  if (arg === "--daemon-url" && nextArg) {
    daemonUrl = nextArg;
    break;
  }
  if (arg && arg.startsWith("--daemon-url=")) {
    daemonUrl = arg.split("=")[1] ?? daemonUrl;
    break;
  }
}

render(<App daemonUrl={daemonUrl} />);
