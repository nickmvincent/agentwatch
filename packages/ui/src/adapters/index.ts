/**
 * Backend adapters for connecting UI components to different data sources.
 */

export * from "./types";
export { AdapterProvider, useAdapter, useBackend } from "./context";
export { createWorkerAdapter, type WorkerAdapter } from "./worker-adapter";
