/**
 * PreToolUse Hook Handler
 *
 * Handles PreToolUse events with:
 * - Rule engine evaluation
 * - Input modification
 * - Security checks
 */

import type { RuleEvaluationContext } from "../../rules/types";
import type {
  HookHandlerContext,
  PreToolUseInput,
  PreToolUseResponse
} from "../types";

/**
 * Input modifiers that can transform tool inputs before execution.
 */
export interface InputModifier {
  name: string;
  shouldApply: (input: PreToolUseInput, ctx: HookHandlerContext) => boolean;
  modify: (
    input: PreToolUseInput,
    ctx: HookHandlerContext
  ) => Record<string, unknown>;
}

/**
 * Built-in input modifiers.
 */
export const builtInModifiers: InputModifier[] = [
  {
    name: "dry-run-flags",
    shouldApply: (input, ctx) => {
      if (!ctx.config.hookEnhancements.inputModification.enabled) return false;
      if (!ctx.config.hookEnhancements.inputModification.addDryRunFlags)
        return false;
      if (input.tool_name.toLowerCase() !== "bash") return false;

      const cmd = String(input.tool_input?.command ?? "");
      const destructiveCommands = [
        "rm ",
        "rm\t",
        "mv ",
        "mv\t",
        "cp ",
        "rsync "
      ];
      return destructiveCommands.some((dc) => cmd.includes(dc));
    },
    modify: (input) => {
      const cmd = String(input.tool_input?.command ?? "");
      // Don't add if already has dry-run or -n flag
      if (cmd.includes("--dry-run") || / -[a-z]*n/.test(cmd)) {
        return input.tool_input;
      }
      return {
        ...input.tool_input,
        command: cmd + " --dry-run"
      };
    }
  },
  {
    name: "commit-message-prefix",
    shouldApply: (input, ctx) => {
      if (!ctx.config.hookEnhancements.inputModification.enabled) return false;
      if (!ctx.config.hookEnhancements.inputModification.enforceCommitFormat)
        return false;
      if (!ctx.config.hookEnhancements.inputModification.commitMessagePrefix)
        return false;
      if (input.tool_name.toLowerCase() !== "bash") return false;

      const cmd = String(input.tool_input?.command ?? "");
      return /git\s+commit/.test(cmd) && /-m\s+["']/.test(cmd);
    },
    modify: (input, ctx) => {
      const cmd = String(input.tool_input?.command ?? "");
      const prefix =
        ctx.config.hookEnhancements.inputModification.commitMessagePrefix;

      // Check if message already has the prefix
      const msgMatch = cmd.match(/-m\s+["']([^"']*)/);
      if (msgMatch && msgMatch[1] && !msgMatch[1].startsWith(prefix)) {
        // Add prefix to message
        const newCmd = cmd.replace(/-m\s+["']([^"']*)/, `-m "${prefix}$1`);
        return {
          ...input.tool_input,
          command: newCmd
        };
      }
      return input.tool_input;
    }
  },
  {
    name: "expand-home-path",
    shouldApply: (input, ctx) => {
      if (!ctx.config.hookEnhancements.rules.enabled) return false;
      const filePath = String(input.tool_input?.file_path ?? "");
      return filePath.startsWith("~");
    },
    modify: (input) => {
      const filePath = String(input.tool_input?.file_path ?? "");
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      return {
        ...input.tool_input,
        file_path: filePath.replace(/^~/, home)
      };
    }
  }
];

/**
 * Handle PreToolUse event.
 */
export async function handlePreToolUse(
  input: PreToolUseInput,
  ctx: HookHandlerContext
): Promise<PreToolUseResponse> {
  const { hookStore, ruleEngine, decisionEngine, connectionManager, config } =
    ctx;

  // Record the tool use
  const usage = hookStore.recordPreToolUse(
    input.session_id,
    input.tool_use_id,
    input.tool_name,
    input.tool_input,
    input.cwd
  );

  // Broadcast event
  connectionManager.broadcast({
    type: "hook_pre_tool_use",
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    session_id: input.session_id,
    tool_use_id: input.tool_use_id,
    timestamp: Date.now()
  });

  // Build evaluation context
  const evalContext: RuleEvaluationContext = {
    hookType: "PreToolUse",
    sessionId: input.session_id,
    toolName: input.tool_name,
    toolInput: input.tool_input,
    cwd: input.cwd,
    permissionMode: input.permission_mode
  };

  // Evaluate rules if enabled
  if (config.hookEnhancements.rules.enabled) {
    const ruleResult = ruleEngine.evaluate(evalContext);

    if (ruleResult.matched && ruleResult.action) {
      const action = ruleResult.action;

      if (action.type === "deny" || action.type === "block") {
        // Record security block
        hookStore.recordSecurityBlock(
          input.session_id,
          input.tool_name,
          input.tool_input,
          ruleResult.matchedRule?.id,
          action.reason
        );

        return {
          decision: action.type === "deny" ? "deny" : "block",
          reason: action.reason ?? "Blocked by rule",
          ruleId: ruleResult.matchedRule?.id,
          source: "rules"
        };
      }

      if (action.type === "modify" && action.modifications) {
        return {
          decision: "approve",
          updatedInput: { ...input.tool_input, ...action.modifications },
          ruleId: ruleResult.matchedRule?.id,
          source: "rules"
        };
      }
    }
  }

  // Use decision engine for more complex evaluation
  const decision = await decisionEngine.decide(evalContext);

  if (decision.finalDecision === "deny" || decision.finalDecision === "block") {
    hookStore.recordSecurityBlock(
      input.session_id,
      input.tool_name,
      input.tool_input,
      undefined,
      decision.reason
    );

    return {
      decision: decision.finalDecision === "deny" ? "deny" : "block",
      reason: decision.reason,
      source: decision.decidingSource
    };
  }

  // Apply input modifiers
  let modifiedInput = input.tool_input;
  for (const modifier of builtInModifiers) {
    if (modifier.shouldApply(input, ctx)) {
      modifiedInput = modifier.modify(
        { ...input, tool_input: modifiedInput },
        ctx
      );
    }
  }

  // Check if input was modified
  const wasModified =
    JSON.stringify(modifiedInput) !== JSON.stringify(input.tool_input);

  if (wasModified || decision.modifications) {
    return {
      decision: "approve",
      updatedInput: { ...modifiedInput, ...decision.modifications },
      source: wasModified ? "input_modifiers" : decision.decidingSource
    };
  }

  return { decision: "approve" };
}
