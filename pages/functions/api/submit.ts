/**
 * Submit API endpoint for Cloudflare Pages Functions.
 * Handles server-side bundle submission to HuggingFace.
 *
 * This endpoint is used when server-side submission with a bot token is needed.
 * Most submissions go directly from the browser using the user's OAuth token.
 */

import { unzipSync } from "fflate";

interface Env {
  ALLOWED_REPOS?: string;
  HF_REPO?: string;
  MAX_UPLOAD_BYTES?: string;
  HF_TOKEN?: string;
}

interface Manifest {
  bundle_id: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

const decoder = new TextDecoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  // TypeScript 5.9 strict mode: cast via unknown to satisfy BufferSource constraint
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource
  );
  return toHex(digest);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || "50000000");
  const allowedRaw = env.ALLOWED_REPOS || env.HF_REPO || "";
  const allowedRepos = allowedRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const targetRepo = request.headers.get("X-Repo-Target") || env.HF_REPO || "";

  if (
    !targetRepo ||
    (allowedRepos.length && !allowedRepos.includes(targetRepo))
  ) {
    return jsonResponse({ error: "Repo not allowlisted" }, 403);
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength > maxUploadBytes) {
    return jsonResponse({ error: "Payload exceeds max upload bytes" }, 413);
  }

  const zipBytes = new Uint8Array(arrayBuffer);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    return jsonResponse({ error: "Invalid zip" }, 400);
  }

  const required = ["transcripts.jsonl", "prep_report.json", "manifest.json"];
  for (const name of required) {
    if (!entries[name]) {
      return jsonResponse({ error: `Missing ${name}` }, 400);
    }
  }

  const manifest = JSON.parse(
    decoder.decode(entries["manifest.json"])
  ) as Manifest;
  if (!manifest.bundle_id || !manifest.files?.length) {
    return jsonResponse({ error: "Invalid manifest.json" }, 400);
  }

  // Verify file hashes
  for (const entry of manifest.files) {
    const fileBytes = entries[entry.path];
    if (!fileBytes) {
      return jsonResponse(
        { error: `Manifest path missing: ${entry.path}` },
        400
      );
    }
    const hash = await sha256Hex(fileBytes);
    if (hash !== entry.sha256) {
      return jsonResponse({ error: `Hash mismatch for ${entry.path}` }, 400);
    }
  }

  const prepReport = JSON.parse(
    decoder.decode(entries["prep_report.json"])
  ) as {
    contributor?: { contributor_id?: string };
  };
  const contributorId = prepReport?.contributor?.contributor_id || "anonymous";
  const bundleId = manifest.bundle_id;
  const branch = `donate/${bundleId}`;

  const filesPayload = required.map((name) => ({
    path: `donations/${contributorId}/${bundleId}/${name}`,
    content: decoder.decode(entries[name]),
    encoding: "utf-8"
  }));

  const hfToken = env.HF_TOKEN;
  if (!hfToken) {
    return jsonResponse({ error: "HF_TOKEN missing" }, 500);
  }

  const commitBody = {
    commitMessage: `Donation: ${bundleId}`,
    commitDescription: "Automated donation bundle submission",
    files: filesPayload,
    isPullRequest: true
  };

  const hfResponse = await fetch(
    `https://huggingface.co/api/datasets/${targetRepo}/commit/${branch}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(commitBody)
    }
  );

  if (!hfResponse.ok) {
    const detail = await hfResponse.text();
    return jsonResponse({ error: "HF commit failed", detail }, 502);
  }

  const hfJson = (await hfResponse.json()) as {
    pullRequestUrl?: string;
    pull_request_url?: string;
  };
  const prUrl = hfJson?.pullRequestUrl || hfJson?.pull_request_url || "";
  return jsonResponse({ pr_url: prUrl, bundle_id: bundleId });
};

export const onRequestGet: PagesFunction = async () => {
  return jsonResponse({ error: "POST required" }, 405);
};
