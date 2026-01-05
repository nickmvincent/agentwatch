import { Box, Text } from "ink";
import React from "react";

interface HelpOverlayProps {
  columns: number;
  rows: number;
}

const HELP_CONTENT = [
  ["Navigation", ""],
  ["j/↓", "Move down"],
  ["k/↑", "Move up"],
  ["g", "Jump to top"],
  ["G", "Jump to bottom"],
  ["Tab", "Switch pane focus"],
  ["", ""],
  ["Views", ""],
  ["R", "Toggle repos pane"],
  ["H", "Toggle hooks pane"],
  ["P", "Toggle ports pane"],
  ["S", "Toggle share pane"],
  ["C", "Show config"],
  ["?", "Toggle help"],
  ["", ""],
  ["Actions", ""],
  ["r", "Refresh data"],
  ["p", "Pause/resume updates"],
  ["q", "Quit"],
  ["", ""],
  ["Agents", ""],
  ["g", "Toggle grouping"],
  ["e", "Expand/collapse group"],
  ["Enter", "View agent output"],
  ["", ""],
  ["Agent Status Symbols", ""],
  ["● green", "Active/working"],
  ["◆ yellow", "Waiting for input"],
  ["✗ red", "Stalled (no activity)"],
  ["○ gray", "Idle/unknown"],
  ["", ""],
  ["Share", ""],
  ["Space", "Toggle session"],
  ["a/n", "Select all/none"],
  ["V", "Cycle view mode"],
  ["E", "Export selected"],
  ["", ""],
  ["Prepare (in Share)", ""],
  ["1", "Toggle secrets redaction"],
  ["2", "Toggle PII redaction"],
  ["3", "Toggle path redaction"],
  ["4", "Toggle high-entropy"],
  ["P", "Prepare sessions"]
];

export function HelpOverlay({ columns, rows }: HelpOverlayProps) {
  const boxWidth = 40;
  const boxHeight = HELP_CONTENT.length + 4;
  const startCol = Math.floor((columns - boxWidth) / 2);
  const startRow = Math.floor((rows - boxHeight) / 2);

  return (
    <Box
      position="absolute"
      marginTop={startRow}
      marginLeft={startCol}
      flexDirection="column"
      width={boxWidth}
      borderStyle="round"
      borderColor="cyan"
    >
      <Box justifyContent="center" paddingY={1}>
        <Text bold color="cyan">
          Keyboard Shortcuts
        </Text>
      </Box>

      {HELP_CONTENT.map((item, idx) => {
        const key = item[0] ?? "";
        const desc = item[1] ?? "";

        if (key === "" && desc === "") {
          return <Box key={idx} height={1} />;
        }

        if (desc === "") {
          return (
            <Box key={idx} paddingX={2}>
              <Text bold color="white">
                {key}
              </Text>
            </Box>
          );
        }

        return (
          <Box key={idx} paddingX={2}>
            <Text color="yellow">{key.padEnd(8)}</Text>
            <Text color="gray">{desc}</Text>
          </Box>
        );
      })}

      <Box justifyContent="center" paddingY={1}>
        <Text color="gray">Press ? or q to close</Text>
      </Box>
    </Box>
  );
}
