/**
 * Docker Sandbox Management
 *
 * Utilities for building and managing the Claude Code Docker sandbox image.
 */

import { execSync, spawn } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export const DEFAULT_IMAGE_NAME = "claude-sandbox";
export const DEFAULT_SCRIPT_PATH = join(
  homedir(),
  ".local",
  "bin",
  "claude-sandboxed"
);

/**
 * Docker installation status
 */
export interface DockerStatus {
  installed: boolean;
  running: boolean;
  version: string | null;
  error: string | null;
}

/**
 * Sandbox image status
 */
export interface ImageStatus {
  exists: boolean;
  imageId: string | null;
  created: string | null;
  size: string | null;
}

interface ImageInspectResult {
  imageId?: string;
  created?: string;
  sizeBytes?: string;
}

/**
 * Script installation status
 */
export interface ScriptStatus {
  installed: boolean;
  path: string;
  inPath: boolean;
  executable: boolean;
}

/**
 * Complete sandbox installation status
 */
export interface SandboxStatus {
  docker: DockerStatus;
  image: ImageStatus;
  script: ScriptStatus;
  ready: boolean;
}

/**
 * Check if Docker is installed and running
 */
export function checkDocker(): DockerStatus {
  try {
    // Check if docker command exists
    const versionOutput = execSync("docker --version", {
      encoding: "utf-8",
      timeout: 5000
    }).trim();
    const versionStr =
      versionOutput.replace("Docker version ", "").split(",")[0] ?? null;

    // Check if docker daemon is running
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
export function checkImage(
  imageName: string = DEFAULT_IMAGE_NAME
): ImageStatus {
  try {
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
      imageId: imageId.length > 7 ? imageId.substring(7, 19) : imageId, // Short ID
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
export function checkScript(
  scriptPath: string = DEFAULT_SCRIPT_PATH
): ScriptStatus {
  const exists = existsSync(scriptPath);

  // Check if script directory is in PATH
  const pathDirs = (process.env.PATH || "").split(":");
  const scriptDir = dirname(scriptPath);
  const inPath = pathDirs.includes(scriptDir);

  // Check if executable
  let executable = false;
  if (exists) {
    try {
      const stats = require("fs").statSync(scriptPath);
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
export function getSandboxStatus(
  imageName: string = DEFAULT_IMAGE_NAME,
  scriptPath: string = DEFAULT_SCRIPT_PATH
): SandboxStatus {
  const docker = checkDocker();
  const image = docker.running
    ? checkImage(imageName)
    : { exists: false, imageId: null, created: null, size: null };
  const script = checkScript(scriptPath);

  return {
    docker,
    image,
    script,
    ready:
      docker.running && image.exists && script.installed && script.executable
  };
}

/**
 * Dockerfile template for Claude Code sandbox
 */
export function getDockerfileTemplate(username = "claude"): string {
  const homeDir = homedir();
  const userPath = homeDir.startsWith("/Users/")
    ? homeDir
    : `/home/${username}`;

  return `# Claude Code Sandboxed Container
# Built by agentwatch sandbox install

FROM node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y \\
    git \\
    curl \\
    ripgrep \\
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for better security
RUN useradd -m -s /bin/bash ${username}

# Create paths for hooks with absolute paths to work
# This allows ${userPath}/.agentwatch to resolve inside the container
RUN mkdir -p ${userPath.split("/").slice(0, 3).join("/")} && \\
    ln -s /home/${username}/.agentwatch ${userPath}/.agentwatch 2>/dev/null || true && \\
    ln -s /home/${username}/.claude ${userPath}/.claude 2>/dev/null || true

USER ${username}

WORKDIR /workspace

ENTRYPOINT ["claude"]
`;
}

/**
 * Script template for running Claude Code in Docker
 */
export function getScriptTemplate(
  imageName: string = DEFAULT_IMAGE_NAME
): string {
  return `#!/bin/bash
# Claude Code in Docker sandbox
# Generated by: agentwatch sandbox install
# Usage: claude-sandboxed [args]   (or: cs [args])
# Example: cs --help
# Example: cs (interactive mode)
#
# Add alias to ~/.zshrc:  alias cs='claude-sandboxed'

set -e

IMAGE_NAME="${imageName}"

# Check if image exists, build if not
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Error: Docker image '$IMAGE_NAME' not found."
    echo "Run: agentwatch sandbox install"
    exit 1
fi

# Run Claude Code in container
# - Mounts current directory as /workspace
# - Mounts ~/.claude for settings/auth
# - Mounts ~/.agentwatch for hooks (read-only)
# - Passes through API keys
# - Allows network (required for API calls)
# - Interactive TTY for terminal UI

docker run -it --rm \\
    -v "$(pwd):/workspace" \\
    -v "$HOME/.claude:/home/claude/.claude" \\
    -v "$HOME/.agentwatch:/home/claude/.agentwatch:ro" \\
    -e ANTHROPIC_API_KEY \\
    -e CLAUDE_CODE_USE_BEDROCK \\
    -e CLAUDE_CODE_USE_VERTEX \\
    -e AWS_ACCESS_KEY_ID \\
    -e AWS_SECRET_ACCESS_KEY \\
    -e AWS_SESSION_TOKEN \\
    -e AWS_REGION \\
    -e GOOGLE_APPLICATION_CREDENTIALS \\
    --network bridge \\
    "$IMAGE_NAME" --dangerously-skip-permissions "$@"
`;
}

/**
 * Build the Docker image
 */
export async function buildImage(
  imageName: string = DEFAULT_IMAGE_NAME,
  options: { force?: boolean; onProgress?: (line: string) => void } = {}
): Promise<{ success: boolean; error?: string }> {
  const docker = checkDocker();
  if (!docker.running) {
    return { success: false, error: docker.error || "Docker is not available" };
  }

  // Check if image exists and force not set
  if (!options.force) {
    const image = checkImage(imageName);
    if (image.exists) {
      return { success: true }; // Already exists
    }
  }

  // Create temp directory for Dockerfile
  const tmpDir = join(homedir(), ".agentwatch", "sandbox");
  mkdirSync(tmpDir, { recursive: true });

  const dockerfilePath = join(tmpDir, "Dockerfile");
  writeFileSync(dockerfilePath, getDockerfileTemplate());

  return new Promise((resolve) => {
    const args = ["build", "-t", imageName];
    if (options.force) {
      args.push("--no-cache");
    }
    args.push(tmpDir);

    const proc = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const line = data.toString();
      options.onProgress?.(line);
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      options.onProgress?.(data.toString());
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr || `Build failed with exit code ${code}`
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Install the claude-sandboxed script
 */
export function installScript(
  scriptPath: string = DEFAULT_SCRIPT_PATH,
  imageName: string = DEFAULT_IMAGE_NAME
): { success: boolean; error?: string } {
  try {
    // Create directory if needed
    const dir = dirname(scriptPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write script
    writeFileSync(scriptPath, getScriptTemplate(imageName));

    // Make executable
    chmodSync(scriptPath, 0o755);

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error"
    };
  }
}

/**
 * Full sandbox installation
 */
export async function installSandbox(options: {
  imageName?: string;
  scriptPath?: string;
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<{ success: boolean; error?: string }> {
  const imageName = options.imageName || DEFAULT_IMAGE_NAME;
  const scriptPath = options.scriptPath || DEFAULT_SCRIPT_PATH;

  // Check Docker first
  const docker = checkDocker();
  if (!docker.installed) {
    return {
      success: false,
      error: "Docker is not installed. Please install Docker first."
    };
  }
  if (!docker.running) {
    return {
      success: false,
      error: "Docker daemon is not running. Please start Docker."
    };
  }

  options.onProgress?.("Building Docker image...");
  const buildResult = await buildImage(imageName, {
    force: options.force,
    onProgress: options.onProgress
  });

  if (!buildResult.success) {
    return buildResult;
  }

  options.onProgress?.("Installing script...");
  const scriptResult = installScript(scriptPath, imageName);

  if (!scriptResult.success) {
    return scriptResult;
  }

  options.onProgress?.("Installation complete!");
  return { success: true };
}
