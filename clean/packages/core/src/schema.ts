import { z } from "zod";
import { SCHEMA_VERSION } from "./types";

const schemaVersion = z.literal(SCHEMA_VERSION);

export const VerboseLogEntrySchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  kind: z.string().min(1),
  payload: z.record(z.unknown()),
  trace: z
    .object({
      runId: z.string().optional(),
      sessionId: z.string().optional()
    })
    .optional()
});

export const SignificantEventSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  event: z.string().min(1),
  summary: z.string().min(1),
  ref: z
    .object({
      kind: z.string().min(1),
      id: z.string().min(1)
    })
    .optional(),
  payload: z.record(z.unknown()).optional()
});

export const EnrichmentSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  timestamp: z.string().min(1),
  subject: z.object({
    kind: z.string().min(1),
    id: z.string().min(1)
  }),
  data: z.record(z.unknown())
});
