/**
 * Git utilities for repository scanning.
 * Ported from agentwatch/git_tools.py
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, isAbsolute, join, normalize } from "path";
import type {
  RepoSpecialState,
  RepoStatus,
  RepoUpstream,
  defaultRepoHealth,
  defaultRepoSpecialState,
  defaultRepoUpstream
} from "@agentwatch/core";

const GIT_PORCELAIN_CONFLICT_CODES = new Set([
  "DD",
  "AU",
  "UD",
  "UA",
  "DU",
  "AA",
  "UU"
]);

/** Hash a path to create a stable repo ID */
export function hashPath(path: string): string {
  return createHash("sha1").update(path).digest("hex");
}

/** Resolve the .git directory for a repo (handles worktrees) */
export function resolveGitDir(repoPath: string): string | null {
  const gitPath = join(repoPath, ".git");

  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }
    if (stat.isFile()) {
      // Worktree: .git is a file containing path to actual git dir
      const content = readFileSync(gitPath, "utf-8").trim();
      if (!content.startsWith("gitdir:")) {
        return null;
      }
      const raw = content.slice(7).trim();
      if (!raw) return null;
      return isAbsolute(raw) ? raw : normalize(join(repoPath, raw));
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

/** Discover git repositories under given roots */
export function discoverRepos(
  roots: string[],
  ignoreDirs: string[] = []
): string[] {
  const repos: string[] = [];
  const ignoreSet = new Set(ignoreDirs);

  for (let root of roots) {
    root = root.startsWith("~") ? root.replace("~", homedir()) : root;

    if (!existsSync(root)) continue;

    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      // Check if this directory is a git repo
      if (entries.includes(".git")) {
        repos.push(dir);
        return; // Don't descend into git repos
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (ignoreSet.has(entry)) continue;
        if (entry.startsWith(".")) continue; // Skip hidden dirs

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          }
        } catch {
          // Permission denied or other error
        }
      }
    };

    walk(root);
  }

  return repos;
}

interface GitStatusResult {
  staged: number;
  unstaged: number;
  untracked: number;
  specialState: RepoSpecialState;
}

/** Run git command with timeout */
async function runGit(
  args: string[],
  timeoutMs: number
): Promise<string | null> {
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe"
  });

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      proc.kill();
      resolve(null);
    }, timeoutMs);
  });

  const resultPromise = (async () => {
    const exitCode = await proc.exited;
    if (exitCode !== 0) return "";
    return await new Response(proc.stdout).text();
  })();

  return Promise.race([resultPromise, timeoutPromise]);
}

/** Get repository status (staged, unstaged, untracked counts) */
export async function getRepoStatus(
  repoPath: string,
  includeUntracked: boolean,
  timeoutMs: number
): Promise<GitStatusResult> {
  const args = ["git", "-C", repoPath, "status", "--porcelain=v1"];
  if (!includeUntracked) {
    args.push("-uno");
  }

  const result = await runGit(args, timeoutMs);
  if (result === null) {
    throw new Error("git status timed out");
  }

  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflict = false;

  for (const line of result.split("\n")) {
    if (!line) continue;

    if (line.startsWith("??")) {
      untracked++;
      continue;
    }

    if (line.length < 2) continue;

    const xy = line.slice(0, 2);
    if (GIT_PORCELAIN_CONFLICT_CODES.has(xy) || xy.includes("U")) {
      conflict = true;
    }
    if (xy[0] !== " ") staged++;
    if (xy[1] !== " ") unstaged++;
  }

  const specialState = getSpecialStateFromGitDir(
    resolveGitDir(repoPath),
    conflict
  );

  return { staged, unstaged, untracked, specialState };
}

/** Get current branch name */
export async function getBranchName(
  repoPath: string,
  timeoutMs: number
): Promise<string | null> {
  const result = await runGit(
    ["git", "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"],
    timeoutMs
  );
  return result?.trim() || null;
}

/** Get upstream tracking info (ahead/behind counts) */
export async function getUpstreamCounts(
  repoPath: string,
  timeoutMs: number
): Promise<RepoUpstream> {
  // Get upstream name
  const upstreamResult = await runGit(
    [
      "git",
      "-C",
      repoPath,
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}"
    ],
    timeoutMs
  );

  if (!upstreamResult?.trim()) {
    return {};
  }

  const upstreamName = upstreamResult.trim();

  // Get ahead/behind counts
  const countsResult = await runGit(
    [
      "git",
      "-C",
      repoPath,
      "rev-list",
      "--left-right",
      "--count",
      "@{upstream}...HEAD"
    ],
    timeoutMs
  );

  if (!countsResult?.trim()) {
    return { upstreamName };
  }

  const parts = countsResult.trim().split(/\s+/);
  if (parts.length !== 2) {
    return { upstreamName };
  }

  const behind = Number.parseInt(parts[0]!, 10);
  const ahead = Number.parseInt(parts[1]!, 10);

  if (isNaN(behind) || isNaN(ahead)) {
    return { upstreamName };
  }

  return { ahead, behind, upstreamName };
}

/** Get last change time for a repo (based on .git/index mtime) */
export function getLastChangeTime(repoPath: string): number {
  const gitDir = resolveGitDir(repoPath);
  const candidates: number[] = [];

  if (gitDir) {
    const indexPath = join(gitDir, "index");
    try {
      candidates.push(statSync(indexPath).mtimeMs);
    } catch {
      // Index doesn't exist
    }
  }

  try {
    candidates.push(statSync(repoPath).mtimeMs);
  } catch {
    // Repo doesn't exist?
  }

  return candidates.length > 0 ? Math.max(...candidates) : Date.now();
}

/** Initialize a RepoStatus object for a new repo */
export function initRepoStatus(path: string): RepoStatus {
  const repoId = hashPath(path);
  const name = basename(path);

  return {
    repoId,
    path,
    name,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    specialState: {
      conflict: false,
      rebase: false,
      merge: false,
      cherryPick: false,
      revert: false
    },
    upstream: {},
    lastScanTime: 0,
    lastChangeTime: 0,
    health: {
      timedOut: false,
      backoffUntil: 0
    }
  };
}

/** Detect special git states (merge, rebase, etc.) from git dir */
function getSpecialStateFromGitDir(
  gitDir: string | null,
  hasConflict: boolean
): RepoSpecialState {
  const state: RepoSpecialState = {
    conflict: hasConflict,
    rebase: false,
    merge: false,
    cherryPick: false,
    revert: false
  };

  if (!gitDir) return state;

  const markers: Record<string, keyof RepoSpecialState> = {
    MERGE_HEAD: "merge",
    CHERRY_PICK_HEAD: "cherryPick",
    REVERT_HEAD: "revert"
  };

  for (const [marker, attr] of Object.entries(markers)) {
    if (existsSync(join(gitDir, marker))) {
      state[attr] = true;
    }
  }

  // Check for rebase
  if (
    existsSync(join(gitDir, "rebase-apply")) ||
    existsSync(join(gitDir, "rebase-merge"))
  ) {
    state.rebase = true;
  }

  return state;
}
