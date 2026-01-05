/**
 * LLM Decision Source
 *
 * Uses an LLM to make intelligent decisions for complex cases.
 */

import type { HookEventType } from "@agentwatch/core";
import type { RuleEvaluationContext } from "../../rules/types";
import type {
  DecisionResult,
  DecisionSource,
  ExtendedDecisionContext
} from "../types";
import { BUILTIN_SOURCES, DECISION_PRIORITY } from "../types";

/**
 * LLM evaluation configuration.
 */
export interface LLMEvaluationConfig {
  enabled: boolean;
  provider: "anthropic" | "openai" | "ollama";
  model: string;
  apiKeyEnvVar: string;
  maxTokens: number;
  timeoutMs: number;
  triggerHooks: HookEventType[];
}

/**
 * Interface for LLM provider implementations.
 */
export interface LLMProvider {
  name: string;
  evaluate(prompt: string, options: LLMEvaluationOptions): Promise<LLMResponse>;
}

export interface LLMEvaluationOptions {
  maxTokens: number;
  timeoutMs: number;
}

export interface LLMResponse {
  decision: "allow" | "deny" | "block" | "continue" | "abstain";
  reason: string;
  confidence: number;
}

/**
 * Prompt templates for different hook types.
 */
export const PROMPT_TEMPLATES: Record<string, string> = {
  PreToolUse: `You are a security reviewer for an AI coding assistant. Evaluate whether the following tool call should be allowed.

Tool: {{toolName}}
Input: {{toolInput}}
Working Directory: {{cwd}}
Session ID: {{sessionId}}

Respond with a JSON object:
{
  "decision": "allow" | "deny",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}

Consider:
- Is this operation safe?
- Could it cause data loss or security issues?
- Is it within the scope of normal development work?`,

  PermissionRequest: `You are a permission evaluator for an AI coding assistant. Decide whether to grant permission for this operation.

Tool: {{toolName}}
Input: {{toolInput}}
Working Directory: {{cwd}}

Respond with a JSON object:
{
  "decision": "allow" | "deny",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}

Consider:
- Is this a safe operation?
- Would a senior developer approve this?`,

  Stop: `You are evaluating whether an AI coding session should continue or stop.

Stop Reason: {{stopReason}}
Session ID: {{sessionId}}
Tool Count: {{toolCount}}
Cost: {{costUsd}} USD

Respond with a JSON object:
{
  "decision": "allow" | "continue",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}

"allow" means let the session stop normally.
"continue" means the session should continue working.`,

  UserPromptSubmit: `You are evaluating a user's prompt to an AI coding assistant.

Prompt: {{prompt}}

Respond with a JSON object:
{
  "decision": "allow" | "deny",
  "reason": "Brief explanation",
  "confidence": 0.0-1.0
}

Consider:
- Is this a legitimate development request?
- Does it ask for anything harmful?`
};

/**
 * Fill a template with context values.
 */
function fillTemplate(
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

/**
 * Parse LLM response to extract decision.
 */
function parseLLMResponse(response: string): LLMResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      decision: parsed.decision ?? "abstain",
      reason: parsed.reason ?? "No reason provided",
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5
    };
  } catch {
    // If parsing fails, try to infer from text
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes("deny") || lowerResponse.includes("block")) {
      return {
        decision: "deny",
        reason: response.slice(0, 200),
        confidence: 0.3
      };
    }
    if (lowerResponse.includes("allow") || lowerResponse.includes("approve")) {
      return {
        decision: "allow",
        reason: response.slice(0, 200),
        confidence: 0.3
      };
    }
    return {
      decision: "abstain",
      reason: "Failed to parse LLM response",
      confidence: 0
    };
  }
}

/**
 * Create a decision source that uses LLM evaluation.
 */
export function createLLMSource(
  getConfig: () => LLMEvaluationConfig,
  getProvider: () => LLMProvider | null
): DecisionSource {
  return {
    name: BUILTIN_SOURCES.LLM,
    priority: DECISION_PRIORITY.LLM,
    enabled: true,

    appliesTo(hookType: string): boolean {
      const config = getConfig();
      return (
        config.enabled &&
        config.triggerHooks.includes(hookType as HookEventType)
      );
    },

    async evaluate(
      context: RuleEvaluationContext | ExtendedDecisionContext
    ): Promise<DecisionResult | null> {
      const config = getConfig();
      const provider = getProvider();

      if (!config.enabled || !provider) {
        return null; // Abstain
      }

      // Get the appropriate template
      const template = PROMPT_TEMPLATES[context.hookType];
      if (!template) {
        return null; // No template for this hook type
      }

      // Build the prompt
      const prompt = fillTemplate(template, {
        ...context,
        toolInput: context.toolInput,
        toolCount: (context as ExtendedDecisionContext).session?.toolCount ?? 0,
        costUsd:
          (context as ExtendedDecisionContext).session?.estimatedCostUsd ?? 0
      });

      try {
        // Call the LLM
        const response = await provider.evaluate(prompt, {
          maxTokens: config.maxTokens,
          timeoutMs: config.timeoutMs
        });

        // Convert to decision result
        if (response.decision === "abstain") {
          return null;
        }

        return {
          decision: response.decision,
          source: BUILTIN_SOURCES.LLM,
          reason: response.reason,
          confidence: response.confidence,
          metadata: {
            provider: config.provider,
            model: config.model
          }
        };
      } catch (error) {
        // LLM call failed, abstain
        return null;
      }
    }
  };
}

/**
 * Simple in-memory mock provider for testing.
 */
export class MockLLMProvider implements LLMProvider {
  name = "mock";
  private defaultResponse: LLMResponse = {
    decision: "allow",
    reason: "Mock approval",
    confidence: 1.0
  };

  setDefaultResponse(response: LLMResponse): void {
    this.defaultResponse = response;
  }

  async evaluate(
    _prompt: string,
    _options: LLMEvaluationOptions
  ): Promise<LLMResponse> {
    return this.defaultResponse;
  }
}
