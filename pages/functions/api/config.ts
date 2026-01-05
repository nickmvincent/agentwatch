/**
 * Config API endpoint for Cloudflare Pages Functions.
 * Returns configuration for the donation page.
 */

interface Env {
  ALLOWED_REPOS?: string;
  HF_REPO?: string;
  MAX_UPLOAD_BYTES?: string;
  MAX_FILE_BYTES?: string;
  APP_VERSION?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const allowedRaw = env.ALLOWED_REPOS || env.HF_REPO || "";
  const allowedRepos = allowedRaw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const defaultRepo = env.HF_REPO || allowedRepos[0] || "";
  const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES || "50000000");
  const maxFileBytes = Number(env.MAX_FILE_BYTES || "20000000");
  const appVersion = env.APP_VERSION || "0.1.0";

  return new Response(
    JSON.stringify({
      app_version: appVersion,
      default_repo: defaultRepo,
      allowed_repos: allowedRepos,
      max_upload_bytes: maxUploadBytes,
      max_file_bytes: maxFileBytes
    }),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
};
