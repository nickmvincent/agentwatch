#!/usr/bin/env bun
/**
 * Check External Resources Script
 *
 * Parses docs/EXTERNAL_RESOURCES.md and reports which resources are overdue for review.
 * Run with: bun run docs:check-sync
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface Resource {
  name: string;
  url: string;
  lastSynced: Date;
  reviewInterval: "monthly" | "quarterly" | "yearly";
  section: string;
}

const INTERVAL_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365
};

function parseExternalResources(content: string): Resource[] {
  const resources: Resource[] = [];
  const lines = content.split("\n");

  let currentSection = "";
  let inTable = false;

  for (const line of lines) {
    // Track section headers
    if (line.startsWith("## ")) {
      currentSection = line.replace("## ", "").trim();
      inTable = false;
      continue;
    }

    // Detect table start
    if (line.includes("| Resource") || line.includes("| Agent")) {
      inTable = true;
      continue;
    }

    // Skip table separator
    if (line.includes("|---")) {
      continue;
    }

    // Parse table rows
    if (inTable && line.startsWith("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c);

      if (cells.length >= 4) {
        const name = cells[0];
        const urlMatch = cells[1].match(/\((https?:\/\/[^)]+)\)/);
        const url = urlMatch ? urlMatch[1] : cells[1];
        const lastSynced = cells[2];
        const reviewInterval = cells[3].toLowerCase();

        // Validate date
        const date = new Date(lastSynced);
        if (isNaN(date.getTime())) {
          continue;
        }

        // Validate interval
        const interval = reviewInterval as "monthly" | "quarterly" | "yearly";
        if (!INTERVAL_DAYS[interval]) {
          continue;
        }

        resources.push({
          name,
          url,
          lastSynced: date,
          reviewInterval: interval,
          section: currentSection
        });
      }
    }

    // End table on empty line
    if (inTable && line.trim() === "") {
      inTable = false;
    }
  }

  return resources;
}

function checkResources(resources: Resource[]): {
  overdue: Resource[];
  upcoming: Resource[];
  ok: Resource[];
} {
  const now = new Date();
  const overdue: Resource[] = [];
  const upcoming: Resource[] = [];
  const ok: Resource[] = [];

  for (const resource of resources) {
    const intervalDays = INTERVAL_DAYS[resource.reviewInterval];
    const daysSinceSync = Math.floor(
      (now.getTime() - resource.lastSynced.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysUntilDue = intervalDays - daysSinceSync;

    if (daysUntilDue < 0) {
      overdue.push(resource);
    } else if (daysUntilDue <= 7) {
      upcoming.push(resource);
    } else {
      ok.push(resource);
    }
  }

  return { overdue, upcoming, ok };
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function main() {
  const docsPath = join(import.meta.dir, "..", "docs", "EXTERNAL_RESOURCES.md");

  if (!existsSync(docsPath)) {
    console.error("Error: docs/EXTERNAL_RESOURCES.md not found");
    process.exit(1);
  }

  const content = readFileSync(docsPath, "utf-8");
  const resources = parseExternalResources(content);

  if (resources.length === 0) {
    console.error("Warning: No resources found in EXTERNAL_RESOURCES.md");
    process.exit(1);
  }

  const { overdue, upcoming, ok } = checkResources(resources);
  const now = new Date();

  console.log("\n📚 External Resources Sync Check");
  console.log(`   ${formatDate(now)}\n`);
  console.log(`   Total resources tracked: ${resources.length}\n`);

  if (overdue.length > 0) {
    console.log("🔴 OVERDUE FOR REVIEW:");
    for (const r of overdue) {
      const daysSince = Math.floor(
        (now.getTime() - r.lastSynced.getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`   • ${r.name} (${r.section})`);
      console.log(
        `     Last synced: ${formatDate(r.lastSynced)} (${daysSince} days ago)`
      );
      console.log(`     URL: ${r.url}\n`);
    }
  }

  if (upcoming.length > 0) {
    console.log("🟡 DUE WITHIN 7 DAYS:");
    for (const r of upcoming) {
      const intervalDays = INTERVAL_DAYS[r.reviewInterval];
      const daysSince = Math.floor(
        (now.getTime() - r.lastSynced.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysUntilDue = intervalDays - daysSince;
      console.log(`   • ${r.name} (${r.section})`);
      console.log(`     Due in ${daysUntilDue} days`);
      console.log(`     URL: ${r.url}\n`);
    }
  }

  if (overdue.length === 0 && upcoming.length === 0) {
    console.log("✅ All resources are up to date!\n");
  }

  console.log(`🟢 Up to date: ${ok.length} resources\n`);

  if (overdue.length > 0) {
    console.log(
      "To update, review each URL and then update the 'Last Synced' date"
    );
    console.log("in docs/EXTERNAL_RESOURCES.md\n");
    process.exit(1);
  }
}

main();
