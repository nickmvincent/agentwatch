import { Box, Text } from "ink";
import React from "react";
import type { HookSession } from "../types.js";

interface TranscriptSession extends HookSession {
  score?: number;
  selected?: boolean;
}

interface RedactionConfig {
  redactSecrets: boolean;
  redactPii: boolean;
  redactPaths: boolean;
  enableHighEntropy: boolean;
}

interface PrepareStatus {
  preparing: boolean;
  result?: {
    totalSessions: number;
    totalRedactions: number;
    totalFieldsStripped: number;
    averageScore: number;
    residueWarnings: string[];
    blocked: boolean;
  };
  error?: string;
}

interface ContribPaneProps {
  sessions: TranscriptSession[];
  selection: number;
  focused: boolean;
  height: number;
  selectedIds: Set<string>;
  viewMode: "list" | "cost" | "patterns" | "prepare";
  redactionConfig?: RedactionConfig;
  prepareStatus?: PrepareStatus;
  onToggleRedaction?: (key: keyof RedactionConfig) => void;
}

function getProjectName(cwd: string): string {
  return cwd.split("/").pop() || cwd;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(1)}c`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatScore(score?: number): string {
  if (score === undefined) return "  -";
  return score.toFixed(1).padStart(4);
}

export function ContribPane({
  sessions,
  selection,
  focused,
  height,
  selectedIds,
  viewMode,
  redactionConfig = {
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    enableHighEntropy: true
  },
  prepareStatus,
  onToggleRedaction
}: ContribPaneProps) {
  // Calculate visible window
  const visibleRows = Math.max(1, height - 4); // header + footer
  const scrollOffset = Math.max(
    0,
    Math.min(
      selection - Math.floor(visibleRows / 2),
      sessions.length - visibleRows
    )
  );
  const visibleSlice = sessions.slice(scrollOffset, scrollOffset + visibleRows);

  // Calculate totals
  const totalCost = sessions
    .filter((s) => selectedIds.has(s.session_id))
    .reduce((sum, s) => sum + (s.estimated_cost_usd || 0), 0);
  const totalTokens = sessions
    .filter((s) => selectedIds.has(s.session_id))
    .reduce(
      (sum, s) =>
        sum + (s.total_input_tokens || 0) + (s.total_output_tokens || 0),
      0
    );
  const totalSelected = selectedIds.size;

  if (viewMode === "patterns") {
    return (
      <Box flexDirection="column" height={height}>
        <Box paddingX={1}>
          <Text color="cyan" bold>
            Sanitization Patterns
          </Text>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Text>
            <Text color="yellow">secrets</Text>
            {": API keys, tokens, private keys"}
          </Text>
          <Text>
            <Text color="yellow">pii</Text>
            {": Emails, phone numbers, SSN, IPs"}
          </Text>
          <Text>
            <Text color="yellow">paths</Text>
            {": File paths with usernames"}
          </Text>
          <Text>
            <Text color="yellow">credentials</Text>
            {": Passwords, auth tokens"}
          </Text>
          <Text>
            <Text color="yellow">network</Text>
            {": URLs, hostnames, endpoints"}
          </Text>
        </Box>
        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color="gray">Press 'V' to switch views</Text>
        </Box>
      </Box>
    );
  }

  if (viewMode === "cost") {
    return (
      <Box flexDirection="column" height={height}>
        <Box paddingX={1}>
          <Text color="cyan" bold>
            Token Summary
          </Text>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Text>
            <Text color="gray">Sessions: </Text>
            <Text color="white">{sessions.length}</Text>
          </Text>
          <Text>
            <Text color="gray">With token data: </Text>
            <Text color="white">
              {
                sessions.filter(
                  (s) =>
                    (s.total_input_tokens || 0) + (s.total_output_tokens || 0) >
                    0
                ).length
              }
            </Text>
          </Text>
          <Text>
            <Text color="gray">Selected: </Text>
            <Text color="green">{totalSelected}</Text>
          </Text>
          <Text>
            <Text color="gray">Total tokens: </Text>
            <Text color="green" bold>
              {formatTokens(totalTokens)}
            </Text>
            <Text color="gray"> (~</Text>
            <Text color="gray">{formatCost(totalCost)}</Text>
            <Text color="gray">)</Text>
          </Text>
        </Box>
        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color="gray">Press 'V' to switch views</Text>
        </Box>
      </Box>
    );
  }

  if (viewMode === "prepare") {
    return (
      <Box flexDirection="column" height={height}>
        <Box paddingX={1}>
          <Text color="cyan" bold>
            Prepare for Export
          </Text>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Text color="gray" bold>
            Redaction Settings
          </Text>
          <Text>
            <Text color={redactionConfig.redactSecrets ? "green" : "gray"}>
              {redactionConfig.redactSecrets ? "[x]" : "[ ]"}
            </Text>{" "}
            <Text color="white">1</Text>
            <Text color="gray"> Secrets (API keys, tokens)</Text>
          </Text>
          <Text>
            <Text color={redactionConfig.redactPii ? "green" : "gray"}>
              {redactionConfig.redactPii ? "[x]" : "[ ]"}
            </Text>{" "}
            <Text color="white">2</Text>
            <Text color="gray"> PII (emails, phones)</Text>
          </Text>
          <Text>
            <Text color={redactionConfig.redactPaths ? "green" : "gray"}>
              {redactionConfig.redactPaths ? "[x]" : "[ ]"}
            </Text>{" "}
            <Text color="white">3</Text>
            <Text color="gray"> File paths</Text>
          </Text>
          <Text>
            <Text color={redactionConfig.enableHighEntropy ? "green" : "gray"}>
              {redactionConfig.enableHighEntropy ? "[x]" : "[ ]"}
            </Text>{" "}
            <Text color="white">4</Text>
            <Text color="gray"> High-entropy strings</Text>
          </Text>
          <Text> </Text>
          <Text>
            <Text color="gray">Selected: </Text>
            <Text color="green">{totalSelected}</Text>
            <Text color="gray"> sessions</Text>
          </Text>

          {prepareStatus?.preparing && (
            <Text color="yellow">Preparing sessions...</Text>
          )}

          {prepareStatus?.error && (
            <Text color="red">Error: {prepareStatus.error}</Text>
          )}

          {prepareStatus?.result && (
            <>
              <Text> </Text>
              <Text color="green" bold>
                Preparation Complete
              </Text>
              <Text>
                <Text color="gray">Sessions: </Text>
                <Text color="white">{prepareStatus.result.totalSessions}</Text>
              </Text>
              <Text>
                <Text color="gray">Redactions: </Text>
                <Text color="white">
                  {prepareStatus.result.totalRedactions}
                </Text>
              </Text>
              <Text>
                <Text color="gray">Fields stripped: </Text>
                <Text color="white">
                  {prepareStatus.result.totalFieldsStripped}
                </Text>
              </Text>
              <Text>
                <Text color="gray">Avg. score: </Text>
                <Text color="white">
                  {prepareStatus.result.averageScore.toFixed(1)}
                </Text>
              </Text>
              {prepareStatus.result.residueWarnings.length > 0 && (
                <>
                  <Text color="yellow">Residue warnings:</Text>
                  {prepareStatus.result.residueWarnings
                    .slice(0, 3)
                    .map((w, i) => (
                      <Text key={i} color="yellow">
                        {" "}
                        {w.slice(0, 50)}
                      </Text>
                    ))}
                </>
              )}
              {prepareStatus.result.blocked && (
                <Text color="red">BLOCKED: Review required before export</Text>
              )}
            </>
          )}
        </Box>
        <Box flexGrow={1} />
        <Box paddingX={1}>
          <Text color="gray">
            <Text color="white">1-4</Text>=toggle{" | "}
            <Text color="white">P</Text>=prepare{" | "}
            <Text color="white">V</Text>=view
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={height}>
      {/* Column header */}
      <Box paddingX={1}>
        <Text color="cyan" bold>
          {"[ ] Session  Score  Tokens  Project"}
        </Text>
      </Box>

      {/* Sessions list */}
      <Box flexDirection="column" flexGrow={1}>
        {sessions.length === 0 && (
          <Box paddingX={1}>
            <Text color="gray">No sessions available for export</Text>
          </Box>
        )}

        {visibleSlice.map((session, idx) => {
          const actualIndex = scrollOffset + idx;
          const isSelected = actualIndex === selection && focused;
          const isChecked = selectedIds.has(session.session_id);
          const projectName = getProjectName(session.cwd);
          const stateColor = session.active ? "green" : "gray";

          return (
            <Box key={session.session_id} paddingX={1}>
              <Text inverse={isSelected}>
                <Text color={isChecked ? "green" : "gray"}>
                  {isChecked ? "[x]" : "[ ]"}
                </Text>{" "}
                <Text color={stateColor}>{session.session_id.slice(0, 8)}</Text>
                {"  "}
                <Text color="yellow">{formatScore(session.score)}</Text>
                {"  "}
                {(() => {
                  const sessionTokens =
                    (session.total_input_tokens || 0) +
                    (session.total_output_tokens || 0);
                  return (
                    <>
                      <Text color="green">
                        {sessionTokens > 0
                          ? formatTokens(sessionTokens).padStart(6)
                          : "     -"}
                      </Text>
                      {session.estimated_cost_usd ? (
                        <Text color="gray">
                          {` (~${formatCost(session.estimated_cost_usd)})`}
                        </Text>
                      ) : null}
                    </>
                  );
                })()}
                {"  "}
                <Text color={session.active ? "white" : "gray"}>
                  {projectName.slice(0, 20)}
                </Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status line */}
      <Box paddingX={1} justifyContent="space-between">
        <Text color="gray">
          Selected: <Text color="green">{totalSelected}</Text>
          {" | "}
          Tokens: <Text color="green">{formatTokens(totalTokens)}</Text>
          <Text color="gray"> (~{formatCost(totalCost)})</Text>
        </Text>
        {sessions.length > visibleRows && (
          <Text color="gray">
            {Math.floor((selection / Math.max(1, sessions.length - 1)) * 100)}%
          </Text>
        )}
      </Box>

      {/* Help line */}
      <Box paddingX={1}>
        <Text color="gray">
          <Text color="white">Space</Text>=toggle{" | "}
          <Text color="white">E</Text>=export{" | "}
          <Text color="white">V</Text>=view
        </Text>
      </Box>
    </Box>
  );
}
