export const SCHEMA_VERSION = "v1" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

export type VerboseLogEntry = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  source: string;
  kind: string;
  payload: Record<string, unknown>;
  trace?: {
    runId?: string;
    sessionId?: string;
  };
};

export type SignificantEvent = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  source: string;
  event: string;
  summary: string;
  ref?: {
    kind: string;
    id: string;
  };
  payload?: Record<string, unknown>;
};

export type Enrichment = {
  schema_version: SchemaVersion;
  id: string;
  timestamp: string;
  subject: {
    kind: string;
    id: string;
  };
  data: Record<string, unknown>;
};

export type RouteDoc = {
  id: string;
  service: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  requestSchema?: string;
  responseSchema?: string;
};
