# Documentation Freshness Review

This file contains instructions and a prompt for AI agents to systematically review and update documentation freshness logs.

## Quick Start

```bash
# Extract all external URLs from docs
bun run scripts/extract-doc-urls.ts

# Or run manually:
grep -roh 'https://[^)]*' docs/*.md | sort -u
```

## Review Process

### 1. Extract URLs to Check

Run the extraction script to get all external URLs referenced in documentation:

```bash
bun run scripts/extract-doc-urls.ts > /tmp/doc-urls.txt
```

### 2. Use the Review Prompt

Copy the prompt below and provide it to an AI agent along with the URL list.

---

## AI Agent Review Prompt

```
You are reviewing agentwatch documentation for freshness and accuracy. Your task is to:

1. For each external URL listed below, fetch the current content
2. Compare it against the agentwatch docs that reference it
3. Note any discrepancies, outdated information, or new features we should document
4. Update the Document Freshness Log at the bottom of each affected doc

## URLs to Check

[PASTE URL LIST HERE]

## Documentation Files to Review

Read each file in docs/*.md and for each one:

1. **Check external references**: Fetch each URL mentioned and verify our docs match
2. **Note discrepancies**: List anything that's changed in the external docs
3. **Update freshness log**: Edit the table at the bottom of each doc:
   - Set "AI review vs external docs" date to today
   - Add notes about what you verified or found
   - If you found issues, note them

## Freshness Log Format

Update the log like this:

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | YYYY-MM-DD | Claude | [What you checked and found] |
| Human full read | — | — | *Awaiting review* |

## Output Format

For each doc reviewed, output:

### [filename.md]
- **URLs checked**: [list]
- **Status**: [Current / Needs Update / Has Issues]
- **Notes**: [What you found]
- **Changes made**: [What you updated in the freshness log]

## Priority Order

Review in this order (most important first):
1. getting-started.md
2. security-overview.md
3. data-sources.md
4. permission-syntax.md
5. configuration.md
6. docker-sandbox.md
7. All other docs
```

---

## Manual Review Checklist

For human reviewers doing a full read:

- [ ] Read entire document top to bottom
- [ ] Verify code examples work
- [ ] Check all internal links resolve
- [ ] Verify external links are accessible
- [ ] Update "Human full read" row with date and initials
- [ ] Note any issues found in the Notes column

---

## External Resources by Priority

### Monthly Review (Fast-moving)

| Resource | URL | Affects |
|----------|-----|---------|
| Claude Code Overview | https://docs.anthropic.com/en/docs/claude-code/overview | getting-started, data-sources |
| Claude Code Hooks | https://docs.anthropic.com/en/docs/claude-code/hooks | configuration, data-sources |
| Claude Code Permissions | https://docs.anthropic.com/en/docs/claude-code/permissions | permission-syntax, security-overview |
| Claude Code Settings | https://docs.anthropic.com/en/docs/claude-code/settings | configuration, permission-syntax |
| Claude Code Security | https://docs.anthropic.com/en/docs/claude-code/security | security-overview, security-levels |

### Quarterly Review (Stable)

| Resource | URL | Affects |
|----------|-----|---------|
| MCP Specification | https://modelcontextprotocol.io/specification | permission-syntax, glossary |
| Docker Desktop | https://docs.docker.com/desktop/ | docker-sandbox |
| Codex CLI | https://github.com/openai/codex | data-sources |
| Gemini CLI | https://github.com/google/gemini-cli | data-sources |
| OpenCode | https://github.com/opencode-ai/opencode | data-sources |

---

## Automation Ideas

Future enhancements:
- [ ] CI job that runs URL extraction weekly
- [ ] Automated link checking (detect 404s)
- [ ] Diff detection for external docs (via web archive)
- [ ] Slack/Discord notification when review is due
