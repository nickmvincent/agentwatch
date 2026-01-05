/**
 * Field stripping module for removing unwanted fields from transcript data.
 */

export {
  FIELD_SCHEMAS,
  CONTENT_HEAVY_FIELDS,
  isContentHeavyField
} from "./schemas";
export {
  getFieldsForSource,
  getDefaultSelectedFields,
  groupFieldsByCategory,
  buildStripSet,
  buildKeepSet,
  pathMatches,
  stripFields,
  stripFieldsWhitelist
} from "./fields";
