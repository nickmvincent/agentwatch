/**
 * Decision Engine Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { DecisionEngine, createDecisionSource } from "../src/decisions/engine";
import type { DecisionResult, DecisionSource } from "../src/decisions/types";
import type { RuleEvaluationContext } from "../src/rules/types";

describe("DecisionEngine", () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    engine = new DecisionEngine();
  });

  describe("registerSource", () => {
    it("registers a decision source", () => {
      const source = createDecisionSource("test-source", 100, async () => ({
        decision: "allow",
        source: "test-source"
      }));

      engine.registerSource(source);
      expect(engine.getSource("test-source")).toBe(source);
    });

    it("replaces existing source with same name", () => {
      const source1 = createDecisionSource("test", 100, async () => ({
        decision: "allow",
        source: "test"
      }));
      const source2 = createDecisionSource("test", 50, async () => ({
        decision: "deny",
        source: "test"
      }));

      engine.registerSource(source1);
      engine.registerSource(source2);

      expect(engine.getSource("test")?.priority).toBe(50);
    });
  });

  describe("unregisterSource", () => {
    it("removes an existing source", () => {
      engine.registerSource(
        createDecisionSource("to-remove", 100, async () => null)
      );

      expect(engine.unregisterSource("to-remove")).toBe(true);
      expect(engine.getSource("to-remove")).toBeUndefined();
    });

    it("returns false for non-existent source", () => {
      expect(engine.unregisterSource("does-not-exist")).toBe(false);
    });
  });

  describe("getAllSources", () => {
    it("returns all registered sources", () => {
      engine.registerSource(createDecisionSource("a", 100, async () => null));
      engine.registerSource(createDecisionSource("b", 200, async () => null));

      const sources = engine.getAllSources();
      expect(sources.length).toBe(2);
      expect(sources.map((s) => s.name)).toContain("a");
      expect(sources.map((s) => s.name)).toContain("b");
    });
  });

  describe("setSourceEnabled", () => {
    it("enables/disables a source", () => {
      engine.registerSource(
        createDecisionSource("toggleable", 100, async () => null)
      );

      engine.setSourceEnabled("toggleable", false);
      expect(engine.getSource("toggleable")?.enabled).toBe(false);

      engine.setSourceEnabled("toggleable", true);
      expect(engine.getSource("toggleable")?.enabled).toBe(true);
    });

    it("returns false for non-existent source", () => {
      expect(engine.setSourceEnabled("does-not-exist", true)).toBe(false);
    });
  });

  describe("decide", () => {
    it("returns default decision when no sources registered", async () => {
      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("allow");
      expect(result.decidingSource).toBe("default");
    });

    it("returns decision from single source", async () => {
      engine.registerSource(
        createDecisionSource("only-source", 100, async () => ({
          decision: "deny",
          source: "only-source",
          reason: "Denied by only source"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("deny");
      expect(result.decidingSource).toBe("only-source");
      expect(result.reason).toBe("Denied by only source");
    });

    it("respects source priority (lower number = higher priority)", async () => {
      engine.registerSource(
        createDecisionSource("low-priority", 200, async () => ({
          decision: "allow",
          source: "low-priority"
        }))
      );

      engine.registerSource(
        createDecisionSource("high-priority", 50, async () => ({
          decision: "deny",
          source: "high-priority"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("deny");
      expect(result.decidingSource).toBe("high-priority");
    });

    it("short-circuits on deny decision", async () => {
      let lowPriorityCalled = false;

      engine.registerSource(
        createDecisionSource("denier", 50, async () => ({
          decision: "deny",
          source: "denier"
        }))
      );

      engine.registerSource(
        createDecisionSource("low-priority", 200, async () => {
          lowPriorityCalled = true;
          return { decision: "allow", source: "low-priority" };
        })
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      await engine.decide(context);

      expect(lowPriorityCalled).toBe(false);
    });

    it("short-circuits on block decision", async () => {
      let lowPriorityCalled = false;

      engine.registerSource(
        createDecisionSource("blocker", 50, async () => ({
          decision: "block",
          source: "blocker"
        }))
      );

      engine.registerSource(
        createDecisionSource("low-priority", 200, async () => {
          lowPriorityCalled = true;
          return { decision: "allow", source: "low-priority" };
        })
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      await engine.decide(context);

      expect(lowPriorityCalled).toBe(false);
    });

    it("continues on allow decision", async () => {
      let secondCalled = false;

      engine.registerSource(
        createDecisionSource("first", 50, async () => ({
          decision: "allow",
          source: "first"
        }))
      );

      engine.registerSource(
        createDecisionSource("second", 100, async () => {
          secondCalled = true;
          return { decision: "allow", source: "second" };
        })
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      await engine.decide(context);

      expect(secondCalled).toBe(true);
    });

    it("skips disabled sources", async () => {
      let disabledCalled = false;

      engine.registerSource(
        createDecisionSource(
          "disabled",
          50,
          async () => {
            disabledCalled = true;
            return { decision: "deny", source: "disabled" };
          },
          { enabled: false }
        )
      );

      engine.registerSource(
        createDecisionSource("enabled", 100, async () => ({
          decision: "allow",
          source: "enabled"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(disabledCalled).toBe(false);
      expect(result.finalDecision).toBe("allow");
    });

    it("respects appliesTo filter", async () => {
      let wrongHookCalled = false;

      engine.registerSource(
        createDecisionSource(
          "pre-tool-only",
          50,
          async () => {
            return { decision: "deny", source: "pre-tool-only" };
          },
          { appliesTo: (hookType) => hookType === "PreToolUse" }
        )
      );

      engine.registerSource(
        createDecisionSource(
          "post-tool-only",
          100,
          async () => {
            wrongHookCalled = true;
            return { decision: "allow", source: "post-tool-only" };
          },
          { appliesTo: (hookType) => hookType === "PostToolUse" }
        )
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(wrongHookCalled).toBe(false);
      expect(result.finalDecision).toBe("deny");
    });

    it("ignores abstain decisions", async () => {
      engine.registerSource(
        createDecisionSource("abstainer", 50, async () => ({
          decision: "abstain",
          source: "abstainer"
        }))
      );

      engine.registerSource(
        createDecisionSource("decider", 100, async () => ({
          decision: "deny",
          source: "decider",
          reason: "Final decision"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("deny");
      expect(result.decidingSource).toBe("decider");
    });

    it("ignores null decisions", async () => {
      engine.registerSource(
        createDecisionSource("null-returner", 50, async () => null)
      );

      engine.registerSource(
        createDecisionSource("decider", 100, async () => ({
          decision: "allow",
          source: "decider"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("allow");
      expect(result.decidingSource).toBe("decider");
    });

    it("handles source errors gracefully", async () => {
      engine.registerSource(
        createDecisionSource("erroring", 50, async () => {
          throw new Error("Source error");
        })
      );

      engine.registerSource(
        createDecisionSource("fallback", 100, async () => ({
          decision: "allow",
          source: "fallback"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.finalDecision).toBe("allow");
      expect(result.decidingSource).toBe("fallback");
    });

    it("combines modifications from multiple sources", async () => {
      engine.registerSource(
        createDecisionSource("modifier1", 50, async () => ({
          decision: "allow",
          source: "modifier1",
          modifications: { key1: "value1" }
        }))
      );

      engine.registerSource(
        createDecisionSource("modifier2", 100, async () => ({
          decision: "allow",
          source: "modifier2",
          modifications: { key2: "value2" }
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.modifications).toEqual({ key1: "value1", key2: "value2" });
    });

    it("combines system messages from multiple sources", async () => {
      engine.registerSource(
        createDecisionSource("msg1", 50, async () => ({
          decision: "allow",
          source: "msg1",
          systemMessage: "Message 1"
        }))
      );

      engine.registerSource(
        createDecisionSource("msg2", 100, async () => ({
          decision: "allow",
          source: "msg2",
          systemMessage: "Message 2"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.systemMessage).toContain("Message 1");
      expect(result.systemMessage).toContain("Message 2");
    });

    it("returns totalTimeMs", async () => {
      engine.registerSource(
        createDecisionSource("quick", 100, async () => ({
          decision: "allow",
          source: "quick"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("wouldBlock", () => {
    it("returns true for deny decision", async () => {
      engine.registerSource(
        createDecisionSource("denier", 100, async () => ({
          decision: "deny",
          source: "denier"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      expect(await engine.wouldBlock(context)).toBe(true);
    });

    it("returns true for block decision", async () => {
      engine.registerSource(
        createDecisionSource("blocker", 100, async () => ({
          decision: "block",
          source: "blocker"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      expect(await engine.wouldBlock(context)).toBe(true);
    });

    it("returns false for allow decision", async () => {
      engine.registerSource(
        createDecisionSource("allower", 100, async () => ({
          decision: "allow",
          source: "allower"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      expect(await engine.wouldBlock(context)).toBe(false);
    });
  });

  describe("onDecision", () => {
    it("emits events on decisions", async () => {
      const events: unknown[] = [];

      engine.onDecision((event) => {
        events.push(event);
      });

      engine.registerSource(
        createDecisionSource("test", 100, async () => ({
          decision: "allow",
          source: "test"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      await engine.decide(context);

      expect(events.length).toBe(1);
    });

    it("returns unsubscribe function", async () => {
      const events: unknown[] = [];

      const unsubscribe = engine.onDecision((event) => {
        events.push(event);
      });

      engine.registerSource(
        createDecisionSource("test", 100, async () => ({
          decision: "allow",
          source: "test"
        }))
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      await engine.decide(context);
      unsubscribe();
      await engine.decide(context);

      expect(events.length).toBe(1);
    });
  });

  describe("getStats", () => {
    it("returns source statistics", () => {
      engine.registerSource(createDecisionSource("a", 100, async () => null));
      engine.registerSource(
        createDecisionSource("b", 50, async () => null, { enabled: false })
      );

      const stats = engine.getStats();

      expect(stats.totalSources).toBe(2);
      expect(stats.enabledSources).toBe(1);
      expect(stats.sourcesByPriority[0].name).toBe("b"); // Lower priority number first
      expect(stats.sourcesByPriority[1].name).toBe("a");
    });
  });

  describe("clear", () => {
    it("removes all sources", () => {
      engine.registerSource(createDecisionSource("a", 100, async () => null));
      engine.registerSource(createDecisionSource("b", 200, async () => null));

      engine.clear();

      expect(engine.getAllSources().length).toBe(0);
    });
  });

  describe("parallel evaluation", () => {
    it("evaluates all sources in parallel when shortCircuit is false", async () => {
      const callOrder: string[] = [];

      engine.updateConfig({ shortCircuit: false });

      engine.registerSource(
        createDecisionSource("slow", 50, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          callOrder.push("slow");
          return { decision: "deny", source: "slow" };
        })
      );

      engine.registerSource(
        createDecisionSource("fast", 100, async () => {
          callOrder.push("fast");
          return { decision: "allow", source: "fast" };
        })
      );

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = await engine.decide(context);

      // Fast should complete first in parallel mode
      expect(callOrder[0]).toBe("fast");
      // But slow has higher priority (lower number), so its decision wins
      expect(result.finalDecision).toBe("deny");
      expect(result.decidingSource).toBe("slow");
    });
  });
});

describe("createDecisionSource", () => {
  it("creates a decision source with defaults", () => {
    const source = createDecisionSource("test", 100, async () => ({
      decision: "allow",
      source: "test"
    }));

    expect(source.name).toBe("test");
    expect(source.priority).toBe(100);
    expect(source.enabled).toBe(true);
  });

  it("creates a decision source with options", () => {
    const appliesTo = (hookType: string) => hookType === "PreToolUse";
    const source = createDecisionSource(
      "test",
      100,
      async () => ({ decision: "allow", source: "test" }),
      { enabled: false, appliesTo }
    );

    expect(source.enabled).toBe(false);
    expect(source.appliesTo).toBe(appliesTo);
  });
});
