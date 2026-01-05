# @agentwatch/pre-share

Sanitization, field stripping, and preparation pipeline for sharing coding agent transcripts.

This package provides everything needed to safely prepare AI coding session transcripts for sharing:
- **Redaction** - Remove API keys, tokens, PII, and file paths using configurable patterns
- **Field stripping** - Select which transcript fields to include/exclude
- **Preparation pipeline** - Unified workflow: strip fields, sanitize, score, check for residue
- **Output formats** - Generate JSONL, markdown, or ZIP bundles
- **Pattern management** - View, test, and customize redaction patterns

## Installation

```bash
bun add @agentwatch/pre-share
# or
npm install @agentwatch/pre-share
```

## Quick Start

```typescript
import { prepareSessions, getDefaultContributor } from "@agentwatch/pre-share";

// Prepare sessions for sharing
const result = await prepareSessions(sessions, {
  redaction: {
    redactSecrets: true,
    redactPii: true,
    redactPaths: true,
    enableHighEntropy: true,
  },
  contributor: getDefaultContributor(),
});

console.log(`Prepared ${result.stats.totalSessions} sessions`);
console.log(`Redacted ${result.redactionReport.totalRedactions} items`);
```

## Core Modules

### Sanitizer

Redact sensitive data using pattern matching and entropy detection.

```typescript
import { TranscriptSanitizer, createSanitizer } from "@agentwatch/pre-share";

// Full control
const sanitizer = new TranscriptSanitizer();
const redacted = sanitizer.redactText("My API key is sk-abc123...");
// "My API key is <API_KEY_1>"

// With options
const sanitizer = createSanitizer({
  redactSecrets: true,
  redactPii: true,
  redactPaths: false,
  enableHighEntropy: true,
  customRegex: ["INTERNAL-\\d+-SECRET"],
});
```

**Built-in pattern categories:**
- `secrets` - API keys (OpenAI, Anthropic, GitHub, HuggingFace, AWS)
- `pii` - Email, phone, SSN, IP addresses
- `paths` - Unix/Windows paths with usernames
- `credentials` - Passwords, tokens in assignments
- `network` - Database connection strings, URLs with auth

### Pattern Management

View, test, and customize redaction patterns.

```typescript
import {
  PatternManager,
  testPattern,
  generateSampleText,
  getPatternDefinitions
} from "@agentwatch/pre-share";

// View all built-in patterns
const patterns = getPatternDefinitions();

// Test patterns against sample text
const sample = generateSampleText();
const result = testPattern(patterns[0], sample);
console.log(`Found ${result.matchCount} matches`);

// Create a custom pattern manager
const manager = new PatternManager();

// Add custom patterns
manager.addCustomPattern({
  name: "internal_id",
  placeholder: "INTERNAL_ID",
  regex: ["INTERNAL-\\d{6}"],
  category: "secrets",
});

// Build pattern set for sanitizer
const patternSet = manager.buildPatternSet({ categories: ["secrets"] });
```

### Fields

Control which transcript fields are included in exports.

```typescript
import {
  getDefaultFieldSelection,
  getFieldSchemasByCategory,
  stripFields
} from "@agentwatch/pre-share";

// Get categorized field schemas
const schemas = getFieldSchemasByCategory();
// schemas.essential - Always included (role, type, timestamp)
// schemas.recommended - Default included (content, model, usage)
// schemas.optional - User choice (tool parameters, metadata)
// schemas.strip - Default excluded (internal IDs)
// schemas.always_strip - Never included (cost details)

// Get default fields to include
const fields = getDefaultFieldSelection("claude");

// Strip fields from data
const stripped = stripFields(sessionData, selectedFields);
```

### Pipeline

Unified preparation workflow.

```typescript
import {
  prepareSessions,
  prepareSession,
  toContribSessions,
  generatePrepReport
} from "@agentwatch/pre-share";

// Full pipeline
const result = await prepareSessions(rawSessions, {
  redaction: { redactSecrets: true, redactPii: true, redactPaths: true },
  contributor: { contributorId: "user123", license: "CC-BY-4.0" },
  selectedFields: ["type", "role", "content", "model"],
});

// Result includes:
// - sessions: Prepared sessions with sanitized data
// - redactionReport: Counts, categories, warnings
// - strippedFields: Fields that were removed
// - stats: Total sessions, redactions, average score
// - blocked: Whether submission should be blocked
// - residueWarnings: Any remaining sensitive data warnings

// Convert to contribution format
const contribSessions = toContribSessions(result.sessions, contributor);

// Generate report
const report = generatePrepReport(result, config, bundleId);
```

### Output

Generate output in various formats.

```typescript
import {
  createBundle,
  sessionsToJsonl,
  sessionsToMarkdown
} from "@agentwatch/pre-share";

// JSONL format
const jsonl = sessionsToJsonl(contribSessions);

// Markdown format
const markdown = sessionsToMarkdown(contribSessions, { includeMetadata: true });

// ZIP bundle
const zipBuffer = await createBundle(contribSessions, {
  includeReport: true,
  includeMarkdown: true,
});
```

## Patterns File

Redaction patterns are defined in `src/sanitizer/patterns.json` for easy auditing:

```json
{
  "version": "1.0.0",
  "patterns": [
    {
      "name": "openai_key",
      "placeholder": "API_KEY",
      "regex": ["\\bsk-[a-zA-Z0-9]{20,}\\b"],
      "category": "secrets",
      "description": "OpenAI API keys"
    }
  ]
}
```

## API Reference

### Types

```typescript
// Pattern definition
interface PatternDefinition {
  name: string;
  placeholder: string;
  regex: string[];
  category: "secrets" | "pii" | "paths" | "credentials" | "network";
  description?: string;
  enabled?: boolean;
}

// Redaction options
interface RedactionOptions {
  redactSecrets?: boolean;
  redactPii?: boolean;
  redactPaths?: boolean;
  redactCredentials?: boolean;
  redactNetwork?: boolean;
  enableHighEntropy?: boolean;
  maskCodeBlocks?: boolean;
  customRegex?: string[];
}

// Contributor info
interface ContributorInfo {
  contributorId: string;
  license: string;
  aiPreference?: string;
  rightsStatement?: string;
  rightsConfirmed?: boolean;
  reviewedConfirmed?: boolean;
}
```

See `src/types/` for complete type definitions.

## Testing

```bash
bun test
```

## License

MIT
