/**
 * LLM Provider Tests
 *
 * Tests for Anthropic, OpenAI, and Ollama providers with mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AnthropicProvider } from "../src/llm/providers/anthropic";
import { OllamaProvider } from "../src/llm/providers/ollama";
import { OpenAIProvider } from "../src/llm/providers/openai";
import type { LLMEvaluationOptions } from "../src/llm/types";

// Default test options
const defaultOptions: LLMEvaluationOptions = {
  timeoutMs: 5000,
  maxTokens: 500,
  systemPrompt: "You are a test assistant."
};

// Store original fetch
const originalFetch = globalThis.fetch;

// Mock response helper
function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return mock(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data))
    } as Response)
  );
}

describe("AnthropicProvider", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = originalFetch;
  });

  it("checks availability based on API key", () => {
    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    expect(provider.isAvailable()).toBe(true);

    delete process.env.ANTHROPIC_API_KEY;
    expect(provider.isAvailable()).toBe(false);
  });

  it("returns abstain when API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("API key not found");
    expect(result.confidence).toBe(0);
  });

  it("parses successful Anthropic response", async () => {
    globalThis.fetch = mockFetchResponse({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            decision: "allow",
            reason: "Safe operation",
            confidence: 0.9
          })
        }
      ]
    });

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("allow");
    expect(result.reason).toBe("Safe operation");
    expect(result.confidence).toBe(0.9);
  });

  it("handles API error response", async () => {
    globalThis.fetch = mockFetchResponse({ error: "Rate limited" }, false, 429);

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("Anthropic API error");
    expect(result.reason).toContain("429");
  });

  it("handles network errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network unavailable"))
    );

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("Network unavailable");
  });

  it("handles timeout", async () => {
    globalThis.fetch = mock(
      () =>
        new Promise((_, reject) => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          setTimeout(() => reject(error), 10);
        })
    );

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", {
      ...defaultOptions,
      timeoutMs: 1
    });

    expect(result.decision).toBe("abstain");
    expect(result.reason).toBe("Request timeout");
  });

  it("handles empty response content", async () => {
    globalThis.fetch = mockFetchResponse({
      content: []
    });

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    // Empty content leads to abstain
    expect(result.decision).toBe("abstain");
  });

  it("sends correct request format", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: "text", text: '{"decision":"allow"}' }]
          })
      } as Response);
    });

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    await provider.evaluate("my test prompt", defaultOptions);

    expect(capturedBody).toBeDefined();
    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe("claude-3-haiku-20240307");
    expect(body.max_tokens).toBe(500);
    expect(body.messages[0].content).toBe("my test prompt");
  });
});

describe("OpenAIProvider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = originalFetch;
  });

  it("checks availability based on API key", () => {
    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    expect(provider.isAvailable()).toBe(true);

    delete process.env.OPENAI_API_KEY;
    expect(provider.isAvailable()).toBe(false);
  });

  it("returns abstain when API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("API key not found");
  });

  it("parses successful OpenAI response", async () => {
    globalThis.fetch = mockFetchResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: "deny",
              reason: "Potentially harmful",
              confidence: 0.85
            })
          }
        }
      ]
    });

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("deny");
    expect(result.reason).toBe("Potentially harmful");
    expect(result.confidence).toBe(0.85);
  });

  it("handles API error response", async () => {
    globalThis.fetch = mockFetchResponse(
      { error: "Invalid API key" },
      false,
      401
    );

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("OpenAI API error");
    expect(result.reason).toContain("401");
  });

  it("handles network errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Connection refused"))
    );

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("Connection refused");
  });

  it("handles timeout", async () => {
    globalThis.fetch = mock(
      () =>
        new Promise((_, reject) => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          setTimeout(() => reject(error), 10);
        })
    );

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", {
      ...defaultOptions,
      timeoutMs: 1
    });

    expect(result.decision).toBe("abstain");
    expect(result.reason).toBe("Request timeout");
  });

  it("handles empty choices", async () => {
    globalThis.fetch = mockFetchResponse({ choices: [] });

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
  });

  it("sends correct request format", async () => {
    let capturedBody: string | undefined;
    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      capturedHeaders = init?.headers;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"decision":"allow"}' } }]
          })
      } as Response);
    });

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    await provider.evaluate("my test prompt", defaultOptions);

    expect(capturedBody).toBeDefined();
    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toHaveLength(2); // system + user
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toBe("my test prompt");

    expect(capturedHeaders).toBeDefined();
    expect((capturedHeaders as Record<string, string>).Authorization).toBe(
      "Bearer test-openai-key"
    );
  });
});

describe("OllamaProvider", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("is always available (no API key required)", () => {
    const provider = new OllamaProvider({ model: "llama3.2" });
    expect(provider.isAvailable()).toBe(true);
  });

  it("uses default base URL", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: '{"decision":"allow"}' })
      } as Response);
    });

    const provider = new OllamaProvider({ model: "llama3.2" });
    await provider.evaluate("test", defaultOptions);

    expect(capturedUrl).toBe("http://localhost:11434/api/generate");
  });

  it("uses custom base URL", async () => {
    let capturedUrl = "";
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: '{"decision":"allow"}' })
      } as Response);
    });

    const provider = new OllamaProvider({
      model: "llama3.2",
      baseUrl: "http://custom:8080"
    });
    await provider.evaluate("test", defaultOptions);

    expect(capturedUrl).toBe("http://custom:8080/api/generate");
  });

  it("parses successful Ollama response", async () => {
    globalThis.fetch = mockFetchResponse({
      response: JSON.stringify({
        decision: "continue",
        reason: "Session looks fine",
        confidence: 0.75
      })
    });

    const provider = new OllamaProvider({ model: "llama3.2" });
    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("continue");
    expect(result.reason).toBe("Session looks fine");
    expect(result.confidence).toBe(0.75);
  });

  it("handles API error response", async () => {
    globalThis.fetch = mockFetchResponse(
      { error: "Model not found" },
      false,
      404
    );

    const provider = new OllamaProvider({ model: "nonexistent-model" });
    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("Ollama API error");
    expect(result.reason).toContain("404");
  });

  it("handles connection refused (Ollama not running)", async () => {
    const error = new Error("fetch failed");
    error.message = "ECONNREFUSED";
    globalThis.fetch = mock(() => Promise.reject(error));

    const provider = new OllamaProvider({ model: "llama3.2" });
    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toContain("Ollama not running");
  });

  it("handles timeout", async () => {
    globalThis.fetch = mock(
      () =>
        new Promise((_, reject) => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          setTimeout(() => reject(error), 10);
        })
    );

    const provider = new OllamaProvider({ model: "llama3.2" });
    const result = await provider.evaluate("test prompt", {
      ...defaultOptions,
      timeoutMs: 1
    });

    expect(result.decision).toBe("abstain");
    expect(result.reason).toBe("Request timeout");
  });

  it("handles generic errors", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("Unknown error")));

    const provider = new OllamaProvider({ model: "llama3.2" });
    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
    expect(result.reason).toBe("Unknown error");
  });

  it("handles empty response", async () => {
    globalThis.fetch = mockFetchResponse({ response: "" });

    const provider = new OllamaProvider({ model: "llama3.2" });
    const result = await provider.evaluate("test prompt", defaultOptions);

    expect(result.decision).toBe("abstain");
  });

  it("sends correct request format", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: '{"decision":"allow"}' })
      } as Response);
    });

    const provider = new OllamaProvider({ model: "llama3.2" });
    await provider.evaluate("my prompt", {
      ...defaultOptions,
      systemPrompt: "Be helpful"
    });

    expect(capturedBody).toBeDefined();
    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
    expect(body.prompt).toContain("Be helpful");
    expect(body.prompt).toContain("my prompt");
    expect(body.options.num_predict).toBe(500);
  });

  it("handles prompt without system prompt", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: '{"decision":"allow"}' })
      } as Response);
    });

    const provider = new OllamaProvider({ model: "llama3.2" });
    await provider.evaluate("my prompt", {
      timeoutMs: 5000,
      maxTokens: 500
    });

    const body = JSON.parse(capturedBody!);
    expect(body.prompt).toBe("my prompt");
  });
});

describe("Provider response parsing integration", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles text response without JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    globalThis.fetch = mockFetchResponse({
      content: [{ type: "text", text: "I would deny this request." }]
    });

    const provider = new AnthropicProvider({
      model: "claude-3-haiku-20240307",
      apiKeyEnvVar: "ANTHROPIC_API_KEY"
    });

    const result = await provider.evaluate("test", defaultOptions);

    // parseLLMResponse infers from text
    expect(result.decision).toBe("deny");
    expect(result.confidence).toBe(0.3);

    delete process.env.ANTHROPIC_API_KEY;
  });

  it("handles malformed JSON", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = mockFetchResponse({
      choices: [{ message: { content: "{ invalid json }" } }]
    });

    const provider = new OpenAIProvider({
      model: "gpt-4o-mini",
      apiKeyEnvVar: "OPENAI_API_KEY"
    });

    const result = await provider.evaluate("test", defaultOptions);

    // Should fallback to text inference
    expect(result.confidence).toBeLessThanOrEqual(0.3);

    delete process.env.OPENAI_API_KEY;
  });
});
