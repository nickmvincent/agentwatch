/**
 * LLM Evaluation Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { LLMEvaluator, PROMPT_TEMPLATES } from "../src/llm/evaluator";
import type { LLMConfig } from "../src/llm/types";
import { fillTemplate, parseLLMResponse } from "../src/llm/utils";

describe("parseLLMResponse", () => {
  it("parses valid JSON response", () => {
    const response = `{
      "decision": "allow",
      "reason": "Safe operation",
      "confidence": 0.95
    }`;

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("Safe operation");
    expect(result.confidence).toBe(0.95);
  });

  it("extracts JSON from text with surrounding content", () => {
    const response = `I've analyzed the request.

Here is my assessment:
{
  "decision": "deny",
  "reason": "Potentially dangerous",
  "confidence": 0.8
}

Let me know if you need more details.`;

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("Potentially dangerous");
  });

  it("infers deny from text when JSON fails", () => {
    const response = "I would deny this request because it's dangerous.";

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("deny");
    expect(result.confidence).toBe(0.3);
  });

  it("infers allow from text when JSON fails", () => {
    const response = "I approve this request, it looks safe.";

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("allow");
    expect(result.confidence).toBe(0.3);
  });

  it("infers continue from text", () => {
    const response = "The session should continue working.";

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("continue");
    expect(result.confidence).toBe(0.3);
  });

  it("returns abstain for unparseable response", () => {
    const response = "I'm not sure what to do here.";

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("abstain");
    expect(result.confidence).toBe(0);
  });

  it("handles missing confidence", () => {
    const response = `{
      "decision": "allow",
      "reason": "OK"
    }`;

    const result = parseLLMResponse(response);

    expect(result.decision).toBe("allow");
    expect(result.confidence).toBe(0.5);
  });

  it("normalizes decision variants", () => {
    const response1 = `{ "decision": "approve", "reason": "ok" }`;
    const response2 = `{ "decision": "reject", "reason": "no" }`;
    const response3 = `{ "decision": "yes", "reason": "ok" }`;
    const response4 = `{ "decision": "no", "reason": "no" }`;

    expect(parseLLMResponse(response1).decision).toBe("allow");
    expect(parseLLMResponse(response2).decision).toBe("deny");
    expect(parseLLMResponse(response3).decision).toBe("allow");
    expect(parseLLMResponse(response4).decision).toBe("deny");
  });

  it("preserves raw response", () => {
    const response = `{ "decision": "allow", "reason": "ok" }`;

    const result = parseLLMResponse(response);

    expect(result.rawResponse).toBe(response);
  });
});

describe("fillTemplate", () => {
  it("replaces simple placeholders", () => {
    const template = "Hello, {{name}}!";
    const context = { name: "World" };

    const result = fillTemplate(template, context);

    expect(result).toBe("Hello, World!");
  });

  it("replaces multiple placeholders", () => {
    const template = "Tool: {{toolName}}, Session: {{sessionId}}";
    const context = { toolName: "Bash", sessionId: "abc123" };

    const result = fillTemplate(template, context);

    expect(result).toBe("Tool: Bash, Session: abc123");
  });

  it("handles missing values as empty string", () => {
    const template = "Tool: {{toolName}}, Missing: {{notHere}}";
    const context = { toolName: "Bash" };

    const result = fillTemplate(template, context);

    expect(result).toBe("Tool: Bash, Missing: ");
  });

  it("stringifies objects", () => {
    const template = "Input: {{toolInput}}";
    const context = { toolInput: { command: "ls", cwd: "/home" } };

    const result = fillTemplate(template, context);

    expect(result).toContain('"command": "ls"');
    expect(result).toContain('"cwd": "/home"');
  });

  it("converts numbers to strings", () => {
    const template = "Cost: {{costUsd}}";
    const context = { costUsd: 0.05 };

    const result = fillTemplate(template, context);

    expect(result).toBe("Cost: 0.05");
  });
});

describe("PROMPT_TEMPLATES", () => {
  it("has template for PreToolUse", () => {
    expect(PROMPT_TEMPLATES.PreToolUse).toBeDefined();
    expect(PROMPT_TEMPLATES.PreToolUse).toContain("{{toolName}}");
    expect(PROMPT_TEMPLATES.PreToolUse).toContain("{{toolInput}}");
  });

  it("has template for PermissionRequest", () => {
    expect(PROMPT_TEMPLATES.PermissionRequest).toBeDefined();
    expect(PROMPT_TEMPLATES.PermissionRequest).toContain("{{toolName}}");
  });

  it("has template for Stop", () => {
    expect(PROMPT_TEMPLATES.Stop).toBeDefined();
    expect(PROMPT_TEMPLATES.Stop).toContain("{{stopReason}}");
  });

  it("has template for UserPromptSubmit", () => {
    expect(PROMPT_TEMPLATES.UserPromptSubmit).toBeDefined();
    expect(PROMPT_TEMPLATES.UserPromptSubmit).toContain("{{prompt}}");
  });
});

describe("LLMEvaluator", () => {
  const disabledConfig: LLMConfig = {
    enabled: false,
    provider: "anthropic",
    model: "claude-3-haiku-20240307",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    maxTokens: 256,
    timeoutMs: 5000,
    triggerHooks: ["PreToolUse"]
  };

  const enabledConfig: LLMConfig = {
    ...disabledConfig,
    enabled: true
  };

  describe("isAvailable", () => {
    it("returns false when disabled", () => {
      const evaluator = new LLMEvaluator(disabledConfig);

      expect(evaluator.isAvailable("PreToolUse")).toBe(false);
    });

    it("returns false when no API key", () => {
      // Ensure key doesn't exist
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const evaluator = new LLMEvaluator(enabledConfig);
      const result = evaluator.isAvailable("PreToolUse");

      // Restore key if it existed
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }

      expect(result).toBe(false);
    });

    it("returns false for hook types not in triggerHooks", () => {
      const evaluator = new LLMEvaluator({
        ...enabledConfig,
        triggerHooks: ["PreToolUse"]
      });

      expect(evaluator.isAvailable("PostToolUse")).toBe(false);
    });

    it("returns false for unknown hook types without templates", () => {
      const evaluator = new LLMEvaluator({
        ...enabledConfig,
        triggerHooks: ["UnknownHook" as never]
      });

      expect(evaluator.isAvailable("UnknownHook")).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("returns current configuration", () => {
      const evaluator = new LLMEvaluator(enabledConfig);

      expect(evaluator.getConfig()).toEqual(enabledConfig);
    });
  });

  describe("getProvider", () => {
    it("returns null when disabled", () => {
      const evaluator = new LLMEvaluator(disabledConfig);

      expect(evaluator.getProvider()).toBeNull();
    });

    it("returns provider when enabled", () => {
      const evaluator = new LLMEvaluator(enabledConfig);

      expect(evaluator.getProvider()).not.toBeNull();
      expect(evaluator.getProvider()?.name).toBe("anthropic");
    });

    it("creates correct provider type", () => {
      const anthropicEval = new LLMEvaluator({
        ...enabledConfig,
        provider: "anthropic"
      });
      const openaiEval = new LLMEvaluator({
        ...enabledConfig,
        provider: "openai"
      });
      const ollamaEval = new LLMEvaluator({
        ...enabledConfig,
        provider: "ollama"
      });

      expect(anthropicEval.getProvider()?.name).toBe("anthropic");
      expect(openaiEval.getProvider()?.name).toBe("openai");
      expect(ollamaEval.getProvider()?.name).toBe("ollama");
    });
  });

  describe("updateConfig", () => {
    it("updates configuration", () => {
      const evaluator = new LLMEvaluator(disabledConfig);

      evaluator.updateConfig({ enabled: true });

      expect(evaluator.getConfig().enabled).toBe(true);
    });

    it("reinitializes provider on config change", () => {
      const evaluator = new LLMEvaluator({
        ...enabledConfig,
        provider: "anthropic"
      });

      expect(evaluator.getProvider()?.name).toBe("anthropic");

      evaluator.updateConfig({ provider: "openai" });

      expect(evaluator.getProvider()?.name).toBe("openai");
    });
  });

  describe("evaluate", () => {
    it("returns null when not available", async () => {
      const evaluator = new LLMEvaluator(disabledConfig);

      const result = await evaluator.evaluate("PreToolUse", {
        toolName: "Bash",
        toolInput: { command: "ls" }
      });

      expect(result).toBeNull();
    });

    it("returns null for hook type without template", async () => {
      const evaluator = new LLMEvaluator({
        ...enabledConfig,
        triggerHooks: ["UnknownHook" as never]
      });

      const result = await evaluator.evaluate("UnknownHook", {});

      expect(result).toBeNull();
    });
  });
});
