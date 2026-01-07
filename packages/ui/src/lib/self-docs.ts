/**
 * Self-documentation registry for UI components.
 * Components can look up their documentation by componentId.
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
