/**
 * Self-documentation registry for UI components.
 */

interface SelfDocEntry {
  title?: string;
  reads?: { path: string; description: string }[];
  writes?: { path: string; description: string }[];
  tests?: string[];
  calculations?: string[];
  notes?: string[];
}

export const SELF_DOCS: Record<string, SelfDocEntry> = {};
