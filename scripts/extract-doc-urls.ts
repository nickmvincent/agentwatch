#!/usr/bin/env bun
/**
 * Extract all external URLs from documentation files
 *
 * Usage:
 *   bun run scripts/extract-doc-urls.ts
 *   bun run scripts/extract-doc-urls.ts --by-file
 *   bun run scripts/extract-doc-urls.ts --json
 */

import { join } from "path";
import { readFile, readdir } from "fs/promises";

const DOCS_DIR = join(import.meta.dir, "../docs");

interface UrlInfo {
  url: string;
  file: string;
  line: number;
  context: string;
}

async function extractUrls(): Promise<UrlInfo[]> {
  const files = await readdir(DOCS_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const results: UrlInfo[] = [];

  for (const file of mdFiles) {
    const content = await readFile(join(DOCS_DIR, file), "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match URLs in markdown links and plain URLs
      const urlRegex = /https?:\/\/[^\s\)\]>"']+/g;
      let match;

      while ((match = urlRegex.exec(line)) !== null) {
        // Clean up trailing punctuation
        const url = match[0].replace(/[.,;:!?]+$/, "");

        results.push({
          url,
          file,
          line: i + 1,
          context: line.trim().slice(0, 100)
        });
      }
    }
  }

  return results;
}

function groupByDomain(urls: UrlInfo[]): Map<string, UrlInfo[]> {
  const groups = new Map<string, UrlInfo[]>();

  for (const info of urls) {
    try {
      const domain = new URL(info.url).hostname;
      const existing = groups.get(domain) || [];
      existing.push(info);
      groups.set(domain, existing);
    } catch {
      // Skip invalid URLs
    }
  }

  return groups;
}

function groupByFile(urls: UrlInfo[]): Map<string, UrlInfo[]> {
  const groups = new Map<string, UrlInfo[]>();

  for (const info of urls) {
    const existing = groups.get(info.file) || [];
    existing.push(info);
    groups.set(info.file, existing);
  }

  return groups;
}

async function main() {
  const args = process.argv.slice(2);
  const byFile = args.includes("--by-file");
  const jsonOutput = args.includes("--json");

  const urls = await extractUrls();

  // Deduplicate URLs
  const uniqueUrls = [...new Set(urls.map((u) => u.url))].sort();

  if (jsonOutput) {
    const byDomain = groupByDomain(urls);
    const output = {
      total: urls.length,
      unique: uniqueUrls.length,
      byDomain: Object.fromEntries(byDomain),
      byFile: Object.fromEntries(groupByFile(urls))
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (byFile) {
    const grouped = groupByFile(urls);
    console.log("# External URLs by File\n");

    for (const [file, fileUrls] of grouped) {
      console.log(`## ${file}`);
      const uniqueFileUrls = [...new Set(fileUrls.map((u) => u.url))];
      for (const url of uniqueFileUrls) {
        console.log(`- ${url}`);
      }
      console.log();
    }
  } else {
    // Default: group by domain
    const byDomain = groupByDomain(urls);

    console.log("# External URLs by Domain\n");
    console.log(
      `Total: ${urls.length} references, ${uniqueUrls.length} unique URLs\n`
    );

    // Sort domains by count (descending)
    const sortedDomains = [...byDomain.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );

    for (const [domain, domainUrls] of sortedDomains) {
      const uniqueDomainUrls = [...new Set(domainUrls.map((u) => u.url))];
      console.log(
        `## ${domain} (${uniqueDomainUrls.length} URLs, ${domainUrls.length} refs)`
      );

      for (const url of uniqueDomainUrls) {
        const files = [
          ...new Set(domainUrls.filter((u) => u.url === url).map((u) => u.file))
        ];
        console.log(`- ${url}`);
        console.log(`  Referenced in: ${files.join(", ")}`);
      }
      console.log();
    }
  }

  // Summary for review prompt
  console.log("---\n");
  console.log("## URLs for Review Prompt\n");
  console.log("```");
  for (const url of uniqueUrls) {
    console.log(url);
  }
  console.log("```");
}

main().catch(console.error);
