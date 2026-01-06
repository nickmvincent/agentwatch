/**
 * Enrichment store for session annotations (watcher-only subset).
 *
 * Persists manual annotations and related enrichments on disk so
 * one-off watcher edits remain available across restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  canonicalizeSessionRef,
  type EnrichmentStore,
  type FeedbackType,
  type ManualAnnotationEnrichment,
  type SessionEnrichments,
  type SessionRef,
  type WorkflowStatus
} from "@agentwatch/core";

const STORE_PATH = "~/.agentwatch/enrichments/store.json";

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

export function loadEnrichmentStore(): EnrichmentStore {
  const path = expandPath(STORE_PATH);
  if (!existsSync(path)) {
    return {
      sessions: {},
      meta: {
        version: 1,
        updatedAt: new Date().toISOString(),
        enrichmentCounts: {
          autoTags: 0,
          outcomeSignals: 0,
          qualityScore: 0,
          manualAnnotation: 0,
          loopDetection: 0,
          diffSnapshot: 0
        }
      }
    };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return {
      sessions: data.sessions || {},
      meta: {
        version: data.meta?.version || 1,
        updatedAt: data.meta?.updatedAt || new Date().toISOString(),
        enrichmentCounts: data.meta?.enrichmentCounts || {
          autoTags: 0,
          outcomeSignals: 0,
          qualityScore: 0,
          manualAnnotation: 0,
          loopDetection: 0,
          diffSnapshot: 0
        }
      }
    };
  } catch {
    return {
      sessions: {},
      meta: {
        version: 1,
        updatedAt: new Date().toISOString(),
        enrichmentCounts: {
          autoTags: 0,
          outcomeSignals: 0,
          qualityScore: 0,
          manualAnnotation: 0,
          loopDetection: 0,
          diffSnapshot: 0
        }
      }
    };
  }
}

export function saveEnrichmentStore(store: EnrichmentStore): void {
  const path = expandPath(STORE_PATH);
  ensureDir(path);
  store.meta.updatedAt = new Date().toISOString();

  store.meta.enrichmentCounts = {
    autoTags: 0,
    outcomeSignals: 0,
    qualityScore: 0,
    manualAnnotation: 0,
    loopDetection: 0,
    diffSnapshot: 0
  };
  for (const session of Object.values(store.sessions)) {
    if (session.autoTags) store.meta.enrichmentCounts.autoTags++;
    if (session.outcomeSignals) store.meta.enrichmentCounts.outcomeSignals++;
    if (session.qualityScore) store.meta.enrichmentCounts.qualityScore++;
    if (session.manualAnnotation)
      store.meta.enrichmentCounts.manualAnnotation++;
    if (session.loopDetection) store.meta.enrichmentCounts.loopDetection++;
    if (session.diffSnapshot) store.meta.enrichmentCounts.diffSnapshot++;
  }

  writeFileSync(path, JSON.stringify(store, null, 2));
}

function getCanonicalId(ref: SessionRef): string {
  return canonicalizeSessionRef(ref);
}

export function getEnrichments(ref: SessionRef): SessionEnrichments | null {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);

  if (store.sessions[id]) {
    return store.sessions[id];
  }

  if (ref.hookSessionId && !ref.correlationId) {
    const altId = `corr:${ref.hookSessionId}`;
    if (store.sessions[altId]) {
      return store.sessions[altId];
    }
  }

  return null;
}

export function getAllEnrichments(): Record<string, SessionEnrichments> {
  const store = loadEnrichmentStore();
  return store.sessions;
}

export function setManualAnnotation(
  ref: SessionRef,
  feedback: FeedbackType,
  options?: {
    notes?: string;
    userTags?: string[];
    extraData?: Record<string, unknown>;
    rating?: number;
    taskDescription?: string;
    goalAchieved?: boolean;
    workflowStatus?: WorkflowStatus;
  }
): SessionEnrichments {
  const store = loadEnrichmentStore();
  const id = getCanonicalId(ref);
  const now = new Date().toISOString();

  const existing = store.sessions[id];

  if (!store.sessions[id]) {
    store.sessions[id] = { sessionRef: ref, updatedAt: now };
  }

  const existingAnnotation = existing?.manualAnnotation;
  const enrichment: ManualAnnotationEnrichment = {
    feedback,
    notes: options?.notes ?? existingAnnotation?.notes,
    userTags: options?.userTags ?? existingAnnotation?.userTags ?? [],
    extraData: options?.extraData ?? existingAnnotation?.extraData,
    rating: options?.rating ?? existingAnnotation?.rating,
    taskDescription:
      options?.taskDescription ?? existingAnnotation?.taskDescription,
    goalAchieved: options?.goalAchieved ?? existingAnnotation?.goalAchieved,
    workflowStatus:
      options?.workflowStatus ?? existingAnnotation?.workflowStatus,
    updatedAt: now
  };

  store.sessions[id].manualAnnotation = enrichment;
  store.sessions[id].updatedAt = now;
  saveEnrichmentStore(store);

  return store.sessions[id];
}

export function getEnrichmentStats(): {
  totalSessions: number;
  byType: EnrichmentStore["meta"]["enrichmentCounts"];
  annotated: { positive: number; negative: number; unlabeled: number };
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
} {
  const store = loadEnrichmentStore();

  const stats = {
    totalSessions: Object.keys(store.sessions).length,
    byType: store.meta.enrichmentCounts,
    annotated: { positive: 0, negative: 0, unlabeled: 0 },
    qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 }
  };

  for (const session of Object.values(store.sessions)) {
    if (session.manualAnnotation?.feedback === "positive") {
      stats.annotated.positive++;
    } else if (session.manualAnnotation?.feedback === "negative") {
      stats.annotated.negative++;
    } else {
      stats.annotated.unlabeled++;
    }

    if (session.qualityScore) {
      const score = session.qualityScore.overall;
      if (score >= 80) stats.qualityDistribution.excellent++;
      else if (score >= 60) stats.qualityDistribution.good++;
      else if (score >= 40) stats.qualityDistribution.fair++;
      else stats.qualityDistribution.poor++;
    }
  }

  return stats;
}
