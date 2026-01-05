/**
 * Project matching utility for resolving cwd paths to configured projects.
 */

import { homedir } from "os";
import type { ProjectConfig } from "./config";

/**
 * Expand ~ to home directory.
 */
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return homedir() + path.slice(1);
  }
  return path;
}

/**
 * Normalize path for comparison (expand ~, remove trailing slashes).
 */
function normalizePath(path: string): string {
  const expanded = expandPath(path);
  return expanded.endsWith("/") ? expanded.slice(0, -1) : expanded;
}

/**
 * Resolve a cwd path to a project, if any matches.
 *
 * Matching rules:
 * - Exact path match
 * - cwd is a subdirectory of a project path
 * - Path expansion (~ -> home directory)
 *
 * @param cwd - The working directory to match
 * @param projects - List of configured projects
 * @returns The matched project or null if no match
 */
export function resolveProject(
  cwd: string | null,
  projects: ProjectConfig[]
): ProjectConfig | null {
  if (!cwd) return null;

  const normalizedCwd = normalizePath(cwd);

  for (const project of projects) {
    for (const projectPath of project.paths) {
      const normalizedProjectPath = normalizePath(projectPath);

      // Exact match
      if (normalizedCwd === normalizedProjectPath) {
        return project;
      }

      // cwd is subdirectory of project path
      if (normalizedCwd.startsWith(normalizedProjectPath + "/")) {
        return project;
      }
    }
  }

  return null;
}

/**
 * Batch resolve project for multiple cwds.
 * Returns a map of cwd -> project (or null).
 *
 * @param cwds - Array of working directories to match
 * @param projects - List of configured projects
 * @returns Map of cwd to matched project (or null)
 */
export function resolveProjectsBatch(
  cwds: (string | null)[],
  projects: ProjectConfig[]
): Map<string | null, ProjectConfig | null> {
  const result = new Map<string | null, ProjectConfig | null>();

  for (const cwd of cwds) {
    if (!result.has(cwd)) {
      result.set(cwd, resolveProject(cwd, projects));
    }
  }

  return result;
}

/**
 * Get a simple project reference (id + name) for API responses.
 */
export function getProjectRef(
  project: ProjectConfig | null
): { id: string; name: string } | null {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name
  };
}
