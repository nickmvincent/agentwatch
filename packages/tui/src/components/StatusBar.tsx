import { Box, Text } from "ink";
import React from "react";

interface StatusBarProps {
  focus: "agents" | "repos" | "hooks" | "ports" | "contrib";
  showRepos: boolean;
  showHooks?: boolean;
  showPorts?: boolean;
  showContrib?: boolean;
  message: string | null;
  error: string | null;
}

export function StatusBar({
  focus,
  showRepos,
  showHooks,
  showPorts,
  showContrib,
  message,
  error
}: StatusBarProps) {
  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      <Box flexGrow={1}>
        {error ? (
          <Text color="red">{error}</Text>
        ) : message ? (
          <Text color="yellow">{message}</Text>
        ) : (
          <Text color="gray">
            {showRepos && (
              <>
                <Text color={focus === "repos" ? "cyan" : "gray"}>[Repos]</Text>
                <Text> </Text>
              </>
            )}
            {showHooks && (
              <>
                <Text color={focus === "hooks" ? "cyan" : "gray"}>[Hooks]</Text>
                <Text> </Text>
              </>
            )}
            {showPorts && (
              <>
                <Text color={focus === "ports" ? "cyan" : "gray"}>[Ports]</Text>
                <Text> </Text>
              </>
            )}
            {showContrib && (
              <>
                <Text color={focus === "contrib" ? "cyan" : "gray"}>
                  [Share]
                </Text>
                <Text> </Text>
              </>
            )}
            <Text color={focus === "agents" ? "cyan" : "gray"}>[Agents]</Text>
            <Text> </Text>
            <Text>?:Help q:Quit R:Repos H:Hooks P:Ports S:Share</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
