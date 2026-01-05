/**
 * Built-in Rule Sets
 *
 * Pre-defined rules for common use cases.
 * All rules are disabled by default and must be explicitly enabled.
 */

import type { Rule, RuleSet } from "./types";
import { BUILTIN_RULE_SETS } from "./types";

// =============================================================================
// Security Rules
// =============================================================================

const securityRules: Rule[] = [
  {
    id: "security:block-rm-rf",
    name: "Block rm -rf",
    description: "Prevents recursive force deletion commands",
    enabled: true,
    priority: 0,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Bash"],
    conditions: [
      {
        field: "toolInput.command",
        operator: "matches",
        value: "/rm\\s+(-[rfR]+\\s+)*(\\/|~|\\$HOME)/"
      }
    ],
    action: {
      type: "deny",
      reason:
        "Recursive deletion of root, home, or important directories is blocked for safety"
    },
    tags: ["security", "filesystem"]
  },
  {
    id: "security:block-env-exposure",
    name: "Block environment variable exposure",
    description:
      "Prevents commands that might expose sensitive environment variables",
    enabled: true,
    priority: 1,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Bash"],
    conditions: [
      {
        field: "toolInput.command",
        operator: "matches",
        value: "/(printenv|env|set)\\s*\\|.*curl|curl.*\\$\\(/"
      }
    ],
    action: {
      type: "deny",
      reason:
        "Commands that may expose environment variables to external services are blocked"
    },
    tags: ["security", "secrets"]
  },
  {
    id: "security:block-sensitive-file-write",
    name: "Block sensitive file writes",
    description: "Prevents writing to sensitive configuration files",
    enabled: true,
    priority: 0,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Write", "Edit"],
    conditions: [
      {
        field: "toolInput.file_path",
        operator: "matches",
        value:
          "/(\\.ssh\\/|\\/(etc|usr)\\/|password|secret|credential|\\.env$)/i"
      }
    ],
    action: {
      type: "deny",
      reason: "Writing to sensitive files is blocked for security"
    },
    tags: ["security", "filesystem"]
  }
];

export const SECURITY_RULE_SET: RuleSet = {
  id: BUILTIN_RULE_SETS.SECURITY,
  name: "Security Rules",
  description:
    "Rules to prevent dangerous operations and protect sensitive data",
  enabled: false,
  rules: securityRules,
  version: "1.0.0",
  author: "agentwatch",
  tags: ["security", "protection"]
};

// =============================================================================
// Read-Only Approval Rules
// =============================================================================

const readOnlyApprovalRules: Rule[] = [
  {
    id: "readonly:auto-approve-read",
    name: "Auto-approve Read tool",
    description: "Automatically approve file read operations",
    enabled: true,
    priority: 10,
    hookTypes: ["PermissionRequest"],
    toolPatterns: ["Read"],
    action: {
      type: "allow",
      reason: "Read operations are safe and auto-approved"
    },
    tags: ["auto-approve", "readonly"]
  },
  {
    id: "readonly:auto-approve-glob",
    name: "Auto-approve Glob tool",
    description: "Automatically approve file pattern matching",
    enabled: true,
    priority: 10,
    hookTypes: ["PermissionRequest"],
    toolPatterns: ["Glob"],
    action: {
      type: "allow",
      reason: "Glob operations are safe and auto-approved"
    },
    tags: ["auto-approve", "readonly"]
  },
  {
    id: "readonly:auto-approve-grep",
    name: "Auto-approve Grep tool",
    description: "Automatically approve code search operations",
    enabled: true,
    priority: 10,
    hookTypes: ["PermissionRequest"],
    toolPatterns: ["Grep"],
    action: {
      type: "allow",
      reason: "Grep operations are safe and auto-approved"
    },
    tags: ["auto-approve", "readonly"]
  },
  {
    id: "readonly:auto-approve-web-fetch",
    name: "Auto-approve WebFetch tool",
    description: "Automatically approve web fetch operations",
    enabled: true,
    priority: 10,
    hookTypes: ["PermissionRequest"],
    toolPatterns: ["WebFetch"],
    action: {
      type: "allow",
      reason: "WebFetch operations are safe and auto-approved"
    },
    tags: ["auto-approve", "readonly"]
  },
  {
    id: "readonly:auto-approve-web-search",
    name: "Auto-approve WebSearch tool",
    description: "Automatically approve web search operations",
    enabled: true,
    priority: 10,
    hookTypes: ["PermissionRequest"],
    toolPatterns: ["WebSearch"],
    action: {
      type: "allow",
      reason: "WebSearch operations are safe and auto-approved"
    },
    tags: ["auto-approve", "readonly"]
  }
];

export const READ_ONLY_APPROVAL_RULE_SET: RuleSet = {
  id: BUILTIN_RULE_SETS.READ_ONLY_APPROVAL,
  name: "Read-Only Auto-Approval",
  description: "Automatically approve safe, read-only operations",
  enabled: false,
  rules: readOnlyApprovalRules,
  version: "1.0.0",
  author: "agentwatch",
  tags: ["auto-approve", "workflow"]
};

// =============================================================================
// Path Sanitization Rules
// =============================================================================

const pathSanitizationRules: Rule[] = [
  {
    id: "path:expand-home",
    name: "Expand home directory",
    description: "Expand ~ to full home path in file operations",
    enabled: true,
    priority: 50,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Read", "Write", "Edit", "Glob"],
    conditions: [
      {
        field: "toolInput.file_path",
        operator: "startsWith",
        value: "~"
      }
    ],
    action: {
      type: "modify",
      reason: "Expanding ~ to full path",
      modifications: {
        // Note: actual expansion happens in handler using process.env.HOME
        _expandHome: true
      }
    },
    tags: ["path", "sanitization"]
  },
  {
    id: "path:block-traversal",
    name: "Block path traversal",
    description: "Block attempts to traverse outside project directory",
    enabled: true,
    priority: 5,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Read", "Write", "Edit"],
    conditions: [
      {
        field: "toolInput.file_path",
        operator: "contains",
        value: "../../../"
      }
    ],
    action: {
      type: "deny",
      reason: "Deep path traversal is blocked for security"
    },
    tags: ["path", "security"]
  }
];

export const PATH_SANITIZATION_RULE_SET: RuleSet = {
  id: BUILTIN_RULE_SETS.PATH_SANITIZATION,
  name: "Path Sanitization",
  description: "Sanitize and validate file paths",
  enabled: false,
  rules: pathSanitizationRules,
  version: "1.0.0",
  author: "agentwatch",
  tags: ["path", "sanitization"]
};

// =============================================================================
// Git Workflow Rules
// =============================================================================

const gitWorkflowRules: Rule[] = [
  {
    id: "git:require-message-prefix",
    name: "Require commit message prefix",
    description: "Ensure commit messages start with conventional prefix",
    enabled: true,
    priority: 20,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Bash"],
    conditions: [
      {
        field: "toolInput.command",
        operator: "matches",
        value: "/git\\s+commit\\s+/"
      },
      {
        field: "toolInput.command",
        operator: "matches",
        value:
          "/-m\\s+[\"'](?!(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)[:(])/",
        negate: false
      }
    ],
    action: {
      type: "warn",
      reason:
        "Consider using conventional commit format (feat:, fix:, docs:, etc.)"
    },
    tags: ["git", "workflow"]
  },
  {
    id: "git:block-force-push-main",
    name: "Block force push to main",
    description: "Prevent force pushing to main/master branches",
    enabled: true,
    priority: 0,
    hookTypes: ["PreToolUse"],
    toolPatterns: ["Bash"],
    conditions: [
      {
        field: "toolInput.command",
        operator: "matches",
        value:
          "/git\\s+push\\s+.*--force.*\\s+(main|master)|git\\s+push\\s+-f.*\\s+(main|master)/"
      }
    ],
    action: {
      type: "deny",
      reason: "Force pushing to main/master is blocked for safety"
    },
    tags: ["git", "security"]
  }
];

export const GIT_WORKFLOW_RULE_SET: RuleSet = {
  id: BUILTIN_RULE_SETS.GIT_WORKFLOW,
  name: "Git Workflow",
  description: "Enforce git workflow best practices",
  enabled: false,
  rules: gitWorkflowRules,
  version: "1.0.0",
  author: "agentwatch",
  tags: ["git", "workflow"]
};

// =============================================================================
// Cost Control Rules
// =============================================================================

const costControlRules: Rule[] = [
  {
    id: "cost:warn-high-session",
    name: "Warn on high session cost",
    description: "Warn when session cost exceeds threshold",
    enabled: true,
    priority: 100,
    hookTypes: ["Stop"],
    conditions: [
      {
        field: "costUsd",
        operator: "gte",
        value: 1.0
      }
    ],
    action: {
      type: "warn",
      reason: "Session cost has exceeded $1.00"
    },
    tags: ["cost", "monitoring"]
  },
  {
    id: "cost:block-excessive",
    name: "Block excessive cost",
    description: "Block session when cost is excessive",
    enabled: true,
    priority: 0,
    hookTypes: ["Stop"],
    conditions: [
      {
        field: "costUsd",
        operator: "gte",
        value: 10.0
      }
    ],
    action: {
      type: "block",
      reason: "Session cost has exceeded $10.00 limit"
    },
    tags: ["cost", "limit"]
  }
];

export const COST_CONTROL_RULE_SET: RuleSet = {
  id: BUILTIN_RULE_SETS.COST_CONTROL,
  name: "Cost Control",
  description: "Monitor and limit session costs",
  enabled: false,
  rules: costControlRules,
  version: "1.0.0",
  author: "agentwatch",
  tags: ["cost", "budget"]
};

// =============================================================================
// All Built-in Rule Sets
// =============================================================================

export const ALL_BUILTIN_RULE_SETS: RuleSet[] = [
  SECURITY_RULE_SET,
  READ_ONLY_APPROVAL_RULE_SET,
  PATH_SANITIZATION_RULE_SET,
  GIT_WORKFLOW_RULE_SET,
  COST_CONTROL_RULE_SET
];

/**
 * Get a built-in rule set by ID.
 */
export function getBuiltinRuleSet(id: string): RuleSet | undefined {
  return ALL_BUILTIN_RULE_SETS.find((rs) => rs.id === id);
}

/**
 * Get all built-in rule set IDs.
 */
export function getBuiltinRuleSetIds(): string[] {
  return ALL_BUILTIN_RULE_SETS.map((rs) => rs.id);
}
