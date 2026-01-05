#!/usr/bin/env bun
/**
 * transcript-parser CLI
 *
 * A standalone tool for discovering and parsing AI coding assistant transcripts.
 *
 * Usage:
 *   transcript-parser discover [--agent <agent>] [--json] [--limit <n>]
 *   transcript-parser parse <path> [--format json|summary]
 *   transcript-parser stats <path>
 *   transcript-parser --help
 */

import { discoverTranscripts, parseTranscript, detectAgent } from "./index";
import { formatCost, formatTokens } from "./cost";
import { getSummary } from "./format";
import type { AgentType } from "./types";

const HELP = `
transcript-parser - Parse AI coding assistant transcripts

USAGE:
  transcript-parser <command> [options]

COMMANDS:
  discover              Discover all local transcripts
  parse <path>          Parse a transcript file
  stats <path>          Show statistics for a transcript

DISCOVER OPTIONS:
  --agent <agent>       Filter by agent (claude, codex, gemini)
  --limit <n>           Limit number of results
  --json                Output as JSON

PARSE OPTIONS:
  --format <fmt>        Output format: json, summary (default: summary)

EXAMPLES:
  transcript-parser discover
  transcript-parser discover --agent claude --json
  transcript-parser parse ~/.claude/projects/xxx/conversation.jsonl
  transcript-parser stats ~/.claude/projects/xxx/conversation.jsonl
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "discover":
      await commandDiscover(args.slice(1));
      break;
    case "parse":
      await commandParse(args.slice(1));
      break;
    case "stats":
      await commandStats(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

async function commandDiscover(args: string[]) {
  const options: {
    agent?: AgentType;
    limit?: number;
    json: boolean;
  } = { json: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--agent":
        options.agent = args[++i] as AgentType;
        break;
      case "--limit":
        options.limit = Number.parseInt(args[++i], 10);
        break;
      case "--json":
        options.json = true;
        break;
    }
  }

  const transcripts = await discoverTranscripts({
    agents: options.agent ? [options.agent] : undefined,
    limit: options.limit
  });

  if (options.json) {
    console.log(JSON.stringify(transcripts, null, 2));
  } else {
    console.log(`Found ${transcripts.length} transcripts:\n`);

    for (const t of transcripts) {
      const date = new Date(t.modifiedAt).toLocaleString();
      const size =
        t.sizeBytes > 1024
          ? `${(t.sizeBytes / 1024).toFixed(1)}KB`
          : `${t.sizeBytes}B`;

      console.log(`[${t.agent}] ${t.name}`);
      console.log(`  Path: ${t.path}`);
      console.log(`  Modified: ${date} | Size: ${size}`);
      if (t.projectDir) {
        console.log(`  Project: ${t.projectDir}`);
      }
      console.log("");
    }
  }
}

async function commandParse(args: string[]) {
  if (args.length === 0) {
    console.error("Error: No path provided");
    process.exit(1);
  }

  const path = args[0];
  let format = "summary";

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--format") {
      format = args[++i];
    }
  }

  const agent = detectAgent(path);
  if (!agent) {
    console.error("Error: Could not detect agent type from path");
    console.error("Expected path containing .claude/, .codex/, or .gemini/");
    process.exit(1);
  }

  const transcript = await parseTranscript(path, agent);
  if (!transcript) {
    console.error("Error: Failed to parse transcript");
    process.exit(1);
  }

  if (format === "json") {
    console.log(JSON.stringify(transcript, null, 2));
  } else {
    console.log(`Transcript: ${transcript.name}`);
    console.log(`Agent: ${transcript.agent}`);
    console.log(`Messages: ${transcript.messages.length}`);
    console.log(
      `Tokens: ${formatTokens(transcript.totalInputTokens)} in / ${formatTokens(transcript.totalOutputTokens)} out`
    );
    console.log(`Est. Cost: ${formatCost(transcript.estimatedCostUsd)}`);
    console.log("");

    // Show first few messages
    console.log("First messages:");
    for (const msg of transcript.messages.slice(0, 5)) {
      const role = msg.role || msg.type;
      const content =
        msg.content.length > 100
          ? msg.content.slice(0, 100) + "..."
          : msg.content;
      console.log(`  [${role}] ${content.replace(/\n/g, " ")}`);
    }

    if (transcript.messages.length > 5) {
      console.log(`  ... and ${transcript.messages.length - 5} more messages`);
    }
  }
}

async function commandStats(args: string[]) {
  if (args.length === 0) {
    console.error("Error: No path provided");
    process.exit(1);
  }

  const path = args[0];
  const agent = detectAgent(path);

  if (!agent) {
    console.error("Error: Could not detect agent type from path");
    process.exit(1);
  }

  const transcript = await parseTranscript(path, agent);
  if (!transcript) {
    console.error("Error: Failed to parse transcript");
    process.exit(1);
  }

  const summary = getSummary(transcript);

  console.log(`Transcript Statistics: ${transcript.name}`);
  console.log("─".repeat(50));
  console.log(`Agent:              ${transcript.agent}`);
  console.log(`Path:               ${transcript.path}`);
  console.log(`Project:            ${transcript.projectDir || "N/A"}`);
  console.log("");
  console.log(`Total Messages:     ${summary.messageCount}`);
  console.log(`  User Messages:    ${summary.userMessages}`);
  console.log(`  Assistant:        ${summary.assistantMessages}`);
  console.log(`  Tool Calls:       ${summary.toolCalls}`);
  console.log(`  Sidechain:        ${summary.sidechainMessages}`);
  console.log("");
  console.log(
    `Input Tokens:       ${formatTokens(transcript.totalInputTokens)}`
  );
  console.log(
    `Output Tokens:      ${formatTokens(transcript.totalOutputTokens)}`
  );
  console.log(`Estimated Cost:     ${formatCost(transcript.estimatedCostUsd)}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
