/**
 * Decision Engine
 *
 * Coordinates multiple decision sources to produce a final decision
 * for hook processing. Supports priority-based evaluation, short-circuiting,
 * and parallel evaluation with timeout.
 */

import type { RuleEvaluationContext } from "../rules/types";
import type {
  AggregatedDecisionResult,
  DecisionEngineConfig,
  DecisionEvent,
  DecisionEventCallback,
  DecisionOutcome,
  DecisionResult,
  DecisionSource,
  ExtendedDecisionContext
} from "./types";
import { DECISION_PRIORITY } from "./types";

/**
 * Default configuration for the decision engine.
 */
const DEFAULT_CONFIG: DecisionEngineConfig = {
  shortCircuit: true,
  defaultDecision: "allow",
  timeoutMs: 5000,
  sources: {}
};

/**
 * Decision Engine class.
 *
 * Coordinates multiple decision sources to produce unified decisions
 * for hook processing.
 */
export class DecisionEngine {
  private sources: Map<string, DecisionSource> = new Map();
  private config: DecisionEngineConfig;
  private eventCallbacks: Set<DecisionEventCallback> = new Set();

  constructor(config: Partial<DecisionEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a decision source.
   */
  registerSource(source: DecisionSource): void {
    this.sources.set(source.name, source);
  }

  /**
   * Unregister a decision source.
   */
  unregisterSource(name: string): boolean {
    return this.sources.delete(name);
  }

  /**
   * Get a registered source by name.
   */
  getSource(name: string): DecisionSource | undefined {
    return this.sources.get(name);
  }

  /**
   * Get all registered sources.
   */
  getAllSources(): DecisionSource[] {
    return [...this.sources.values()];
  }

  /**
   * Enable or disable a source.
   */
  setSourceEnabled(name: string, enabled: boolean): boolean {
    const source = this.sources.get(name);
    if (!source) {
      return false;
    }
    source.enabled = enabled;
    return true;
  }

  /**
   * Update engine configuration.
   */
  updateConfig(config: Partial<DecisionEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Subscribe to decision events.
   */
  onDecision(callback: DecisionEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit a decision event.
   */
  private emitEvent(event: DecisionEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Get applicable sources for a hook type, sorted by priority.
   */
  private getApplicableSources(hookType: string): DecisionSource[] {
    return [...this.sources.values()]
      .filter((source) => {
        if (!source.enabled) return false;
        if (source.appliesTo && !source.appliesTo(hookType)) return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a decision should short-circuit evaluation.
   */
  private shouldShortCircuit(decision: DecisionOutcome): boolean {
    // These decisions are final and stop further evaluation
    return decision === "deny" || decision === "block";
  }

  /**
   * Combine modifications from multiple decisions.
   */
  private combineModifications(
    decisions: DecisionResult[]
  ): Record<string, unknown> | undefined {
    const modifications: Record<string, unknown> = {};
    let hasModifications = false;

    for (const decision of decisions) {
      if (decision.modifications) {
        hasModifications = true;
        Object.assign(modifications, decision.modifications);
      }
    }

    return hasModifications ? modifications : undefined;
  }

  /**
   * Combine system messages from multiple decisions.
   */
  private combineSystemMessages(
    decisions: DecisionResult[]
  ): string | undefined {
    const messages = decisions
      .filter((d) => d.systemMessage)
      .map((d) => d.systemMessage!);

    if (messages.length === 0) return undefined;
    if (messages.length === 1) return messages[0];
    return messages.join("\n\n");
  }

  /**
   * Evaluate all sources and return an aggregated decision.
   */
  async decide(
    context: RuleEvaluationContext | ExtendedDecisionContext
  ): Promise<AggregatedDecisionResult> {
    const startTime = performance.now();
    const decisions: DecisionResult[] = [];
    const applicableSources = this.getApplicableSources(context.hookType);

    let finalDecision: DecisionOutcome = this.config.defaultDecision;
    let decidingSource = "default";
    let reason: string | undefined;
    let systemMessage: string | undefined;

    if (this.config.shortCircuit) {
      // Sequential evaluation with short-circuit
      for (const source of applicableSources) {
        try {
          const result = await Promise.race([
            source.evaluate(context),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), this.config.timeoutMs)
            )
          ]);

          if (result && result.decision !== "abstain") {
            decisions.push(result);

            if (this.shouldShortCircuit(result.decision)) {
              finalDecision = result.decision;
              decidingSource = result.source;
              reason = result.reason;
              systemMessage = result.systemMessage;
              break;
            }

            // Update to most recent non-abstain decision
            finalDecision = result.decision;
            decidingSource = result.source;
            reason = result.reason;
            systemMessage = result.systemMessage;
          }
        } catch {
          // Source evaluation failed, continue with next
          decisions.push({
            decision: "abstain",
            source: source.name,
            reason: "Source evaluation failed"
          });
        }
      }
    } else {
      // Parallel evaluation
      const promises = applicableSources.map(async (source) => {
        try {
          const result = await Promise.race([
            source.evaluate(context),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), this.config.timeoutMs)
            )
          ]);
          return result;
        } catch {
          return {
            decision: "abstain" as DecisionOutcome,
            source: source.name,
            reason: "Source evaluation failed"
          };
        }
      });

      const results = await Promise.all(promises);

      for (const result of results) {
        if (result && result.decision !== "abstain") {
          decisions.push(result);
        }
      }

      // Find the highest priority (lowest number) non-abstain decision
      for (const source of applicableSources) {
        const result = decisions.find((d) => d.source === source.name);
        if (result) {
          finalDecision = result.decision;
          decidingSource = result.source;
          reason = result.reason;
          systemMessage = result.systemMessage;
          break;
        }
      }
    }

    const aggregatedResult: AggregatedDecisionResult = {
      finalDecision,
      decidingSource,
      reason,
      systemMessage: this.combineSystemMessages(decisions) ?? systemMessage,
      modifications: this.combineModifications(decisions),
      decisions,
      totalTimeMs: performance.now() - startTime
    };

    // Emit event
    this.emitEvent({
      timestamp: Date.now(),
      hookType: context.hookType,
      sessionId: context.sessionId,
      toolName: context.toolName,
      result: aggregatedResult
    });

    return aggregatedResult;
  }

  /**
   * Quick check if any source would deny/block.
   * Useful for permission checks without full evaluation.
   */
  async wouldBlock(
    context: RuleEvaluationContext | ExtendedDecisionContext
  ): Promise<boolean> {
    const result = await this.decide(context);
    return result.finalDecision === "deny" || result.finalDecision === "block";
  }

  /**
   * Get statistics about registered sources.
   */
  getStats(): {
    totalSources: number;
    enabledSources: number;
    sourcesByPriority: Array<{
      name: string;
      priority: number;
      enabled: boolean;
    }>;
  } {
    const sources = [...this.sources.values()];
    return {
      totalSources: sources.length,
      enabledSources: sources.filter((s) => s.enabled).length,
      sourcesByPriority: sources
        .map((s) => ({
          name: s.name,
          priority: s.priority,
          enabled: s.enabled
        }))
        .sort((a, b) => a.priority - b.priority)
    };
  }

  /**
   * Clear all sources.
   */
  clear(): void {
    this.sources.clear();
  }
}

/**
 * Create a simple decision source from a function.
 */
export function createDecisionSource(
  name: string,
  priority: number,
  evaluate: (
    context: RuleEvaluationContext | ExtendedDecisionContext
  ) => Promise<DecisionResult | null>,
  options: {
    enabled?: boolean;
    appliesTo?: (hookType: string) => boolean;
  } = {}
): DecisionSource {
  return {
    name,
    priority,
    enabled: options.enabled ?? true,
    evaluate,
    appliesTo: options.appliesTo
  };
}
