import { Box, Text } from "ink";
import React from "react";
import type { HookSession } from "../types.js";

interface HooksPaneProps {
  sessions: HookSession[];
  selection: number;
  focused: boolean;
  height: number;
}

function getProjectName(cwd: string): string {
  return cwd.split("/").pop() || cwd;
}

function getStateColor(session: HookSession): string {
  if (!session.active) return "gray";
  if (session.awaiting_user) return "yellow";
  return "green";
}

function getStateIndicator(session: HookSession): string {
  if (!session.active) return "o";
  if (session.awaiting_user) return "*";
  return "*";
}

export function HooksPane({
  sessions,
  selection,
  focused,
  height
}: HooksPaneProps) {
  const activeSessions = sessions.filter((s) => s.active);
  const recentSessions = sessions.filter((s) => !s.active).slice(0, 5);
  const allSessions = [...activeSessions, ...recentSessions];

  // Calculate visible window
  const visibleRows = Math.max(1, height - 2);
  const scrollOffset = Math.max(
    0,
    Math.min(
      selection - Math.floor(visibleRows / 2),
      allSessions.length - visibleRows
    )
  );
  const visibleSlice = allSessions.slice(
    scrollOffset,
    scrollOffset + visibleRows
  );

  return (
    <Box flexDirection="column" height={height}>
      {/* Column header */}
      <Box paddingX={1}>
        <Text color="cyan" bold>
          {"  "}Session{"        "}Tools{"  "}Project
        </Text>
      </Box>

      {/* Sessions list */}
      <Box flexDirection="column" flexGrow={1}>
        {allSessions.length === 0 && (
          <Box paddingX={1}>
            <Text color="gray">No Claude Code sessions</Text>
          </Box>
        )}

        {visibleSlice.map((session, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selection && focused;
          const stateColor = getStateColor(session);
          const indicator = getStateIndicator(session);
          const projectName = getProjectName(session.cwd);

          return (
            <Box key={session.session_id} paddingX={1}>
              <Text inverse={isSelected}>
                <Text color={stateColor}>{indicator}</Text>
                {"  "}
                <Text color="gray">{session.session_id.slice(0, 8)}...</Text>
                {"  "}
                <Text color="white">
                  {String(session.tool_count).padStart(5)}
                </Text>
                {"  "}
                <Text color={session.active ? "white" : "gray"}>
                  {projectName}
                </Text>
                {session.awaiting_user && (
                  <Text color="yellow"> [waiting]</Text>
                )}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status line */}
      <Box paddingX={1} justifyContent="space-between">
        <Text color="gray">
          Active: <Text color="green">{activeSessions.length}</Text>
          {" | "}
          Recent: <Text color="gray">{recentSessions.length}</Text>
        </Text>
        {allSessions.length > visibleRows && (
          <Text color="gray">
            {Math.floor(
              (selection / Math.max(1, allSessions.length - 1)) * 100
            )}
            %
          </Text>
        )}
      </Box>
    </Box>
  );
}
