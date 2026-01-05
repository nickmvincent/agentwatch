/**
 * Test Gate - Require tests to pass before git commits.
 *
 * This is the only remaining "security gate" feature. Other pattern-based
 * blocking has been removed in favor of Claude Code's native deny rules,
 * which provide the same functionality without duplication.
 *
 * Use Claude Code's ~/.claude/settings.json for:
 * - Blocking dangerous commands (deny rules)
 * - Protecting sensitive paths (deny rules)
 * - Allowing safe operations (allow rules)
 *
 * This file only handles the Test Gate workflow feature, which has no
 * equivalent in Claude Code's native permission system.
 */

import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname } from "path";
import type { TestGateConfig } from "./config";

export interface TestGateDecision {
  allowed: boolean;
  reason?: string;
}

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return homedir() + path.slice(1);
  }
  return path;
}

/**
 * Check if a command is a git commit.
 */
export function isGitCommit(command: string): boolean {
  const tokens = tokenizeCommand(command);
  if (tokens.length >= 2 && tokens[0] === "git") {
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === undefined) continue;
      if (token === "commit") return true;
      // Skip flags but stop at other subcommands
      if (!token.startsWith("-") && token !== "commit") {
        // Could be git -c config commit, so keep looking
        continue;
      }
    }
  }
  return false;
}

/**
 * Check if tests have passed recently (Test Gate).
 */
export function checkTestGate(config: TestGateConfig): TestGateDecision {
  if (!config.enabled) {
    return { allowed: true };
  }

  const passFile = expandPath(config.passFile);

  if (!existsSync(passFile)) {
    return {
      allowed: false,
      reason: "Tests must pass before committing. Run your test command first."
    };
  }

  // Check file age
  const stats = statSync(passFile);
  const fileAge = Date.now() / 1000 - stats.mtimeMs / 1000;

  if (fileAge > config.passFileMaxAgeSeconds) {
    return {
      allowed: false,
      reason: `Tests passed ${Math.floor(fileAge)}s ago (max ${config.passFileMaxAgeSeconds}s). Run tests again.`
    };
  }

  return { allowed: true };
}

/**
 * Record that tests have passed.
 */
export function recordTestPass(passFile: string): void {
  const path = expandPath(passFile);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, String(Date.now()));
}

/**
 * Clear the test pass file.
 */
export function clearTestPass(passFile: string): void {
  const path = expandPath(passFile);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Simple shell command tokenizer.
 * Handles whitespace and basic quotes.
 */
function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let currentToken = "";
  let inQuote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      currentToken += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        currentToken += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      inQuote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = "";
      }
      continue;
    }

    // Handle shell operators as separate tokens
    if (char === ">" || char === "|" || char === "&" || char === ";") {
      if (currentToken.length > 0) {
        tokens.push(currentToken);
        currentToken = "";
      }
      tokens.push(char);
      continue;
    }

    currentToken += char;
  }

  if (currentToken.length > 0) {
    tokens.push(currentToken);
  }

  return tokens;
}
