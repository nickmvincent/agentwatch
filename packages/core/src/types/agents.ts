/**
 * Agent/process monitoring types
 * Ported from agentwatch/models.py
 */

/** Heuristic state derived from process metrics */
export interface AgentHeuristicState {
  /** Current state: WORKING, WAITING, STALLED, IDLE */
  state: AgentState;
  /** Recent CPU percentage (0-100) */
  cpuPctRecent: number;
  /** Seconds since last CPU activity */
  quietSeconds: number;
}

/** State from wrapper process (more accurate than heuristic) */
export interface AgentWrapperState {
  /** Current state */
  state: AgentState;
  /** Unix timestamp of last output */
  lastOutputTime: number;
  /** Recent output lines (for display) */
  lastLines: string[];
  /** True if agent is waiting for user input */
  awaitingUser: boolean;
  /** Command line used to start the agent */
  cmdline?: string;
  /** Current working directory */
  cwd?: string;
  /** Unix timestamp when agent started */
  startTime?: number;
  /** Agent label (claude, codex, cursor, etc.) */
  label?: string;
}

/** Agent state enum */
export type AgentState = "WORKING" | "WAITING" | "STALLED" | "IDLE" | "UNKNOWN";

/** Source of agent data */
export type AgentSource = "claude" | "codex" | "cursor" | "opencode" | "custom";

/** A running agent process */
export interface AgentProcess {
  /** Process ID */
  pid: number;
  /** Agent type label (claude, codex, etc.) */
  label: string;
  /** Full command line */
  cmdline: string;
  /** Executable path */
  exe: string;
  /** Unix timestamp when process started */
  startTime: number;
  /** CPU percentage (0-100) */
  cpuPct: number;
  /** Resident set size in KB */
  rssKb?: number;
  /** Thread count */
  threads?: number;
  /** TTY device */
  tty?: string;
  /** Current working directory */
  cwd?: string;
  /** Associated repository path */
  repoPath?: string;
  /** Heuristic state (from process scanning) */
  heuristicState?: AgentHeuristicState;
  /** Wrapper state (from wrapper process) */
  wrapperState?: AgentWrapperState;
  /** Whether running in a sandbox (Docker container) */
  sandboxed?: boolean;
  /** Sandbox type if sandboxed */
  sandboxType?: "docker" | "macos" | "unknown";
}

/** Agent matcher configuration */
export interface AgentMatcher {
  /** Label to apply when matched */
  label: string;
  /** Matcher type */
  type: "cmd_regex" | "exe_prefix" | "exe_suffix";
  /** Pattern to match against */
  pattern: string;
}

/** Derived state from either heuristic or wrapper */
export function getAgentState(agent: AgentProcess): AgentState {
  if (agent.wrapperState) {
    return agent.wrapperState.state;
  }
  if (agent.heuristicState) {
    return agent.heuristicState.state;
  }
  return "UNKNOWN";
}

/** Check if agent is waiting for user input */
export function isAwaitingUser(agent: AgentProcess): boolean {
  return agent.wrapperState?.awaitingUser ?? false;
}
