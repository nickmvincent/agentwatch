/**
 * LLM Evaluator
 *
 * Coordinates LLM-based evaluation for hook decisions.
 */

import { AnthropicProvider, OllamaProvider, OpenAIProvider } from "./providers";
import type {
  LLMConfig,
  LLMEvaluationOptions,
  LLMProvider,
  LLMResponse
} from "./types";
import { fillTemplate } from "./utils";

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
 * LLMEvaluator coordinates LLM-based decision making.
 */
export class LLMEvaluator {
  private config: LLMConfig;
  private provider: LLMProvider | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
    this.initializeProvider();
  }

  /**
   * Initialize the configured provider.
   */
  private initializeProvider(): void {
    if (!this.config.enabled) {
      this.provider = null;
      return;
    }

    switch (this.config.provider) {
      case "anthropic":
        this.provider = new AnthropicProvider({
          model: this.config.model,
          apiKeyEnvVar: this.config.apiKeyEnvVar
        });
        break;

      case "openai":
        this.provider = new OpenAIProvider({
          model: this.config.model,
          apiKeyEnvVar: this.config.apiKeyEnvVar
        });
        break;

      case "ollama":
        this.provider = new OllamaProvider({
          model: this.config.model,
          baseUrl: this.config.ollamaBaseUrl
        });
        break;

      default:
        this.provider = null;
    }
  }

  /**
   * Check if evaluation is available for a hook type.
   */
  isAvailable(hookType: string): boolean {
    if (!this.config.enabled || !this.provider) {
      return false;
    }

    if (!this.provider.isAvailable()) {
      return false;
    }

    if (
      this.config.triggerHooks.length > 0 &&
      !this.config.triggerHooks.includes(hookType as never)
    ) {
      return false;
    }

    return Boolean(PROMPT_TEMPLATES[hookType]);
  }

  /**
   * Get the current provider.
   */
  getProvider(): LLMProvider | null {
    return this.provider;
  }

  /**
   * Get the current config.
   */
  getConfig(): LLMConfig {
    return this.config;
  }

  /**
   * Evaluate a context using the LLM.
   */
  async evaluate(
    hookType: string,
    context: Record<string, unknown>
  ): Promise<LLMResponse | null> {
    if (!this.isAvailable(hookType)) {
      return null;
    }

    const template = PROMPT_TEMPLATES[hookType];
    if (!template) {
      return null;
    }

    const prompt = fillTemplate(template, context);

    const options: LLMEvaluationOptions = {
      maxTokens: this.config.maxTokens,
      timeoutMs: this.config.timeoutMs
    };

    try {
      return await this.provider!.evaluate(prompt, options);
    } catch {
      return null;
    }
  }

  /**
   * Update configuration.
   */
  updateConfig(newConfig: Partial<LLMConfig>): void {
    Object.assign(this.config, newConfig);
    this.initializeProvider();
  }
}
