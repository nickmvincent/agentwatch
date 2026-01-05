/**
 * In-memory data store for agents, repos, and wrapper states.
 * Ported from agentwatch/store.py
 */

import type {
  AgentProcess,
  AgentWrapperState,
  ListeningPort,
  RepoStatus
} from "@agentwatch/core";

export type ReposChangeCallback = (repos: RepoStatus[]) => void;
export type AgentsChangeCallback = (agents: AgentProcess[]) => void;
export type PortsChangeCallback = (ports: ListeningPort[]) => void;
export type WrapperOutputCallback = (
  pid: number,
  line: string,
  timestamp: number
) => void;

/**
 * Thread-safe in-memory store for monitoring data.
 */
export class DataStore {
  private repos: Map<string, RepoStatus> = new Map();
  private agents: Map<number, AgentProcess> = new Map();
  private ports: Map<number, ListeningPort> = new Map();
  private repoErrors: string[] = [];
  private repoIgnoredCount = 0;
  private repoReminders: string[] = [];
  private wrapperStates: Map<number, AgentWrapperState> = new Map();

  // Callbacks
  private onReposChange?: ReposChangeCallback;
  private onAgentsChange?: AgentsChangeCallback;
  private onPortsChange?: PortsChangeCallback;
  private onWrapperOutput?: WrapperOutputCallback;

  /**
   * Set callbacks for state change notifications.
   */
  setCallbacks(callbacks: {
    onReposChange?: ReposChangeCallback;
    onAgentsChange?: AgentsChangeCallback;
    onPortsChange?: PortsChangeCallback;
    onWrapperOutput?: WrapperOutputCallback;
  }): void {
    this.onReposChange = callbacks.onReposChange;
    this.onAgentsChange = callbacks.onAgentsChange;
    this.onPortsChange = callbacks.onPortsChange;
    this.onWrapperOutput = callbacks.onWrapperOutput;
  }

  /**
   * Update repository data from scanner.
   */
  updateRepos(
    repos: Map<string, RepoStatus>,
    errors: string[] = [],
    ignoredCount = 0,
    reminders: string[] = []
  ): void {
    this.repos = new Map(repos);
    this.repoErrors = [...errors];
    this.repoIgnoredCount = ignoredCount;
    this.repoReminders = [...reminders];

    if (this.onReposChange) {
      try {
        this.onReposChange([...this.repos.values()]);
      } catch {
        // Callback error
      }
    }
  }

  /**
   * Update agent data from scanner.
   */
  updateAgents(agents: Map<number, AgentProcess>): void {
    // Merge with wrapper states
    const merged = new Map<number, AgentProcess>();

    for (const [pid, agent] of agents) {
      const wrapperState = this.wrapperStates.get(pid);
      if (wrapperState) {
        merged.set(pid, { ...agent, wrapperState });
      } else {
        merged.set(pid, agent);
      }
    }

    this.agents = merged;

    if (this.onAgentsChange) {
      try {
        this.onAgentsChange([...this.agents.values()]);
      } catch {
        // Callback error
      }
    }
  }

  /**
   * Update port data from scanner.
   */
  updatePorts(ports: Map<number, ListeningPort>): void {
    this.ports = new Map(ports);

    if (this.onPortsChange) {
      try {
        this.onPortsChange([...this.ports.values()]);
      } catch {
        // Callback error
      }
    }
  }

  /**
   * Update wrapper state for a specific agent.
   */
  updateWrapperState(pid: number, state: AgentWrapperState): void {
    this.wrapperStates.set(pid, state);
  }

  /**
   * Remove wrapper state when agent exits.
   */
  removeWrapperState(pid: number): void {
    this.wrapperStates.delete(pid);
  }

  /**
   * Get snapshot of all repos.
   */
  snapshotRepos(): RepoStatus[] {
    return [...this.repos.values()];
  }

  /**
   * Get snapshot of all agents.
   */
  snapshotAgents(): AgentProcess[] {
    return [...this.agents.values()];
  }

  /**
   * Get snapshot of all ports.
   */
  snapshotPorts(): ListeningPort[] {
    return [...this.ports.values()];
  }

  /**
   * Get snapshot of wrapper states.
   */
  snapshotWrapperStates(): Map<number, AgentWrapperState> {
    return new Map(this.wrapperStates);
  }

  /**
   * Get repo scan errors.
   */
  snapshotRepoErrors(): string[] {
    return [...this.repoErrors];
  }

  /**
   * Get count of ignored repos.
   */
  snapshotRepoIgnoredCount(): number {
    return this.repoIgnoredCount;
  }

  /**
   * Get repo reminders.
   */
  snapshotRepoReminders(): string[] {
    return [...this.repoReminders];
  }

  /**
   * Get a specific agent by PID.
   */
  getAgent(pid: number): AgentProcess | undefined {
    return this.agents.get(pid);
  }

  /**
   * Get a specific repo by path.
   */
  getRepo(path: string): RepoStatus | undefined {
    return this.repos.get(path);
  }

  /**
   * Get a specific port by port number.
   */
  getPort(port: number): ListeningPort | undefined {
    return this.ports.get(port);
  }

  /**
   * Clean up orphaned wrapper states for PIDs that no longer exist.
   * @returns List of PIDs whose wrapper states were removed
   */
  cleanupOrphanedWrapperStates(): number[] {
    const orphanedPids: number[] = [];

    for (const pid of this.wrapperStates.keys()) {
      if (!this.agents.has(pid)) {
        this.wrapperStates.delete(pid);
        orphanedPids.push(pid);
      }
    }

    return orphanedPids;
  }

  /**
   * Get all current agent PIDs.
   */
  getAgentPids(): number[] {
    return [...this.agents.keys()];
  }

  /**
   * Get agents as a map with cwd and label for session matching.
   */
  getAgentsForSessionMatching(): Map<
    number,
    { cwd: string | undefined; label: string }
  > {
    const result = new Map<
      number,
      { cwd: string | undefined; label: string }
    >();
    for (const [pid, agent] of this.agents) {
      result.set(pid, { cwd: agent.cwd, label: agent.label });
    }
    return result;
  }
}
