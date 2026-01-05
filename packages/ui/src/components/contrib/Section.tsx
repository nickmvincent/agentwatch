/**
 * Section - Collapsible section wrapper for the contribution wizard steps.
 */

import type { ReactNode } from "react";

export interface SectionProps {
  title: string;
  step: number;
  expanded: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  step,
  expanded,
  onToggle,
  badge,
  children
}: SectionProps) {
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-gray-700/50 flex items-center justify-between hover:bg-gray-700"
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
            {step}
          </span>
          <span className="font-medium text-white">{title}</span>
          {badge}
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  );
}
