/**
 * Sandbox management routes.
 *
 * Provides endpoints for:
 * - Docker sandbox status (installation, image, script)
 * - Permission presets (permissive, balanced, restrictive)
 * - Applying presets to Claude Code settings
 * - Security documentation
 *
 * @module routes/sandbox
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { Hono } from "hono";

/**
 * Path to Claude Code's settings file.
 */
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

/**
 * Docker installation status
 */
interface DockerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  error: string | null;
}

/**
 * Sandbox image status
 */
interface ImageStatus {
  exists: boolean;
  imageId: string | null;
  created: string | null;
  size: string | null;
}

/**
 * Script installation status
 */
interface ScriptStatus {
  installed: boolean;
  path: string;
  inPath: boolean;
  executable: boolean;
}

/**
 * Complete sandbox installation status
 */
interface SandboxStatus {
  docker: DockerStatus;
  image: ImageStatus;
  script: ScriptStatus;
  ready: boolean;
}

/**
 * Permission preset configuration
 */
interface PermissionPreset {
  name: string;
  id: "permissive" | "balanced" | "restrictive" | "custom";
  description: string;
  shortDescription: string;
  riskLevel: "low" | "medium" | "high";
  sandbox: {
    enabled: boolean;
    autoAllowBashIfSandboxed: boolean;
    network?: {
      allowedDomains: string[];
      allowLocalBinding: boolean;
    };
  };
  permissions: {
    allow: string[];
    deny: string[];
  };
  useCase: string;
  recommendedFor: string[];
}

const DEFAULT_IMAGE_NAME = "claude-sandbox";
const DEFAULT_SCRIPT_PATH = join(
  homedir(),
  ".local",
  "bin",
  "claude-sandboxed"
);

/**
 * Default network domains allowed for Claude Code operations
 */
const DEFAULT_NETWORK_DOMAINS = [
  "registry.npmjs.org",
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "pypi.org",
  "files.pythonhosted.org",
  "api.anthropic.com"
];

/**
 * Common safe Bash command prefixes
 */
const SAFE_BASH_COMMANDS = [
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
const BUILD_TOOL_COMMANDS = [
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
 * Permission Presets
 */
const PRESETS: PermissionPreset[] = [
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
        ...SAFE_BASH_COMMANDS.map((cmd) => `Bash(${cmd}:*)`),
        ...BUILD_TOOL_COMMANDS.map((cmd) => `Bash(${cmd}:*)`),
        "Bash(git add:*)",
        "Bash(git commit:*)",
        "Bash(git push:*)"
      ],
      deny: ["Bash(rm -rf /)", "Bash(rm -rf ~)"]
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
        "Bash(rm:*)",
        "Bash(curl:*)",
        "Bash(wget:*)",
        "Bash(ssh:*)",
        "Bash(scp:*)",
        "Bash(sudo:*)",
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
 * Check if Docker is installed and running
 */
function checkDocker(): DockerStatus {
  try {
    const { execSync } = require("child_process");
    const versionOutput = execSync("docker --version", {
      encoding: "utf-8",
      timeout: 5000
    }).trim();
    const versionStr =
      versionOutput.replace("Docker version ", "").split(",")[0] ?? null;

    try {
      execSync("docker info", {
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return {
        installed: true,
        running: true,
        version: versionStr,
        error: null
      };
    } catch {
      return {
        installed: true,
        running: false,
        version: versionStr,
        error: "Docker daemon is not running"
      };
    }
  } catch {
    return {
      installed: false,
      running: false,
      version: null,
      error: "Docker is not installed"
    };
  }
}

/**
 * Check if the sandbox image exists
 */
function checkImage(imageName: string = DEFAULT_IMAGE_NAME): ImageStatus {
  try {
    const { execSync } = require("child_process");
    const output = execSync(
      `docker image inspect ${imageName} --format '{{.Id}}|{{.Created}}|{{.Size}}'`,
      { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    const parts = output.split("|");
    const imageId = parts[0] ?? "";
    const created = parts[1] ?? "";
    const sizeBytes = parts[2] ?? "0";
    const sizeMB = Math.round(Number.parseInt(sizeBytes) / 1024 / 1024);

    return {
      exists: true,
      imageId: imageId.length > 7 ? imageId.substring(7, 19) : imageId,
      created: created || null,
      size: `${sizeMB}MB`
    };
  } catch {
    return {
      exists: false,
      imageId: null,
      created: null,
      size: null
    };
  }
}

/**
 * Check if the claude-sandboxed script is installed
 */
function checkScript(scriptPath: string = DEFAULT_SCRIPT_PATH): ScriptStatus {
  const exists = existsSync(scriptPath);

  const pathDirs = (process.env.PATH || "").split(":");
  const scriptDir = dirname(scriptPath);
  const inPath = pathDirs.includes(scriptDir);

  let executable = false;
  if (exists) {
    try {
      const { statSync } = require("fs");
      const stats = statSync(scriptPath);
      executable = (stats.mode & 0o111) !== 0;
    } catch {
      executable = false;
    }
  }

  return {
    installed: exists,
    path: scriptPath,
    inPath,
    executable
  };
}

/**
 * Get complete sandbox status
 */
function getSandboxStatus(): SandboxStatus {
  const docker = checkDocker();
  const image = docker.running
    ? checkImage()
    : { exists: false, imageId: null, created: null, size: null };
  const script = checkScript();

  return {
    docker,
    image,
    script,
    ready:
      docker.running && image.exists && script.installed && script.executable
  };
}

/**
 * Convert a preset to Claude Code settings.json format
 */
function presetToSettings(preset: PermissionPreset): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

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

/**
 * Register sandbox management routes.
 *
 * @param app - The Hono app instance
 */
export function registerSandboxRoutes(app: Hono): void {
  /**
   * GET /api/sandbox/status
   *
   * Get Docker sandbox installation status.
   *
   * @returns {
   *   docker: DockerStatus,
   *   image: ImageStatus,
   *   script: ScriptStatus,
   *   ready: boolean
   * }
   */
  app.get("/api/sandbox/status", (c) => {
    const status = getSandboxStatus();
    return c.json(status);
  });

  /**
   * GET /api/sandbox/presets
   *
   * List available permission presets.
   *
   * @returns { presets: PermissionPreset[] }
   */
  app.get("/api/sandbox/presets", (c) => {
    return c.json({ presets: PRESETS });
  });

  /**
   * GET /api/sandbox/presets/:id
   *
   * Get a specific preset by ID.
   *
   * @param id - Preset ID (permissive, balanced, restrictive, custom)
   * @returns PermissionPreset or 404
   */
  app.get("/api/sandbox/presets/:id", (c) => {
    const id = c.req.param("id");
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) {
      return c.json({ error: "Preset not found" }, 404);
    }
    return c.json(preset);
  });

  /**
   * POST /api/sandbox/presets/:id/apply
   *
   * Apply a preset to Claude Code settings.
   * Merges preset settings with existing settings.
   *
   * @param id - Preset ID to apply
   * @returns { success: boolean, settings: object }
   */
  app.post("/api/sandbox/presets/:id/apply", async (c) => {
    const id = c.req.param("id");
    const preset = PRESETS.find((p) => p.id === id);

    if (!preset) {
      return c.json({ error: "Preset not found" }, 404);
    }

    try {
      // Load existing settings
      let existingSettings: Record<string, unknown> = {};
      if (existsSync(CLAUDE_SETTINGS_PATH)) {
        try {
          existingSettings = JSON.parse(
            readFileSync(CLAUDE_SETTINGS_PATH, "utf-8")
          );
        } catch {
          // Invalid JSON, start fresh
        }
      }

      // Get preset settings
      const presetSettings = presetToSettings(preset);

      // Merge - preset overrides existing sandbox/permissions
      const mergedSettings = {
        ...existingSettings,
        ...presetSettings
      };

      // Write settings
      const claudeDir = dirname(CLAUDE_SETTINGS_PATH);
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      writeFileSync(
        CLAUDE_SETTINGS_PATH,
        JSON.stringify(mergedSettings, null, 2) + "\n"
      );

      return c.json({
        success: true,
        preset: preset.id,
        settings: mergedSettings,
        path: CLAUDE_SETTINGS_PATH
      });
    } catch (e) {
      return c.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Failed to apply preset"
        },
        500
      );
    }
  });

  /**
   * GET /api/sandbox/current
   *
   * Get current sandbox/permission configuration from Claude settings.
   *
   * @returns Current sandbox and permissions config
   */
  app.get("/api/sandbox/current", (c) => {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return c.json({
        exists: false,
        sandbox: null,
        permissions: null,
        detectedPreset: null
      });
    }

    try {
      const settings = JSON.parse(
        readFileSync(CLAUDE_SETTINGS_PATH, "utf-8")
      ) as Record<string, unknown>;

      // Try to detect which preset matches current settings
      let detectedPreset: string | null = null;
      const sandboxConfig = settings.sandbox as
        | Record<string, unknown>
        | undefined;
      const permConfig = settings.permissions as
        | Record<string, unknown>
        | undefined;

      for (const preset of PRESETS) {
        const presetSettings = presetToSettings(preset);
        const presetSandbox = presetSettings.sandbox as
          | Record<string, unknown>
          | undefined;
        const presetPerm = presetSettings.permissions as
          | Record<string, unknown>
          | undefined;

        // Simple comparison - check if sandbox.enabled matches
        const sandboxMatches =
          (!sandboxConfig && !presetSandbox) ||
          sandboxConfig?.enabled === presetSandbox?.enabled;

        if (sandboxMatches && preset.id !== "custom") {
          detectedPreset = preset.id;
          break;
        }
      }

      return c.json({
        exists: true,
        sandbox: sandboxConfig || null,
        permissions: permConfig || null,
        detectedPreset,
        path: CLAUDE_SETTINGS_PATH
      });
    } catch {
      return c.json({
        exists: true,
        sandbox: null,
        permissions: null,
        detectedPreset: null,
        error: "Failed to parse settings.json"
      });
    }
  });
}
