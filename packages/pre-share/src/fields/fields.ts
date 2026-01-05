/**
 * Field stripping logic for removing unwanted fields from transcript data.
 */

import type { FieldCategory, FieldSchema } from "../types/sanitizer";
import { FIELD_SCHEMAS } from "./schemas";

// Re-export FIELD_SCHEMAS
export { FIELD_SCHEMAS };

/**
 * Get fields applicable to a specific source.
 */
export function getFieldsForSource(source: string): FieldSchema[] {
  return FIELD_SCHEMAS.filter((f) => f.source === "all" || f.source === source);
}

/**
 * Get default selected fields (essential + recommended).
 */
export function getDefaultSelectedFields(source: string): string[] {
  return getFieldsForSource(source)
    .filter((f) => f.category === "essential" || f.category === "recommended")
    .map((f) => f.path);
}

/**
 * Group fields by category for UI display.
 */
export function groupFieldsByCategory(
  source: string
): Record<FieldCategory, FieldSchema[]> {
  const fields = getFieldsForSource(source);
  return {
    essential: fields.filter((f) => f.category === "essential"),
    recommended: fields.filter((f) => f.category === "recommended"),
    optional: fields.filter((f) => f.category === "optional"),
    strip: fields.filter((f) => f.category === "strip"),
    content_heavy: fields.filter((f) => f.category === "content_heavy"),
    always_strip: fields.filter((f) => f.category === "always_strip")
  };
}

/**
 * Build a set of field paths to strip based on user selection.
 * If selectedFields is provided, it's treated as the whitelist of fields to KEEP.
 * Any field NOT in selectedFields will be stripped (for dynamic field support).
 */
export function buildStripSet(
  selectedFields: string[],
  source: string
): Set<string> {
  const stripSet = new Set<string>();
  const schemaFields = getFieldsForSource(source);

  // Always strip these regardless of selection
  for (const field of schemaFields) {
    if (field.category === "always_strip") {
      stripSet.add(field.path);
    }
  }

  // For schema fields not in selectedFields, add to strip set
  for (const field of schemaFields) {
    if (
      field.category !== "always_strip" &&
      !selectedFields.includes(field.path)
    ) {
      stripSet.add(field.path);
    }
  }

  return stripSet;
}

/**
 * Build a whitelist of fields to KEEP (for dynamic field stripping).
 * Returns the set of field paths that should be kept.
 */
export function buildKeepSet(selectedFields: string[]): Set<string> {
  return new Set(selectedFields);
}

/**
 * Check if an actual path matches a pattern (supports * wildcards).
 */
export function pathMatches(actualPath: string, pattern: string): boolean {
  const patternParts = pattern.split(".");
  const actualParts = actualPath.split(".");

  let pi = 0;
  let ai = 0;

  while (pi < patternParts.length && ai < actualParts.length) {
    const pp = patternParts[pi];
    const ap = actualParts[ai];

    if (pp === "*") {
      // Wildcard matches exactly one segment
      pi++;
      ai++;
    } else if (pp === ap) {
      pi++;
      ai++;
    } else {
      return false;
    }
  }

  return pi === patternParts.length && ai === actualParts.length;
}

/**
 * Strip fields from an object based on the strip set (blacklist).
 */
export function stripFields(
  obj: unknown,
  stripSet: Set<string>,
  currentPath = ""
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      stripFields(item, stripSet, currentPath ? `${currentPath}.*` : "*")
    );
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;

    // Check if this path should be stripped
    let shouldStrip = false;
    for (const pattern of stripSet) {
      if (pathMatches(fieldPath, pattern)) {
        shouldStrip = true;
        break;
      }
    }

    if (shouldStrip) {
      continue; // Skip this field
    }

    // Recursively process nested objects
    result[key] = stripFields(value, stripSet, fieldPath);
  }

  return result;
}

/**
 * Check if a keepPath is a leaf (no more specific paths exist in keepSet).
 * E.g., "messages" is NOT a leaf if "messages[].role" exists.
 */
function isLeafPath(keepPath: string, keepSet: Set<string>): boolean {
  const normalizedKeepPath = keepPath
    .replace(/\[\]/g, "")
    .replace(/^\.+|\.+$/g, "");
  for (const other of keepSet) {
    if (other === keepPath) continue;
    const normalizedOther = other
      .replace(/\[\]/g, "")
      .replace(/^\.+|\.+$/g, "");
    // Check if there's a more specific path
    if (normalizedOther.startsWith(normalizedKeepPath + ".")) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a field path should be kept based on the whitelist.
 * A path is kept if:
 * 1. It exactly matches an entry in keepSet
 * 2. It's a parent of an entry in keepSet (e.g., "session" if "session.id" is in keepSet)
 * 3. It's a child of a LEAF entry in keepSet (e.g., "session.id.nested" if "session" is a leaf in keepSet)
 *    - This prevents keeping all children when specific children are selected
 */
function shouldKeepPath(fieldPath: string, keepSet: Set<string>): boolean {
  // Normalize path - remove array markers for comparison, and leading/trailing dots
  const normalizedPath = fieldPath
    .replace(/\.\*/g, "")
    .replace(/\[\]/g, "")
    .replace(/^\.+|\.+$/g, "");

  for (const keepPath of keepSet) {
    const normalizedKeepPath = keepPath
      .replace(/\[\]/g, "")
      .replace(/^\.+|\.+$/g, "");

    // Exact match
    if (normalizedPath === normalizedKeepPath) return true;

    // Field is a parent of kept path (keep parents to allow drilling down)
    if (normalizedKeepPath.startsWith(normalizedPath + ".")) return true;

    // Field is a child of kept path - ONLY if keepPath is a leaf
    // This prevents "messages" from keeping all children when specific fields like "messages[].role" are selected
    if (
      normalizedPath.startsWith(normalizedKeepPath + ".") &&
      isLeafPath(keepPath, keepSet)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Strip fields using whitelist mode - only keep fields in the keepSet.
 * This is used when user has explicitly selected which fields to keep.
 */
export function stripFieldsWhitelist(
  obj: unknown,
  keepSet: Set<string>,
  alwaysStripSet: Set<string>,
  currentPath = ""
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      stripFieldsWhitelist(
        item,
        keepSet,
        alwaysStripSet,
        currentPath ? `${currentPath}[]` : "[]"
      )
    );
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;

    // Always strip these fields (e.g., base64 image data)
    let shouldAlwaysStrip = false;
    for (const pattern of alwaysStripSet) {
      if (pathMatches(fieldPath, pattern)) {
        shouldAlwaysStrip = true;
        break;
      }
    }
    if (shouldAlwaysStrip) {
      continue;
    }

    // Check if this path should be kept (whitelist mode)
    if (!shouldKeepPath(fieldPath, keepSet)) {
      continue; // Skip this field - not in whitelist
    }

    // Recursively process nested objects
    result[key] = stripFieldsWhitelist(
      value,
      keepSet,
      alwaysStripSet,
      fieldPath
    );
  }

  return result;
}
