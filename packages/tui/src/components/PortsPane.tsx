import { Box, Text } from "ink";
import React from "react";
import type { ListeningPort } from "../types.js";

interface PortsPaneProps {
  ports: ListeningPort[];
  selection: number;
  focused: boolean;
  height: number;
}

function getPortColor(port: ListeningPort): string {
  if (port.agent_label) return "green";
  return "white";
}

function formatBindAddress(addr: string): string {
  if (addr === "*" || addr === "0.0.0.0") return "*";
  if (addr === "::") return "::";
  if (addr === "127.0.0.1" || addr === "::1") return "local";
  return addr.slice(0, 10);
}

export function PortsPane({
  ports,
  selection,
  focused,
  height
}: PortsPaneProps) {
  // Sort by port number
  const sortedPorts = [...ports].sort((a, b) => a.port - b.port);

  // Calculate visible window
  const visibleRows = Math.max(1, height - 2);
  const scrollOffset = Math.max(
    0,
    Math.min(
      selection - Math.floor(visibleRows / 2),
      sortedPorts.length - visibleRows
    )
  );
  const visibleSlice = sortedPorts.slice(
    scrollOffset,
    scrollOffset + visibleRows
  );

  const agentLinkedCount = ports.filter((p) => p.agent_label).length;

  return (
    <Box flexDirection="column" height={height}>
      {/* Column header */}
      <Box paddingX={1}>
        <Text color="cyan" bold>
          {"  "}Port{"   "}Bind{"      "}Process{"       "}Agent
        </Text>
      </Box>

      {/* Ports list */}
      <Box flexDirection="column" flexGrow={1}>
        {sortedPorts.length === 0 && (
          <Box paddingX={1}>
            <Text color="gray">No listening ports detected</Text>
          </Box>
        )}

        {visibleSlice.map((port, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selection && focused;
          const color = getPortColor(port);
          const bindAddr = formatBindAddress(port.bind_address);

          return (
            <Box key={port.port} paddingX={1}>
              <Text inverse={isSelected}>
                <Text color={port.agent_label ? "green" : "gray"}>*</Text>
                {"  "}
                <Text color={color}>{String(port.port).padEnd(6)}</Text>
                <Text color="gray">{bindAddr.padEnd(10)}</Text>
                <Text color="white">
                  {port.process_name.slice(0, 12).padEnd(14)}
                </Text>
                {port.agent_label ? (
                  <Text color="green">{port.agent_label}</Text>
                ) : (
                  <Text color="gray">-</Text>
                )}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status line */}
      <Box paddingX={1} justifyContent="space-between">
        <Text color="gray">
          Listening: <Text color="cyan">{ports.length}</Text>
          {" | "}
          Agent-linked: <Text color="green">{agentLinkedCount}</Text>
        </Text>
        {sortedPorts.length > visibleRows && (
          <Text color="gray">
            {Math.floor(
              (selection / Math.max(1, sortedPorts.length - 1)) * 100
            )}
            %
          </Text>
        )}
      </Box>
    </Box>
  );
}
