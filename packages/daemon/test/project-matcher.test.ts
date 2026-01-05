/**
 * Project Matcher Tests
 *
 * Tests for project path matching and resolution.
 */

import { homedir } from "os";
import { describe, expect, it } from "bun:test";
import type { ProjectConfig } from "../src/config";
import {
  getProjectRef,
  resolveProject,
  resolveProjectsBatch
} from "../src/project-matcher";

// Sample projects for testing
const testProjects: ProjectConfig[] = [
  {
    id: "project-a",
    name: "Project A",
    paths: ["/home/user/projects/project-a", "/var/www/project-a"]
  },
  {
    id: "project-b",
    name: "Project B",
    paths: ["~/code/project-b"]
  },
  {
    id: "project-c",
    name: "Project C",
    paths: ["/workspace/project-c/"]
  }
];

describe("resolveProject", () => {
  describe("exact matching", () => {
    it("matches exact path", () => {
      const result = resolveProject(
        "/home/user/projects/project-a",
        testProjects
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-a");
    });

    it("matches alternate path", () => {
      const result = resolveProject("/var/www/project-a", testProjects);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-a");
    });

    it("matches path with trailing slash normalization", () => {
      // Project has trailing slash, cwd doesn't
      const result = resolveProject("/workspace/project-c", testProjects);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-c");
    });

    it("matches cwd with trailing slash", () => {
      const result = resolveProject(
        "/home/user/projects/project-a/",
        testProjects
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-a");
    });
  });

  describe("subdirectory matching", () => {
    it("matches subdirectory of project path", () => {
      const result = resolveProject(
        "/home/user/projects/project-a/src/components",
        testProjects
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-a");
    });

    it("matches deep subdirectory", () => {
      const result = resolveProject(
        "/var/www/project-a/app/models/user.ts",
        testProjects
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-a");
    });

    it("does not match parent directory", () => {
      const result = resolveProject("/home/user/projects", testProjects);

      expect(result).toBeNull();
    });

    it("does not match sibling directory", () => {
      const result = resolveProject(
        "/home/user/projects/project-x",
        testProjects
      );

      expect(result).toBeNull();
    });

    it("does not match partial path names", () => {
      // project-a-extended is not a subdirectory of project-a
      const result = resolveProject(
        "/home/user/projects/project-a-extended",
        testProjects
      );

      expect(result).toBeNull();
    });
  });

  describe("tilde expansion", () => {
    it("expands tilde in project path", () => {
      const home = homedir();
      const result = resolveProject(`${home}/code/project-b`, testProjects);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-b");
    });

    it("matches subdirectory with tilde expansion", () => {
      const home = homedir();
      const result = resolveProject(
        `${home}/code/project-b/src/index.ts`,
        testProjects
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-b");
    });

    it("expands tilde in cwd", () => {
      const result = resolveProject("~/code/project-b", testProjects);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("project-b");
    });
  });

  describe("edge cases", () => {
    it("returns null for null cwd", () => {
      const result = resolveProject(null, testProjects);
      expect(result).toBeNull();
    });

    it("returns null for empty cwd", () => {
      const result = resolveProject("", testProjects);
      expect(result).toBeNull();
    });

    it("returns null for empty projects list", () => {
      const result = resolveProject("/home/user/projects/project-a", []);
      expect(result).toBeNull();
    });

    it("returns first matching project when multiple could match", () => {
      const projects: ProjectConfig[] = [
        { id: "first", name: "First", paths: ["/shared/code"] },
        { id: "second", name: "Second", paths: ["/shared/code"] }
      ];

      const result = resolveProject("/shared/code", projects);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("first");
    });

    it("handles project with multiple paths", () => {
      const project: ProjectConfig = {
        id: "multi",
        name: "Multi Path",
        paths: ["/path/one", "/path/two", "/path/three"]
      };

      expect(resolveProject("/path/one", [project])?.id).toBe("multi");
      expect(resolveProject("/path/two", [project])?.id).toBe("multi");
      expect(resolveProject("/path/three", [project])?.id).toBe("multi");
      expect(resolveProject("/path/four", [project])).toBeNull();
    });
  });
});

describe("resolveProjectsBatch", () => {
  it("resolves multiple cwds", () => {
    const cwds = [
      "/home/user/projects/project-a",
      "/var/www/project-a",
      "/unknown/path",
      null
    ];

    const result = resolveProjectsBatch(cwds, testProjects);

    expect(result.size).toBe(4);
    expect(result.get("/home/user/projects/project-a")?.id).toBe("project-a");
    expect(result.get("/var/www/project-a")?.id).toBe("project-a");
    expect(result.get("/unknown/path")).toBeNull();
    expect(result.get(null)).toBeNull();
  });

  it("deduplicates repeated cwds", () => {
    const cwds = [
      "/home/user/projects/project-a",
      "/home/user/projects/project-a",
      "/home/user/projects/project-a"
    ];

    const result = resolveProjectsBatch(cwds, testProjects);

    // Map only has unique keys
    expect(result.size).toBe(1);
    expect(result.get("/home/user/projects/project-a")?.id).toBe("project-a");
  });

  it("handles empty cwds array", () => {
    const result = resolveProjectsBatch([], testProjects);
    expect(result.size).toBe(0);
  });

  it("handles mixed matches and non-matches", () => {
    const cwds = [
      "/home/user/projects/project-a/src",
      "/workspace/project-c",
      "/no/match/here",
      "~/code/project-b"
    ];

    const result = resolveProjectsBatch(cwds, testProjects);

    expect(result.get("/home/user/projects/project-a/src")?.id).toBe(
      "project-a"
    );
    expect(result.get("/workspace/project-c")?.id).toBe("project-c");
    expect(result.get("/no/match/here")).toBeNull();
    expect(result.get("~/code/project-b")?.id).toBe("project-b");
  });
});

describe("getProjectRef", () => {
  it("returns id and name for project", () => {
    const project: ProjectConfig = {
      id: "my-project",
      name: "My Project",
      paths: ["/some/path"]
    };

    const ref = getProjectRef(project);

    expect(ref).not.toBeNull();
    expect(ref!.id).toBe("my-project");
    expect(ref!.name).toBe("My Project");
  });

  it("returns null for null project", () => {
    const ref = getProjectRef(null);
    expect(ref).toBeNull();
  });

  it("only includes id and name (not paths)", () => {
    const project: ProjectConfig = {
      id: "test",
      name: "Test",
      paths: ["/path1", "/path2"]
    };

    const ref = getProjectRef(project);

    expect(ref).toEqual({ id: "test", name: "Test" });
    expect((ref as unknown as { paths?: string[] }).paths).toBeUndefined();
  });
});
