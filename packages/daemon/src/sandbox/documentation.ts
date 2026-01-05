/**
 * Security Documentation
 *
 * Comprehensive documentation for the Claude Code security system,
 * explaining how permissions, security gates, and sandboxes work together.
 */

export interface SecurityLevel {
  name: string;
  id: string;
  isolation: string;
  protection: "Basic" | "Medium" | "Strong";
  useCase: string;
  pros: string[];
  cons: string[];
}

export interface CommandCategory {
  name: string;
  description: string;
  commands: string[];
  riskLevel: "safe" | "moderate" | "risky";
}

/**
 * Security level comparison
 */
export const SECURITY_LEVELS: SecurityLevel[] = [
  {
    name: "Permission Rules",
    id: "permissions",
    isolation: "None (permission prompts)",
    protection: "Basic",
    useCase: "Quick interactive tasks",
    pros: [
      "No setup required",
      "Fine-grained control over commands",
      "User stays aware of all operations"
    ],
    cons: [
      "Frequent prompts interrupt workflow",
      "Can be bypassed with creative commands",
      "Relies on user judgment for each action"
    ]
  },
  {
    name: "macOS Sandbox",
    id: "macos-sandbox",
    isolation: "Working directory + network allowlist",
    protection: "Medium",
    useCase: "Standard development work",
    pros: [
      "OS-level enforcement",
      "Restricts file access outside working directory",
      "Network limited to allowlist",
      "Commands can auto-approve when sandboxed"
    ],
    cons: [
      "macOS only",
      "Still has access to mounted directories",
      "Network restrictions may break some workflows"
    ]
  },
  {
    name: "Docker Container",
    id: "docker",
    isolation: "Full filesystem isolation",
    protection: "Strong",
    useCase: "Autonomous/agentic work, untrusted code",
    pros: [
      "Complete filesystem isolation",
      "Only current directory is accessible",
      "No access to ~/.ssh, ~/.aws, home directory",
      "Container is disposable - destroyed on exit",
      "Malicious npm packages cannot escape"
    ],
    cons: [
      "Requires Docker installation",
      "Slightly slower startup",
      "Some tools may not work in container"
    ]
  }
];

/**
 * Bash command categories for permission configuration
 */
export const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    name: "File Information",
    description: "Read-only file and directory information",
    commands: ["ls", "pwd", "tree", "file", "stat", "du", "df", "find"],
    riskLevel: "safe"
  },
  {
    name: "File Reading",
    description: "Read file contents",
    commands: ["cat", "head", "tail", "less", "wc", "grep", "rg"],
    riskLevel: "safe"
  },
  {
    name: "Text Processing",
    description: "Transform and process text",
    commands: ["sort", "uniq", "cut", "tr", "diff"],
    riskLevel: "safe"
  },
  {
    name: "Git (Read-Only)",
    description: "Git repository information",
    commands: [
      "git status",
      "git log",
      "git diff",
      "git branch",
      "git show",
      "git tag"
    ],
    riskLevel: "safe"
  },
  {
    name: "Git (Write)",
    description: "Git repository modifications",
    commands: [
      "git add",
      "git commit",
      "git push",
      "git pull",
      "git checkout",
      "git merge"
    ],
    riskLevel: "moderate"
  },
  {
    name: "System Information",
    description: "System and environment info",
    commands: ["whoami", "which", "type", "date", "echo", "env", "printenv"],
    riskLevel: "safe"
  },
  {
    name: "Directory Operations",
    description: "Create directories and navigate",
    commands: ["mkdir", "cd"],
    riskLevel: "safe"
  },
  {
    name: "Build Tools",
    description: "Package managers and build systems",
    commands: [
      "bun",
      "npm",
      "pnpm",
      "yarn",
      "cargo",
      "go",
      "make",
      "python -m pytest"
    ],
    riskLevel: "moderate"
  },
  {
    name: "File Modification",
    description: "Modify or move files",
    commands: ["mv", "cp", "ln", "touch"],
    riskLevel: "moderate"
  },
  {
    name: "Destructive Operations",
    description: "Delete files and directories",
    commands: ["rm", "rm -rf", "rmdir"],
    riskLevel: "risky"
  },
  {
    name: "Network",
    description: "Network requests and transfers",
    commands: ["curl", "wget", "nc", "ssh", "scp", "rsync"],
    riskLevel: "risky"
  },
  {
    name: "Privilege Escalation",
    description: "Administrative operations",
    commands: ["sudo", "chmod", "chown"],
    riskLevel: "risky"
  },
  {
    name: "Process Control",
    description: "Control system processes",
    commands: ["kill", "killall", "pkill"],
    riskLevel: "risky"
  }
];

/**
 * Overview documentation
 */
export const SECURITY_OVERVIEW = `
# Claude Code Security Overview

Claude Code security operates in three complementary layers. Understanding how they work together helps you choose the right protection level for your use case.

## Security Layer Stack

\`\`\`
┌──────────────────────────────────────────────────┐
│         Agentwatch Security Gates                │
│   (PreToolUse hooks - blocks BEFORE execution)   │
│   • Dangerous pattern blocking (rm -rf, etc.)    │
│   • Anomaly detection (failure loops)            │
│   • Test gate (require tests before commits)     │
└──────────────────────────────────────────────────┘
                      ↓
┌─────────────────────┬────────────────────────────┐
│  Claude Code        │  Container/Sandbox         │
│  Permission Rules   │  Isolation Layer           │
│  (settings.json)    │  (OS-level restrictions)   │
│  • allow → auto     │  • macOS: dir + network    │
│  • deny → block     │  • Docker: full isolation  │
│  • ask → prompt     │                            │
└─────────────────────┴────────────────────────────┘
\`\`\`

## How They Work Together

1. **Agentwatch Security Gates** evaluate tool calls BEFORE Claude Code even attempts them
   - Can block dangerous patterns outright
   - Detects anomalies like failure loops
   - Enforces test-before-commit policies

2. **Claude Code Permission Rules** control what Claude is allowed to do
   - \`allow\`: Auto-approve without prompting
   - \`ask\`: Always prompt for approval (default)
   - \`deny\`: Hard block, cannot be used at all

3. **Sandbox Layer** provides OS-level isolation regardless of what Claude attempts
   - macOS sandbox restricts to working directory + network allowlist
   - Docker container provides complete filesystem isolation

## Execution Flow

1. User invokes Claude Code (native or sandboxed)
2. Claude decides to use a tool
3. **Agentwatch PreToolUse hook fires** → Security gates evaluate (may block)
4. If not blocked, **Claude Code permissions check** → Allow/Ask/Deny
5. If allowed, **tool executes within sandbox constraints**

## When to Use What

| Scenario | Recommended Setup |
|----------|-------------------|
| Quick question, trusted codebase | Permission Rules only (Permissive preset) |
| Regular development work | macOS Sandbox (Balanced preset) |
| Autonomous multi-file changes | Docker Container + Agentwatch hooks |
| Running in CI/untrusted env | Docker Container (Restrictive preset) |
| Learning/experimenting | macOS Sandbox (Permissive preset) |

## Security Comparison

\`\`\`
Protection Level:  Permission Rules < macOS Sandbox < Docker Container
Setup Complexity:  Permission Rules < macOS Sandbox < Docker Container
Workflow Impact:   Permission Rules > macOS Sandbox > Docker Container
\`\`\`
`;

/**
 * Permission rule syntax documentation
 */
export const PERMISSION_SYNTAX = `
# Permission Rule Syntax

Claude Code uses **prefix matching** for Bash commands, not regex or glob patterns.

## Format

\`Bash(command-prefix:*)\`

## Examples

| Pattern | Matches |
|---------|---------|
| \`Bash(npm run:*)\` | \`npm run test\`, \`npm run build\`, \`npm run start\` |
| \`Bash(git:*)\` | All git commands |
| \`Bash(rm -rf:*)\` | \`rm -rf anything\` |
| \`Bash(curl:*)\` | All curl commands |

## Other Tool Types

| Pattern | Description |
|---------|-------------|
| \`Read(path-pattern)\` | File read operations |
| \`Write(path-pattern)\` | File write operations |
| \`Edit(path-pattern)\` | File edit operations |
| \`WebFetch(*)\` | Web fetch operations |
| \`mcp__serverName__toolName\` | MCP tool calls |

## Limitations

Permission prefix matching **cannot catch**:
- \`find . -exec rm {} \\;\` (flag comes after path)
- \`awk '...' > file\` (redirect at end)
- Command substitution: \`$(rm file)\`
- Variable expansion: \`$CMD\`

**Recommendation**: For comprehensive protection, use sandbox isolation rather than complex permission rules.
`;

/**
 * Get all documentation as structured data
 */
export function getDocumentation() {
  return {
    securityLevels: SECURITY_LEVELS,
    commandCategories: COMMAND_CATEGORIES,
    overview: SECURITY_OVERVIEW,
    permissionSyntax: PERMISSION_SYNTAX
  };
}
