import { useState } from "react";

interface InfoTooltipProps {
  /** The tooltip content */
  content: string;
  /** Optional: make tooltip appear on left instead of right */
  position?: "left" | "right" | "top" | "bottom";
  /** Icon to show (default: ?) */
  icon?: string;
}

/**
 * Info icon with tooltip - use this to add inline documentation to settings
 */
export function InfoTooltip({
  content,
  position = "right",
  icon = "?"
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2"
  };

  return (
    <span
      className="relative inline-flex items-center justify-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <span className="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-[10px] flex items-center justify-center cursor-help hover:bg-gray-500">
        {icon}
      </span>
      {isVisible && (
        <span
          className={`absolute z-50 w-64 p-2 text-xs bg-gray-900 border border-gray-600 rounded shadow-lg text-gray-200 ${positionClasses[position]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

interface StorageInfoProps {
  /** Path to the storage location */
  path: string;
  /** Brief description of what's stored */
  description?: string;
  /** Optional: show as compact inline version */
  compact?: boolean;
}

/**
 * Shows where data is stored - use at bottom of panes for transparency
 */
export function StorageInfo({
  path,
  description,
  compact = false
}: StorageInfoProps) {
  if (compact) {
    return (
      <span className="text-xs text-gray-500">
        Data: <code className="bg-gray-700/50 px-1 rounded">{path}</code>
      </span>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-700/50 text-xs text-gray-500">
      <span className="text-gray-400">Data stored in: </span>
      <code className="bg-gray-700 px-1.5 py-0.5 rounded">{path}</code>
      {description && <span className="ml-2 text-gray-600">{description}</span>}
    </div>
  );
}

interface HookTypeInfoProps {
  /** Hook type (SessionStart, PreToolUse, etc) */
  hookType: string;
  /** Show as badge instead of full description */
  asBadge?: boolean;
}

// Hook type descriptions from Claude Code docs
const HOOK_DESCRIPTIONS: Record<
  string,
  { summary: string; when: string; useCase: string }
> = {
  SessionStart: {
    summary: "Session initialized",
    when: "When Claude starts a new session or resumes an existing one",
    useCase: "Inject context, check prerequisites, log session start"
  },
  PreToolUse: {
    summary: "Before tool execution",
    when: "Before Claude executes any tool (Read, Write, Bash, etc.)",
    useCase: "Validate inputs, add dry-run flags, block dangerous operations"
  },
  PostToolUse: {
    summary: "After tool execution",
    when: "After a tool completes (success or failure)",
    useCase: "Log results, track metrics, trigger follow-up actions"
  },
  Stop: {
    summary: "Turn complete",
    when: "When Claude finishes responding and yields control",
    useCase: "Quality gates, notify user, update status"
  },
  SubagentStop: {
    summary: "Subagent finished",
    when: "When a Task agent completes its work",
    useCase: "Validate subagent output, aggregate results"
  },
  Notification: {
    summary: "Status message",
    when: "When Claude wants to send a user notification",
    useCase: "Custom notification routing, logging"
  },
  UserPromptSubmit: {
    summary: "User sent prompt",
    when: "After user submits a message to Claude",
    useCase: "Prompt validation, context injection"
  },
  PermissionRequest: {
    summary: "Approval needed",
    when: "When Claude requests permission for an action",
    useCase: "Auto-approve safe operations, log decisions"
  },
  PreCompact: {
    summary: "Context compaction",
    when: "Before Claude compacts the conversation context",
    useCase: "Preserve important context, log compaction events"
  }
};

/**
 * Shows hook type with description tooltip
 */
export function HookTypeInfo({ hookType, asBadge = false }: HookTypeInfoProps) {
  const [isVisible, setIsVisible] = useState(false);
  const info = HOOK_DESCRIPTIONS[hookType];

  if (!info) {
    return <span className="text-gray-400">{hookType}</span>;
  }

  if (asBadge) {
    return (
      <span
        className="relative inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        <span className="px-2 py-0.5 text-xs bg-blue-900/50 text-blue-300 rounded cursor-help">
          {hookType}
        </span>
        {isVisible && (
          <span className="absolute z-50 left-0 top-full mt-1 w-72 p-3 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
            <div className="font-medium text-white mb-1">{info.summary}</div>
            <div className="text-gray-400 mb-2">
              <span className="text-gray-500">When: </span>
              {info.when}
            </div>
            <div className="text-gray-400">
              <span className="text-gray-500">Use case: </span>
              {info.useCase}
            </div>
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <span className="text-blue-400 cursor-help border-b border-dotted border-blue-400/50">
        {hookType}
      </span>
      {isVisible && (
        <div className="absolute z-50 left-0 top-full mt-1 w-72 p-3 bg-gray-900 border border-gray-600 rounded shadow-lg text-xs">
          <div className="font-medium text-white mb-1">{info.summary}</div>
          <div className="text-gray-400 mb-2">
            <span className="text-gray-500">When: </span>
            {info.when}
          </div>
          <div className="text-gray-400">
            <span className="text-gray-500">Use case: </span>
            {info.useCase}
          </div>
        </div>
      )}
    </div>
  );
}

// Export all hook descriptions for use elsewhere
export { HOOK_DESCRIPTIONS };
