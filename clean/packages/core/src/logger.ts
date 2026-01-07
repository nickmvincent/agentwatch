import { appendJsonl } from "./jsonl";
import { createId } from "./ids";
import { SCHEMA_VERSION, type SignificantEvent, type VerboseLogEntry } from "./types";

export type VerboseLogger = {
  log: (
    kind: string,
    payload: Record<string, unknown>,
    trace?: VerboseLogEntry["trace"]
  ) => Promise<VerboseLogEntry>;
};

export function createVerboseLogger(options: {
  service: string;
  logPath: string;
}): VerboseLogger {
  return {
    async log(kind, payload, trace) {
      const entry: VerboseLogEntry = {
        schema_version: SCHEMA_VERSION,
        id: createId("log"),
        timestamp: new Date().toISOString(),
        source: options.service,
        kind,
        payload,
        trace
      };
      await appendJsonl(options.logPath, entry);
      return entry;
    }
  };
}

export function deriveSignificantEvent(
  entry: VerboseLogEntry,
  summaryOverrides: Record<string, string> = {}
): SignificantEvent {
  const summary = summaryOverrides[entry.kind] ?? entry.kind.replace(/[._]/g, " ");
  return {
    schema_version: SCHEMA_VERSION,
    id: createId("event"),
    timestamp: entry.timestamp,
    source: entry.source,
    event: entry.kind,
    summary,
    ref: { kind: entry.kind, id: entry.id },
    payload: entry.payload
  };
}

export async function logSignificantEvent(
  filePath: string,
  event: SignificantEvent
): Promise<void> {
  await appendJsonl(filePath, event);
}
