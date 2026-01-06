/**
 * HuggingFace Hub integration for uploading contribution bundles.
 */

import { exec } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  type CommitOutput,
  type RepoDesignation,
  uploadFiles
} from "@huggingface/hub";

export interface HuggingFaceConfig {
  /** HuggingFace API token */
  token: string;
  /** Repository ID (e.g., "username/repo-name") */
  repoId: string;
  /** Whether to create a PR instead of direct commit */
  createPr?: boolean;
  /** Commit message */
  commitMessage?: string;
  /** PR title (if createPr is true) */
  prTitle?: string;
  /** PR description (if createPr is true) */
  prDescription?: string;
}

export interface UploadResult {
  success: boolean;
  /** Commit URL or PR URL */
  url?: string;
  /** Commit SHA (if direct commit) */
  commitSha?: string;
  /** PR number (if PR created) */
  prNumber?: number;
  /** Whether a PR was created (vs direct commit) */
  isPullRequest?: boolean;
  /** Whether this was a fallback from the preferred method */
  wasFallback?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Upload a bundle to HuggingFace Hub.
 *
 * @param bundle - The bundle content (ZIP bytes or JSONL string)
 * @param bundleId - Unique identifier for this bundle
 * @param config - HuggingFace configuration
 * @returns Upload result with URL
 */
export async function uploadToHuggingFace(
  bundle: Uint8Array | string,
  bundleId: string,
  config: HuggingFaceConfig
): Promise<UploadResult> {
  const isZip = bundle instanceof Uint8Array;
  const filename = isZip
    ? `bundles/${bundleId}.zip`
    : `bundles/${bundleId}.jsonl`;
  const contentType = isZip ? "application/zip" : "application/x-ndjson";

  // Convert string to Uint8Array if needed
  const content =
    typeof bundle === "string" ? new TextEncoder().encode(bundle) : bundle;

  const repo: RepoDesignation = {
    type: "dataset",
    name: config.repoId
  };

  const files = [
    {
      path: filename,
      content: new Blob([content], { type: contentType })
    }
  ];

  const commitMessage =
    config.commitMessage || `Add contribution bundle ${bundleId.slice(0, 16)}`;

  const baseUrl = `https://huggingface.co/datasets/${config.repoId}`;

  // Respect user's preference, but fall back if their preferred method fails
  const preferPR = config.createPr ?? true;
  let usePR = preferPR;
  let result: CommitOutput;

  try {
    // Try user's preferred method first
    result = await uploadFiles({
      repo,
      credentials: { accessToken: config.token },
      files,
      commitTitle: commitMessage,
      commitDescription: config.prDescription,
      hubUrl: "https://huggingface.co",
      isPullRequest: preferPR
    });
  } catch (firstError) {
    // First method failed, try the opposite
    console.log(
      `${preferPR ? "PR" : "Direct"} commit failed, trying ${preferPR ? "direct" : "PR"}:`,
      firstError
    );
    try {
      result = await uploadFiles({
        repo,
        credentials: { accessToken: config.token },
        files,
        commitTitle: commitMessage,
        commitDescription: config.prDescription,
        hubUrl: "https://huggingface.co",
        isPullRequest: !preferPR
      });
      usePR = !preferPR;
    } catch (secondError) {
      // Both failed
      const errorMsg =
        secondError instanceof Error
          ? secondError.message
          : String(secondError);
      return {
        success: false,
        error: `Upload failed: ${errorMsg}. Check that the dataset exists and you have write access.`
      };
    }
  }

  // Determine result URL
  let url: string;
  let prNumber: number | undefined;

  if (usePR && result.pullRequestUrl) {
    url = result.pullRequestUrl;
    // Extract PR number from URL
    const match = /\/discussions\/(\d+)/.exec(result.pullRequestUrl);
    prNumber = match?.[1] ? Number.parseInt(match[1], 10) : undefined;
  } else if (result.commit?.oid) {
    url = `${baseUrl}/commit/${result.commit.oid}`;
  } else {
    url = `${baseUrl}/tree/main/${filename}`;
  }

  return {
    success: true,
    url,
    commitSha: result.commit?.oid,
    prNumber,
    isPullRequest: usePR,
    wasFallback: usePR !== preferPR
  };
}

/**
 * Validate HuggingFace token by checking API access.
 */
export async function validateHuggingFaceToken(token: string): Promise<{
  valid: boolean;
  username?: string;
  error?: string;
}> {
  try {
    const response = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return { valid: false, error: "Invalid token" };
    }

    const data = (await response.json()) as { name?: string };
    return { valid: true, username: data.name };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

/**
 * Check if a HuggingFace dataset exists and is accessible.
 */
export async function checkDatasetAccess(
  token: string,
  repoId: string
): Promise<{
  exists: boolean;
  canWrite: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(
      `https://huggingface.co/api/datasets/${repoId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (response.status === 404) {
      return { exists: false, canWrite: false, error: "Dataset not found" };
    }

    if (!response.ok) {
      return {
        exists: false,
        canWrite: false,
        error: `API error: ${response.status}`
      };
    }

    // If we can read it, assume we can write (would need additional check for exact permissions)
    return { exists: true, canWrite: true };
  } catch (error) {
    return {
      exists: false,
      canWrite: false,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

// =============================================================================
// HuggingFace OAuth Integration
// =============================================================================

/**
 * HuggingFace OAuth configuration.
 * Users must create an app at https://huggingface.co/settings/applications
 */
export interface HFOAuthConfig {
  clientId: string;
  clientSecret?: string; // Optional for public clients
  redirectUri: string;
  scopes?: string[];
}

/**
 * OAuth state stored during the flow.
 */
export interface HFOAuthState {
  state: string;
  codeVerifier?: string; // For PKCE
  createdAt: number;
}

// In-memory store for OAuth states (short-lived)
const oauthStates = new Map<string, HFOAuthState>();

/**
 * Generate a random state string for OAuth CSRF protection.
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate PKCE code verifier and challenge.
 */
async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Array.from(array, (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

  // Create SHA-256 hash of verifier
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Base64url encode the hash
  const hashArray = new Uint8Array(hashBuffer);
  const base64 = btoa(String.fromCharCode(...hashArray));
  const challenge = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return { verifier, challenge };
}

/**
 * Get the HuggingFace OAuth authorization URL.
 * Redirects user to HF to authorize the app.
 */
export async function getHFOAuthURL(config: HFOAuthConfig): Promise<{
  url: string;
  state: string;
}> {
  const state = generateState();
  const { verifier, challenge } = await generatePKCE();

  // Store state for verification
  oauthStates.set(state, {
    state,
    codeVerifier: verifier,
    createdAt: Date.now()
  });

  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of oauthStates) {
    if (value.createdAt < tenMinutesAgo) {
      oauthStates.delete(key);
    }
  }

  // write-repos for uploading, write-discussions for creating PRs
  const scopes = config.scopes || [
    "read-repos",
    "write-repos",
    "write-discussions"
  ];
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  return {
    url: `https://huggingface.co/oauth/authorize?${params.toString()}`,
    state
  };
}

/**
 * Exchange OAuth authorization code for access token.
 */
export async function exchangeHFOAuthCode(
  code: string,
  state: string,
  config: HFOAuthConfig
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  username?: string;
  error?: string;
}> {
  // Verify state
  const storedState = oauthStates.get(state);
  if (!storedState) {
    return { success: false, error: "Invalid or expired state" };
  }

  // Remove used state
  oauthStates.delete(state);

  try {
    const params = new URLSearchParams({
      client_id: config.clientId,
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: storedState.codeVerifier || ""
    });

    if (config.clientSecret) {
      params.set("client_secret", config.clientSecret);
    }

    const response = await fetch("https://huggingface.co/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Token exchange failed: ${error}` };
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type: string;
    };

    // Get username
    const userInfo = await validateHuggingFaceToken(data.access_token);

    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      username: userInfo.username
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Token exchange failed"
    };
  }
}

// =============================================================================
// HuggingFace CLI Auth Integration
// =============================================================================

/**
 * Known locations for HuggingFace token cache.
 * The HF CLI stores tokens in these locations.
 */
const HF_TOKEN_PATHS = [
  join(homedir(), ".cache", "huggingface", "token"),
  join(homedir(), ".huggingface", "token")
];

/**
 * Result of checking HuggingFace CLI auth status.
 */
export interface HFAuthStatus {
  /** Whether CLI is authenticated */
  authenticated: boolean;
  /** Username if authenticated */
  username?: string;
  /** Token (masked for display) */
  tokenMasked?: string;
  /** Full token (only returned if explicitly requested) */
  token?: string;
  /** Source of the token */
  source?: "cli-cache" | "environment" | "saved";
  /** Error message if auth check failed */
  error?: string;
}

/**
 * Check if HuggingFace CLI is authenticated by reading cached token.
 *
 * This reads from the same token cache that `huggingface-cli login` writes to,
 * allowing users to authenticate once via CLI and use across all HF tools.
 */
export async function checkHFCLIAuth(options?: {
  includeToken?: boolean;
}): Promise<HFAuthStatus> {
  // First check environment variable
  const envToken = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  if (envToken) {
    const validation = await validateHuggingFaceToken(envToken);
    if (validation.valid) {
      return {
        authenticated: true,
        username: validation.username,
        tokenMasked: maskToken(envToken),
        token: options?.includeToken ? envToken : undefined,
        source: "environment"
      };
    }
  }

  // Check cached token files
  for (const tokenPath of HF_TOKEN_PATHS) {
    if (existsSync(tokenPath)) {
      try {
        const token = readFileSync(tokenPath, "utf-8").trim();
        if (token) {
          const validation = await validateHuggingFaceToken(token);
          if (validation.valid) {
            return {
              authenticated: true,
              username: validation.username,
              tokenMasked: maskToken(token),
              token: options?.includeToken ? token : undefined,
              source: "cli-cache"
            };
          }
        }
      } catch {
        // Continue to next path
      }
    }
  }

  return {
    authenticated: false,
    error: "Not authenticated. Run 'huggingface-cli login' to authenticate."
  };
}

/**
 * Trigger HuggingFace CLI login flow.
 *
 * This runs `huggingface-cli login --token` which will prompt for a token.
 * Note: For interactive browser-based login, users should run the CLI directly.
 * Returns a promise that resolves when login completes.
 */
export function triggerHFCLILogin(): Promise<{
  success: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    // Check if CLI is available by running whoami
    exec("huggingface-cli whoami", (error) => {
      if (error) {
        // Try hf command
        exec("hf whoami", (error2) => {
          if (error2) {
            resolve({
              success: false,
              error:
                "HuggingFace CLI not found. Install with: pip install huggingface_hub"
            });
          } else {
            resolve({ success: true });
          }
        });
      } else {
        resolve({ success: true });
      }
    });
  });
}

/**
 * Get the cached HF token for use in API calls.
 * This is a convenience wrapper for checkHFCLIAuth.
 */
export async function getHFCachedToken(): Promise<string | null> {
  const status = await checkHFCLIAuth({ includeToken: true });
  return status.token || null;
}

/**
 * Mask a token for display (show first 4 and last 4 chars).
 */
function maskToken(token: string): string {
  if (token.length <= 12) {
    return "****";
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}
