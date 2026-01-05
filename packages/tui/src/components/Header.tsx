import { Box, Text } from "ink";
import React from "react";

interface HeaderProps {
  connected: boolean;
  agentCount: number;
  repoCount: number;
  paused: boolean;
}

export function Header({
  connected,
  agentCount,
  repoCount,
  paused
}: HeaderProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Box flexGrow={1}>
        <Text bold color="cyan">
          AgentWatch
        </Text>
        <Text color="gray"> │ </Text>
        <Text color={connected ? "green" : "red"}>{connected ? "●" : "○"}</Text>
        <Text color="gray"> │ </Text>
        <Text>
          <Text color="blue">{agentCount}</Text>
          <Text color="gray"> agents</Text>
        </Text>
        <Text color="gray"> │ </Text>
        <Text>
          <Text color="yellow">{repoCount}</Text>
          <Text color="gray"> repos</Text>
        </Text>
        {paused && (
          <>
            <Text color="gray"> │ </Text>
            <Text color="yellow" bold>
              PAUSED
            </Text>
          </>
        )}
      </Box>
      <Text color="gray">?=help q=quit</Text>
    </Box>
  );
}
