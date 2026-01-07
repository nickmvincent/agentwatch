import { useEffect, useState } from "react";
import {
  fetchClaudeSettings,
  fetchRawConfig,
  saveRawConfig,
  updateClaudeSettings
} from "../api/client";
import type { ClaudeSettingsResponse } from "../api/types";
import { HookEnhancementsSection } from "./HookEnhancementsSection";
import {
  SelfDocumentingSection,
  setSelfDocumentingPreference,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

export function WatcherSettingsPane() {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSelfDocs = useSelfDocumentingVisible();

  // Notifications toggle state (parsed from content)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Claude settings state
  const [claudeSettings, setClaudeSettings] =
    useState<ClaudeSettingsResponse | null>(null);
  const [claudeError, setClaudeError] = useState<string | null>(null);

  const selfDocs = {
    title: "Watcher Settings",
    componentId: "watcher.settings.pane",
    reads: [
      { path: "GET /api/config/raw", description: "Raw watcher config file" }
    ],
    writes: [
      { path: "PUT /api/config/raw", description: "Persist watcher config" }
    ],
    tests: ["packages/watcher/test/api.test.ts"],
    notes: [
      "Changes take effect after restarting the watcher process.",
      "The watcher config lives under ~/.config/agentwatch/."
    ]
  };

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawConfig();
      setContent(data.content ?? "");
      setPath(data.path ?? "");
      // Parse notifications.enable from TOML content
      const enableMatch = data.content?.match(
        /\[notifications\][\s\S]*?enable\s*=\s*(true|false)/
      );
      setNotificationsEnabled(enableMatch?.[1] === "true");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load config file."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadClaudeSettings = async () => {
    try {
      const data = await fetchClaudeSettings();
      setClaudeSettings(data);
      setClaudeError(null);
    } catch (err) {
      setClaudeError(
        err instanceof Error ? err.message : "Failed to load Claude settings"
      );
    }
  };

  useEffect(() => {
    loadConfig();
    loadClaudeSettings();
  }, []);

  // Toggle notifications in config
  const toggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    // Update the TOML content
    let newContent = content;
    if (content.includes("[notifications]")) {
      newContent = content.replace(
        /(\[notifications\][\s\S]*?enable\s*=\s*)(true|false)/,
        `$1${newValue}`
      );
    } else {
      // Add notifications section
      newContent = `${content.trim()}\n\n[notifications]\nenable = ${newValue}\n`;
    }
    setContent(newContent);
    setNotificationsEnabled(newValue);

    // Save immediately
    setSaving(true);
    try {
      await saveRawConfig(newContent);
      setMessage(
        `Notifications ${newValue ? "enabled" : "disabled"}. Restart watcher to apply.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveRawConfig(content);
      setMessage(result.message || "Config saved. Restart watcher to apply.");
      setPath(result.path || path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="bg-gray-800 rounded-lg p-4 text-gray-400">
          Loading watcher settings...
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      <div className="space-y-4">
      {/* Quick Settings */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-white">Quick Settings</h2>

        {/* Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">Desktop Notifications</div>
            <div className="text-xs text-gray-500">
              macOS notifications for session end, tool failures, etc.
            </div>
          </div>
          <button
            onClick={toggleNotifications}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              notificationsEnabled ? "bg-blue-600" : "bg-gray-600"
            } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                notificationsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Component Documentation Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">Component Documentation</div>
            <div className="text-xs text-gray-500">
              Show self-documenting sections in each pane
            </div>
          </div>
          <button
            onClick={() => setSelfDocumentingPreference(!showSelfDocs)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showSelfDocs ? "bg-blue-600" : "bg-gray-600"
            } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showSelfDocs ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Claude Code Permissions */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-2">
          Claude Code Permissions
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          From <code className="bg-gray-700 px-1 rounded">~/.claude/settings.json</code>
        </p>

        {claudeError ? (
          <div className="text-sm text-red-400">{claudeError}</div>
        ) : !claudeSettings ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-3">
            {/* Allow patterns */}
            <div>
              <div className="text-sm text-green-400 mb-1">
                Allow ({claudeSettings.settings?.permissions?.allow?.length ?? 0})
              </div>
              <div className="flex flex-wrap gap-1">
                {(claudeSettings.settings?.permissions?.allow ?? []).length === 0 ? (
                  <span className="text-xs text-gray-500">No allow patterns</span>
                ) : (
                  (claudeSettings.settings?.permissions?.allow ?? []).map((p, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-green-900/50 text-green-300 text-xs rounded font-mono"
                    >
                      {p}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Deny patterns */}
            <div>
              <div className="text-sm text-red-400 mb-1">
                Deny ({claudeSettings.settings?.permissions?.deny?.length ?? 0})
              </div>
              <div className="flex flex-wrap gap-1">
                {(claudeSettings.settings?.permissions?.deny ?? []).length === 0 ? (
                  <span className="text-xs text-gray-500">No deny patterns</span>
                ) : (
                  (claudeSettings.settings?.permissions?.deny ?? []).map((p, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded font-mono"
                    >
                      {p}
                    </span>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={loadClaudeSettings}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-2">
          Watcher Settings
        </h2>
        <p className="text-sm text-gray-400 mb-3">
          Edit the watcher configuration file directly. Changes take effect
          after restarting the watcher process.
        </p>
        {path && (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span>Config file:</span>
            <code className="bg-gray-900/60 px-1 rounded">{path}</code>
            <button
              onClick={() => navigator.clipboard.writeText(path)}
              className="text-blue-400 hover:text-blue-300"
              type="button"
            >
              Copy path
            </button>
          </div>
        )}
      </div>

      <HookEnhancementsSection />

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded p-3">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 text-sm rounded p-3">
          {message}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[420px] bg-gray-900 border border-gray-700 text-gray-200 text-sm font-mono rounded p-3"
          spellCheck={false}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            onClick={loadConfig}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
          >
            Reload
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            Restart with{" "}
            <code className="bg-gray-900/60 px-1 rounded">
              aw watcher restart
            </code>
          </span>
        </div>
      </div>
      </div>
    </SelfDocumentingSection>
  );
}
