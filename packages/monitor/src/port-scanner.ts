/**
 * Port scanner for detecting listening TCP ports.
 * Tracks dev servers and correlates them with agent processes.
 */

import type { ListeningPort } from "@agentwatch/core";
import type { DataStore } from "./store";

interface PortScannerConfig {
  /** Scan interval in seconds */
  refreshSeconds: number;
  /** Minimum port to scan (filter out system ports) */
  minPort: number;
  /** Maximum port to scan */
  maxPort: number;
}

const DEFAULT_CONFIG: PortScannerConfig = {
  refreshSeconds: 2,
  minPort: 1024,
  maxPort: 65535
};

/**
 * Scanner that detects listening TCP ports via lsof.
 */
export class PortScanner {
  private config: PortScannerConfig;
  private store: DataStore;
  private running = false;
  private paused = false;
  private intervalId?: Timer;

  // Cache for tracking when ports were first seen
  private firstSeenCache: Map<string, number> = new Map();

  constructor(store: DataStore, config: Partial<PortScannerConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the scanner.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const scan = async () => {
      if (this.paused) return;

      const now = Date.now();
      const ports = await this.scanPorts(now);
      this.store.updatePorts(ports);
    };

    // Run immediately, then on interval
    scan();
    this.intervalId = setInterval(scan, this.config.refreshSeconds * 1000);
  }

  /**
   * Stop the scanner.
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Pause/resume scanning.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Scan for listening ports.
   */
  private async scanPorts(now: number): Promise<Map<number, ListeningPort>> {
    const ports = new Map<number, ListeningPort>();
    const rawPorts = await lsofListeningPorts();
    const agents = this.store.snapshotAgents();

    // Build PID -> Agent mapping for correlation
    const agentByPid = new Map(agents.map((a) => [a.pid, a]));

    // Get parent PIDs for child process correlation
    const pids = rawPorts.map((p) => p.pid);
    const parentPids = await getParentPids(pids);

    for (const raw of rawPorts) {
      // Filter by port range
      if (raw.port < this.config.minPort || raw.port > this.config.maxPort) {
        continue;
      }

      const cacheKey = `${raw.port}:${raw.pid}`;
      let firstSeen = this.firstSeenCache.get(cacheKey);
      if (!firstSeen) {
        firstSeen = now;
        this.firstSeenCache.set(cacheKey, now);
      }

      // Try to correlate with agents
      let agentPid: number | undefined;
      let agentLabel: string | undefined;

      // Direct match - is this PID an agent?
      const directAgent = agentByPid.get(raw.pid);
      if (directAgent) {
        agentPid = directAgent.pid;
        agentLabel = directAgent.label;
      } else {
        // Check if parent process is an agent (common for spawned dev servers)
        const parentPid = parentPids.get(raw.pid);
        if (parentPid) {
          const parentAgent = agentByPid.get(parentPid);
          if (parentAgent) {
            agentPid = parentAgent.pid;
            agentLabel = parentAgent.label;
          }
        }
      }

      ports.set(raw.port, {
        port: raw.port,
        pid: raw.pid,
        processName: raw.processName,
        cmdline: raw.cmdline,
        bindAddress: raw.bindAddress,
        protocol: raw.protocol,
        agentPid,
        agentLabel,
        firstSeen,
        cwd: raw.cwd
      });
    }

    // Prune old entries from firstSeenCache
    const seenKeys = new Set(
      Array.from(ports.values()).map((p) => `${p.port}:${p.pid}`)
    );
    for (const key of this.firstSeenCache.keys()) {
      if (!seenKeys.has(key)) {
        this.firstSeenCache.delete(key);
      }
    }

    return ports;
  }
}

interface RawPortInfo {
  port: number;
  pid: number;
  processName: string;
  cmdline?: string;
  bindAddress: string;
  protocol: "tcp" | "tcp6";
  cwd?: string;
}

/**
 * Get listening ports using lsof.
 * Command: lsof -i -P -n -sTCP:LISTEN
 */
async function lsofListeningPorts(): Promise<RawPortInfo[]> {
  try {
    const proc = Bun.spawn(["lsof", "-i", "-P", "-n", "-sTCP:LISTEN"], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];

    const output = await new Response(proc.stdout).text();
    return parseLsofOutput(output);
  } catch (e) {
    if (process.env.DEBUG) {
      console.error("lsof failed:", e);
    }
    return [];
  }
}

/**
 * Parse lsof output.
 * Example line: node    12345 user   21u  IPv4 0x...  0t0  TCP *:3000 (LISTEN)
 */
function parseLsofOutput(output: string): RawPortInfo[] {
  const ports: RawPortInfo[] = [];
  const lines = output.split("\n");

  for (const line of lines.slice(1)) {
    // Skip header
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const processName = parts[0]!;
    const pid = Number.parseInt(parts[1]!, 10);
    if (isNaN(pid)) continue;

    // Find the TCP column (format: TCP *:3000 or TCP 127.0.0.1:3000)
    const tcpIdx = parts.findIndex((p) => p === "TCP" || p === "TCP6");
    if (tcpIdx === -1 || tcpIdx + 1 >= parts.length) continue;

    const addressPart = parts[tcpIdx + 1]!;
    const lastColon = addressPart.lastIndexOf(":");
    if (lastColon === -1) continue;

    const bindAddress = addressPart.slice(0, lastColon);
    const port = Number.parseInt(addressPart.slice(lastColon + 1), 10);
    if (isNaN(port)) continue;

    const protocol = parts[tcpIdx] === "TCP6" ? "tcp6" : "tcp";

    ports.push({
      port,
      pid,
      processName,
      bindAddress,
      protocol
    });
  }

  return ports;
}

/**
 * Get parent PIDs for a list of PIDs using ps.
 */
async function getParentPids(pids: number[]): Promise<Map<number, number>> {
  if (pids.length === 0) return new Map();

  try {
    const proc = Bun.spawn(["ps", "-o", "pid=,ppid=", "-p", pids.join(",")], {
      stdout: "pipe",
      stderr: "pipe"
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) return new Map();

    const output = await new Response(proc.stdout).text();
    const result = new Map<number, number>();

    for (const line of output.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pid = Number.parseInt(parts[0]!, 10);
        const ppid = Number.parseInt(parts[1]!, 10);
        if (!isNaN(pid) && !isNaN(ppid)) {
          result.set(pid, ppid);
        }
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

export { DEFAULT_CONFIG as DEFAULT_PORT_SCANNER_CONFIG };
