/**
 * Utility functions for the ContribPane component.
 * These are pure functions that can be easily tested.
 */

import type { Session } from "../../adapters/types";

/**
 * Format a timestamp to a readable time string (HH:MM).
 */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Format bytes to a human-readable size string.
 */
export function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format a timestamp to a date string (MMM DD, YYYY).
 */
export function formatDate(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Group sessions by date.
 */
export function groupSessionsByDate(
  sessions: Session[]
): Record<string, Session[]> {
  return sessions.reduce(
    (acc, session) => {
      const date = formatDate(session.modifiedAt);
      if (!acc[date]) acc[date] = [];
      acc[date].push(session);
      return acc;
    },
    {} as Record<string, Session[]>
  );
}

/**
 * Get a privacy score color class based on the score value.
 * @param score 0-100 privacy score
 * @returns Tailwind CSS classes for background and text color
 */
export function getScoreColorClass(score: number): string {
  if (score >= 80) return "bg-green-900/50 text-green-400";
  if (score >= 50) return "bg-yellow-900/50 text-yellow-400";
  return "bg-red-900/50 text-red-400";
}

/**
 * Get a source badge color class based on the source type.
 */
export function getSourceColorClass(source: string): string {
  switch (source) {
    case "claude":
      return "bg-purple-900/50 text-purple-300";
    case "codex":
      return "bg-blue-900/50 text-blue-300";
    case "opencode":
      return "bg-cyan-900/50 text-cyan-300";
    case "hooks":
      return "bg-green-900/50 text-green-300";
    case "local":
      return "bg-gray-600 text-gray-300";
    default:
      return "bg-gray-600 text-gray-300";
  }
}

/**
 * Privacy threat information for each field type.
 * Explains why certain fields might be privacy-sensitive.
 */
export const FIELD_THREAT_INFO: Record<string, string> = {
  timestamp: "Timestamps can reveal your work patterns and timezone.",
  session_id:
    "Session IDs could potentially be used to link multiple contributions.",
  message_id: "Message IDs could be used to correlate data.",
  model: "Model names may fingerprint your service tier or subscription.",
  tokens: "Token counts reveal conversation complexity and usage patterns.",
  client_version: "Client version can be used for fingerprinting.",
  cwd: "Current working directory may reveal your username or project structure.",
  path: "File paths may contain your username or sensitive directory names.",
  project_dir:
    "Project directory may reveal organizational or personal information.",
  os: "Operating system information can be used for fingerprinting.",
  cost: "Token usage information reveals your usage and subscription details."
};

/**
 * Get threat info for a field path.
 */
export function getFieldThreatInfo(path: string): string | undefined {
  // Check for exact match first
  if (FIELD_THREAT_INFO[path]) return FIELD_THREAT_INFO[path];

  // Check for partial matches
  for (const [key, value] of Object.entries(FIELD_THREAT_INFO)) {
    if (path.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return undefined;
}
