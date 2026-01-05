// ../packages/pre-share/dist/browser/index.js
function calculateEntropy(s) {
  if (!s)
    return 0;
  const freq = new Map;
  for (const char of s) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }
  const length = s.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
function isHighEntropy(s, minLength = 20, minEntropy = 4) {
  if (s.length < minLength) {
    return false;
  }
  if (/^[a-f0-9]+$/i.test(s)) {
    return false;
  }
  if (/^\d+$/.test(s) || /^[a-zA-Z]+$/.test(s)) {
    return false;
  }
  const keyChars = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_");
  if (![...s].every((c) => keyChars.has(c))) {
    return false;
  }
  return calculateEntropy(s) >= minEntropy;
}
function redactHighEntropyStrings(text, getPlaceholder, minLength = 20, minEntropy = 4) {
  const pattern = /\b[A-Za-z0-9+/=_-]{20,}\b/g;
  let count = 0;
  const result = text.replace(pattern, (match) => {
    if (isHighEntropy(match, minLength, minEntropy)) {
      count++;
      return getPlaceholder(match);
    }
    return match;
  });
  return { text: result, count };
}
var patterns_default = {
  version: "1.0.0",
  patterns: [
    {
      name: "openai_key",
      placeholder: "API_KEY",
      regex: [
        "\\bsk-[a-zA-Z0-9]{20,}\\b",
        "\\bsk-proj-[a-zA-Z0-9_-]{20,}\\b"
      ],
      category: "secrets",
      description: "OpenAI API keys"
    },
    {
      name: "anthropic_key",
      placeholder: "API_KEY",
      regex: ["\\bsk-ant-[a-zA-Z0-9_-]{10,}\\b"],
      category: "secrets",
      description: "Anthropic API keys"
    },
    {
      name: "github_token",
      placeholder: "GITHUB_TOKEN",
      regex: ["\\b(ghp|gho|ghs|ghu|github_pat)_[a-zA-Z0-9]{22,255}\\b"],
      category: "secrets",
      description: "GitHub personal access tokens and OAuth tokens"
    },
    {
      name: "huggingface_token",
      placeholder: "HF_TOKEN",
      regex: ["\\bhf_[a-zA-Z0-9]{20,}\\b"],
      category: "secrets",
      description: "HuggingFace API tokens"
    },
    {
      name: "aws_key_id",
      placeholder: "AWS_KEY_ID",
      regex: ["\\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\\b"],
      category: "secrets",
      description: "AWS Access Key IDs"
    },
    {
      name: "aws_secret",
      placeholder: "AWS_SECRET",
      regex: ['(?<=["\\s=:])[A-Za-z0-9/+=]{40}(?=["\\s,\\n]|$)'],
      category: "secrets",
      description: "AWS Secret Access Keys (40 char base64)"
    },
    {
      name: "slack_token",
      placeholder: "SLACK_TOKEN",
      regex: [
        "\\b(xox[aboprs])-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}\\b",
        "\\b(xox[aboprs])-[0-9A-Za-z-]{24,}\\b"
      ],
      category: "secrets",
      description: "Slack API tokens"
    },
    {
      name: "jwt",
      placeholder: "JWT",
      regex: ["\\beyJ[a-zA-Z0-9_-]*\\.eyJ[a-zA-Z0-9_-]*\\.[a-zA-Z0-9_-]*\\b"],
      category: "secrets",
      description: "JSON Web Tokens"
    },
    {
      name: "private_key",
      placeholder: "PRIVATE_KEY",
      regex: [
        "-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----[\\s\\S]*?-----END (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----",
        "-----BEGIN PGP PRIVATE KEY BLOCK-----[\\s\\S]*?-----END PGP PRIVATE KEY BLOCK-----"
      ],
      category: "secrets",
      description: "RSA, DSA, EC, OpenSSH, and PGP private keys"
    },
    {
      name: "credential_assignment",
      placeholder: "CREDENTIAL",
      regex: [
        `(password|passwd|pwd|secret|token|api_key|apikey|auth_token|access_token|private_key|client_secret)\\s*[:=]\\s*["']?[^\\s"']{8,}["']?`
      ],
      category: "credentials",
      description: "Password and credential assignments in code/config"
    },
    {
      name: "db_connection",
      placeholder: "DB_CONN",
      regex: [
        "(?:mongodb|postgres|postgresql|mysql|redis|amqp)://[^\\s]+",
        "Server=[^;]+;.*(?:Password|Pwd)=[^;]+"
      ],
      category: "credentials",
      description: "Database connection strings"
    },
    {
      name: "url_with_auth",
      placeholder: "URL",
      regex: ["https?://[^:]+:[^@]+@[^\\s]+"],
      category: "credentials",
      description: "URLs with embedded credentials"
    },
    {
      name: "email",
      placeholder: "EMAIL",
      regex: ["[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"],
      category: "pii",
      description: "Email addresses"
    },
    {
      name: "phone",
      placeholder: "PHONE",
      regex: [
        "\\+?1?[-.\\s]?\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4}\\b",
        "\\+[0-9]{1,3}[-.\\s]?[0-9]{1,4}[-.\\s]?[0-9]{1,4}[-.\\s]?[0-9]{1,9}\\b"
      ],
      category: "pii",
      description: "Phone numbers (US and international formats)"
    },
    {
      name: "ssn",
      placeholder: "SSN",
      regex: ["\\b\\d{3}-\\d{2}-\\d{4}\\b"],
      category: "pii",
      description: "US Social Security Numbers"
    },
    {
      name: "ipv4",
      placeholder: "IP",
      regex: [
        "\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b"
      ],
      category: "network",
      description: "IPv4 addresses"
    },
    {
      name: "ipv6",
      placeholder: "IP",
      regex: ["\\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\b"],
      category: "network",
      description: "IPv6 addresses"
    },
    {
      name: "unix_path",
      placeholder: "PATH",
      regex: ['\\/(?:home|Users)\\/[a-zA-Z0-9_-]+(?:\\/[^\\s:*?"<>|]*)*'],
      category: "paths",
      description: "Unix paths with usernames (/home/user, /Users/user)"
    },
    {
      name: "windows_path",
      placeholder: "PATH",
      regex: [
        '[A-Za-z]:\\\\Users\\\\[a-zA-Z0-9_-]+(?:\\\\[^\\s:*?"<>|]*)*',
        '[A-Za-z]:\\\\Documents and Settings\\\\[a-zA-Z0-9_-]+(?:\\\\[^\\s:*?"<>|]*)*'
      ],
      category: "paths",
      description: "Windows paths with usernames"
    }
  ]
};
function definitionToConfig(def) {
  return {
    placeholder: def.placeholder,
    regex: def.regex.map((r) => new RegExp(r, "g")),
    category: def.category
  };
}
function loadPatternsFromJson() {
  const data = patterns_default;
  const result = {};
  for (const pattern of data.patterns) {
    if (pattern.enabled !== false) {
      result[pattern.name] = definitionToConfig(pattern);
    }
  }
  return result;
}
var DEFAULT_PATTERNS = loadPatternsFromJson();
function getPatternDefinitions() {
  const data = patterns_default;
  return data.patterns;
}
function createCustomPattern(label, pattern) {
  try {
    const regex = new RegExp(pattern, "g");
    return {
      placeholder: label.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      regex: [regex],
      category: "secrets"
    };
  } catch {
    return null;
  }
}
class TranscriptSanitizer {
  patterns;
  customPatterns = [];
  placeholderCounters = new Map;
  valueToPlaceholder = new Map;
  placeholderToInfo = new Map;
  redactionCounts = new Map;
  warnings = new Set;
  config;
  totalStringsTouched = 0;
  constructor(config = {}) {
    this.patterns = config.patterns ?? DEFAULT_PATTERNS;
    this.config = {
      patterns: this.patterns,
      enableHighEntropy: config.enableHighEntropy ?? true,
      highEntropyMinLength: config.highEntropyMinLength ?? 20,
      highEntropyThreshold: config.highEntropyThreshold ?? 4,
      enableResidueCheck: config.enableResidueCheck ?? true,
      customRegex: config.customRegex ?? []
    };
    for (const custom of this.config.customRegex) {
      const pattern = createCustomPattern(custom.label, custom.pattern);
      if (pattern) {
        this.customPatterns.push(pattern);
      } else {
        this.warnings.add(`Invalid custom regex: ${custom.pattern}`);
      }
    }
  }
  getPlaceholder(category, value, prefix, ruleName = category) {
    if (this.valueToPlaceholder.has(value)) {
      return this.valueToPlaceholder.get(value);
    }
    const count = (this.placeholderCounters.get(prefix) || 0) + 1;
    this.placeholderCounters.set(prefix, count);
    const placeholder = `<${prefix}_${count}>`;
    this.valueToPlaceholder.set(value, placeholder);
    this.redactionCounts.set(category, (this.redactionCounts.get(category) || 0) + 1);
    this.placeholderToInfo.set(placeholder, {
      placeholder,
      category,
      ruleName,
      originalLength: value.length
    });
    return placeholder;
  }
  redactText(text) {
    if (typeof text !== "string") {
      return text;
    }
    let result = text;
    let touched = false;
    for (const [patternName, config] of Object.entries(this.patterns)) {
      for (const regex of config.regex) {
        const re = new RegExp(regex.source, regex.flags);
        const before = result;
        result = result.replace(re, (match) => this.getPlaceholder(config.category, match, config.placeholder, patternName));
        if (result !== before) {
          touched = true;
        }
      }
    }
    for (const config of this.customPatterns) {
      for (const regex of config.regex) {
        const re = new RegExp(regex.source, regex.flags);
        const before = result;
        result = result.replace(re, (match) => this.getPlaceholder("custom", match, config.placeholder, config.placeholder));
        if (result !== before) {
          touched = true;
        }
      }
    }
    if (this.config.enableHighEntropy) {
      const { text: entropyResult, count } = redactHighEntropyStrings(result, (value) => {
        this.warnings.add("High-entropy token detected and redacted");
        return this.getPlaceholder("high_entropy", value, "KEY", "high_entropy");
      }, this.config.highEntropyMinLength, this.config.highEntropyThreshold);
      if (count > 0) {
        touched = true;
      }
      result = entropyResult;
    }
    if (touched) {
      this.totalStringsTouched++;
    }
    return result;
  }
  redactObject(obj) {
    if (typeof obj === "string") {
      return this.redactText(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item));
    }
    if (obj && typeof obj === "object") {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactObject(value);
      }
      return result;
    }
    return obj;
  }
  getReport() {
    return {
      totalRedactions: [...this.redactionCounts.values()].reduce((a, b) => a + b, 0),
      countsByCategory: Object.fromEntries(this.redactionCounts),
      placeholderCount: this.valueToPlaceholder.size,
      warnings: [...this.warnings],
      timestamp: new Date().toISOString(),
      enabledCategories: [
        ...Object.keys(this.patterns),
        ...this.customPatterns.length > 0 ? ["custom"] : [],
        ...this.config.enableHighEntropy ? ["high_entropy"] : []
      ],
      residueWarnings: [],
      blocked: false
    };
  }
  getTotalStringsTouched() {
    return this.totalStringsTouched;
  }
  getRedactionInfoMap() {
    return Object.fromEntries(this.placeholderToInfo);
  }
  reset() {
    this.placeholderCounters.clear();
    this.valueToPlaceholder.clear();
    this.placeholderToInfo.clear();
    this.redactionCounts.clear();
    this.warnings.clear();
    this.totalStringsTouched = 0;
  }
}
function createSanitizer(config) {
  const patterns2 = {};
  for (const [name, pattern] of Object.entries(DEFAULT_PATTERNS)) {
    const include = config.redactSecrets && (pattern.category === "secrets" || pattern.category === "credentials") || config.redactPii && (pattern.category === "pii" || pattern.category === "network") || config.redactPaths && pattern.category === "paths";
    if (include) {
      patterns2[name] = pattern;
    }
  }
  if (config.maskCodeBlocks) {
    patterns2["code_block"] = {
      placeholder: "CODE_BLOCK",
      regex: [/```[\s\S]*?```/g],
      category: "secrets"
    };
  }
  const customRegex = (config.customRegex || []).filter(Boolean).map((pattern, index) => ({
    label: `USER_REGEX_${index + 1}`,
    pattern
  }));
  return new TranscriptSanitizer({
    patterns: patterns2,
    customRegex,
    enableHighEntropy: config.enableHighEntropy ?? true
  });
}
var BLOCKING_PATTERNS = {
  privateKey: /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]+?-----END [^-]+ PRIVATE KEY-----/
};
var WARNING_PATTERNS = {
  tokenLike: /(sk-[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{10,}|hf_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})/,
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
};
function residueCheck(strings) {
  const warnings = [];
  let blocked = false;
  let tokenHits = 0;
  let emailHits = 0;
  for (const text of strings) {
    if (BLOCKING_PATTERNS.privateKey.test(text)) {
      blocked = true;
    }
    if (WARNING_PATTERNS.tokenLike.test(text)) {
      tokenHits++;
    }
    if (WARNING_PATTERNS.email.test(text)) {
      emailHits++;
    }
  }
  if (blocked) {
    warnings.push("Private key material still detected. Submission is blocked.");
  }
  if (tokenHits > 0) {
    warnings.push("Token-like strings remain. Review sanitized output.");
  }
  if (emailHits > 0) {
    warnings.push("Email-like strings remain. Review sanitized output.");
  }
  return { blocked, warnings };
}
function collectStrings(value, bucket) {
  if (typeof value === "string") {
    bucket.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, bucket);
    }
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectStrings(entry, bucket);
    }
  }
}
var FIELD_SCHEMAS = [
  {
    path: "type",
    category: "essential",
    label: "Entry type",
    description: "Message type (user/assistant/system)",
    source: "all"
  },
  {
    path: "role",
    category: "essential",
    label: "Role",
    description: "Message role",
    source: "all"
  },
  {
    path: "message.role",
    category: "essential",
    label: "Message role",
    description: "Role in message object",
    source: "claude"
  },
  {
    path: "message.content",
    category: "essential",
    label: "Message content",
    description: "The actual message text",
    source: "claude"
  },
  {
    path: "content",
    category: "essential",
    label: "Content",
    description: "Message content",
    source: "all"
  },
  {
    path: "text",
    category: "essential",
    label: "Text",
    description: "Text content",
    source: "all"
  },
  {
    path: "timestamp",
    category: "recommended",
    label: "Timestamp",
    description: "When the message occurred",
    source: "all"
  },
  {
    path: "sessionId",
    category: "recommended",
    label: "Session ID",
    description: "Links related messages together",
    source: "all"
  },
  {
    path: "uuid",
    category: "recommended",
    label: "Message UUID",
    description: "Unique message identifier",
    source: "claude"
  },
  {
    path: "parentUuid",
    category: "recommended",
    label: "Parent UUID",
    description: "Links to parent message (for threading)",
    source: "claude"
  },
  {
    path: "message.model",
    category: "recommended",
    label: "Model name",
    description: "Which model was used",
    source: "claude"
  },
  {
    path: "message.stop_reason",
    category: "recommended",
    label: "Stop reason",
    description: "Why the model stopped generating",
    source: "claude"
  },
  {
    path: "message.usage",
    category: "recommended",
    label: "Token usage",
    description: "Input/output token counts",
    source: "claude"
  },
  {
    path: "usage",
    category: "recommended",
    label: "Token usage",
    description: "Token consumption data",
    source: "all"
  },
  {
    path: "version",
    category: "optional",
    label: "Client version",
    description: "Version of the coding agent",
    source: "all"
  },
  {
    path: "message.id",
    category: "optional",
    label: "Message ID",
    description: "API message identifier",
    source: "claude"
  },
  {
    path: "message.type",
    category: "optional",
    label: "Message type",
    description: "API message type field",
    source: "claude"
  },
  {
    path: "message.stop_sequence",
    category: "optional",
    label: "Stop sequence",
    description: "Token sequence that stopped generation",
    source: "claude"
  },
  {
    path: "requestId",
    category: "optional",
    label: "Request ID",
    description: "API request identifier",
    source: "claude"
  },
  {
    path: "isSidechain",
    category: "optional",
    label: "Is sidechain",
    description: "Whether this is a sidechain message",
    source: "claude"
  },
  {
    path: "isMeta",
    category: "optional",
    label: "Is meta",
    description: "Whether this is a meta message",
    source: "claude"
  },
  {
    path: "userType",
    category: "optional",
    label: "User type",
    description: "Type of user (external/internal)",
    source: "claude"
  },
  {
    path: "summary",
    category: "optional",
    label: "Summary",
    description: "Context summary text",
    source: "claude"
  },
  {
    path: "leafUuid",
    category: "optional",
    label: "Leaf UUID",
    description: "Reference to conversation leaf",
    source: "claude"
  },
  {
    path: "subtype",
    category: "optional",
    label: "Subtype",
    description: "System message subtype",
    source: "claude"
  },
  {
    path: "level",
    category: "optional",
    label: "Level",
    description: "Log level for system messages",
    source: "claude"
  },
  {
    path: "gitBranch",
    category: "optional",
    label: "Git branch",
    description: "Current git branch name",
    source: "claude"
  },
  {
    path: "exit_code",
    category: "optional",
    label: "Exit code",
    description: "Command exit code",
    source: "codex"
  },
  {
    path: "status",
    category: "optional",
    label: "Status",
    description: "Command execution status",
    source: "codex"
  },
  {
    path: "cwd",
    category: "strip",
    label: "Working directory",
    description: "Full local path to working directory",
    source: "all"
  },
  {
    path: "sourcePathHint",
    category: "strip",
    label: "Source path hint",
    description: "Original file path on disk",
    source: "all"
  },
  {
    path: "original_path_hint",
    category: "strip",
    label: "Original path",
    description: "Original file path on disk",
    source: "all"
  },
  {
    path: "filePath",
    category: "strip",
    label: "File path",
    description: "File path in session",
    source: "all"
  },
  {
    path: "toolUseResult",
    category: "strip",
    label: "Tool use result",
    description: "Detailed tool execution results (may contain paths)",
    source: "claude"
  },
  {
    path: "hookErrors",
    category: "strip",
    label: "Hook errors",
    description: "Error messages from hooks",
    source: "claude"
  },
  {
    path: "hookInfos",
    category: "strip",
    label: "Hook info",
    description: "Information from hooks",
    source: "claude"
  },
  {
    path: "hasOutput",
    category: "strip",
    label: "Has output flag",
    description: "Boolean flag for output presence",
    source: "claude"
  },
  {
    path: "preventedContinuation",
    category: "strip",
    label: "Prevented continuation",
    description: "Whether continuation was prevented",
    source: "claude"
  },
  {
    path: "agentId",
    category: "strip",
    label: "Agent ID",
    description: "Internal agent identifier",
    source: "claude"
  },
  {
    path: "aggregated_output",
    category: "strip",
    label: "Aggregated output",
    description: "Full command output (may be large)",
    source: "codex"
  },
  {
    path: "command",
    category: "strip",
    label: "Command",
    description: "Full command with paths",
    source: "codex"
  },
  {
    path: "message.content.*.source.data",
    category: "always_strip",
    label: "Base64 image data",
    description: "Raw image data (large, privacy)",
    source: "claude"
  },
  {
    path: "*.source.data",
    category: "always_strip",
    label: "Base64 data",
    description: "Any base64 encoded data",
    source: "all"
  },
  {
    path: "message.content.*.signature",
    category: "always_strip",
    label: "Thinking signature",
    description: "Thinking block signatures",
    source: "claude"
  },
  {
    path: "session",
    category: "recommended",
    label: "Session object",
    description: "Session-level metadata container",
    source: "cc_hook"
  },
  {
    path: "session.session_id",
    category: "recommended",
    label: "Session ID",
    description: "Unique session identifier",
    source: "cc_hook"
  },
  {
    path: "session.start_time",
    category: "recommended",
    label: "Start time",
    description: "When the session started",
    source: "cc_hook"
  },
  {
    path: "session.end_time",
    category: "recommended",
    label: "End time",
    description: "When the session ended",
    source: "cc_hook"
  },
  {
    path: "session.permission_mode",
    category: "recommended",
    label: "Permission mode",
    description: "Claude Code permission setting",
    source: "cc_hook"
  },
  {
    path: "session.source",
    category: "recommended",
    label: "Source",
    description: "Where session was launched from (vscode, cli, etc.)",
    source: "cc_hook"
  },
  {
    path: "session.tool_count",
    category: "recommended",
    label: "Tool count",
    description: "Total number of tool calls in session",
    source: "cc_hook"
  },
  {
    path: "session.tools_used",
    category: "recommended",
    label: "Tools used",
    description: "List of tool names used",
    source: "cc_hook"
  },
  {
    path: "session.total_input_tokens",
    category: "recommended",
    label: "Input tokens",
    description: "Total input tokens consumed",
    source: "cc_hook"
  },
  {
    path: "session.total_output_tokens",
    category: "recommended",
    label: "Output tokens",
    description: "Total output tokens generated",
    source: "cc_hook"
  },
  {
    path: "session.estimated_cost_usd",
    category: "recommended",
    label: "Estimated cost",
    description: "Estimated API cost in USD",
    source: "cc_hook"
  },
  {
    path: "session.cwd",
    category: "strip",
    label: "Working directory",
    description: "Full path to working directory (contains username)",
    source: "cc_hook"
  },
  {
    path: "session.transcript_path",
    category: "strip",
    label: "Transcript path",
    description: "Full path to transcript file (contains username)",
    source: "cc_hook"
  },
  {
    path: "session.commits",
    category: "optional",
    label: "Git commits",
    description: "List of commits made during session",
    source: "cc_hook"
  },
  {
    path: "tool_usages",
    category: "recommended",
    label: "Tool usages",
    description: "Array of individual tool calls",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_use_id",
    category: "recommended",
    label: "Tool use ID",
    description: "Unique identifier for this tool call",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_name",
    category: "recommended",
    label: "Tool name",
    description: "Name of the tool called (Read, Edit, Bash, etc.)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].timestamp",
    category: "recommended",
    label: "Timestamp",
    description: "When the tool was called",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].session_id",
    category: "recommended",
    label: "Session ID",
    description: "Parent session identifier",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].success",
    category: "recommended",
    label: "Success",
    description: "Whether the tool call succeeded",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].duration_ms",
    category: "recommended",
    label: "Duration",
    description: "How long the tool call took in milliseconds",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_input",
    category: "strip",
    label: "Tool input ⚠️",
    description: "Full tool input parameters (file paths, commands, code)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].tool_response",
    category: "strip",
    label: "Tool response ⚠️",
    description: "Full tool output (file contents, command output, code)",
    source: "cc_hook"
  },
  {
    path: "tool_usages[].cwd",
    category: "strip",
    label: "Tool CWD",
    description: "Working directory for this tool call",
    source: "cc_hook"
  }
];
function getFieldsForSource(source) {
  return FIELD_SCHEMAS.filter((f) => f.source === "all" || f.source === source);
}
function buildStripSet(selectedFields, source) {
  const stripSet = new Set;
  const schemaFields = getFieldsForSource(source);
  for (const field of schemaFields) {
    if (field.category === "always_strip") {
      stripSet.add(field.path);
    }
  }
  for (const field of schemaFields) {
    if (field.category !== "always_strip" && !selectedFields.includes(field.path)) {
      stripSet.add(field.path);
    }
  }
  return stripSet;
}
function pathMatches(actualPath, pattern) {
  const patternParts = pattern.split(".");
  const actualParts = actualPath.split(".");
  let pi = 0;
  let ai = 0;
  while (pi < patternParts.length && ai < actualParts.length) {
    const pp = patternParts[pi];
    const ap = actualParts[ai];
    if (pp === "*") {
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
function stripFields(obj, stripSet, currentPath = "") {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => stripFields(item, stripSet, currentPath ? `${currentPath}.*` : "*"));
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;
    let shouldStrip = false;
    for (const pattern of stripSet) {
      if (pathMatches(fieldPath, pattern)) {
        shouldStrip = true;
        break;
      }
    }
    if (shouldStrip) {
      continue;
    }
    result[key] = stripFields(value, stripSet, fieldPath);
  }
  return result;
}
var QUALITY_KEYWORDS = [
  "error",
  "traceback",
  "stack",
  "diff",
  "patch",
  "git",
  "commit",
  "test",
  "pytest",
  "npm",
  "yarn",
  "pip",
  "stderr",
  "stdout",
  "tool call",
  "function",
  "stacktrace",
  "exception",
  "debug",
  "warning",
  "failed",
  "success",
  "build",
  "compile"
];
function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of QUALITY_KEYWORDS) {
    if (lower.includes(word)) {
      score += 1.5;
    }
  }
  const length = text.length;
  if (length > 400 && length < 8000) {
    score += 2;
  }
  if (length > 8000) {
    score -= 1;
  }
  if (length < 120) {
    score -= 1;
  }
  return Math.max(0, Math.round(score * 10) / 10);
}
function safePreview(data, maxLen = 800) {
  const parts = [];
  try {
    if (typeof data === "string") {
      return data.slice(0, maxLen).replace(/\s+/g, " ").trim();
    }
    if (Array.isArray(data)) {
      for (const item of data.slice(0, 3)) {
        if (typeof item === "object" && item !== null) {
          const obj = item;
          const importantFields = [
            "role",
            "type",
            "timestamp",
            "model",
            "uuid",
            "message"
          ];
          for (const field of importantFields) {
            if (field in obj && obj[field] !== undefined) {
              const val = obj[field];
              if (typeof val === "string" || typeof val === "number") {
                parts.push(`${field}: ${String(val).slice(0, 50)}`);
              }
            }
          }
          const content = obj.content || obj.text || obj.message;
          if (typeof content === "string") {
            parts.push(`content: ${content.slice(0, 100)}...`);
          } else if (Array.isArray(content)) {
            for (const part of content.slice(0, 2)) {
              if (typeof part === "object" && part !== null) {
                const p = part;
                if (typeof p.text === "string") {
                  parts.push(`text: ${p.text.slice(0, 100)}...`);
                }
                if (typeof p.type === "string") {
                  parts.push(`type: ${p.type}`);
                }
              }
            }
          }
          if ("meta" in obj && typeof obj.meta === "object" && obj.meta !== null) {
            const meta = obj.meta;
            const metaFields = [
              "inputTokens",
              "outputTokens",
              "model",
              "sessionId"
            ];
            for (const mf of metaFields) {
              if (mf in meta) {
                parts.push(`meta.${mf}: ${String(meta[mf]).slice(0, 30)}`);
              }
            }
          }
          parts.push("---");
        }
      }
    } else if (typeof data === "object" && data !== null) {
      const obj = data;
      for (const [key, val] of Object.entries(obj).slice(0, 10)) {
        if (val === null || val === undefined)
          continue;
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          parts.push(`${key}: ${String(val).slice(0, 50)}`);
        } else if (Array.isArray(val)) {
          parts.push(`${key}: [${val.length} items]`);
        } else {
          parts.push(`${key}: {...}`);
        }
      }
    }
  } catch {
    return String(data ?? "").slice(0, maxLen);
  }
  return parts.join(" | ").slice(0, maxLen).replace(/\s+/g, " ").trim() || JSON.stringify(data).slice(0, maxLen);
}
function formatUtcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
function randomUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0;i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function sha256Hex(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const encoder = new TextEncoder;
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseJsonLines(text) {
  return text.split(`
`).filter((line) => line.trim()).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((item) => item !== null);
}
function inferSource(path) {
  const lower = path.toLowerCase();
  if (lower.includes("claude") || lower.includes(".claude"))
    return "claude";
  if (lower.includes("codex"))
    return "codex";
  if (lower.includes("opencode"))
    return "opencode";
  return "unknown";
}
function extractEntryTypes(data) {
  const types = {};
  if (!Array.isArray(data))
    return { types, primary: "unknown" };
  for (const item of data) {
    if (typeof item === "object" && item !== null) {
      const type = String(item.type || item.role || "unknown");
      types[type] = (types[type] || 0) + 1;
    }
  }
  const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);
  return { types, primary: sorted[0]?.[0] || "unknown" };
}
function redactPathUsername2(path) {
  if (!path)
    return path;
  let redacted = path.replace(/\/(Users|home)\/[^/\s]+/g, "/$1/[REDACTED]");
  redacted = redacted.replace(/([A-Z]):\\Users\\[^\\]+/gi, "$1:\\Users\\[REDACTED]");
  return redacted;
}
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0;i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1;i < 30; ++i) {
    for (var j = b[i];j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0;i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var flt = new u8(288);
for (i = 0;i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144;i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256;i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280;i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0;i < 32; ++i)
  fdt[i] = 5;
var i;
var et = /* @__PURE__ */ new u8(0);
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder;
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var encoder = new TextEncoder;
function formatUtcNow2() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
function makeBundleId(contributorId) {
  const safe = contributorId.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
  const now = formatUtcNow2().replace(/[-:]/g, "").replace(".", "");
  const short = Math.random().toString(36).slice(2, 8);
  return `${now}_${safe || "anonymous"}_${short}`;
}
var VALID_CATEGORIES = [
  "secrets",
  "pii",
  "paths",
  "credentials",
  "network"
];
function hasBacktrackingRisk(regex) {
  const dangerousPatterns = [
    /\([^)]*[+*][^)]*\)[+*]/,
    /[+*][+*]/,
    /\.\*[^?].*\.\*/
  ];
  return dangerousPatterns.some((p) => p.test(regex));
}
function isOverlyBroad(regex) {
  const broadPatterns = [
    /^\.\*$/,
    /^\.\+$/,
    /^\[^\\s\]\+$/,
    /^\.\{[0-9]+,\}$/
  ];
  return broadPatterns.some((p) => p.test(regex));
}
function validatePattern(pattern) {
  const errors = [];
  const warnings = [];
  if (!pattern.name || typeof pattern.name !== "string") {
    errors.push("Pattern name is required and must be a string");
  } else if (!/^[a-z][a-z0-9_]*$/i.test(pattern.name)) {
    errors.push("Pattern name must start with a letter and contain only letters, numbers, and underscores");
  }
  if (!pattern.placeholder || typeof pattern.placeholder !== "string") {
    errors.push("Placeholder is required and must be a string");
  } else if (!/^[A-Z][A-Z0-9_]*$/i.test(pattern.placeholder)) {
    warnings.push("Placeholder should be uppercase with underscores (e.g., 'API_KEY')");
  }
  if (!pattern.category) {
    errors.push("Category is required");
  } else if (!VALID_CATEGORIES.includes(pattern.category)) {
    errors.push(`Invalid category '${pattern.category}'. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }
  if (!Array.isArray(pattern.regex) || pattern.regex.length === 0) {
    errors.push("At least one regex pattern is required");
  } else {
    for (let i2 = 0;i2 < pattern.regex.length; i2++) {
      const regexStr = pattern.regex[i2];
      if (typeof regexStr !== "string") {
        errors.push(`Regex at index ${i2} must be a string`);
        continue;
      }
      try {
        new RegExp(regexStr, "g");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`Invalid regex at index ${i2}: ${message}`);
        continue;
      }
      if (hasBacktrackingRisk(regexStr)) {
        warnings.push(`Regex at index ${i2} may have catastrophic backtracking issues: ${regexStr.slice(0, 50)}...`);
      }
      if (isOverlyBroad(regexStr)) {
        warnings.push(`Regex at index ${i2} is overly broad and may match too much: ${regexStr}`);
      }
      if (/^[A-Za-z]/.test(regexStr) && !/\\b/.test(regexStr)) {
        warnings.push(`Regex at index ${i2} may benefit from word boundaries (\\b) to avoid partial matches`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
function normalizePattern(pattern) {
  return {
    name: (pattern.name || "").trim(),
    placeholder: (pattern.placeholder || "").trim().toUpperCase(),
    regex: (pattern.regex || []).map((r) => r.trim()),
    category: pattern.category || "secrets",
    description: pattern.description?.trim(),
    enabled: pattern.enabled !== false
  };
}

class PatternManager {
  patterns = new Map;
  customPatterns = new Map;
  constructor(options = {}) {
    const { loadDefaults = true, initialCustomPatterns = [] } = options;
    if (loadDefaults) {
      this.loadDefaultPatterns();
    }
    for (const pattern of initialCustomPatterns) {
      this.addCustomPattern(pattern);
    }
  }
  loadDefaultPatterns() {
    const definitions = getPatternDefinitions();
    for (const pattern of definitions) {
      this.patterns.set(pattern.name, pattern);
    }
  }
  getPattern(name) {
    return this.customPatterns.get(name) ?? this.patterns.get(name);
  }
  getDefaultPatterns() {
    return Array.from(this.patterns.values());
  }
  getCustomPatterns() {
    return Array.from(this.customPatterns.values());
  }
  getAllPatterns() {
    const all = new Map(this.patterns);
    for (const [name, pattern] of this.customPatterns) {
      all.set(name, pattern);
    }
    return Array.from(all.values());
  }
  getPatternsByCategory(category) {
    return this.getAllPatterns().filter((p) => p.category === category);
  }
  hasPattern(name) {
    return this.patterns.has(name) || this.customPatterns.has(name);
  }
  isCustomPattern(name) {
    return this.customPatterns.has(name);
  }
  addCustomPattern(pattern) {
    const normalized = normalizePattern(pattern);
    const validation = validatePattern(normalized);
    if (!validation.valid) {
      return validation;
    }
    if (this.patterns.has(normalized.name)) {
      validation.warnings.push(`Pattern '${normalized.name}' overrides a default pattern`);
    }
    this.customPatterns.set(normalized.name, normalized);
    return validation;
  }
  editCustomPattern(name, updates) {
    const existing = this.customPatterns.get(name);
    if (!existing) {
      if (this.patterns.has(name)) {
        return {
          valid: false,
          errors: [
            `Cannot edit default pattern '${name}'. Create a custom pattern instead.`
          ],
          warnings: []
        };
      }
      return {
        valid: false,
        errors: [`Pattern '${name}' not found`],
        warnings: []
      };
    }
    const updated = normalizePattern({
      ...existing,
      ...updates,
      name: existing.name
    });
    const validation = validatePattern(updated);
    if (validation.valid) {
      this.customPatterns.set(name, updated);
    }
    return validation;
  }
  removeCustomPattern(name) {
    return this.customPatterns.delete(name);
  }
  clearCustomPatterns() {
    this.customPatterns.clear();
  }
  definitionToConfig(def) {
    return {
      placeholder: def.placeholder,
      regex: def.regex.map((r) => new RegExp(r, "g")),
      category: def.category
    };
  }
  buildPatternSet(options = {}) {
    const { categories, names, includeCustom = true } = options;
    const result = {};
    const sources = includeCustom ? [this.patterns, this.customPatterns] : [this.patterns];
    for (const source of sources) {
      for (const [name, pattern] of source) {
        if (pattern.enabled === false)
          continue;
        if (categories && !categories.includes(pattern.category))
          continue;
        if (names && !names.includes(name))
          continue;
        result[name] = this.definitionToConfig(pattern);
      }
    }
    return result;
  }
  exportToJson(includeDefaults = false) {
    const patterns2 = includeDefaults ? this.getAllPatterns() : this.getCustomPatterns();
    const data = {
      version: "1.0.0",
      patterns: includeDefaults ? this.getDefaultPatterns() : [],
      customPatterns: this.getCustomPatterns()
    };
    return JSON.stringify(data, null, 2);
  }
  importFromJson(json, replaceExisting = false) {
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        warnings: []
      };
    }
    const allErrors = [];
    const allWarnings = [];
    if (replaceExisting) {
      this.customPatterns.clear();
    }
    const customPatterns = data.customPatterns ?? data.patterns ?? [];
    for (const pattern of customPatterns) {
      const result = this.addCustomPattern(pattern);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }
    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
  getSummary() {
    const byCategory = {};
    for (const pattern of this.getAllPatterns()) {
      byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
    }
    return {
      defaultCount: this.patterns.size,
      customCount: this.customPatterns.size,
      byCategory
    };
  }
}

// ../node_modules/fflate/esm/browser.js
var u82 = Uint8Array;
var u162 = Uint16Array;
var i322 = Int32Array;
var fleb2 = new u82([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0]);
var fdeb2 = new u82([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0]);
var clim2 = new u82([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb2 = function(eb, start) {
  var b = new u162(31);
  for (var i2 = 0;i2 < 31; ++i2) {
    b[i2] = start += 1 << eb[i2 - 1];
  }
  var r = new i322(b[30]);
  for (var i2 = 1;i2 < 30; ++i2) {
    for (var j = b[i2];j < b[i2 + 1]; ++j) {
      r[j] = j - b[i2] << 5 | i2;
    }
  }
  return { b, r };
};
var _a2 = freb2(fleb2, 2);
var fl2 = _a2.b;
var revfl2 = _a2.r;
fl2[28] = 258, revfl2[258] = 28;
var _b2 = freb2(fdeb2, 0);
var fd2 = _b2.b;
var revfd2 = _b2.r;
var rev2 = new u162(32768);
for (i2 = 0;i2 < 32768; ++i2) {
  x2 = (i2 & 43690) >> 1 | (i2 & 21845) << 1;
  x2 = (x2 & 52428) >> 2 | (x2 & 13107) << 2;
  x2 = (x2 & 61680) >> 4 | (x2 & 3855) << 4;
  rev2[i2] = ((x2 & 65280) >> 8 | (x2 & 255) << 8) >> 1;
}
var x2;
var i2;
var hMap = function(cd, mb, r) {
  var s = cd.length;
  var i2 = 0;
  var l = new u162(mb);
  for (;i2 < s; ++i2) {
    if (cd[i2])
      ++l[cd[i2] - 1];
  }
  var le = new u162(mb);
  for (i2 = 1;i2 < mb; ++i2) {
    le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
  }
  var co;
  if (r) {
    co = new u162(1 << mb);
    var rvb = 15 - mb;
    for (i2 = 0;i2 < s; ++i2) {
      if (cd[i2]) {
        var sv = i2 << 4 | cd[i2];
        var r_1 = mb - cd[i2];
        var v = le[cd[i2] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1;v <= m; ++v) {
          co[rev2[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u162(s);
    for (i2 = 0;i2 < s; ++i2) {
      if (cd[i2]) {
        co[i2] = rev2[le[cd[i2] - 1]++] >> 15 - cd[i2];
      }
    }
  }
  return co;
};
var flt2 = new u82(288);
for (i2 = 0;i2 < 144; ++i2)
  flt2[i2] = 8;
var i2;
for (i2 = 144;i2 < 256; ++i2)
  flt2[i2] = 9;
var i2;
for (i2 = 256;i2 < 280; ++i2)
  flt2[i2] = 7;
var i2;
for (i2 = 280;i2 < 288; ++i2)
  flt2[i2] = 8;
var i2;
var fdt2 = new u82(32);
for (i2 = 0;i2 < 32; ++i2)
  fdt2[i2] = 5;
var i2;
var flm = /* @__PURE__ */ hMap(flt2, 9, 0);
var flrm = /* @__PURE__ */ hMap(flt2, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt2, 5, 0);
var fdrm = /* @__PURE__ */ hMap(fdt2, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i2 = 1;i2 < a.length; ++i2) {
    if (a[i2] > m)
      m = a[i2];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u82(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u82(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u82(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u82(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u82(tl);
        var clt = new u82(19);
        for (var i2 = 0;i2 < hcLen; ++i2) {
          clt[clim2[i2]] = bits(dat, pos + i2 * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i2 = 0;i2 < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i2++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i2++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (;; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i2 = sym - 257, b = fleb2[i2];
          add = bits(dat, pos, (1 << b) - 1) + fl2[i2];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd2[dsym];
        if (dsym > 3) {
          var b = fdeb2[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (;bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (;bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var wbits = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
};
var wbits16 = function(d, p, v) {
  v <<= p & 7;
  var o = p / 8 | 0;
  d[o] |= v;
  d[o + 1] |= v >> 8;
  d[o + 2] |= v >> 16;
};
var hTree = function(d, mb) {
  var t = [];
  for (var i2 = 0;i2 < d.length; ++i2) {
    if (d[i2])
      t.push({ s: i2, f: d[i2] });
  }
  var s = t.length;
  var t2 = t.slice();
  if (!s)
    return { t: et2, l: 0 };
  if (s == 1) {
    var v = new u82(t[0].s + 1);
    v[t[0].s] = 1;
    return { t: v, l: 1 };
  }
  t.sort(function(a, b) {
    return a.f - b.f;
  });
  t.push({ s: -1, f: 25001 });
  var l = t[0], r = t[1], i0 = 0, i1 = 1, i22 = 2;
  t[0] = { s: -1, f: l.f + r.f, l, r };
  while (i1 != s - 1) {
    l = t[t[i0].f < t[i22].f ? i0++ : i22++];
    r = t[i0 != i1 && t[i0].f < t[i22].f ? i0++ : i22++];
    t[i1++] = { s: -1, f: l.f + r.f, l, r };
  }
  var maxSym = t2[0].s;
  for (var i2 = 1;i2 < s; ++i2) {
    if (t2[i2].s > maxSym)
      maxSym = t2[i2].s;
  }
  var tr = new u162(maxSym + 1);
  var mbt = ln(t[i1 - 1], tr, 0);
  if (mbt > mb) {
    var i2 = 0, dt = 0;
    var lft = mbt - mb, cst = 1 << lft;
    t2.sort(function(a, b) {
      return tr[b.s] - tr[a.s] || a.f - b.f;
    });
    for (;i2 < s; ++i2) {
      var i2_1 = t2[i2].s;
      if (tr[i2_1] > mb) {
        dt += cst - (1 << mbt - tr[i2_1]);
        tr[i2_1] = mb;
      } else
        break;
    }
    dt >>= lft;
    while (dt > 0) {
      var i2_2 = t2[i2].s;
      if (tr[i2_2] < mb)
        dt -= 1 << mb - tr[i2_2]++ - 1;
      else
        ++i2;
    }
    for (;i2 >= 0 && dt; --i2) {
      var i2_3 = t2[i2].s;
      if (tr[i2_3] == mb) {
        --tr[i2_3];
        ++dt;
      }
    }
    mbt = mb;
  }
  return { t: new u82(tr), l: mbt };
};
var ln = function(n, l, d) {
  return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
  var s = c.length;
  while (s && !c[--s])
    ;
  var cl = new u162(++s);
  var cli = 0, cln = c[0], cls = 1;
  var w = function(v) {
    cl[cli++] = v;
  };
  for (var i2 = 1;i2 <= s; ++i2) {
    if (c[i2] == cln && i2 != s)
      ++cls;
    else {
      if (!cln && cls > 2) {
        for (;cls > 138; cls -= 138)
          w(32754);
        if (cls > 2) {
          w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
          cls = 0;
        }
      } else if (cls > 3) {
        w(cln), --cls;
        for (;cls > 6; cls -= 6)
          w(8304);
        if (cls > 2)
          w(cls - 3 << 5 | 8208), cls = 0;
      }
      while (cls--)
        w(cln);
      cls = 1;
      cln = c[i2];
    }
  }
  return { c: cl.subarray(0, cli), n: s };
};
var clen = function(cf, cl) {
  var l = 0;
  for (var i2 = 0;i2 < cl.length; ++i2)
    l += cf[i2] * cl[i2];
  return l;
};
var wfblk = function(out, pos, dat) {
  var s = dat.length;
  var o = shft(pos + 2);
  out[o] = s & 255;
  out[o + 1] = s >> 8;
  out[o + 2] = out[o] ^ 255;
  out[o + 3] = out[o + 1] ^ 255;
  for (var i2 = 0;i2 < s; ++i2)
    out[o + i2 + 4] = dat[i2];
  return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
  wbits(out, p++, final);
  ++lf[256];
  var _a3 = hTree(lf, 15), dlt = _a3.t, mlb = _a3.l;
  var _b3 = hTree(df, 15), ddt = _b3.t, mdb = _b3.l;
  var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
  var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
  var lcfreq = new u162(19);
  for (var i2 = 0;i2 < lclt.length; ++i2)
    ++lcfreq[lclt[i2] & 31];
  for (var i2 = 0;i2 < lcdt.length; ++i2)
    ++lcfreq[lcdt[i2] & 31];
  var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
  var nlcc = 19;
  for (;nlcc > 4 && !lct[clim2[nlcc - 1]]; --nlcc)
    ;
  var flen = bl + 5 << 3;
  var ftlen = clen(lf, flt2) + clen(df, fdt2) + eb;
  var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
  if (bs >= 0 && flen <= ftlen && flen <= dtlen)
    return wfblk(out, p, dat.subarray(bs, bs + bl));
  var lm, ll, dm, dl;
  wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
  if (dtlen < ftlen) {
    lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
    var llm = hMap(lct, mlcb, 0);
    wbits(out, p, nlc - 257);
    wbits(out, p + 5, ndc - 1);
    wbits(out, p + 10, nlcc - 4);
    p += 14;
    for (var i2 = 0;i2 < nlcc; ++i2)
      wbits(out, p + 3 * i2, lct[clim2[i2]]);
    p += 3 * nlcc;
    var lcts = [lclt, lcdt];
    for (var it = 0;it < 2; ++it) {
      var clct = lcts[it];
      for (var i2 = 0;i2 < clct.length; ++i2) {
        var len = clct[i2] & 31;
        wbits(out, p, llm[len]), p += lct[len];
        if (len > 15)
          wbits(out, p, clct[i2] >> 5 & 127), p += clct[i2] >> 12;
      }
    }
  } else {
    lm = flm, ll = flt2, dm = fdm, dl = fdt2;
  }
  for (var i2 = 0;i2 < li; ++i2) {
    var sym = syms[i2];
    if (sym > 255) {
      var len = sym >> 18 & 31;
      wbits16(out, p, lm[len + 257]), p += ll[len + 257];
      if (len > 7)
        wbits(out, p, sym >> 23 & 31), p += fleb2[len];
      var dst = sym & 31;
      wbits16(out, p, dm[dst]), p += dl[dst];
      if (dst > 3)
        wbits16(out, p, sym >> 5 & 8191), p += fdeb2[dst];
    } else {
      wbits16(out, p, lm[sym]), p += ll[sym];
    }
  }
  wbits16(out, p, lm[256]);
  return p + ll[256];
};
var deo = /* @__PURE__ */ new i322([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
var et2 = /* @__PURE__ */ new u82(0);
var dflt = function(dat, lvl, plvl, pre, post, st) {
  var s = st.z || dat.length;
  var o = new u82(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
  var w = o.subarray(pre, o.length - post);
  var lst = st.l;
  var pos = (st.r || 0) & 7;
  if (lvl) {
    if (pos)
      w[0] = st.r >> 3;
    var opt = deo[lvl - 1];
    var n = opt >> 13, c = opt & 8191;
    var msk_1 = (1 << plvl) - 1;
    var prev = st.p || new u162(32768), head = st.h || new u162(msk_1 + 1);
    var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
    var hsh = function(i3) {
      return (dat[i3] ^ dat[i3 + 1] << bs1_1 ^ dat[i3 + 2] << bs2_1) & msk_1;
    };
    var syms = new i322(25000);
    var lf = new u162(288), df = new u162(32);
    var lc_1 = 0, eb = 0, i2 = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
    for (;i2 + 2 < s; ++i2) {
      var hv = hsh(i2);
      var imod = i2 & 32767, pimod = head[hv];
      prev[imod] = pimod;
      head[hv] = imod;
      if (wi <= i2) {
        var rem = s - i2;
        if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
          pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i2 - bs, pos);
          li = lc_1 = eb = 0, bs = i2;
          for (var j = 0;j < 286; ++j)
            lf[j] = 0;
          for (var j = 0;j < 30; ++j)
            df[j] = 0;
        }
        var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
        if (rem > 2 && hv == hsh(i2 - dif)) {
          var maxn = Math.min(n, rem) - 1;
          var maxd = Math.min(32767, i2);
          var ml = Math.min(258, rem);
          while (dif <= maxd && --ch_1 && imod != pimod) {
            if (dat[i2 + l] == dat[i2 + l - dif]) {
              var nl = 0;
              for (;nl < ml && dat[i2 + nl] == dat[i2 + nl - dif]; ++nl)
                ;
              if (nl > l) {
                l = nl, d = dif;
                if (nl > maxn)
                  break;
                var mmd = Math.min(dif, nl - 2);
                var md = 0;
                for (var j = 0;j < mmd; ++j) {
                  var ti = i2 - dif + j & 32767;
                  var pti = prev[ti];
                  var cd = ti - pti & 32767;
                  if (cd > md)
                    md = cd, pimod = ti;
                }
              }
            }
            imod = pimod, pimod = prev[imod];
            dif += imod - pimod & 32767;
          }
        }
        if (d) {
          syms[li++] = 268435456 | revfl2[l] << 18 | revfd2[d];
          var lin = revfl2[l] & 31, din = revfd2[d] & 31;
          eb += fleb2[lin] + fdeb2[din];
          ++lf[257 + lin];
          ++df[din];
          wi = i2 + l;
          ++lc_1;
        } else {
          syms[li++] = dat[i2];
          ++lf[dat[i2]];
        }
      }
    }
    for (i2 = Math.max(i2, wi);i2 < s; ++i2) {
      syms[li++] = dat[i2];
      ++lf[dat[i2]];
    }
    pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i2 - bs, pos);
    if (!lst) {
      st.r = pos & 7 | w[pos / 8 | 0] << 3;
      pos -= 7;
      st.h = head, st.p = prev, st.i = i2, st.w = wi;
    }
  } else {
    for (var i2 = st.w || 0;i2 < s + lst; i2 += 65535) {
      var e = i2 + 65535;
      if (e >= s) {
        w[pos / 8 | 0] = lst;
        e = s;
      }
      pos = wfblk(w, pos + 1, dat.subarray(i2, e));
    }
    st.i = s;
  }
  return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ function() {
  var t = new Int32Array(256);
  for (var i2 = 0;i2 < 256; ++i2) {
    var c = i2, k = 9;
    while (--k)
      c = (c & 1 && -306674912) ^ c >>> 1;
    t[i2] = c;
  }
  return t;
}();
var crc = function() {
  var c = -1;
  return {
    p: function(d) {
      var cr = c;
      for (var i2 = 0;i2 < d.length; ++i2)
        cr = crct[cr & 255 ^ d[i2]] ^ cr >>> 8;
      c = cr;
    },
    d: function() {
      return ~c;
    }
  };
};
var dopt = function(dat, opt, pre, post, st) {
  if (!st) {
    st = { l: 1 };
    if (opt.dictionary) {
      var dict = opt.dictionary.subarray(-32768);
      var newDat = new u82(dict.length + dat.length);
      newDat.set(dict);
      newDat.set(dat, dict.length);
      dat = newDat;
      st.w = dict.length;
    }
  }
  return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
};
var mrg = function(a, b) {
  var o = {};
  for (var k in a)
    o[k] = a[k];
  for (var k in b)
    o[k] = b[k];
  return o;
};
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
  for (;v; ++b)
    d[b] = v, v >>>= 8;
};
function deflateSync(data, opts) {
  return dopt(data, opts || {}, 0, 0);
}
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var fltn = function(d, p, t, o) {
  for (var k in d) {
    var val = d[k], n = p + k, op = o;
    if (Array.isArray(val))
      op = mrg(o, val[1]), val = val[0];
    if (val instanceof u82)
      t[n] = [val, op];
    else {
      t[n += "/"] = [new u82(0), op];
      fltn(val, n, t, o);
    }
  }
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder;
var td2 = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder;
var tds2 = 0;
try {
  td2.decode(et2, { stream: true });
  tds2 = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i2 = 0;; ) {
    var c = d[i2++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i2 + eb > d.length)
      return { s: r, r: slc(d, i2 - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i2++] & 63) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i2++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i2++] & 63) << 6 | d[i2++] & 63);
  }
};
function strToU8(str, latin1) {
  if (latin1) {
    var ar_1 = new u82(str.length);
    for (var i2 = 0;i2 < str.length; ++i2)
      ar_1[i2] = str.charCodeAt(i2);
    return ar_1;
  }
  if (te)
    return te.encode(str);
  var l = str.length;
  var ar = new u82(str.length + (str.length >> 1));
  var ai = 0;
  var w = function(v) {
    ar[ai++] = v;
  };
  for (var i2 = 0;i2 < l; ++i2) {
    if (ai + 5 > ar.length) {
      var n = new u82(ai + 8 + (l - i2 << 1));
      n.set(ar);
      ar = n;
    }
    var c = str.charCodeAt(i2);
    if (c < 128 || latin1)
      w(c);
    else if (c < 2048)
      w(192 | c >> 6), w(128 | c & 63);
    else if (c > 55295 && c < 57344)
      c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i2) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
    else
      w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
  }
  return slc(ar, 0, ai);
}
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i2 = 0;i2 < dat.length; i2 += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i2, i2 + 16384));
    return r;
  } else if (td2) {
    return td2.decode(dat);
  } else {
    var _a3 = dutf8(dat), s = _a3.s, r = _a3.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
  var _a3 = z && bs == 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)], sc = _a3[0], su = _a3[1], off = _a3[2];
  return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (;b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
var exfl = function(ex) {
  var le = 0;
  if (ex) {
    for (var k in ex) {
      var l = ex[k].length;
      if (l > 65535)
        err(9);
      le += l + 4;
    }
  }
  return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
  var fl3 = fn.length, ex = f.extra, col = co && co.length;
  var exl = exfl(ex);
  wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
  if (ce != null)
    d[b++] = 20, d[b++] = f.os;
  d[b] = 20, b += 2;
  d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
  d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
  var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
  if (y < 0 || y > 119)
    err(10);
  wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
  if (c != -1) {
    wbytes(d, b, f.crc);
    wbytes(d, b + 4, c < 0 ? -c - 2 : c);
    wbytes(d, b + 8, f.size);
  }
  wbytes(d, b + 12, fl3);
  wbytes(d, b + 14, exl), b += 16;
  if (ce != null) {
    wbytes(d, b, col);
    wbytes(d, b + 6, f.attrs);
    wbytes(d, b + 10, ce), b += 14;
  }
  d.set(fn, b);
  b += fl3;
  if (exl) {
    for (var k in ex) {
      var exf = ex[k], l = exf.length;
      wbytes(d, b, +k);
      wbytes(d, b + 2, l);
      d.set(exf, b + 4), b += 4 + l;
    }
  }
  if (col)
    d.set(co, b), b += col;
  return b;
};
var wzf = function(o, b, c, d, e) {
  wbytes(o, b, 101010256);
  wbytes(o, b + 8, c);
  wbytes(o, b + 10, c);
  wbytes(o, b + 12, d);
  wbytes(o, b + 16, e);
};
function zipSync(data, opts) {
  if (!opts)
    opts = {};
  var r = {};
  var files = [];
  fltn(data, "", r, opts);
  var o = 0;
  var tot = 0;
  for (var fn in r) {
    var _a3 = r[fn], file = _a3[0], p = _a3[1];
    var compression = p.level == 0 ? 0 : 8;
    var f = strToU8(fn), s = f.length;
    var com = p.comment, m = com && strToU8(com), ms = m && m.length;
    var exl = exfl(p.extra);
    if (s > 65535)
      err(11);
    var d = compression ? deflateSync(file, p) : file, l = d.length;
    var c = crc();
    c.p(file);
    files.push(mrg(p, {
      size: file.length,
      crc: c.d(),
      c: d,
      f,
      m,
      u: s != fn.length || m && com.length != ms,
      o,
      compression
    }));
    o += 30 + s + exl + l;
    tot += 76 + 2 * (s + exl) + (ms || 0) + l;
  }
  var out = new u82(tot + 22), oe = o, cdl = tot - o;
  for (var i2 = 0;i2 < files.length; ++i2) {
    var f = files[i2];
    wzh(out, f.o, f, f.f, f.u, f.c.length);
    var badd = 30 + f.f.length + exfl(f.extra);
    out.set(f.c, f.o + badd);
    wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
  }
  wzf(out, o, files.length, cdl, oe);
  return out;
}
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (;b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = o == 4294967295 || c == 65535;
  if (z) {
    var ze = b4(data, e - 12);
    z = b4(data, ze) == 101075792;
    if (z) {
      c = b4(data, ze + 32);
      o = b4(data, ze + 48);
    }
  }
  var fltr = opts && opts.filter;
  for (var i2 = 0;i2 < c; ++i2) {
    var _a3 = zh(data, o, z), c_2 = _a3[0], sc = _a3[1], su = _a3[2], fn = _a3[3], no = _a3[4], off = _a3[5], b = slzh(data, off);
    o = no;
    if (!fltr || fltr({
      name: fn,
      size: sc,
      originalSize: su,
      compression: c_2
    })) {
      if (!c_2)
        files[fn] = slc(data, b, b + sc);
      else if (c_2 == 8)
        files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u82(su) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}

// src/workers/processor.ts
var encoder2 = new TextEncoder;
var decoder = new TextDecoder;
var state = {
  manifest: null,
  manifestBytes: null,
  files: {},
  sessions: [],
  sanitizedSessions: {}
};
self.onmessage = async (event) => {
  const { type, payload } = event.data || {};
  if (type === "getSchema") {
    const source = payload?.source || "all";
    const fields = getFieldsForSource(source);
    const defaultSelected = fields.filter((f) => f.category === "essential" || f.category === "recommended").map((f) => f.path);
    self.postMessage({
      type: "schema",
      payload: { fields, defaultSelected }
    });
    return;
  }
  if (type === "import") {
    try {
      const zipBytes = new Uint8Array(payload.bytes);
      const entries = unzipSync(zipBytes);
      const manifestBytes = entries["export_manifest.json"];
      if (!manifestBytes) {
        throw new Error("export_manifest.json not found in zip.");
      }
      const manifest = JSON.parse(decoder.decode(manifestBytes));
      state.manifest = manifest;
      state.manifestBytes = manifestBytes;
      state.files = {};
      const sessions = [];
      for (const entry of manifest.files) {
        const fileBytes = entries[entry.path_in_zip];
        if (!fileBytes)
          continue;
        state.files[entry.path_in_zip] = fileBytes;
        const rawText = decoder.decode(fileBytes);
        const parsed = entry.path_in_zip.endsWith(".jsonl") ? parseJsonLines(rawText) : JSON.parse(rawText);
        const preview = safePreview(parsed);
        const score = scoreText(preview);
        const approxChars = rawText.length;
        const sessionId = await sha256Hex(fileBytes);
        const { types: entryTypes, primary: primaryType } = extractEntryTypes(parsed);
        sessions.push({
          sessionId,
          source: inferSource(entry.path_in_zip),
          rawSha256: entry.sha256 || sessionId,
          mtimeUtc: entry.mtime_utc,
          data: parsed,
          preview,
          score,
          approxChars,
          sourcePathHint: entry.original_path_hint,
          filePath: entry.path_in_zip,
          entryTypes,
          primaryType
        });
      }
      state.sessions = sessions;
      state.sanitizedSessions = {};
      const totalBytes = manifest.files.reduce((acc, f) => acc + f.bytes, 0);
      self.postMessage({
        type: "imported",
        payload: {
          manifest: {
            fileCount: manifest.files.length,
            totalBytes,
            sources: manifest.sources || []
          },
          sessions,
          fileTree: manifest.files.map((f) => `- ${f.path_in_zip}`).join(`
`),
          source: payload.source
        }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
  if (type === "redact") {
    try {
      if (!state.sessions.length) {
        throw new Error("No sessions loaded.");
      }
      const config = payload.config;
      const selectedIds = new Set(payload.selectedIds);
      let selectedFields = payload.selectedFields;
      if (!selectedFields || selectedFields.length === 0) {
        const allFields = getFieldsForSource("all");
        selectedFields = allFields.filter((f) => f.category === "essential" || f.category === "recommended").map((f) => f.path);
      }
      const fieldsStripped = {};
      const sanitizer = createSanitizer(config);
      const sanitizedSessions = {};
      const sanitizedList = [];
      for (const session of state.sessions) {
        if (!selectedIds.has(session.sessionId))
          continue;
        const stripSet = buildStripSet(selectedFields, session.source);
        let processed = session.data;
        if (stripSet.size > 0) {
          processed = stripFields(session.data, stripSet);
          for (const pattern of stripSet) {
            fieldsStripped[pattern] = (fieldsStripped[pattern] || 0) + 1;
          }
        }
        const sanitized = sanitizer.redactObject(processed);
        const previewOriginal = safePreview(session.data);
        const previewRedacted = safePreview(sanitized);
        const enriched = {
          ...session,
          sanitized,
          previewOriginal,
          previewRedacted
        };
        sanitizedSessions[session.sessionId] = enriched;
        sanitizedList.push(enriched);
      }
      state.sanitizedSessions = sanitizedSessions;
      const sanitizerReport = sanitizer.getReport();
      const allStrings = [];
      sanitizedList.forEach((session) => collectStrings(session.sanitized, allStrings));
      const residue = residueCheck(allStrings);
      const enabledCategories = [];
      if (config.redactSecrets)
        enabledCategories.push("secrets");
      if (config.redactPii)
        enabledCategories.push("pii");
      if (config.redactPaths)
        enabledCategories.push("paths");
      if (config.maskCodeBlocks)
        enabledCategories.push("code_blocks");
      const customRegexHashes = await Promise.all((config.customRegex || []).filter(Boolean).map((pattern) => sha256Hex(pattern)));
      const report = {
        counts: sanitizerReport.countsByCategory,
        totalStringsTouched: sanitizerReport.totalRedactions,
        enabledCategories,
        customRegexHashes,
        residueWarnings: residue.warnings,
        blocked: residue.blocked,
        fieldsStripped: Object.keys(fieldsStripped).length
      };
      self.postMessage({
        type: "redacted",
        payload: { report, sanitizedSessions: sanitizedList, fieldsStripped }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
  if (type === "bundle") {
    try {
      const selectedIds = new Set(payload.selectedIds);
      const contributor = payload.contributor;
      const appVersion = payload.appVersion;
      const redaction = payload.redaction;
      const annotations = payload.annotations || {};
      const requestedFormat = payload.format || "auto";
      const bundleId = makeBundleId(contributor.contributorId);
      const now = formatUtcNow();
      const schemaVersion = "donated_coding_agent_transcripts.v0";
      const selectedSessions = Object.values(state.sanitizedSessions).filter((session) => selectedIds.has(session.sessionId));
      if (!selectedSessions.length) {
        throw new Error("No sanitized sessions selected.");
      }
      const transcriptsLines = [];
      const selectedSessionReport = [];
      for (const session of selectedSessions) {
        const selection = {
          score: session.score,
          approx_chars: session.approxChars,
          preview_redacted: session.previewRedacted
        };
        const sessionAnnotation = annotations[session.sessionId];
        const transcriptEntry = {
          schema_version: schemaVersion,
          bundle_id: bundleId,
          source: session.source,
          source_path_hint: redactPathUsername2(session.sourcePathHint),
          source_mtime_utc: session.mtimeUtc,
          raw_sha256: session.rawSha256,
          selection,
          contributor: {
            contributor_id: contributor.contributorId,
            license: contributor.license,
            ai_use_preference: contributor.aiPreference
          },
          data: session.sanitized
        };
        if (sessionAnnotation?.rating || sessionAnnotation?.notes) {
          transcriptEntry.annotation = {
            ...sessionAnnotation.rating && {
              rating: sessionAnnotation.rating
            },
            ...sessionAnnotation.notes && { notes: sessionAnnotation.notes }
          };
        }
        transcriptsLines.push(JSON.stringify(transcriptEntry));
        selectedSessionReport.push({
          session_id: session.sessionId,
          raw_sha256: session.rawSha256,
          source_path_hint: redactPathUsername2(session.sourcePathHint),
          score: session.score
        });
      }
      const transcriptsJsonl = transcriptsLines.join(`
`) + `
`;
      const prepReport = {
        app_version: appVersion,
        created_at_utc: now,
        bundle_id: bundleId,
        contributor: {
          contributor_id: contributor.contributorId,
          license: contributor.license,
          ai_use_preference: contributor.aiPreference
        },
        inputs: {
          raw_export_manifest_sha256: state.manifestBytes ? await sha256Hex(state.manifestBytes) : "",
          selected_sessions: selectedSessionReport
        },
        redaction: {
          counts: redaction.counts,
          total_strings_touched: redaction.totalStringsTouched,
          enabled_categories: redaction.enabledCategories,
          custom_regexes: redaction.customRegexHashes,
          residue_check_results: {
            warnings: redaction.residueWarnings,
            blocked: redaction.blocked
          }
        },
        rights: {
          rights_statement: contributor.rightsStatement,
          rights_confirmed: contributor.rightsConfirmed
        },
        user_attestation: {
          reviewed: contributor.reviewedConfirmed,
          reviewed_at_utc: now,
          attestation_id: randomUuid()
        }
      };
      const transcriptsBytes = encoder2.encode(transcriptsJsonl);
      const prepReportBytes = encoder2.encode(JSON.stringify(prepReport, null, 2));
      const manifestEntries = [];
      manifestEntries.push({
        path: "transcripts.jsonl",
        sha256: await sha256Hex(transcriptsBytes),
        bytes: transcriptsBytes.length
      });
      manifestEntries.push({
        path: "prep_report.json",
        sha256: await sha256Hex(prepReportBytes),
        bytes: prepReportBytes.length
      });
      const manifest = {
        bundle_id: bundleId,
        created_at_utc: now,
        files: manifestEntries,
        tooling: { app_version: appVersion, schema_version: schemaVersion }
      };
      const manifestBytes = encoder2.encode(JSON.stringify(manifest, null, 2));
      manifestEntries.push({
        path: "manifest.json",
        sha256: await sha256Hex(manifestBytes),
        bytes: manifestBytes.length
      });
      let bundleFormat;
      if (requestedFormat === "auto") {
        bundleFormat = selectedSessions.length <= 3 ? "jsonl" : "zip";
      } else {
        bundleFormat = requestedFormat;
      }
      let bundleBytes;
      if (bundleFormat === "jsonl") {
        bundleBytes = transcriptsBytes;
      } else {
        bundleBytes = zipSync({
          "transcripts.jsonl": transcriptsBytes,
          "prep_report.json": prepReportBytes,
          "manifest.json": manifestBytes
        });
      }
      self.postMessage({
        type: "bundle",
        payload: {
          bundleBytes,
          bundleId,
          bundleFormat,
          manifest,
          prepReport,
          transcriptsCount: selectedSessions.length
        }
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        payload: {
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }
};
