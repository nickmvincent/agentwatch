/**
 * Task type inference from session content.
 *
 * Analyzes tool usages and git changes to infer what type of task
 * the session was performing: feature, bugfix, refactor, test, docs, etc.
 */

import type {
  AutoTag,
  AutoTagsEnrichment,
  HookSession,
  TagCategory,
  TaskType,
  ToolUsage
} from "@agentwatch/core";

// =============================================================================
// INFERENCE RULES
// =============================================================================

interface InferenceRule {
  pattern: RegExp;
  tag: string;
  category: TagCategory;
  confidence: number;
}

/**
 * Rules for inferring task type from commands.
 */
const COMMAND_RULES: InferenceRule[] = [
  // Test commands
  {
    pattern: /\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /\bpytest\b/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  { pattern: /\bjest\b/i, tag: "test", category: "task_type", confidence: 0.9 },
  {
    pattern: /\bvitest\b/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /\bcargo\s+test\b/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /\bgo\s+test\b/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },

  // Lint/format commands
  {
    pattern: /\b(eslint|prettier|biome)\b/i,
    tag: "lint",
    category: "task_type",
    confidence: 0.8
  },
  { pattern: /\bruff\b/i, tag: "lint", category: "task_type", confidence: 0.8 },
  {
    pattern: /\b(npm|yarn|pnpm|bun)\s+(run\s+)?lint\b/i,
    tag: "lint",
    category: "task_type",
    confidence: 0.8
  },

  // Build commands
  {
    pattern: /\b(npm|yarn|pnpm|bun)\s+(run\s+)?build\b/i,
    tag: "build",
    category: "task_type",
    confidence: 0.7
  },
  { pattern: /\btsc\b/i, tag: "build", category: "task_type", confidence: 0.7 },
  {
    pattern: /\bcargo\s+build\b/i,
    tag: "build",
    category: "task_type",
    confidence: 0.7
  },

  // Fix-related keywords in commit messages or commands
  {
    pattern: /\bfix(es|ed|ing)?\b/i,
    tag: "bugfix",
    category: "task_type",
    confidence: 0.7
  },
  {
    pattern: /\bbug\b/i,
    tag: "bugfix",
    category: "task_type",
    confidence: 0.6
  },
  {
    pattern: /\berror\b/i,
    tag: "bugfix",
    category: "task_type",
    confidence: 0.5
  },

  // Refactor keywords
  {
    pattern: /\brefactor(s|ed|ing)?\b/i,
    tag: "refactor",
    category: "task_type",
    confidence: 0.8
  },
  {
    pattern: /\brename\b/i,
    tag: "refactor",
    category: "task_type",
    confidence: 0.6
  },
  {
    pattern: /\bcleanup\b/i,
    tag: "refactor",
    category: "task_type",
    confidence: 0.6
  },

  // Docs keywords
  {
    pattern: /\bdocs?\b/i,
    tag: "docs",
    category: "task_type",
    confidence: 0.7
  },
  {
    pattern: /\bdocumentation\b/i,
    tag: "docs",
    category: "task_type",
    confidence: 0.8
  },
  {
    pattern: /\breadme\b/i,
    tag: "docs",
    category: "task_type",
    confidence: 0.8
  }
];

/**
 * Rules for inferring from file extensions.
 */
const FILE_EXTENSION_RULES: InferenceRule[] = [
  // Test files
  {
    pattern: /\.test\.[jt]sx?$/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /\.spec\.[jt]sx?$/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /_test\.go$/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /_test\.py$/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },
  {
    pattern: /test_.*\.py$/i,
    tag: "test",
    category: "task_type",
    confidence: 0.9
  },

  // Documentation files
  { pattern: /\.md$/i, tag: "docs", category: "task_type", confidence: 0.7 },
  { pattern: /\.rst$/i, tag: "docs", category: "task_type", confidence: 0.7 },
  { pattern: /readme/i, tag: "docs", category: "task_type", confidence: 0.8 },
  {
    pattern: /changelog/i,
    tag: "docs",
    category: "task_type",
    confidence: 0.7
  },

  // Config files
  {
    pattern: /\.(json|ya?ml|toml)$/i,
    tag: "config",
    category: "task_type",
    confidence: 0.5
  },
  {
    pattern: /\bpackage\.json$/i,
    tag: "config",
    category: "task_type",
    confidence: 0.6
  },
  {
    pattern: /\btsconfig\.json$/i,
    tag: "config",
    category: "task_type",
    confidence: 0.6
  },
  { pattern: /\.env/i, tag: "config", category: "task_type", confidence: 0.6 },

  // Languages
  {
    pattern: /\.[jt]sx?$/i,
    tag: "typescript",
    category: "language",
    confidence: 0.9
  },
  { pattern: /\.py$/i, tag: "python", category: "language", confidence: 0.9 },
  { pattern: /\.rs$/i, tag: "rust", category: "language", confidence: 0.9 },
  { pattern: /\.go$/i, tag: "go", category: "language", confidence: 0.9 },
  { pattern: /\.java$/i, tag: "java", category: "language", confidence: 0.9 },
  { pattern: /\.rb$/i, tag: "ruby", category: "language", confidence: 0.9 },
  { pattern: /\.php$/i, tag: "php", category: "language", confidence: 0.9 },
  { pattern: /\.swift$/i, tag: "swift", category: "language", confidence: 0.9 },
  { pattern: /\.kt$/i, tag: "kotlin", category: "language", confidence: 0.9 },
  { pattern: /\.cs$/i, tag: "csharp", category: "language", confidence: 0.9 },
  { pattern: /\.cpp$/i, tag: "cpp", category: "language", confidence: 0.9 },
  { pattern: /\.c$/i, tag: "c", category: "language", confidence: 0.9 },

  // Domain hints
  {
    pattern: /components?[/\\]/i,
    tag: "frontend",
    category: "domain",
    confidence: 0.7
  },
  {
    pattern: /pages?[/\\]/i,
    tag: "frontend",
    category: "domain",
    confidence: 0.6
  },
  {
    pattern: /views?[/\\]/i,
    tag: "frontend",
    category: "domain",
    confidence: 0.6
  },
  { pattern: /api[/\\]/i, tag: "backend", category: "domain", confidence: 0.7 },
  {
    pattern: /server[/\\]/i,
    tag: "backend",
    category: "domain",
    confidence: 0.6
  },
  {
    pattern: /routes?[/\\]/i,
    tag: "backend",
    category: "domain",
    confidence: 0.6
  },
  {
    pattern: /migrations?[/\\]/i,
    tag: "database",
    category: "domain",
    confidence: 0.8
  },
  {
    pattern: /models?[/\\]/i,
    tag: "database",
    category: "domain",
    confidence: 0.5
  },
  { pattern: /schema/i, tag: "database", category: "domain", confidence: 0.6 }
];

// =============================================================================
// INFERENCE LOGIC
// =============================================================================

/**
 * Extract file paths from tool usages.
 */
function extractFilePaths(toolUsages: ToolUsage[]): string[] {
  const paths: string[] = [];

  for (const usage of toolUsages) {
    // Edit, Write, Read tools have file_path
    const filePath = usage.toolInput?.file_path as string | undefined;
    if (filePath) {
      paths.push(filePath);
    }

    // Glob tool has pattern that might indicate files
    const pattern = usage.toolInput?.pattern as string | undefined;
    if (pattern && !pattern.includes("*")) {
      paths.push(pattern);
    }
  }

  return paths;
}

/**
 * Extract bash commands from tool usages.
 */
function extractCommands(toolUsages: ToolUsage[]): string[] {
  const commands: string[] = [];

  for (const usage of toolUsages) {
    if (usage.toolName === "Bash") {
      const command = usage.toolInput?.command as string | undefined;
      if (command) {
        commands.push(command);
      }
    }
  }

  return commands;
}

/**
 * Apply inference rules to extract tags.
 */
function applyRules(
  items: string[],
  rules: InferenceRule[],
  sourceLabel: string
): AutoTag[] {
  const tags: AutoTag[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    for (const rule of rules) {
      if (rule.pattern.test(item)) {
        const key = `${rule.category}:${rule.tag}`;
        if (!seen.has(key)) {
          seen.add(key);
          tags.push({
            name: rule.tag,
            category: rule.category,
            inferredFrom: `${sourceLabel}: ${item.slice(0, 50)}${item.length > 50 ? "..." : ""}`,
            confidence: rule.confidence
          });
        }
      }
    }
  }

  return tags;
}

/**
 * Determine primary task type from tags.
 */
function determinePrimaryTaskType(tags: AutoTag[]): TaskType {
  // Priority order for task types
  const taskTypePriority: TaskType[] = [
    "test",
    "bugfix",
    "refactor",
    "docs",
    "config",
    "feature",
    "exploration"
  ];

  // Get task_type tags sorted by confidence
  const taskTypeTags = tags
    .filter((t) => t.category === "task_type")
    .sort((a, b) => b.confidence - a.confidence);

  if (taskTypeTags.length === 0) {
    return "unknown";
  }

  // Return highest confidence task type
  const topTag = taskTypeTags[0]!.name as TaskType;
  if (taskTypePriority.includes(topTag)) {
    return topTag;
  }

  return "feature"; // Default if not in priority list
}

/**
 * Check if session is exploration-heavy (mostly reads).
 */
function isExplorationSession(
  toolUsages: ToolUsage[],
  session: HookSession
): boolean {
  const readTools = ["Read", "Glob", "Grep", "LSP"];
  const writeTools = ["Edit", "Write", "Bash"];

  let readCount = 0;
  let writeCount = 0;

  for (const usage of toolUsages) {
    if (readTools.includes(usage.toolName)) {
      readCount++;
    } else if (writeTools.includes(usage.toolName)) {
      writeCount++;
    }
  }

  // Exploration if mostly reads and no commits
  const readRatio = readCount / (readCount + writeCount + 1);
  const noCommits = (session.commits?.length || 0) === 0;

  return readRatio > 0.8 && noCommits;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Infer auto-tags for a session.
 */
export function inferAutoTags(
  session: HookSession,
  toolUsages: ToolUsage[]
): AutoTagsEnrichment {
  const filePaths = extractFilePaths(toolUsages);
  const commands = extractCommands(toolUsages);

  // Apply inference rules
  const fileTags = applyRules(filePaths, FILE_EXTENSION_RULES, "file");
  const commandTags = applyRules(commands, COMMAND_RULES, "command");

  // Combine and deduplicate
  const allTags = [...fileTags, ...commandTags];
  const seenKeys = new Set<string>();
  const uniqueTags = allTags.filter((tag) => {
    const key = `${tag.category}:${tag.name}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Sort by confidence
  uniqueTags.sort((a, b) => b.confidence - a.confidence);

  // Determine primary task type
  let taskType = determinePrimaryTaskType(uniqueTags);

  // Check for exploration pattern
  if (taskType === "unknown" && isExplorationSession(toolUsages, session)) {
    taskType = "exploration";
    uniqueTags.push({
      name: "exploration",
      category: "task_type",
      inferredFrom: "session pattern: read-heavy, no commits",
      confidence: 0.7
    });
  }

  // If still unknown and has commits, likely a feature
  if (taskType === "unknown" && (session.commits?.length || 0) > 0) {
    taskType = "feature";
    uniqueTags.push({
      name: "feature",
      category: "task_type",
      inferredFrom: "default: session has commits",
      confidence: 0.5
    });
  }

  return {
    tags: uniqueTags,
    taskType,
    userTags: [],
    computedAt: new Date().toISOString()
  };
}

/**
 * Get task type label for display.
 */
export function getTaskTypeLabel(taskType: TaskType): string {
  const labels: Record<TaskType, string> = {
    feature: "Feature",
    bugfix: "Bug Fix",
    refactor: "Refactor",
    test: "Testing",
    docs: "Documentation",
    config: "Configuration",
    exploration: "Exploration",
    unknown: "Unknown"
  };
  return labels[taskType] || taskType;
}
