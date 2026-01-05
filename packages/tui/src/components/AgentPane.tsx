import { Box, Text } from "ink";
import React from "react";
import type { AgentProcess } from "../types.js";

interface AgentPaneProps {
  agents: AgentProcess[];
  selection: number;
  focused: boolean;
  filter: string;
  groupAgents: boolean;
  collapsedGroups: Set<string>;
  height: number;
}

interface AgentRow {
  kind: "agent" | "group";
  key: string;
  label: string;
  depth: number;
  count?: number;
  agent?: AgentProcess;
}

function buildAgentRows(
  agents: AgentProcess[],
  groupAgents: boolean,
  collapsedGroups: Set<string>
): AgentRow[] {
  if (!groupAgents) {
    return agents.map((agent) => ({
      kind: "agent",
      key: `agent-${agent.pid}`,
      label: agent.label,
      depth: 0,
      agent
    }));
  }

  const rows: AgentRow[] = [];
  const byLabel = new Map<string, AgentProcess[]>();

  for (const agent of agents) {
    const list = byLabel.get(agent.label) || [];
    list.push(agent);
    byLabel.set(agent.label, list);
  }

  for (const [label, labelAgents] of byLabel) {
    rows.push({
      kind: "group",
      key: `group-${label}`,
      label,
      depth: 0,
      count: labelAgents.length
    });

    if (!collapsedGroups.has(label)) {
      for (const agent of labelAgents) {
        rows.push({
          kind: "agent",
          key: `agent-${agent.pid}`,
          label: agent.label,
          depth: 1,
          agent
        });
      }
    }
  }

  return rows;
}

function getStateColor(agent: AgentProcess): string {
  if (agent.wrapper_state) {
    const state = agent.wrapper_state.state;
    if (agent.wrapper_state.awaiting_user) {
      return "yellow";
    }
    switch (state) {
      case "active":
      case "working":
        return "green";
      case "idle":
        return "gray";
      case "stalled":
        return "red";
      default:
        return "white";
    }
  }

  if (agent.heuristic_state) {
    switch (agent.heuristic_state.state) {
      case "WORKING":
        return "green";
      case "STALLED":
        return "red";
      case "WAITING":
      default:
        return "gray";
    }
  }

  return "gray";
}

function getStateIndicator(agent: AgentProcess): string {
  if (agent.wrapper_state) {
    if (agent.wrapper_state.awaiting_user) {
      return "◆";
    }
    const state = agent.wrapper_state.state;
    switch (state) {
      case "active":
      case "working":
        return "●";
      case "idle":
        return "◐";
      case "stalled":
        return "✗";
      default:
        return "○";
    }
  }

  if (agent.heuristic_state) {
    switch (agent.heuristic_state.state) {
      case "WORKING":
        return "●";
      case "STALLED":
        return "✗";
      case "WAITING":
      default:
        return "○";
    }
  }

  return "○";
}

export function AgentPane({
  agents,
  selection,
  focused,
  filter,
  groupAgents,
  collapsedGroups,
  height
}: AgentPaneProps) {
  const rows = buildAgentRows(agents, groupAgents, collapsedGroups);

  // Calculate visible window
  const visibleRows = Math.max(1, height - 2);
  const scrollOffset = Math.max(
    0,
    Math.min(selection - Math.floor(visibleRows / 2), rows.length - visibleRows)
  );
  const visibleSlice = rows.slice(scrollOffset, scrollOffset + visibleRows);

  return (
    <Box flexDirection="column" height={height}>
      {/* Column header */}
      <Box paddingX={1}>
        <Text color="cyan" bold>
          {"  "}PID{"    "}State{"  "}CPU{"  "}Label
        </Text>
      </Box>

      {/* Agent list */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleSlice.length === 0 && (
          <Box paddingX={1}>
            <Text color="gray">
              {filter ? "No matching agents" : "No agents running"}
            </Text>
          </Box>
        )}

        {visibleSlice.map((row, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selection && focused;
          const indent = "  ".repeat(row.depth);

          if (row.kind === "group") {
            const collapsed = collapsedGroups.has(row.label);
            return (
              <Box key={row.key} paddingX={1}>
                <Text inverse={isSelected} color="blue" bold>
                  {indent}
                  {collapsed ? "▸" : "▾"} {row.label} ({row.count})
                </Text>
              </Box>
            );
          }

          const agent = row.agent!;
          const stateColor = getStateColor(agent);
          const indicator = getStateIndicator(agent);

          return (
            <Box key={row.key} paddingX={1}>
              <Text inverse={isSelected}>
                {indent}
                <Text color="gray">{String(agent.pid).padStart(6)}</Text>
                {"  "}
                <Text color={stateColor}>{indicator}</Text>
                {"     "}
                <Text color="gray">
                  {agent.cpu_pct.toFixed(0).padStart(3)}%
                </Text>
                {"  "}
                <Text color="white">{agent.label}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {rows.length > visibleRows && (
        <Box paddingX={1} justifyContent="flex-end">
          <Text color="gray">
            {Math.floor((selection / Math.max(1, rows.length - 1)) * 100)}%
          </Text>
        </Box>
      )}
    </Box>
  );
}
