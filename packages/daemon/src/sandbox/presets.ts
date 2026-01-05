/**
 * Permission Presets for Claude Code Sandbox Configuration
 *
 * These presets provide pre-configured security levels for different use cases.
 * They can be applied via CLI (`agentwatch sandbox preset <name>`) or Web UI.
 */

export interface SandboxConfig {
  enabled: boolean;
  autoAllowBashIfSandboxed: boolean;
  network?: {
    allowedDomains: string[];
    allowLocalBinding: boolean;
  };
}

export interface PermissionRules {
  allow: string[];
  deny: string[];
}

export interface PermissionPreset {
  name: string;
  id: "permissive" | "balanced" | "restrictive" | "custom";
  description: string;
  shortDescription: string;
  riskLevel: "low" | "medium" | "high";
  sandbox: SandboxConfig;
  permissions: PermissionRules;
  useCase: string;
  recommendedFor: string[];
}

/**
 * Default network domains allowed for Claude Code operations
 */
export const DEFAULT_NETWORK_DOMAINS = [
  "registry.npmjs.org",
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "pypi.org",
  "files.pythonhosted.org",
  "api.anthropic.com"
];

/**
 * Common safe Bash command prefixes (read-only operations)
 */
export const SAFE_BASH_COMMANDS = [
  "ls",
  "pwd",
  "tree",
  "file",
  "stat",
  "du",
  "df",
  "find",
  "cat",
  "head",
  "tail",
  "less",
  "wc",
  "grep",
  "rg",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "git status",
  "git log",
  "git diff",
  "git branch",
  "git show",
  "git tag",
  "whoami",
  "which",
  "type",
  "date",
  "echo",
  "env",
  "printenv",
  "mkdir",
  "cd"
];

/**
 * Common build tool command prefixes
 */
export const BUILD_TOOL_COMMANDS = [
  "bun run",
  "bun test",
  "bun install",
  "bun add",
  "bun remove",
  "bun build",
  "bun x",
  "bunx",
  "npm run",
  "npm test",
  "npm install",
  "npm ci",
  "pnpm run",
  "pnpm test",
  "pnpm install",
  "yarn",
  "yarn run",
  "yarn test",
  "yarn install",
  "cargo build",
  "cargo test",
  "cargo run",
  "go build",
  "go test",
  "go run",
  "python -m pytest",
  "uv run"
];

/**
 * Risky commands that should be blocked or prompted
 */
export const RISKY_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "curl:*)|sh",
  "curl:*)|bash",
  "wget:*)|sh",
  "wget:*)|bash",
  "sudo",
  "chmod 777",
  "chmod -R 777"
];

/**
 * Sensitive file patterns to deny reading
 */
export const SENSITIVE_FILE_PATTERNS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/secrets/**",
  "**/credentials*",
  "**/*.pem",
  "**/*.key",
  "**/*secret*",
  "~/.ssh/*",
  "~/.aws/*",
  "~/.gnupg/*"
];

/**
 * Permission Presets
 */
export const PRESETS: PermissionPreset[] = [
  {
    name: "Permissive",
    id: "permissive",
    description:
      "Minimal restrictions for trusted projects. Sandbox disabled, permission prompts for most operations. Best for quick interactive tasks in trusted codebases.",
    shortDescription: "Minimal restrictions for trusted projects",
    riskLevel: "low",
    sandbox: {
      enabled: false,
      autoAllowBashIfSandboxed: false
    },
    permissions: {
      allow: [
        // Safe read operations
        ...SAFE_BASH_COMMANDS.map((cmd) => `Bash(${cmd}:*)`),
        // Build tools
        ...BUILD_TOOL_COMMANDS.map((cmd) => `Bash(${cmd}:*)`),
        // Git write operations (for trusted projects)
        "Bash(git add:*)",
        "Bash(git commit:*)",
        "Bash(git push:*)"
      ],
      deny: [
        // Still block catastrophic operations
        "Bash(rm -rf /)",
        "Bash(rm -rf ~)"
      ]
    },
    useCase: "Quick interactive tasks, trusted environments",
    recommendedFor: ["Trusted codebases", "Quick questions", "Code review"]
  },
  {
    name: "Balanced",
    id: "balanced",
    description:
      "Standard safety with usability. macOS sandbox enabled with network allowlist. Commands auto-approved when sandboxed. Good for regular development work.",
    shortDescription: "Standard safety with usability. macOS sandbox.",
    riskLevel: "medium",
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      network: {
        allowedDomains: DEFAULT_NETWORK_DOMAINS,
        allowLocalBinding: true
      }
    },
    permissions: {
      allow: [],
      deny: [
        // Block pipe-to-shell attacks
        "Bash(curl:*)|sh",
        "Bash(curl:*)|bash",
        "Bash(wget:*)|sh",
        "Bash(wget:*)|bash"
      ]
    },
    useCase: "Regular development work with reasonable safety",
    recommendedFor: [
      "Day-to-day development",
      "Feature implementation",
      "Bug fixes"
    ]
  },
  {
    name: "Restrictive",
    id: "restrictive",
    description:
      "Maximum protection. Designed for Docker container isolation with minimal network access. Best for autonomous/agentic work or untrusted code.",
    shortDescription: "Maximum protection. Docker container isolation.",
    riskLevel: "high",
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: false,
      network: {
        allowedDomains: ["api.anthropic.com"],
        allowLocalBinding: false
      }
    },
    permissions: {
      allow: [],
      deny: [
        // Block all risky operations
        "Bash(rm:*)",
        "Bash(curl:*)",
        "Bash(wget:*)",
        "Bash(ssh:*)",
        "Bash(scp:*)",
        "Bash(sudo:*)",
        // Block sensitive file access
        "Write(.env*)",
        "Read(~/.ssh/*)",
        "Read(~/.aws/*)",
        "Read(.env*)"
      ]
    },
    useCase: "Autonomous work, untrusted code, CI environments",
    recommendedFor: ["Autonomous agents", "Untrusted code", "CI/CD pipelines"]
  },
  {
    name: "Custom",
    id: "custom",
    description:
      "User-defined rules. Start from scratch and build your own permission configuration using the visual builder or JSON editor.",
    shortDescription: "User-defined rules",
    riskLevel: "medium",
    sandbox: {
      enabled: false,
      autoAllowBashIfSandboxed: false
    },
    permissions: {
      allow: [],
      deny: []
    },
    useCase: "Specialized workflows with specific requirements",
    recommendedFor: ["Advanced users", "Specialized workflows"]
  }
];

/**
 * Get a preset by ID
 */
export function getPreset(id: string): PermissionPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Get all presets
 */
export function getAllPresets(): PermissionPreset[] {
  return PRESETS;
}

/**
 * Convert a preset to Claude Code settings.json format
 */
export function presetToSettings(
  preset: PermissionPreset
): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  // Add sandbox configuration
  if (preset.sandbox.enabled) {
    settings.sandbox = {
      enabled: preset.sandbox.enabled,
      autoAllowBashIfSandboxed: preset.sandbox.autoAllowBashIfSandboxed
    };
    if (preset.sandbox.network) {
      (settings.sandbox as Record<string, unknown>).network =
        preset.sandbox.network;
    }
  }

  // Add permissions if any
  if (
    preset.permissions.allow.length > 0 ||
    preset.permissions.deny.length > 0
  ) {
    settings.permissions = {};
    if (preset.permissions.allow.length > 0) {
      (settings.permissions as Record<string, unknown>).allow =
        preset.permissions.allow;
    }
    if (preset.permissions.deny.length > 0) {
      (settings.permissions as Record<string, unknown>).deny =
        preset.permissions.deny;
    }
  }

  return settings;
}
