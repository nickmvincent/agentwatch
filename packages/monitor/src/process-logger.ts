/**
 * Process logger for persisting agent process snapshots to JSONL files.
 *
 * Stores periodic snapshots of detected agent processes to enable:
 * - Historical analysis of agent activity patterns
 * - Correlation with hook events and transcripts
 * - Data contribution (sanitized process logs)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AgentProcess } from "@agentwatch/core";

/**
 * Schema for a process snapshot entry in the JSONL file.
 */
export interface ProcessSnapshot {
  /** Unix timestamp (milliseconds) when snapshot was taken */
  timestamp: number;
  /** Process ID */
  pid: number;
  /** Agent label (claude, codex, etc.) */
  label: string;
  /** Full command line */
  cmdline: string;
  /** Executable path */
  exe: string;
  /** CPU percentage at snapshot time */
  cpuPct: number;
  /** Resident set size in KB */
  rssKb?: number;
  /** Thread count */
  threads?: number;
  /** Current working directory */
  cwd?: string;
  /** Associated repository path */
  repoPath?: string;
  /** Heuristic state (WORKING, WAITING, STALLED) */
  state?: string;
  /** Whether process is sandboxed */
  sandboxed?: boolean;
  /** Sandbox type if sandboxed */
  sandboxType?: string;
  /** Process start time (milliseconds) */
  startTime?: number;
}

/**
 * Schema for a lifecycle event (process start/end).
 */
export interface ProcessLifecycleEvent {
  /** Event type */
  type: "process_start" | "process_end";
  /** Unix timestamp (milliseconds) */
  timestamp: number;
  /** Process ID */
  pid: number;
  /** Agent label */
  label: string;
  /** Command line */
  cmdline: string;
  /** Working directory */
  cwd?: string;
  /** Repository path */
  repoPath?: string;
  /** Duration in milliseconds (for process_end) */
  durationMs?: number;
}

export interface ProcessLoggerConfig {
  /** Directory to store process logs */
  logDir: string;
  /** How often to log snapshots (in scan cycles, not seconds) */
  snapshotInterval: number;
  /** Maximum age of log files in days before cleanup */
  maxAgeDays: number;
  /** Maximum number of log files to keep */
  maxFiles: number;
}

const DEFAULT_CONFIG: ProcessLoggerConfig = {
  logDir: "~/.agentwatch/processes",
  snapshotInterval: 10, // Log every 10th scan (every ~10 seconds with default 1s scan)
  maxAgeDays: 30,
  maxFiles: 100
};

/**
 * Logger for agent process activity.
 */
export class ProcessLogger {
  private config: ProcessLoggerConfig;
  private logDir: string;
  private scanCount = 0;
  private knownPids = new Set<number>();
  private pidStartTimes = new Map<number, number>();

  constructor(config: Partial<ProcessLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = this.config.logDir.startsWith("~")
      ? join(homedir(), this.config.logDir.slice(1))
      : this.config.logDir;

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log agent processes from a scan cycle.
   * Called by ProcessScanner after each scan.
   *
   * @param agents Map of detected agent processes
   */
  logProcesses(agents: Map<number, AgentProcess>): void {
    const now = Date.now();
    this.scanCount++;

    // Track lifecycle events (new/ended processes)
    this.trackLifecycle(agents, now);

    // Periodic snapshots
    if (this.scanCount % this.config.snapshotInterval === 0) {
      this.writeSnapshots(agents, now);
    }
  }

  /**
   * Track process lifecycle events.
   */
  private trackLifecycle(agents: Map<number, AgentProcess>, now: number): void {
    const currentPids = new Set(agents.keys());

    // Detect new processes
    for (const [pid, agent] of agents) {
      if (!this.knownPids.has(pid)) {
        this.knownPids.add(pid);
        this.pidStartTimes.set(pid, agent.startTime ?? now);

        const event: ProcessLifecycleEvent = {
          type: "process_start",
          timestamp: now,
          pid,
          label: agent.label,
          cmdline: agent.cmdline,
          cwd: agent.cwd,
          repoPath: agent.repoPath
        };
        this.writeEvent(event);
      }
    }

    // Detect ended processes
    for (const pid of this.knownPids) {
      if (!currentPids.has(pid)) {
        const startTime = this.pidStartTimes.get(pid);
        const durationMs = startTime ? now - startTime : undefined;

        const event: ProcessLifecycleEvent = {
          type: "process_end",
          timestamp: now,
          pid,
          label: "unknown", // Process is gone, we don't have the label
          cmdline: "",
          durationMs
        };
        this.writeEvent(event);

        this.knownPids.delete(pid);
        this.pidStartTimes.delete(pid);
      }
    }
  }

  /**
   * Write process snapshots to the daily log file.
   */
  private writeSnapshots(agents: Map<number, AgentProcess>, now: number): void {
    if (agents.size === 0) return;

    for (const agent of agents.values()) {
      const snapshot: ProcessSnapshot = {
        timestamp: now,
        pid: agent.pid,
        label: agent.label,
        cmdline: agent.cmdline,
        exe: agent.exe,
        cpuPct: agent.cpuPct,
        rssKb: agent.rssKb,
        threads: agent.threads,
        cwd: agent.cwd,
        repoPath: agent.repoPath,
        state: agent.heuristicState?.state,
        sandboxed: agent.sandboxed,
        sandboxType: agent.sandboxType,
        startTime: agent.startTime
      };
      this.writeSnapshot(snapshot);
    }
  }

  /**
   * Write a snapshot to the daily log file.
   */
  private writeSnapshot(snapshot: ProcessSnapshot): void {
    try {
      const date = new Date(snapshot.timestamp).toISOString().slice(0, 10);
      const filename = `snapshots_${date}.jsonl`;
      const filepath = join(this.logDir, filename);
      appendFileSync(filepath, JSON.stringify(snapshot) + "\n");
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Write a lifecycle event to the events log.
   */
  private writeEvent(event: ProcessLifecycleEvent): void {
    try {
      const date = new Date(event.timestamp).toISOString().slice(0, 10);
      const filename = `events_${date}.jsonl`;
      const filepath = join(this.logDir, filename);
      appendFileSync(filepath, JSON.stringify(event) + "\n");
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Rotate old log files.
   */
  rotateLogs(): number {
    let deleted = 0;
    const now = Date.now();
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;

    try {
      const files: { path: string; mtime: number }[] = [];

      for (const name of readdirSync(this.logDir)) {
        if (!name.endsWith(".jsonl")) continue;
        const filepath = join(this.logDir, name);
        const stats = statSync(filepath);
        files.push({ path: filepath, mtime: stats.mtimeMs });
      }

      // Delete files older than maxAgeDays
      for (const { path, mtime } of files) {
        if (now - mtime > maxAgeMs) {
          try {
            unlinkSync(path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }

      // If still too many files, delete oldest
      const remaining = files.filter(({ path }) => existsSync(path));
      remaining.sort((a, b) => b.mtime - a.mtime);

      while (remaining.length > this.config.maxFiles) {
        const oldest = remaining.pop();
        if (oldest) {
          try {
            unlinkSync(oldest.path);
            deleted++;
          } catch {
            // Ignore deletion errors
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return deleted;
  }

  /**
   * Get the log directory path.
   */
  getLogDir(): string {
    return this.logDir;
  }

  /**
   * List available snapshot files with metadata.
   */
  listSnapshotFiles(): ProcessSnapshotFileInfo[] {
    const files: ProcessSnapshotFileInfo[] = [];

    try {
      for (const name of readdirSync(this.logDir)) {
        if (!name.startsWith("snapshots_") || !name.endsWith(".jsonl"))
          continue;

        const filepath = join(this.logDir, name);
        const stats = statSync(filepath);

        // Extract date from filename: snapshots_YYYY-MM-DD.jsonl
        const dateMatch = name.match(/snapshots_(\d{4}-\d{2}-\d{2})\.jsonl/);
        const date = dateMatch?.[1] ?? name;

        files.push({
          filename: name,
          path: filepath,
          date,
          sizeBytes: stats.size,
          modifiedAt: stats.mtimeMs
        });
      }

      // Sort by date descending
      files.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * List available event files with metadata.
   */
  listEventFiles(): ProcessEventFileInfo[] {
    const files: ProcessEventFileInfo[] = [];

    try {
      for (const name of readdirSync(this.logDir)) {
        if (!name.startsWith("events_") || !name.endsWith(".jsonl")) continue;

        const filepath = join(this.logDir, name);
        const stats = statSync(filepath);

        // Extract date from filename: events_YYYY-MM-DD.jsonl
        const dateMatch = name.match(/events_(\d{4}-\d{2}-\d{2})\.jsonl/);
        const date = dateMatch?.[1] ?? name;

        files.push({
          filename: name,
          path: filepath,
          date,
          sizeBytes: stats.size,
          modifiedAt: stats.mtimeMs
        });
      }

      // Sort by date descending
      files.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      // Ignore errors
    }

    return files;
  }

  /**
   * Read snapshots from a specific date file.
   */
  readSnapshots(date: string): ProcessSnapshot[] {
    const filepath = join(this.logDir, `snapshots_${date}.jsonl`);
    return this.readJsonlFile<ProcessSnapshot>(filepath);
  }

  /**
   * Read lifecycle events from a specific date file.
   */
  readEvents(date: string): ProcessLifecycleEvent[] {
    const filepath = join(this.logDir, `events_${date}.jsonl`);
    return this.readJsonlFile<ProcessLifecycleEvent>(filepath);
  }

  /**
   * Read all snapshots within a time range.
   */
  readSnapshotsInRange(startDate: string, endDate: string): ProcessSnapshot[] {
    const files = this.listSnapshotFiles();
    const snapshots: ProcessSnapshot[] = [];

    for (const file of files) {
      if (file.date >= startDate && file.date <= endDate) {
        snapshots.push(...this.readSnapshots(file.date));
      }
    }

    return snapshots;
  }

  /**
   * Read all events within a time range.
   */
  readEventsInRange(
    startDate: string,
    endDate: string
  ): ProcessLifecycleEvent[] {
    const files = this.listEventFiles();
    const events: ProcessLifecycleEvent[] = [];

    for (const file of files) {
      if (file.date >= startDate && file.date <= endDate) {
        events.push(...this.readEvents(file.date));
      }
    }

    return events;
  }

  /**
   * Get summary stats about process data.
   */
  getSummaryStats(): ProcessLogSummary {
    const snapshotFiles = this.listSnapshotFiles();
    const eventFiles = this.listEventFiles();

    let totalSnapshots = 0;
    let totalEvents = 0;
    let totalSizeBytes = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const file of snapshotFiles) {
      totalSizeBytes += file.sizeBytes;
      // Rough estimate: count lines in file
      const snapshots = this.readSnapshots(file.date);
      totalSnapshots += snapshots.length;

      if (!earliestDate || file.date < earliestDate) earliestDate = file.date;
      if (!latestDate || file.date > latestDate) latestDate = file.date;
    }

    for (const file of eventFiles) {
      totalSizeBytes += file.sizeBytes;
      const events = this.readEvents(file.date);
      totalEvents += events.length;

      if (!earliestDate || file.date < earliestDate) earliestDate = file.date;
      if (!latestDate || file.date > latestDate) latestDate = file.date;
    }

    return {
      snapshotFileCount: snapshotFiles.length,
      eventFileCount: eventFiles.length,
      totalSnapshots,
      totalEvents,
      totalSizeBytes,
      earliestDate,
      latestDate,
      logDir: this.logDir
    };
  }

  /**
   * Helper to read a JSONL file.
   */
  private readJsonlFile<T>(filepath: string): T[] {
    const items: T[] = [];

    try {
      if (!existsSync(filepath)) return items;

      const content = require("fs").readFileSync(filepath, "utf-8");
      for (const line of content.split("\n")) {
        if (line.trim()) {
          try {
            items.push(JSON.parse(line) as T);
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return items;
  }
}

/**
 * Metadata about a snapshot file.
 */
export interface ProcessSnapshotFileInfo {
  filename: string;
  path: string;
  date: string;
  sizeBytes: number;
  modifiedAt: number;
}

/**
 * Metadata about an event file.
 */
export interface ProcessEventFileInfo {
  filename: string;
  path: string;
  date: string;
  sizeBytes: number;
  modifiedAt: number;
}

/**
 * Summary statistics about process logs.
 */
export interface ProcessLogSummary {
  snapshotFileCount: number;
  eventFileCount: number;
  totalSnapshots: number;
  totalEvents: number;
  totalSizeBytes: number;
  earliestDate: string | null;
  latestDate: string | null;
  logDir: string;
}
