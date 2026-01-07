import { homedir } from "os";
import { resolve } from "path";

export const DEFAULT_DATA_DIR = "~/.agentwatch-clean";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") return homedir();
  if (inputPath.startsWith("~/")) {
    return resolve(homedir(), inputPath.slice(2));
  }
  return resolve(inputPath);
}

export function resolveDataDir(envVar = "AWC_DATA_DIR"): string {
  const configured = process.env[envVar] ?? DEFAULT_DATA_DIR;
  return expandHome(configured);
}
