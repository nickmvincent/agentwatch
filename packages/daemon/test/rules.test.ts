/**
 * Rules Engine Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { RuleEngine } from "../src/rules/engine";
import type { Rule, RuleEvaluationContext } from "../src/rules/types";

describe("RuleEngine", () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine({
      enabled: true,
      rulesFile: "",
      enabledRuleSets: []
    });
  });

  describe("addRule", () => {
    it("adds a rule to the engine", () => {
      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
        action: { type: "allow" }
      };

      engine.addRule(rule);
      expect(engine.getRule("test-rule")).toEqual(rule);
    });

    it("replaces existing rule with same id", () => {
      const rule1: Rule = {
        id: "test-rule",
        name: "Original",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      };

      const rule2: Rule = {
        id: "test-rule",
        name: "Updated",
        enabled: true,
        priority: 50,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "deny" }
      };

      engine.addRule(rule1);
      engine.addRule(rule2);

      expect(engine.getRule("test-rule")?.name).toBe("Updated");
      expect(engine.getRule("test-rule")?.priority).toBe(50);
    });
  });

  describe("removeRule", () => {
    it("removes an existing rule", () => {
      engine.addRule({
        id: "to-remove",
        name: "To Remove",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      });

      expect(engine.removeRule("to-remove")).toBe(true);
      expect(engine.getRule("to-remove")).toBeUndefined();
    });

    it("returns false for non-existent rule", () => {
      expect(engine.removeRule("does-not-exist")).toBe(false);
    });
  });

  describe("evaluate", () => {
    it("matches rule with eq operator", () => {
      engine.addRule({
        id: "bash-rule",
        name: "Bash Rule",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
        action: { type: "deny", reason: "Bash not allowed" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: { command: "ls" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.action?.type).toBe("deny");
      expect(result.action?.reason).toBe("Bash not allowed");
    });

    it("matches rule with contains operator", () => {
      engine.addRule({
        id: "rm-rule",
        name: "Block rm commands",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          { field: "toolName", operator: "eq", value: "Bash" },
          { field: "toolInput.command", operator: "contains", value: "rm -rf" }
        ],
        action: { type: "block", reason: "Dangerous command" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: { command: "rm -rf /tmp/test" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.action?.type).toBe("block");
    });

    it("matches rule with matches (regex) operator", () => {
      engine.addRule({
        id: "secret-rule",
        name: "Block secrets",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          // Use /regex/ format for regex patterns
          {
            field: "toolInput.file_path",
            operator: "matches",
            value: "/\\.(env|secret|key)$/"
          }
        ],
        action: { type: "block", reason: "Cannot access secret files" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Read",
        toolInput: { file_path: "/home/user/.env" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
    });

    it("matches rule with glob pattern", () => {
      engine.addRule({
        id: "glob-rule",
        name: "Match config files",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          // Glob pattern: * matches anything
          {
            field: "toolInput.file_path",
            operator: "matches",
            value: "*.config.ts"
          }
        ],
        action: { type: "allow" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Read",
        toolInput: { file_path: "vite.config.ts" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
    });

    it("matches rule with in operator", () => {
      engine.addRule({
        id: "read-only-rule",
        name: "Allow read-only tools",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          {
            field: "toolName",
            operator: "in",
            value: ["Read", "Glob", "Grep"]
          }
        ],
        action: { type: "allow" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Glob",
        toolInput: { pattern: "*.ts" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.action?.type).toBe("allow");
    });

    it("respects rule priority (lower number = higher priority)", () => {
      engine.addRule({
        id: "low-priority",
        name: "Low Priority Allow",
        enabled: true,
        priority: 200,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
        action: { type: "allow" }
      });

      engine.addRule({
        id: "high-priority",
        name: "High Priority Deny",
        enabled: true,
        priority: 50,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
        action: { type: "deny", reason: "High priority wins" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
      expect(result.action?.type).toBe("deny");
      expect(result.matchedRule?.id).toBe("high-priority");
    });

    it("skips disabled rules", () => {
      engine.addRule({
        id: "disabled-rule",
        name: "Disabled",
        enabled: false,
        priority: 1,
        hookTypes: ["PreToolUse"],
        conditions: [{ field: "toolName", operator: "eq", value: "Bash" }],
        action: { type: "deny" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(false);
    });

    it("only evaluates rules for matching hook type", () => {
      engine.addRule({
        id: "pre-tool-only",
        name: "PreToolUse Only",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "deny" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PostToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: {}
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(false);
    });

    it("handles nested field access", () => {
      engine.addRule({
        id: "nested-rule",
        name: "Nested Field Rule",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          { field: "toolInput.options.force", operator: "eq", value: true }
        ],
        action: { type: "block", reason: "Force option not allowed" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Bash",
        toolInput: { options: { force: true, verbose: false } }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(true);
    });

    it("returns no match when conditions fail", () => {
      engine.addRule({
        id: "strict-rule",
        name: "Strict Rule",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [
          { field: "toolName", operator: "eq", value: "Write" },
          {
            field: "toolInput.file_path",
            operator: "startsWith",
            value: "/protected"
          }
        ],
        action: { type: "deny" }
      });

      const context: RuleEvaluationContext = {
        hookType: "PreToolUse",
        sessionId: "test-session",
        toolName: "Write",
        toolInput: { file_path: "/home/user/file.txt" }
      };

      const result = engine.evaluate(context);
      expect(result.matched).toBe(false);
    });
  });

  describe("getAllRules", () => {
    it("returns all added rules", () => {
      engine.addRule({
        id: "rule-1",
        name: "Rule 1",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      });

      engine.addRule({
        id: "rule-2",
        name: "Rule 2",
        enabled: true,
        priority: 200,
        hookTypes: ["PostToolUse"],
        conditions: [],
        action: { type: "deny" }
      });

      const rules = engine.getAllRules();
      expect(rules.length).toBe(2);
      expect(rules.map((r) => r.id)).toContain("rule-1");
      expect(rules.map((r) => r.id)).toContain("rule-2");
    });
  });

  describe("updateRule", () => {
    it("updates an existing rule", () => {
      engine.addRule({
        id: "to-update",
        name: "Original Name",
        enabled: true,
        priority: 100,
        hookTypes: ["PreToolUse"],
        conditions: [],
        action: { type: "allow" }
      });

      engine.updateRule("to-update", { name: "Updated Name", priority: 50 });

      const rule = engine.getRule("to-update");
      expect(rule?.name).toBe("Updated Name");
      expect(rule?.priority).toBe(50);
      expect(rule?.enabled).toBe(true); // Unchanged
    });

    it("returns false for non-existent rule", () => {
      expect(engine.updateRule("does-not-exist", { name: "New" })).toBe(false);
    });
  });
});
