/**
 * Contributor settings persistence.
 *
 * Stores user preferences for data sharing:
 * - Contributor ID and license
 * - Hugging Face token
 * - AI training preferences
 * - Contribution history
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { logAuditEvent } from "./audit-log";

/**
 * Redaction configuration for content sanitization.
 */
export interface RedactionConfig {
  /** Redact secrets (API keys, tokens, passwords) */
  redactSecrets: boolean;
  /** Redact PII (emails, IPs, phone numbers) */
  redactPii: boolean;
  /** Redact file paths (replace username) */
  redactPaths: boolean;
  /** Enable high-entropy string detection */
  enableHighEntropy: boolean;
  /** Custom regex patterns */
  customPatterns?: string[];
}

/**
 * A saved field selection + redaction configuration.
 */
export interface RedactionProfile {
  /** Profile identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what this profile does */
  description?: string;
  /** Field paths to KEEP (whitelist) */
  keptFields: string[];
  /** Redaction toggles */
  redactionConfig: RedactionConfig;
  /** Whether this is the active default */
  isDefault?: boolean;
  /** When created */
  createdAt: string;
  /** When last modified */
  updatedAt: string;
}

/**
 * Default redaction configuration.
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  redactSecrets: true,
  redactPii: true,
  redactPaths: true,
  enableHighEntropy: true
};

// =============================================================================
// RESEARCH-ORIENTED PROFILES
// =============================================================================
// Profiles are now defined in research-profiles.ts for easier editing.
// Import and re-export for backwards compatibility.

import {
  RESEARCH_PROFILES,
  getLegacyProfiles,
  getDefaultProfileId,
  getProfileById,
  isResearchProfile,
  type ResearchProfile,
  type ArtifactLink,
  type ArtifactType
} from "./research-profiles";

export {
  RESEARCH_PROFILES,
  getDefaultProfileId,
  getProfileById,
  isResearchProfile,
  type ResearchProfile,
  type ArtifactLink,
  type ArtifactType
};

/**
 * Built-in profiles in legacy format for backwards compatibility.
 * Order: Most restrictive → Most permissive (matching research-profiles.ts)
 */
export const BUILTIN_PROFILES: RedactionProfile[] = getLegacyProfiles();

/**
 * Default profile for new users.
 */
export const DEFAULT_PROFILE_ID = getDefaultProfileId();

/**
 * Saved contributor preferences.
 */
export interface ContributorSettings {
  /** Unique contributor identifier */
  contributorId: string;
  /** License for contributions (e.g., "CC-BY-4.0") */
  license: string;
  /** AI training preference signal */
  aiPreference: string;
  /** Rights statement */
  rightsStatement: string;
  /** Hugging Face API token (encrypted in future) */
  hfToken?: string;
  /** Default dataset to upload to */
  hfDataset?: string;
  /** User-defined redaction profiles */
  redactionProfiles?: RedactionProfile[];
  /** ID of the currently active profile */
  activeProfileId?: string;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Record of a single contribution upload.
 */
export interface ContributionRecord {
  /** Unique ID for this contribution */
  id: string;
  /** When the upload occurred */
  timestamp: string;
  /** Number of sessions included */
  sessionCount: number;
  /** Total characters contributed */
  totalChars: number;
  /** Destination (e.g., "huggingface:user/dataset") */
  destination: string;
  /** Bundle ID */
  bundleId: string;
  /** Upload status */
  status: "success" | "failed" | "pending";
  /** Error message if failed */
  error?: string;
  /** Session IDs (correlation IDs) that were contributed */
  sessionIds?: string[];
  /** Linked artifacts (repos, PRs, commits, etc.) */
  artifacts?: ArtifactLink[];
}

/**
 * Session-level artifact links.
 * Stored separately for performance (indexed by session ID).
 */
export interface SessionArtifacts {
  /** Session ID this belongs to */
  sessionId: string;
  /** Linked artifacts */
  artifacts: ArtifactLink[];
  /** When last modified */
  updatedAt: string;
}

/**
 * Full contribution history.
 */
export interface ContributionHistory {
  /** All contribution records */
  contributions: ContributionRecord[];
  /** Total sessions contributed across all uploads */
  totalSessions: number;
  /** Total characters contributed */
  totalChars: number;
  /** First contribution date */
  firstContribution?: string;
  /** Last contribution date */
  lastContribution?: string;
}

const SETTINGS_PATH = "~/.agentwatch/contributor.json";
const HISTORY_PATH = "~/.agentwatch/contributions.json";

function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Default contributor settings.
 */
export function getDefaultContributorSettings(): ContributorSettings {
  return {
    contributorId: "",
    license: "CC-BY-4.0",
    aiPreference: "train-genai=ok",
    rightsStatement:
      "I have the right to share this data and it does not contain sensitive information.",
    redactionProfiles: [],
    activeProfileId: DEFAULT_PROFILE_ID,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get all available profiles (built-in + user-defined).
 */
export function getAvailableProfiles(
  settings: ContributorSettings
): RedactionProfile[] {
  const userProfiles = settings.redactionProfiles || [];
  return [...BUILTIN_PROFILES, ...userProfiles];
}

/**
 * Get the active profile.
 */
export function getActiveProfile(
  settings: ContributorSettings
): RedactionProfile {
  const activeId = settings.activeProfileId || DEFAULT_PROFILE_ID;
  const allProfiles = getAvailableProfiles(settings);
  // Fallback to first built-in profile if active not found
  const found = allProfiles.find((p) => p.id === activeId);
  if (found) return found;
  // BUILTIN_PROFILES is guaranteed to have at least one entry
  return BUILTIN_PROFILES[0]!;
}

/**
 * Check if a profile is built-in (cannot be deleted/modified).
 */
export function isBuiltinProfile(profileId: string): boolean {
  return BUILTIN_PROFILES.some((p) => p.id === profileId);
}

/**
 * Generate a unique profile ID.
 */
function generateProfileId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `profile-${timestamp}-${random}`;
}

/**
 * Save a new user-defined profile.
 */
export function saveRedactionProfile(
  name: string,
  keptFields: string[],
  redactionConfig: RedactionConfig,
  description?: string
): RedactionProfile {
  const settings = loadContributorSettings();

  const newProfile: RedactionProfile = {
    id: generateProfileId(),
    name,
    description,
    keptFields,
    redactionConfig,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existingProfiles = settings.redactionProfiles || [];
  existingProfiles.push(newProfile);

  // Note: saveContributorSettings will also log, but we want specific profile creation log
  logAuditEvent(
    "contributor",
    "create",
    newProfile.id,
    `Redaction profile created: "${name}"`,
    { name, fieldCount: keptFields.length, description },
    "api"
  );

  saveContributorSettings({
    redactionProfiles: existingProfiles
  });

  return newProfile;
}

/**
 * Delete a user-defined profile.
 */
export function deleteRedactionProfile(profileId: string): boolean {
  if (isBuiltinProfile(profileId)) {
    return false; // Cannot delete built-in profiles
  }

  const settings = loadContributorSettings();
  const existingProfiles = settings.redactionProfiles || [];
  const toDelete = existingProfiles.find((p) => p.id === profileId);
  const filtered = existingProfiles.filter((p) => p.id !== profileId);

  if (filtered.length === existingProfiles.length) {
    return false; // Profile not found
  }

  // If we deleted the active profile, reset to default
  const updates: Partial<ContributorSettings> = {
    redactionProfiles: filtered
  };
  if (settings.activeProfileId === profileId) {
    updates.activeProfileId = DEFAULT_PROFILE_ID;
  }

  logAuditEvent(
    "contributor",
    "delete",
    profileId,
    `Redaction profile deleted: "${toDelete?.name || profileId}"`,
    { name: toDelete?.name, wasActive: settings.activeProfileId === profileId },
    "api"
  );

  saveContributorSettings(updates);
  return true;
}

/**
 * Set the active profile.
 */
export function setActiveProfile(profileId: string): boolean {
  const settings = loadContributorSettings();
  const allProfiles = getAvailableProfiles(settings);
  const newProfile = allProfiles.find((p) => p.id === profileId);

  if (!newProfile) {
    return false; // Profile not found
  }

  const previousProfileId = settings.activeProfileId;
  const previousProfile = allProfiles.find((p) => p.id === previousProfileId);

  logAuditEvent(
    "contributor",
    "update",
    profileId,
    `Active redaction profile changed: "${previousProfile?.name || "(none)"}" → "${newProfile.name}"`,
    { previousProfile: previousProfileId, newProfile: profileId },
    "api"
  );

  saveContributorSettings({ activeProfileId: profileId });
  return true;
}

/**
 * Load saved contributor settings.
 */
export function loadContributorSettings(): ContributorSettings {
  const path = expandPath(SETTINGS_PATH);

  if (!existsSync(path)) {
    return getDefaultContributorSettings();
  }

  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content);
    return {
      ...getDefaultContributorSettings(),
      ...parsed
    };
  } catch {
    return getDefaultContributorSettings();
  }
}

/**
 * Save contributor settings.
 */
export function saveContributorSettings(
  settings: Partial<ContributorSettings>
): ContributorSettings {
  const path = expandPath(SETTINGS_PATH);
  ensureDir(path);

  const existing = loadContributorSettings();
  const updated: ContributorSettings = {
    ...existing,
    ...settings,
    updatedAt: new Date().toISOString()
  };

  writeFileSync(path, JSON.stringify(updated, null, 2) + "\n");

  // Audit logging
  const changedKeys = Object.keys(settings).filter((k) => k !== "updatedAt");
  logAuditEvent(
    "contributor",
    "update",
    "settings",
    `Contributor settings updated: ${changedKeys.join(", ") || "no changes"}`,
    {
      changedFields: changedKeys,
      contributorId: updated.contributorId || null,
      license: updated.license,
      activeProfile: updated.activeProfileId
    },
    "api"
  );

  return updated;
}

/**
 * Load contribution history.
 */
export function loadContributionHistory(): ContributionHistory {
  const path = expandPath(HISTORY_PATH);

  if (!existsSync(path)) {
    return {
      contributions: [],
      totalSessions: 0,
      totalChars: 0
    };
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      contributions: [],
      totalSessions: 0,
      totalChars: 0
    };
  }
}

/**
 * Add a contribution record to history.
 */
export function addContributionRecord(
  record: Omit<ContributionRecord, "id">
): ContributionRecord {
  const path = expandPath(HISTORY_PATH);
  ensureDir(path);

  const history = loadContributionHistory();

  const newRecord: ContributionRecord = {
    ...record,
    id: generateContributionId()
  };

  history.contributions.unshift(newRecord); // Most recent first

  // Update aggregates
  if (record.status === "success") {
    history.totalSessions += record.sessionCount;
    history.totalChars += record.totalChars;
    history.lastContribution = record.timestamp;
    if (!history.firstContribution) {
      history.firstContribution = record.timestamp;
    }
  }

  // Keep last 100 records
  if (history.contributions.length > 100) {
    history.contributions = history.contributions.slice(0, 100);
  }

  writeFileSync(path, JSON.stringify(history, null, 2) + "\n");

  // Audit logging
  logAuditEvent(
    "contributor",
    "export",
    newRecord.id,
    `Data contribution: ${record.sessionCount} sessions to ${record.destination}`,
    {
      sessionCount: record.sessionCount,
      totalChars: record.totalChars,
      destination: record.destination,
      bundleId: record.bundleId,
      status: record.status
    },
    "api"
  );

  return newRecord;
}

/**
 * Update a contribution record status.
 */
export function updateContributionRecord(
  id: string,
  updates: Partial<Pick<ContributionRecord, "status" | "error">>
): ContributionRecord | null {
  const path = expandPath(HISTORY_PATH);
  const history = loadContributionHistory();

  const record = history.contributions.find((r) => r.id === id);
  if (!record) return null;

  const wasSuccess = record.status === "success";
  Object.assign(record, updates);
  const isSuccess = record.status === "success";

  // Update aggregates if status changed to success
  if (!wasSuccess && isSuccess) {
    history.totalSessions += record.sessionCount;
    history.totalChars += record.totalChars;
    history.lastContribution = record.timestamp;
    if (!history.firstContribution) {
      history.firstContribution = record.timestamp;
    }
  }

  writeFileSync(path, JSON.stringify(history, null, 2) + "\n");
  return record;
}

/**
 * Get contribution statistics.
 */
export function getContributionStats(): {
  totalContributions: number;
  successfulContributions: number;
  totalSessions: number;
  totalChars: number;
  firstContribution?: string;
  lastContribution?: string;
  recentContributions: ContributionRecord[];
} {
  const history = loadContributionHistory();

  return {
    totalContributions: history.contributions.length,
    successfulContributions: history.contributions.filter(
      (c) => c.status === "success"
    ).length,
    totalSessions: history.totalSessions,
    totalChars: history.totalChars,
    firstContribution: history.firstContribution,
    lastContribution: history.lastContribution,
    recentContributions: history.contributions.slice(0, 10)
  };
}

function generateContributionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `contrib-${timestamp}-${random}`;
}

/**
 * Known dataset destinations for display.
 */
export const KNOWN_DESTINATIONS = {
  huggingface: {
    name: "Hugging Face",
    defaultDataset: "agentwatch/coding-agent-transcripts",
    url: (dataset: string) => `https://huggingface.co/datasets/${dataset}`,
    description:
      "Public dataset for AI research. Your contributions will be visible to anyone."
  },
  local: {
    name: "Local Export",
    description: "Save to your local filesystem only."
  }
} as const;

/**
 * Get destination info for display.
 */
export function getDestinationInfo(destination: string): {
  name: string;
  url?: string;
  description: string;
  isPublic: boolean;
} {
  if (destination.startsWith("huggingface:")) {
    const dataset = destination.slice("huggingface:".length);
    return {
      name: `Hugging Face: ${dataset}`,
      url: KNOWN_DESTINATIONS.huggingface.url(dataset),
      description: KNOWN_DESTINATIONS.huggingface.description,
      isPublic: true
    };
  }

  if (destination.startsWith("local:")) {
    return {
      name: "Local Export",
      description: KNOWN_DESTINATIONS.local.description,
      isPublic: false
    };
  }

  return {
    name: destination,
    description: "Unknown destination",
    isPublic: false
  };
}

// =============================================================================
// ARTIFACT LINKING
// =============================================================================

const ARTIFACTS_PATH = "~/.agentwatch/artifacts.json";

interface ArtifactsStore {
  /** Session ID -> artifacts mapping */
  bySession: Record<string, SessionArtifacts>;
  /** Last updated */
  updatedAt: string;
}

/**
 * Load all session artifacts.
 */
export function loadSessionArtifacts(): ArtifactsStore {
  const path = expandPath(ARTIFACTS_PATH);

  if (!existsSync(path)) {
    return { bySession: {}, updatedAt: new Date().toISOString() };
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return { bySession: {}, updatedAt: new Date().toISOString() };
  }
}

/**
 * Save session artifacts.
 */
function saveArtifactsStore(store: ArtifactsStore): void {
  const path = expandPath(ARTIFACTS_PATH);
  ensureDir(path);
  store.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n");
}

/**
 * Get artifacts for a specific session.
 */
export function getSessionArtifacts(sessionId: string): ArtifactLink[] {
  const store = loadSessionArtifacts();
  return store.bySession[sessionId]?.artifacts || [];
}

/**
 * Add an artifact link to a session.
 */
export function addSessionArtifact(
  sessionId: string,
  artifact: Omit<ArtifactLink, "addedAt">
): ArtifactLink {
  const store = loadSessionArtifacts();

  const newArtifact: ArtifactLink = {
    ...artifact,
    addedAt: new Date().toISOString()
  };

  if (!store.bySession[sessionId]) {
    store.bySession[sessionId] = {
      sessionId,
      artifacts: [],
      updatedAt: new Date().toISOString()
    };
  }

  store.bySession[sessionId].artifacts.push(newArtifact);
  store.bySession[sessionId].updatedAt = new Date().toISOString();

  saveArtifactsStore(store);

  logAuditEvent(
    "contributor",
    "create",
    sessionId,
    `Artifact linked: ${artifact.type} - ${artifact.url}`,
    { type: artifact.type, url: artifact.url, label: artifact.label },
    "api"
  );

  return newArtifact;
}

/**
 * Remove an artifact link from a session.
 */
export function removeSessionArtifact(
  sessionId: string,
  artifactUrl: string
): boolean {
  const store = loadSessionArtifacts();

  if (!store.bySession[sessionId]) {
    return false;
  }

  const before = store.bySession[sessionId].artifacts.length;
  store.bySession[sessionId].artifacts = store.bySession[
    sessionId
  ].artifacts.filter((a) => a.url !== artifactUrl);
  const after = store.bySession[sessionId].artifacts.length;

  if (before === after) {
    return false;
  }

  store.bySession[sessionId].updatedAt = new Date().toISOString();
  saveArtifactsStore(store);

  logAuditEvent(
    "contributor",
    "delete",
    sessionId,
    `Artifact unlinked: ${artifactUrl}`,
    { url: artifactUrl },
    "api"
  );

  return true;
}

/**
 * Get all sessions that have artifacts linked.
 */
export function getSessionsWithArtifacts(): string[] {
  const store = loadSessionArtifacts();
  return Object.keys(store.bySession).filter((id) => {
    const session = store.bySession[id];
    return session && session.artifacts.length > 0;
  });
}

/**
 * Parse a URL to detect artifact type.
 */
export function detectArtifactType(url: string): ArtifactType {
  if (url.includes("github.com")) {
    if (url.includes("/pull/")) return "github_pr";
    if (url.includes("/commit/")) return "github_commit";
    if (url.includes("/issues/")) return "github_issue";
    return "github_repo";
  }
  if (url.startsWith("file://") || url.startsWith("/")) return "file";
  if (url.startsWith("http://") || url.startsWith("https://")) return "url";
  return "other";
}
