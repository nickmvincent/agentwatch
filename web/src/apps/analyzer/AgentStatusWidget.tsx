/**
 * AgentStatusWidget - Shows real-time agent status from the watcher.
 *
 * Displays a compact summary of running agents fetched from the watcher API.
 */

import { useEffect, useState } from "react";

interface AgentProcess {
  pid: number;
  label: string;
  cwd: string | null;
  cpu_pct: number;
  rss_kb: number;
  heuristic_state?: {
    state: string;
  };
}

interface HookSession {
  session_id: string;
  active: boolean;
  tool_count: number;
  cwd: string;
}

const WATCHER_URL = "http://localhost:8420";

export function AgentStatusWidget() {
  const [agents, setAgents] = useState<AgentProcess[]>([]);
  const [sessions, setSessions] = useState<HookSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [agentsRes, sessionsRes] = await Promise.all([
          fetch(`${WATCHER_URL}/api/agents`),
          fetch(`${WATCHER_URL}/api/hooks/sessions?active=true`)
        ]);

        if (agentsRes.ok && sessionsRes.ok) {
          const agentsData = await agentsRes.json();
          const sessionsData = await sessionsRes.json();
          setAgents(agentsData);
          setSessions(sessionsData);
          setConnected(true);
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
        setAgents([]);
        setSessions([]);
      }
    };

    fetchStatus();
    // Poll every 5 seconds for real-time updates
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!connected) {
    return null; // Don't show widget if watcher isn't running
  }

  const activeAgents = agents.filter((a) => {
    const state = a.heuristic_state?.state?.toUpperCase();
    return state === "ACTIVE" || state === "WORKING";
  });

  const waitingAgents = agents.filter((a) => {
    const state = a.heuristic_state?.state?.toUpperCase();
    return state === "IDLE" || state === "WAITING";
  });

  const activeSessions = sessions.filter((s) => s.active);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-lg transition-all ${
          expanded ? "w-80" : "w-auto"
        }`}
      >
        {/* Collapsed view - just counts */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 flex items-center gap-3 text-sm hover:bg-gray-750 rounded-lg"
        >
          <div className="flex items-center gap-2">
            {activeAgents.length > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                {activeAgents.length}
              </span>
            )}
            {waitingAgents.length > 0 && (
              <span className="flex items-center gap-1 text-yellow-400">
                <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                {waitingAgents.length}
              </span>
            )}
            {agents.length === 0 && (
              <span className="text-gray-500">No agents</span>
            )}
          </div>
          <span className="text-gray-500">{expanded ? "▼" : "▲"}</span>
        </button>

        {/* Expanded view - agent list */}
        {expanded && agents.length > 0 && (
          <div className="border-t border-gray-700 px-3 py-2 max-h-64 overflow-auto">
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentRow
                  key={agent.pid}
                  agent={agent}
                  session={activeSessions.find((s) => s.cwd === agent.cwd)}
                />
              ))}
            </div>
            <a
              href={WATCHER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-2 text-xs text-blue-400 hover:text-blue-300 text-center"
            >
              Open Watcher Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  session
}: {
  agent: AgentProcess;
  session?: HookSession;
}) {
  const state = agent.heuristic_state?.state?.toUpperCase() || "?";
  const stateColor =
    state === "ACTIVE" || state === "WORKING"
      ? "bg-green-400"
      : state === "IDLE" || state === "WAITING"
        ? "bg-yellow-400"
        : state === "STALLED"
          ? "bg-red-400"
          : "bg-gray-400";

  const projectName = agent.cwd?.split("/").pop() || "unknown";

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${stateColor}`} />
        <span className="text-white font-medium">{agent.label}</span>
        <span
          className="text-gray-500 truncate max-w-24"
          title={agent.cwd || ""}
        >
          {projectName}
        </span>
      </div>
      <div className="flex items-center gap-2 text-gray-400">
        {session && <span>{session.tool_count} tools</span>}
        <span>{agent.cpu_pct?.toFixed(0) || 0}%</span>
      </div>
    </div>
  );
}
