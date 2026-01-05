import { Box, Text } from "ink";
import React from "react";
import type { RepoStatus } from "../types.js";

interface RepoPaneProps {
  repos: RepoStatus[];
  selection: number;
  focused: boolean;
  filter: string;
  height: number;
}

function getRepoColor(repo: RepoStatus): string {
  if (repo.staged > 0) {
    return "green";
  }
  if (repo.unstaged > 0 || repo.untracked > 0) {
    return "yellow";
  }
  return "gray";
}

function formatChanges(repo: RepoStatus): string {
  const parts: string[] = [];

  if (repo.staged > 0) {
    parts.push(`+${repo.staged}`);
  }
  if (repo.unstaged > 0) {
    parts.push(`~${repo.unstaged}`);
  }
  if (repo.untracked > 0) {
    parts.push(`?${repo.untracked}`);
  }

  return parts.join(" ") || "clean";
}

export function RepoPane({
  repos,
  selection,
  focused,
  filter,
  height
}: RepoPaneProps) {
  // Calculate visible window
  const visibleRows = Math.max(1, height - 2);
  const scrollOffset = Math.max(
    0,
    Math.min(
      selection - Math.floor(visibleRows / 2),
      repos.length - visibleRows
    )
  );
  const visibleSlice = repos.slice(scrollOffset, scrollOffset + visibleRows);

  return (
    <Box flexDirection="column" height={height}>
      {/* Column header */}
      <Box paddingX={1}>
        <Text color="cyan" bold>
          Repository{"           "}Branch{"      "}Changes
        </Text>
      </Box>

      {/* Repo list */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleSlice.length === 0 && (
          <Box paddingX={1}>
            <Text color="gray">
              {filter ? "No matching repos" : "No repos found"}
            </Text>
          </Box>
        )}

        {visibleSlice.map((repo, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selection && focused;
          const color = getRepoColor(repo);
          const changes = formatChanges(repo);

          return (
            <Box key={repo.repo_id} paddingX={1}>
              <Text inverse={isSelected}>
                <Text color={repo.dirty ? "yellow" : "white"}>
                  {repo.name.slice(0, 20).padEnd(20)}
                </Text>
                {"  "}
                <Text color="cyan">
                  {(repo.branch ?? "-").slice(0, 12).padEnd(12)}
                </Text>
                {"  "}
                <Text color={color}>{changes}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {repos.length > visibleRows && (
        <Box paddingX={1} justifyContent="flex-end">
          <Text color="gray">
            {Math.floor((selection / Math.max(1, repos.length - 1)) * 100)}%
          </Text>
        </Box>
      )}
    </Box>
  );
}
