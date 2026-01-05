/**
 * Transcript formatting utilities.
 * Converts parsed transcripts to display-friendly formats.
 */

import type {
  ParsedTranscript,
  DisplayTranscript,
  DisplayMessage
} from "./types";

/**
 * Format a parsed transcript for display.
 * Normalizes roles, extracts content, and prepares for UI rendering.
 */
export function formatForDisplay(
  transcript: ParsedTranscript
): DisplayTranscript {
  const messages: DisplayMessage[] = [];

  for (const msg of transcript.messages) {
    let role: DisplayMessage["role"] = "system";
    let content = "";
    let hasThinking = false;

    // Determine role
    if (msg.type === "user" || msg.role === "user") {
      role = "user";
    } else if (msg.type === "assistant" || msg.role === "assistant") {
      role = "assistant";
    } else if (msg.type === "tool_use" || msg.toolName) {
      role = "tool";
    } else if (msg.type === "tool_result") {
      role = "tool_result";
    }

    // Extract content
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const parts: string[] = [];
      for (const c of msg.content as unknown[]) {
        if (typeof c === "string") {
          parts.push(c);
        } else if (
          typeof c === "object" &&
          c !== null &&
          "type" in c &&
          (c as { type: string }).type === "thinking"
        ) {
          hasThinking = true;
          if (
            "thinking" in c &&
            typeof (c as { thinking: string }).thinking === "string"
          ) {
            parts.push(`[Thinking]\n${(c as { thinking: string }).thinking}`);
          }
        } else if (typeof c === "object" && c !== null && "text" in c) {
          parts.push((c as { text: string }).text);
        } else {
          parts.push(JSON.stringify(c));
        }
      }
      content = parts.join("\n");
    }

    // Add tool info prefix
    if (msg.toolName) {
      content = `[Tool: ${msg.toolName}]\n${content}`;
    }

    // Skip empty messages
    if (!content.trim()) continue;

    messages.push({
      role,
      content,
      timestamp: msg.timestamp,
      meta: {
        inputTokens: msg.inputTokens,
        outputTokens: msg.outputTokens,
        model: msg.model
      },
      isSidechain: msg.isSidechain,
      agentId: msg.agentId,
      messageType: msg.type,
      hasThinking,
      toolName: msg.toolName,
      toolInput: msg.toolInput
    });
  }

  return {
    id: transcript.id,
    agent: transcript.agent,
    name: transcript.name,
    path: transcript.path,
    projectDir: transcript.projectDir,
    messages,
    totalInputTokens: transcript.totalInputTokens,
    totalOutputTokens: transcript.totalOutputTokens,
    estimatedCostUsd: transcript.estimatedCostUsd
  };
}

/**
 * Get a summary of the transcript.
 */
export function getSummary(transcript: ParsedTranscript): {
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  sidechainMessages: number;
} {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let sidechainMessages = 0;

  for (const msg of transcript.messages) {
    if (msg.isSidechain) {
      sidechainMessages++;
    }

    if (msg.type === "user" || msg.role === "user") {
      userMessages++;
    } else if (msg.type === "assistant" || msg.role === "assistant") {
      assistantMessages++;
    } else if (msg.type === "tool_use" || msg.toolName) {
      toolCalls++;
    }
  }

  return {
    messageCount: transcript.messages.length,
    userMessages,
    assistantMessages,
    toolCalls,
    sidechainMessages
  };
}
