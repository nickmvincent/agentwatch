/**
 * LLM Utilities
 */

import type { LLMResponse } from "./types";

/**
 * Parse LLM response text to extract a decision.
 */
export function parseLLMResponse(response: string): LLMResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      decision?: string;
      reason?: string;
      confidence?: number;
    };

    const decision = normalizeDecision(parsed.decision);

    return {
      decision,
      reason: parsed.reason ?? "No reason provided",
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      rawResponse: response
    };
  } catch {
    // If parsing fails, try to infer from text
    const lowerResponse = response.toLowerCase();

    if (lowerResponse.includes("deny") || lowerResponse.includes("block")) {
      return {
        decision: "deny",
        reason: response.slice(0, 200),
        confidence: 0.3,
        rawResponse: response
      };
    }

    if (lowerResponse.includes("allow") || lowerResponse.includes("approve")) {
      return {
        decision: "allow",
        reason: response.slice(0, 200),
        confidence: 0.3,
        rawResponse: response
      };
    }

    if (lowerResponse.includes("continue")) {
      return {
        decision: "continue",
        reason: response.slice(0, 200),
        confidence: 0.3,
        rawResponse: response
      };
    }

    return {
      decision: "abstain",
      reason: "Failed to parse LLM response",
      confidence: 0,
      rawResponse: response
    };
  }
}

/**
 * Normalize decision string to valid decision type.
 */
function normalizeDecision(
  decision: string | undefined
): LLMResponse["decision"] {
  if (!decision) return "abstain";

  const lower = decision.toLowerCase();

  if (lower === "allow" || lower === "approve" || lower === "yes") {
    return "allow";
  }
  if (lower === "deny" || lower === "reject" || lower === "no") {
    return "deny";
  }
  if (lower === "block") {
    return "block";
  }
  if (lower === "continue") {
    return "continue";
  }

  return "abstain";
}

/**
 * Fill a template with context values.
 */
export function fillTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });
}
