/**
 * Worker Adapter
 *
 * Backend adapter implementation that uses a Web Worker for processing.
 * Used by the static site (pages) which runs entirely in the browser.
 */

import type { ContributorMeta, RedactionConfig } from "@agentwatch/pre-share";
import type {
  BackendAdapter,
  BundleResult,
  FieldSchemasResult,
  HFOAuthConfig,
  HuggingFaceUploadResult,
  PreparationResult,
  RedactionReport,
  Session
} from "./types";

// OAuth constants
const HF_OAUTH_CLIENT_ID = "bf3c2da8-ffa5-4ac1-9fe1-5a0e96b6f918";
const HF_OAUTH_REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/oauth/callback`
    : "";

export interface WorkerAdapterOptions {
  /** Path to the worker script */
  workerPath?: string;
  /** App version string for bundles */
  appVersion?: string;
}

interface WorkerMessage {
  type: string;
  payload?: unknown;
}

interface ImportPayload {
  bytes: ArrayBuffer;
  source: string;
}

/**
 * Creates a worker adapter for browser-based processing.
 */
export function createWorkerAdapter(
  options: WorkerAdapterOptions = {}
): BackendAdapter {
  const { workerPath = "/workers/processor.js", appVersion = "0.1.0-static" } =
    options;

  let worker: Worker | null = null;
  let sessions: Session[] = [];
  const preparedSessions: Map<string, PreparationResult["sessions"][0]> =
    new Map();
  let lastRedactionReport: RedactionReport | null = null;

  // Pending message handlers
  const pendingMessages = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  let messageId = 0;

  // Initialize worker
  function getWorker(): Worker {
    if (!worker) {
      worker = new Worker(workerPath, { type: "module" });
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (e) => {
        console.error("Worker error:", e);
      };
    }
    return worker;
  }

  function handleWorkerMessage(event: MessageEvent<WorkerMessage>) {
    const { type, payload } = event.data;

    // Handle responses
    if (type === "schema") {
      const handler = pendingMessages.get("getSchema");
      if (handler) {
        pendingMessages.delete("getSchema");
        const p = payload as { fields: unknown[]; defaultSelected: string[] };
        handler.resolve({
          fields: p.fields,
          defaultSelected: p.defaultSelected
        });
      }
    } else if (type === "imported") {
      const handler = pendingMessages.get("import");
      if (handler) {
        pendingMessages.delete("import");
        const p = payload as { sessions: Session[] };
        sessions = p.sessions;
        handler.resolve(p.sessions);
      }
    } else if (type === "redacted") {
      const handler = pendingMessages.get("redact");
      if (handler) {
        pendingMessages.delete("redact");
        const p = payload as {
          report: RedactionReport;
          sanitizedSessions: PreparationResult["sessions"];
          fieldsStripped: Record<string, number>;
        };
        // Cache prepared sessions
        preparedSessions.clear();
        for (const s of p.sanitizedSessions) {
          preparedSessions.set(s.sessionId, s);
        }
        lastRedactionReport = p.report;
        handler.resolve({
          sessions: p.sanitizedSessions,
          redactionReport: p.report,
          fieldsStripped: p.fieldsStripped
        });
      }
    } else if (type === "bundle") {
      const handler = pendingMessages.get("bundle");
      if (handler) {
        pendingMessages.delete("bundle");
        handler.resolve(payload);
      }
    } else if (type === "error") {
      // Find and reject any pending handler
      const p = payload as { message: string };
      for (const [key, handler] of pendingMessages) {
        pendingMessages.delete(key);
        handler.reject(new Error(p.message));
        break;
      }
    }
  }

  function sendMessage(type: string, payload?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      messageId++;
      pendingMessages.set(type, { resolve, reject });
      getWorker().postMessage({ type, payload });

      // Timeout after 60 seconds
      setTimeout(() => {
        if (pendingMessages.has(type)) {
          pendingMessages.delete(type);
          reject(new Error(`Worker message '${type}' timed out`));
        }
      }, 60000);
    });
  }

  // PKCE helpers for OAuth
  function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const adapter: BackendAdapter = {
    type: "worker",

    async loadSessions(): Promise<Session[]> {
      // For worker adapter, sessions are loaded via file upload
      // This returns cached sessions from previous imports
      return sessions;
    },

    async refreshSessions(): Promise<Session[]> {
      // No refresh for file-based sessions
      return sessions;
    },

    async getFieldSchemas(source?: string): Promise<FieldSchemasResult> {
      const result = (await sendMessage("getSchema", {
        source
      })) as FieldSchemasResult;
      return result;
    },

    async prepareSessions(
      sessionIds: string[],
      config: RedactionConfig,
      selectedFields: string[] | undefined,
      _contributor: ContributorMeta
    ): Promise<PreparationResult> {
      const result = (await sendMessage("redact", {
        selectedIds: sessionIds,
        config,
        selectedFields
      })) as PreparationResult;
      return result;
    },

    async buildBundle(
      sessionIds: string[],
      contributor: ContributorMeta,
      redactionReport: RedactionReport,
      annotations?: Record<string, { rating?: string; notes?: string }>,
      format?: "zip" | "jsonl" | "auto"
    ): Promise<BundleResult> {
      const result = (await sendMessage("bundle", {
        selectedIds: sessionIds,
        contributor,
        redaction: redactionReport,
        annotations,
        format,
        appVersion
      })) as BundleResult;
      return result;
    },

    async downloadBundle(bundle: BundleResult): Promise<void> {
      const extension = bundle.bundleFormat === "jsonl" ? "jsonl" : "zip";
      const mimeType =
        bundle.bundleFormat === "jsonl"
          ? "application/x-jsonlines"
          : "application/zip";

      const blob = new Blob([bundle.bundleBytes as BlobPart], {
        type: mimeType
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bundle.bundleId}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async uploadToHuggingFace(
      bundle: BundleResult,
      repoId: string,
      token?: string,
      _createPr?: boolean
    ): Promise<HuggingFaceUploadResult> {
      if (!token) {
        return { success: false, error: "No HuggingFace token provided" };
      }

      try {
        const extension = bundle.bundleFormat === "jsonl" ? "jsonl" : "zip";
        const fileName = `${bundle.bundleId}.${extension}`;
        const filePath = `contributions/${fileName}`;

        // Use HuggingFace Hub API to upload
        const uploadUrl = `https://huggingface.co/api/datasets/${repoId}/upload/main/${filePath}`;
        const blob = new Blob([bundle.bundleBytes as BlobPart]);

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/octet-stream"
          },
          body: blob
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${response.status} ${errorText}`);
        }

        const fileUrl = `https://huggingface.co/datasets/${repoId}/blob/main/${filePath}`;
        return { success: true, url: fileUrl };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    },

    async getHFOAuthConfig(): Promise<HFOAuthConfig> {
      return {
        enabled: true,
        clientId: HF_OAUTH_CLIENT_ID,
        redirectUri: HF_OAUTH_REDIRECT_URI,
        scopes: ["read-repos", "write-repos"]
      };
    },

    async startHFOAuth(): Promise<{ authUrl: string; state: string }> {
      const state = crypto.randomUUID();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // Store PKCE verifier in sessionStorage for callback
      sessionStorage.setItem("hf_oauth_state", state);
      sessionStorage.setItem("hf_oauth_code_verifier", codeVerifier);

      const params = new URLSearchParams({
        client_id: HF_OAUTH_CLIENT_ID,
        redirect_uri: HF_OAUTH_REDIRECT_URI,
        scope: "read-repos write-repos",
        response_type: "code",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      });

      const authUrl = `https://huggingface.co/oauth/authorize?${params}`;
      return { authUrl, state };
    },

    async handleHFOAuthCallback(
      code: string,
      state: string
    ): Promise<{ username: string }> {
      const savedState = sessionStorage.getItem("hf_oauth_state");
      const codeVerifier = sessionStorage.getItem("hf_oauth_code_verifier");

      if (state !== savedState) {
        throw new Error("OAuth state mismatch");
      }
      if (!codeVerifier) {
        throw new Error("Missing PKCE code verifier");
      }

      // Exchange code for token
      const tokenResponse = await fetch("https://huggingface.co/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: HF_OAUTH_CLIENT_ID,
          redirect_uri: HF_OAUTH_REDIRECT_URI,
          code,
          code_verifier: codeVerifier
        })
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange OAuth code for token");
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
      };

      // Get user info
      const whoamiResponse = await fetch(
        "https://huggingface.co/api/whoami-v2",
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        }
      );

      if (!whoamiResponse.ok) {
        throw new Error("Failed to get user info");
      }

      const userInfo = (await whoamiResponse.json()) as { name: string };

      // Store token securely
      sessionStorage.setItem("hf_access_token", tokenData.access_token);
      sessionStorage.removeItem("hf_oauth_state");
      sessionStorage.removeItem("hf_oauth_code_verifier");

      return { username: userInfo.name };
    }
  };

  // Add method to import files (not part of standard interface)
  (adapter as WorkerAdapter).importZip = async (
    bytes: ArrayBuffer,
    source: string
  ): Promise<Session[]> => {
    const result = (await sendMessage("import", {
      bytes,
      source
    } as ImportPayload)) as Session[];
    return result;
  };

  (adapter as WorkerAdapter).getPreparedSession = (sessionId: string) => {
    return preparedSessions.get(sessionId);
  };

  (adapter as WorkerAdapter).getLastRedactionReport = () => {
    return lastRedactionReport;
  };

  return adapter;
}

/** Extended adapter interface with worker-specific methods */
export interface WorkerAdapter extends BackendAdapter {
  /** Import a ZIP file and extract sessions */
  importZip(bytes: ArrayBuffer, source: string): Promise<Session[]>;
  /** Get a prepared session by ID */
  getPreparedSession(
    sessionId: string
  ): PreparationResult["sessions"][0] | undefined;
  /** Get the last redaction report */
  getLastRedactionReport(): RedactionReport | null;
}
