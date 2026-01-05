import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  discoverRepos,
  getLastChangeTime,
  hashPath,
  initRepoStatus,
  resolveGitDir
} from "../src/git";

describe("hashPath", () => {
  test("returns consistent hash for same path", () => {
    const path = "/Users/test/project";
    expect(hashPath(path)).toBe(hashPath(path));
  });

  test("returns different hash for different paths", () => {
    expect(hashPath("/path/a")).not.toBe(hashPath("/path/b"));
  });

  test("returns 40 character hex string", () => {
    const hash = hashPath("/some/path");
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });
});

describe("resolveGitDir", () => {
  let tempDir: string;

  test("returns null for non-git directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "git-test-"));
    expect(resolveGitDir(tempDir)).toBeNull();
    rmSync(tempDir, { recursive: true });
  });

  test("returns .git path for git directory", () => {
    tempDir = mkdtempSync(join(tmpdir(), "git-test-"));
    const gitDir = join(tempDir, ".git");
    mkdirSync(gitDir);

    expect(resolveGitDir(tempDir)).toBe(gitDir);
    rmSync(tempDir, { recursive: true });
  });

  test("resolves worktree gitdir file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "git-test-"));
    const actualGitDir = join(tempDir, "actual-git");
    mkdirSync(actualGitDir);

    const worktree = join(tempDir, "worktree");
    mkdirSync(worktree);
    writeFileSync(join(worktree, ".git"), `gitdir: ${actualGitDir}`);

    expect(resolveGitDir(worktree)).toBe(actualGitDir);
    rmSync(tempDir, { recursive: true });
  });
});

describe("discoverRepos", () => {
  let tempDir: string;

  test("finds git repositories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "discover-test-"));

    // Create a git repo
    const repo1 = join(tempDir, "repo1");
    mkdirSync(repo1);
    mkdirSync(join(repo1, ".git"));

    // Create a non-git directory
    const notRepo = join(tempDir, "not-a-repo");
    mkdirSync(notRepo);

    const repos = discoverRepos([tempDir], []);
    expect(repos).toContain(repo1);
    expect(repos).not.toContain(notRepo);

    rmSync(tempDir, { recursive: true });
  });

  test("ignores specified directories", () => {
    tempDir = mkdtempSync(join(tmpdir(), "discover-test-"));

    // Create repo inside node_modules
    const nodeModules = join(tempDir, "node_modules");
    mkdirSync(nodeModules);
    const ignoredRepo = join(nodeModules, "some-package");
    mkdirSync(ignoredRepo);
    mkdirSync(join(ignoredRepo, ".git"));

    // Create normal repo
    const normalRepo = join(tempDir, "my-project");
    mkdirSync(normalRepo);
    mkdirSync(join(normalRepo, ".git"));

    const repos = discoverRepos([tempDir], ["node_modules"]);
    expect(repos).toContain(normalRepo);
    expect(repos).not.toContain(ignoredRepo);

    rmSync(tempDir, { recursive: true });
  });

  test("does not descend into git repos", () => {
    tempDir = mkdtempSync(join(tmpdir(), "discover-test-"));

    // Create nested structure
    const parent = join(tempDir, "parent");
    mkdirSync(parent);
    mkdirSync(join(parent, ".git"));

    // Nested repo should not be found
    const nested = join(parent, "nested");
    mkdirSync(nested);
    mkdirSync(join(nested, ".git"));

    const repos = discoverRepos([tempDir], []);
    expect(repos).toContain(parent);
    expect(repos).not.toContain(nested);

    rmSync(tempDir, { recursive: true });
  });

  test("handles tilde expansion", () => {
    // This test verifies the code handles ~ without actually testing home dir
    const repos = discoverRepos(["~/nonexistent-path-12345"], []);
    expect(repos).toEqual([]);
  });
});

describe("initRepoStatus", () => {
  test("creates status with correct defaults", () => {
    const status = initRepoStatus("/path/to/my-project");

    expect(status.path).toBe("/path/to/my-project");
    expect(status.name).toBe("my-project");
    expect(status.repoId).toMatch(/^[a-f0-9]{40}$/);
    expect(status.stagedCount).toBe(0);
    expect(status.unstagedCount).toBe(0);
    expect(status.untrackedCount).toBe(0);
    expect(status.specialState.conflict).toBe(false);
    expect(status.health.timedOut).toBe(false);
  });
});

describe("getLastChangeTime", () => {
  test("returns recent timestamp for existing directory", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "change-test-"));
    mkdirSync(join(tempDir, ".git"));

    const time = getLastChangeTime(tempDir);

    // Should be within last minute (allow small buffer for test execution)
    expect(time).toBeGreaterThan(Date.now() - 60000);
    expect(time).toBeLessThanOrEqual(Date.now() + 1000); // Small buffer for timing

    rmSync(tempDir, { recursive: true });
  });

  test("uses index mtime when available", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "change-test-"));
    const gitDir = join(tempDir, ".git");
    mkdirSync(gitDir);
    writeFileSync(join(gitDir, "index"), "dummy");

    const time = getLastChangeTime(tempDir);
    expect(time).toBeGreaterThan(0);

    rmSync(tempDir, { recursive: true });
  });
});
