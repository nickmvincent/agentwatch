/**
 * ContribPane for the static pages site
 *
 * Uses the shared @agentwatch/ui ContribPane component with a worker adapter
 * and custom file upload logic for loading sessions.
 */

import {
  AdapterProvider,
  type Session,
  ContribPane as SharedContribPane,
  type WorkerAdapter,
  createWorkerAdapter,
  MarkdownRenderer
} from "@agentwatch/ui";
import { oauthHandleRedirectIfPresent, whoAmI } from "@huggingface/hub";
import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// Constants
// ============================================================================

const HF_OAUTH_CLIENT_ID = "7478b456-ef0a-4814-b0ce-d47ac259ff1d";
const HF_STORAGE_KEY = "hf_auth";
const APP_VERSION = "0.2.0";

// ============================================================================
// Types
// ============================================================================

interface HfAuth {
  accessToken: string;
  username: string;
}

// ============================================================================
// File Upload Component
// ============================================================================

interface FileUploadProps {
  onSessionsLoaded: (sessions: Session[]) => void;
  adapter: WorkerAdapter;
}

function FileUpload({ onSessionsLoaded, adapter }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<
    { source: string; count: number }[]
  >([]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const bytes = await file.arrayBuffer();
      const sessions = await adapter.importZip(bytes, source);

      // Convert worker sessions to UI sessions
      const uiSessions: Session[] = sessions.map((s: unknown) => {
        const session = s as {
          sessionId: string;
          source: string;
          preview: string;
          score: number;
          approxChars: number;
          mtimeUtc: string;
          entryTypes: Record<string, number>;
          primaryType: string;
          sourcePathHint: string;
        };
        return {
          id: session.sessionId,
          source: session.source,
          agent: session.source,
          name:
            session.sourcePathHint?.split("/").pop() ||
            session.sessionId.slice(0, 8),
          projectDir: null,
          modifiedAt: new Date(session.mtimeUtc).getTime(),
          messageCount: session.entryTypes?.message || null,
          sizeBytes: session.approxChars,
          score: session.score,
          preview: session.preview,
          entryTypes: session.entryTypes,
          primaryType: session.primaryType,
          sourcePathHint: session.sourcePathHint
        };
      });

      setLoadedFiles((prev) => [...prev, { source, count: uiSessions.length }]);
      onSessionsLoaded(uiSessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-white">Import Transcripts</div>

      <div className="grid grid-cols-3 gap-2">
        {(["claude", "codex", "opencode"] as const).map((source) => (
          <div key={source} className="relative">
            <input
              type="file"
              accept=".zip"
              onChange={(e) => handleFileUpload(e, source)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            <div
              className={`p-3 rounded border border-dashed text-center ${
                source === "claude"
                  ? "border-purple-600 bg-purple-900/20"
                  : source === "codex"
                    ? "border-blue-600 bg-blue-900/20"
                    : "border-gray-600 bg-gray-900/20"
              }`}
            >
              <div
                className={`text-sm font-medium ${
                  source === "claude"
                    ? "text-purple-300"
                    : source === "codex"
                      ? "text-blue-300"
                      : "text-gray-300"
                }`}
              >
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Drop ZIP or click
              </div>
            </div>
          </div>
        ))}
      </div>

      {uploading && (
        <div className="text-xs text-blue-400 animate-pulse">
          Loading transcripts...
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}

      {loadedFiles.length > 0 && (
        <div className="text-xs text-gray-400">
          Loaded: {loadedFiles.map((f) => `${f.count} ${f.source}`).join(", ")}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Export your transcripts using the agent's CLI:
        <code className="ml-1 px-1 py-0.5 bg-gray-800 rounded">
          claude export
        </code>{" "}
        or
        <code className="ml-1 px-1 py-0.5 bg-gray-800 rounded">
          codex export
        </code>
      </div>
    </div>
  );
}

// ============================================================================
// Session View Modal
// ============================================================================

interface SessionViewModalProps {
  session: Session;
  preparedData?: { rawJson?: string; previewRedacted?: string };
  onClose: () => void;
}

function SessionViewModal({
  session,
  preparedData,
  onClose
}: SessionViewModalProps) {
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");

  // Parse rawJson if available to try to extract messages
  const parsedMessages = useMemo(() => {
    if (!preparedData?.rawJson) return null;
    try {
      // rawJson is JSONL format - split by newlines and parse each
      const lines = preparedData.rawJson.trim().split("\n");
      const entries = lines
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      // Look for message entries
      const messages = entries.filter(
        (e) =>
          e.type === "user" ||
          e.type === "assistant" ||
          e.role === "user" ||
          e.role === "assistant"
      );
      return messages.length > 0 ? messages : null;
    } catch {
      return null;
    }
  }, [preparedData?.rawJson]);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">
              {session.name}
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
              <span className="px-2 py-0.5 bg-gray-700 rounded">
                {session.agent}
              </span>
              {session.messageCount && (
                <span>{session.messageCount} messages</span>
              )}
              {session.sizeBytes && (
                <span>
                  {session.sizeBytes >= 1000
                    ? `${(session.sizeBytes / 1000).toFixed(1)}K chars`
                    : `${session.sizeBytes} chars`}
                </span>
              )}
              {session.score !== undefined && (
                <span
                  className={
                    session.score >= 7
                      ? "text-green-400"
                      : session.score >= 4
                        ? "text-yellow-400"
                        : "text-red-400"
                  }
                >
                  Score: {session.score}/10
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {preparedData?.rawJson && (
              <div className="flex text-xs">
                <button
                  onClick={() => setViewMode("preview")}
                  className={`px-2 py-1 rounded-l ${
                    viewMode === "preview"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setViewMode("raw")}
                  className={`px-2 py-1 rounded-r ${
                    viewMode === "raw"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  Raw
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white"
            >
              x
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === "raw" && preparedData?.rawJson ? (
            <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap bg-gray-900/50 p-4 rounded">
              {preparedData.rawJson}
            </pre>
          ) : parsedMessages ? (
            <div className="space-y-3">
              {parsedMessages.map((msg, idx) => {
                const role = msg.role || msg.type;
                const content =
                  msg.message ||
                  msg.content ||
                  (typeof msg.text === "string" ? msg.text : "");
                const isUser = role === "user";
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 ${
                      isUser
                        ? "bg-blue-900/30 border-blue-700/50"
                        : "bg-purple-900/30 border-purple-700/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`w-6 h-6 flex items-center justify-center text-xs font-bold bg-gray-700 rounded ${
                          isUser ? "text-blue-400" : "text-purple-400"
                        }`}
                      >
                        {isUser ? "U" : "A"}
                      </span>
                      <span
                        className={`text-sm font-medium ${isUser ? "text-blue-400" : "text-purple-400"}`}
                      >
                        {isUser ? "You" : "Assistant"}
                      </span>
                    </div>
                    <div className="text-sm text-gray-200">
                      <MarkdownRenderer content={content || "(empty)"} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : preparedData?.previewRedacted ? (
            <div className="text-sm text-gray-300">
              <div className="text-xs text-gray-500 mb-2">
                Redacted Preview:
              </div>
              <div className="bg-gray-900/50 p-4 rounded whitespace-pre-wrap font-mono">
                {preparedData.previewRedacted}
              </div>
            </div>
          ) : session.preview ? (
            <div className="text-sm text-gray-300">
              <div className="text-xs text-gray-500 mb-2">
                Original Preview:
              </div>
              <div className="bg-gray-900/50 p-4 rounded whitespace-pre-wrap font-mono">
                {session.preview}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No content available. Run "Prepare" first to see the full session
              data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ContribPane() {
  const [adapter] = useState(
    () =>
      createWorkerAdapter({
        workerPath: "/workers/processor.js",
        appVersion: APP_VERSION
      }) as WorkerAdapter
  );

  const [sessions, setSessions] = useState<Session[]>([]);
  const [hfAuth, setHfAuth] = useState<HfAuth | null>(null);
  const [viewingSession, setViewingSession] = useState<Session | null>(null);

  // Load saved HF auth
  useEffect(() => {
    const saved = localStorage.getItem(HF_STORAGE_KEY);
    if (saved) {
      try {
        setHfAuth(JSON.parse(saved));
      } catch {
        localStorage.removeItem(HF_STORAGE_KEY);
      }
    }

    // Handle OAuth redirect
    oauthHandleRedirectIfPresent()
      .then(async (result) => {
        if (result) {
          const user = await whoAmI({ accessToken: result.accessToken });
          const auth = { accessToken: result.accessToken, username: user.name };
          localStorage.setItem(HF_STORAGE_KEY, JSON.stringify(auth));
          sessionStorage.setItem("hf_access_token", result.accessToken);
          setHfAuth(auth);
        }
      })
      .catch(console.error);
  }, []);

  const handleSessionsLoaded = useCallback((newSessions: Session[]) => {
    setSessions((prev) => [...prev, ...newSessions]);
  }, []);

  const handleViewSession = useCallback((session: Session) => {
    setViewingSession(session);
  }, []);

  // Get prepared data for viewing session
  const viewingPreparedData = useMemo(() => {
    if (!viewingSession) return undefined;
    const prepared = adapter.getPreparedSession(viewingSession.id);
    return prepared
      ? { rawJson: prepared.rawJson, previewRedacted: prepared.previewRedacted }
      : undefined;
  }, [viewingSession, adapter]);

  const sessionLoader = (
    <FileUpload adapter={adapter} onSessionsLoaded={handleSessionsLoaded} />
  );

  return (
    <div className="min-h-screen p-4">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white">
          Transcript Donation Lab
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Prepare and share your coding agent transcripts
        </p>
        {hfAuth && (
          <div className="mt-2 text-xs text-green-400">
            Logged in as @{hfAuth.username}
            <button
              onClick={() => {
                localStorage.removeItem(HF_STORAGE_KEY);
                sessionStorage.removeItem("hf_access_token");
                setHfAuth(null);
              }}
              className="ml-2 text-gray-400 hover:text-white"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      <AdapterProvider adapter={adapter}>
        <SharedContribPane
          title="Prepare & Share"
          initialSessions={sessions}
          onSessionsChange={setSessions}
          sessionLoader={sessionLoader}
          onViewSession={handleViewSession}
        />
      </AdapterProvider>

      {viewingSession && (
        <SessionViewModal
          session={viewingSession}
          preparedData={viewingPreparedData}
          onClose={() => setViewingSession(null)}
        />
      )}
    </div>
  );
}

export default ContribPane;
