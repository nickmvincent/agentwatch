/**
 * Help text and tooltip components for the contribution flow.
 * Provides contextual explanations to improve transparency and usability.
 */

import { type ReactNode, useState } from "react";

// ============================================================================
// Tooltip Component
// ============================================================================

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-block">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="cursor-help"
      >
        {children}
      </span>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg shadow-lg text-xs text-gray-200 whitespace-normal w-64">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-600" />
        </div>
      )}
    </span>
  );
}

// ============================================================================
// Help Icon
// ============================================================================

interface HelpIconProps {
  tooltip: ReactNode;
}

export function HelpIcon({ tooltip }: HelpIconProps) {
  return (
    <Tooltip content={tooltip}>
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-700 text-gray-400 text-[10px] font-bold hover:bg-gray-600 hover:text-gray-200">
        ?
      </span>
    </Tooltip>
  );
}

// ============================================================================
// Info Box
// ============================================================================

interface InfoBoxProps {
  type?: "info" | "warning" | "tip";
  title?: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function InfoBox({
  type = "info",
  title,
  children,
  collapsible = false,
  defaultExpanded = true
}: InfoBoxProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const colors = {
    info: "bg-blue-900/20 border-blue-700 text-blue-300",
    warning: "bg-yellow-900/20 border-yellow-700 text-yellow-300",
    tip: "bg-green-900/20 border-green-700 text-green-300"
  };

  const icons = {
    info: "i",
    warning: "!",
    tip: "*"
  };

  return (
    <div className={`p-3 rounded border ${colors[type]}`}>
      {(title || collapsible) && (
        <div
          className={`flex items-center gap-2 text-xs font-medium ${collapsible ? "cursor-pointer" : ""}`}
          onClick={() => collapsible && setExpanded(!expanded)}
        >
          <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
            {icons[type]}
          </span>
          {title && <span>{title}</span>}
          {collapsible && (
            <span className="ml-auto text-gray-500">
              {expanded ? "▼" : "▶"}
            </span>
          )}
        </div>
      )}
      {(!collapsible || expanded) && (
        <div className={`text-xs ${title ? "mt-2" : ""}`}>{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// Standard Help Content
// ============================================================================

export const HELP_CONTENT = {
  privacyScore: (
    <>
      <strong>Privacy Score (0-100)</strong>
      <p className="mt-1">
        Higher is better. This score estimates how safe the transcript is to
        share publicly.
      </p>
      <ul className="mt-1 space-y-0.5 text-gray-400">
        <li>
          <span className="text-green-400">80+</span>: Low risk - minimal
          sensitive content detected
        </li>
        <li>
          <span className="text-yellow-400">50-79</span>: Medium risk - some
          items may need review
        </li>
        <li>
          <span className="text-red-400">&lt;50</span>: High risk - review
          carefully before sharing
        </li>
      </ul>
    </>
  ),

  fieldCategories: (
    <>
      <strong>Field Categories</strong>
      <ul className="mt-1 space-y-1 text-gray-400">
        <li>
          <span className="text-blue-300">Essential</span>: Required for the
          data to be useful (always included)
        </li>
        <li>
          <span className="text-blue-300">Recommended</span>: Useful context,
          but can be removed if sensitive
        </li>
        <li>
          <span className="text-gray-400">Optional</span>: Extra metadata - safe
          to remove
        </li>
      </ul>
      <p className="mt-1 text-gray-500">
        Unselected fields are completely removed from the output.
      </p>
    </>
  ),

  redactionTypes: {
    secrets:
      "API keys, access tokens, private keys, passwords, and other credentials",
    pii: "Email addresses, phone numbers, IP addresses, and other personally identifiable information",
    paths:
      "File paths that may contain your username or reveal directory structure",
    highEntropy: "Long random-looking strings that might be tokens or keys"
  },

  licenses: {
    "CC-BY-4.0": {
      name: "Attribution 4.0",
      description:
        "Others can use your data for any purpose, including commercial and AI training, as long as they credit you.",
      link: "https://creativecommons.org/licenses/by/4.0/"
    },
    "CC-BY-SA-4.0": {
      name: "Attribution-ShareAlike 4.0",
      description:
        "Like CC-BY, but derivatives must use the same license. Ensures your contributions remain open.",
      link: "https://creativecommons.org/licenses/by-sa/4.0/"
    },
    "CC0-1.0": {
      name: "Public Domain",
      description:
        "You waive all rights. Anyone can use your data for anything without attribution.",
      link: "https://creativecommons.org/publicdomain/zero/1.0/"
    }
  },

  aiPreferences: {
    "train-genai=ok": {
      label: "Permissive",
      description:
        "Allow any AI/ML use including commercial AI training. Maximum impact for AI development."
    },
    "train-genai=conditional;conditions=open-weights-only": {
      label: "Open Only",
      description:
        "Only allow use in open-source/open-weights models. No closed commercial models."
    },
    "train-genai=no": {
      label: "No AI Training",
      description:
        "Do not use for AI training. Data can still be used for research, benchmarks, and analysis."
    }
  },

  attestations: {
    rights: (
      <>
        <strong>What rights do you need?</strong>
        <ul className="mt-1 space-y-0.5 text-gray-400">
          <li>You created the prompts yourself (not copied from others)</li>
          <li>You're not sharing confidential work information</li>
          <li>Any code shown is yours or appropriately licensed</li>
          <li>No third-party copyrighted content (unless fair use)</li>
        </ul>
      </>
    ),
    reviewed: (
      <>
        <strong>What should you review?</strong>
        <ul className="mt-1 space-y-0.5 text-gray-400">
          <li>Check the diff view for any remaining sensitive data</li>
          <li>Look for names, emails, or API keys that weren't caught</li>
          <li>Verify project-specific terms are redacted if needed</li>
          <li>Use "Original" view to compare with redacted version</li>
        </ul>
      </>
    )
  },

  huggingFace: {
    repoFormat: (
      <>
        <strong>Dataset Repository Format</strong>
        <p className="mt-1">
          Enter as:{" "}
          <code className="px-1 bg-gray-800 rounded">
            your-username/dataset-name
          </code>
        </p>
        <p className="mt-1 text-gray-400">
          The dataset must already exist on HuggingFace. You need write access
          to upload.
        </p>
      </>
    ),
    whatHappens: (
      <>
        <strong>What happens after upload?</strong>
        <ul className="mt-1 space-y-0.5 text-gray-400">
          <li>Your bundle is uploaded to the dataset's files</li>
          <li>
            It becomes publicly accessible (or private if the dataset is
            private)
          </li>
          <li>You can view/delete it from the HuggingFace web interface</li>
        </ul>
      </>
    )
  },

  customPatterns: (
    <>
      <strong>Custom Redaction Patterns</strong>
      <p className="mt-1">Add words or patterns you want redacted. Examples:</p>
      <ul className="mt-1 space-y-0.5 text-gray-400">
        <li>
          <code className="px-1 bg-gray-800 rounded">my-company-name</code> -
          redact literal text
        </li>
        <li>
          <code className="px-1 bg-gray-800 rounded">ProjectX</code> - redact
          project names
        </li>
        <li>
          <code className="px-1 bg-gray-800 rounded">
            \b192\.168\.\d+\.\d+\b
          </code>{" "}
          - regex for local IPs
        </li>
      </ul>
    </>
  ),

  diffView: {
    changes: "Shows only the parts that were changed by redaction",
    full: "Shows the complete content with changes highlighted inline",
    original: "Shows the original content before any redaction",
    colors: (
      <>
        <span className="bg-red-900/50 text-red-300 line-through px-1 rounded">
          Red strikethrough
        </span>{" "}
        = removed
        <span className="mx-2">/</span>
        <span className="bg-green-900/50 text-green-300 px-1 rounded">
          Green highlight
        </span>{" "}
        = replacement
      </>
    )
  },

  exportFormat: (
    <>
      <strong>Export Format</strong>
      <ul className="mt-1 space-y-0.5 text-gray-400">
        <li>
          <strong>JSONL</strong>: Simple, one transcript per line. Best for 1-3
          sessions.
        </li>
        <li>
          <strong>ZIP</strong>: Includes manifest and prep report. Best for
          larger contributions.
        </li>
      </ul>
      <p className="mt-1 text-gray-500">
        Format is chosen automatically based on session count.
      </p>
    </>
  )
};

// ============================================================================
// Pre-Export Summary Component
// ============================================================================

interface ExportSummaryProps {
  sessionCount: number;
  totalChars: number;
  redactionCount: number;
  fieldsStripped: number;
  warningCount: number;
  license: string;
  aiPreference: string;
}

export function ExportSummary({
  sessionCount,
  totalChars,
  redactionCount,
  fieldsStripped,
  warningCount,
  license,
  aiPreference
}: ExportSummaryProps) {
  const formatSize = (chars: number) => {
    if (chars < 1000) return `${chars} chars`;
    if (chars < 1000000) return `~${(chars / 1000).toFixed(1)}K chars`;
    return `~${(chars / 1000000).toFixed(1)}M chars`;
  };

  const licenseInfo =
    HELP_CONTENT.licenses[license as keyof typeof HELP_CONTENT.licenses];
  const aiInfo = Object.entries(HELP_CONTENT.aiPreferences).find(([k]) =>
    aiPreference.startsWith(k.split(";")[0] ?? "")
  )?.[1];

  return (
    <div className="p-3 bg-gray-900/50 rounded border border-gray-700 space-y-3">
      <div className="text-sm font-medium text-white">Contribution Summary</div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 bg-gray-800 rounded">
          <div className="text-lg font-bold text-blue-400">{sessionCount}</div>
          <div className="text-[10px] text-gray-500">Sessions</div>
        </div>
        <div className="p-2 bg-gray-800 rounded">
          <div className="text-lg font-bold text-purple-400">
            {formatSize(totalChars)}
          </div>
          <div className="text-[10px] text-gray-500">Content</div>
        </div>
        <div className="p-2 bg-gray-800 rounded">
          <div className="text-lg font-bold text-green-400">
            {redactionCount}
          </div>
          <div className="text-[10px] text-gray-500">Redactions</div>
        </div>
        <div className="p-2 bg-gray-800 rounded">
          <div className="text-lg font-bold text-orange-400">
            {fieldsStripped}
          </div>
          <div className="text-[10px] text-gray-500">Fields Stripped</div>
        </div>
      </div>

      {warningCount > 0 && (
        <div className="text-xs text-yellow-400 flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-yellow-900/50 flex items-center justify-center">
            !
          </span>
          {warningCount} warning{warningCount !== 1 ? "s" : ""} to review
        </div>
      )}

      <div className="text-xs text-gray-400 space-y-1">
        <div>
          <span className="text-gray-500">License:</span>{" "}
          <Tooltip content={licenseInfo?.description || license}>
            <span className="text-white">{licenseInfo?.name || license}</span>
          </Tooltip>
        </div>
        <div>
          <span className="text-gray-500">AI Preference:</span>{" "}
          <Tooltip content={aiInfo?.description || aiPreference}>
            <span className="text-white">{aiInfo?.label || aiPreference}</span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Getting Started Guide
// ============================================================================

export function GettingStartedGuide() {
  return (
    <InfoBox
      type="tip"
      title="How to Export Your Transcripts"
      collapsible
      defaultExpanded={false}
    >
      <div className="space-y-2">
        <p>First, export your transcripts from your coding agent:</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-gray-800 rounded">
            <div className="text-purple-300 font-medium text-xs">
              Claude Code
            </div>
            <code className="text-[10px] text-gray-400">
              claude export --format zip
            </code>
          </div>
          <div className="p-2 bg-gray-800 rounded">
            <div className="text-blue-300 font-medium text-xs">Codex</div>
            <code className="text-[10px] text-gray-400">
              codex export --format zip
            </code>
          </div>
        </div>
        <p className="text-gray-500">
          Then upload the ZIP file above to review and sanitize your sessions.
        </p>
      </div>
    </InfoBox>
  );
}

// ============================================================================
// Review Checklist
// ============================================================================

interface ReviewChecklistProps {
  onComplete?: (complete: boolean) => void;
}

export function ReviewChecklist({ onComplete }: ReviewChecklistProps) {
  const [checks, setChecks] = useState({
    diffReviewed: false,
    noSecrets: false,
    noPersonal: false,
    noConfidential: false
  });

  const allChecked = Object.values(checks).every(Boolean);

  const toggle = (key: keyof typeof checks) => {
    const newChecks = { ...checks, [key]: !checks[key] };
    setChecks(newChecks);
    onComplete?.(Object.values(newChecks).every(Boolean));
  };

  return (
    <div className="p-3 bg-gray-900/50 rounded border border-gray-700 space-y-2">
      <div className="text-xs font-medium text-gray-300">Review Checklist</div>
      <div className="space-y-1.5">
        {[
          {
            key: "diffReviewed",
            label: "I reviewed the diff for each session"
          },
          {
            key: "noSecrets",
            label: "No API keys, tokens, or passwords remain visible"
          },
          {
            key: "noPersonal",
            label: "No personal information (names, emails) remains"
          },
          {
            key: "noConfidential",
            label: "No confidential work information is included"
          }
        ].map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200"
          >
            <input
              type="checkbox"
              checked={checks[key as keyof typeof checks]}
              onChange={() => toggle(key as keyof typeof checks)}
              className="rounded"
            />
            {label}
          </label>
        ))}
      </div>
      {allChecked && (
        <div className="text-xs text-green-400 flex items-center gap-1">
          <span>*</span> Review complete
        </div>
      )}
    </div>
  );
}
