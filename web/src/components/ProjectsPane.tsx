import { useCallback, useEffect, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchAnalyticsByProject,
  fetchProjects,
  inferProjects,
  updateProject
} from "../api/client";
import type { Project, ProjectAnalyticsItem } from "../api/types";

interface ProjectWithStats extends Project {
  session_count?: number;
  total_cost_usd?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function ProjectsPane() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(
    null
  );
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPaths, setFormPaths] = useState("");
  const [saving, setSaving] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [inferResult, setInferResult] = useState<string | null>(null);

  // Load projects and analytics
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsData, analyticsData] = await Promise.all([
        fetchProjects(),
        fetchAnalyticsByProject(90)
      ]);

      // Create a map of project stats
      const statsMap = new Map<string, ProjectAnalyticsItem>();
      for (const item of analyticsData.breakdown) {
        statsMap.set(item.project_id, item);
      }

      // Merge stats with projects
      const projectsWithStats: ProjectWithStats[] = projectsData.map((p) => {
        const stats = statsMap.get(p.id);
        return {
          ...p,
          session_count: stats?.session_count,
          total_cost_usd: stats?.total_cost_usd,
          total_input_tokens: stats?.total_input_tokens,
          total_output_tokens: stats?.total_output_tokens
        };
      });

      setProjects(projectsWithStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Open create modal
  const openCreateModal = () => {
    setFormId("");
    setFormName("");
    setFormDescription("");
    setFormPaths("");
    setEditingProject(null);
    setIsCreating(true);
  };

  // Open edit modal
  const openEditModal = (project: ProjectWithStats) => {
    setFormId(project.id);
    setFormName(project.name);
    setFormDescription(project.description || "");
    setFormPaths(project.paths.join("\n"));
    setEditingProject(project);
    setIsCreating(false);
  };

  // Close modal
  const closeModal = () => {
    setEditingProject(null);
    setIsCreating(false);
  };

  // Save project (create or update)
  const handleSave = async () => {
    const paths = formPaths
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (!formName.trim() || paths.length === 0) {
      setError("Name and at least one path are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isCreating) {
        // Generate ID from name if not provided
        const id =
          formId.trim() ||
          formName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        await createProject({
          id,
          name: formName.trim(),
          paths,
          description: formDescription.trim() || undefined
        });
      } else if (editingProject) {
        await updateProject(editingProject.id, {
          name: formName.trim(),
          paths,
          description: formDescription.trim() || undefined
        });
      }
      closeModal();
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  // Delete project
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      await deleteProject(id);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    }
  };

  // Discover projects from git repos
  const handleDiscover = async () => {
    setInferring(true);
    setInferResult(null);
    setError(null);

    try {
      const result = await inferProjects();
      if (result.new_projects > 0) {
        setInferResult(
          `Found ${result.new_projects} new project${result.new_projects > 1 ? "s" : ""} from ${result.git_repos_found} git repositories`
        );
        await loadProjects();
      } else if (result.git_repos_found > 0) {
        setInferResult(
          `Scanned ${result.scanned_cwds} locations, found ${result.git_repos_found} git repos (all already tracked)`
        );
      } else {
        setInferResult(
          `Scanned ${result.scanned_cwds} locations, no git repositories found`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to discover projects"
      );
    } finally {
      setInferring(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <p className="text-sm text-gray-400 mt-1">
            Manage projects to organize and filter your sessions.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Stored in{" "}
            <code className="bg-gray-700 px-1 rounded">
              ~/.config/agentwatch/config.toml
            </code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscover}
            disabled={inferring}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm disabled:opacity-50"
            title="Scan session directories for git repositories and auto-create projects"
          >
            {inferring ? "Discovering..." : "Discover from Git"}
          </button>
          <button
            onClick={loadProjects}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={openCreateModal}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
          >
            New Project
          </button>
        </div>
      </div>

      {inferResult && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded text-green-300 text-sm">
          {inferResult}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Projects Grid */}
      {loading && projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">No projects configured yet.</div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleDiscover}
              disabled={inferring}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
            >
              {inferring ? "Discovering..." : "Discover from Git"}
            </button>
            <span className="text-gray-500">or</span>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded"
            >
              Create Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors"
              onClick={() => openEditModal(project)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Paths */}
              <div className="mt-3 space-y-1">
                {project.paths.slice(0, 2).map((path, i) => (
                  <div
                    key={i}
                    className="text-xs text-gray-500 truncate font-mono"
                    title={path}
                  >
                    {path}
                  </div>
                ))}
                {project.paths.length > 2 && (
                  <div className="text-xs text-gray-600">
                    +{project.paths.length - 2} more
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="mt-3 pt-3 border-t border-gray-800 flex items-center gap-4 text-xs text-gray-500">
                {project.session_count !== undefined && (
                  <span title="Sessions">
                    {project.session_count} session
                    {project.session_count !== 1 ? "s" : ""}
                  </span>
                )}
                {project.total_cost_usd !== undefined &&
                  project.total_input_tokens !== undefined &&
                  project.total_output_tokens !== undefined && (
                    <span title="Total tokens">
                      {formatTokens(
                        project.total_input_tokens + project.total_output_tokens
                      )}{" "}
                      tok{" "}
                      {project.total_cost_usd > 0 && (
                        <span className="text-[10px] text-gray-500">
                          (~${project.total_cost_usd.toFixed(2)})
                        </span>
                      )}
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      {(editingProject || isCreating) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={closeModal}
        >
          <div
            className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white mb-4">
              {isCreating ? "New Project" : "Edit Project"}
            </h2>

            <div className="space-y-4">
              {isCreating && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    ID (optional)
                  </label>
                  <input
                    type="text"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="auto-generated from name"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to auto-generate from name
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Project"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this project"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Paths (one per line)
                </label>
                <textarea
                  value={formPaths}
                  onChange={(e) => setFormPaths(e.target.value)}
                  placeholder="/Users/you/projects/my-project"
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Sessions with working directories matching these paths will be
                  assigned to this project
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6">
              {!isCreating && editingProject && (
                <button
                  onClick={() => {
                    handleDelete(editingProject.id);
                    closeModal();
                  }}
                  className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 rounded text-sm"
                >
                  Delete
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
