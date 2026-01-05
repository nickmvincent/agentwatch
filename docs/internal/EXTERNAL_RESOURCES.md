# External Resources Tracking

This file tracks external documentation and resources that agentwatch documentation references. When these external resources update, our documentation may need to be updated as well.

> **Maintainers:** Run `bun run docs:check-sync` to see if any resources are overdue for review.

---

## Claude Code

| Resource | URL | Last Synced | Review Interval |
|----------|-----|-------------|-----------------|
| Claude Code Overview | https://docs.anthropic.com/en/docs/claude-code/overview | 2025-12-31 | Monthly |
| Claude Code Hooks | https://docs.anthropic.com/en/docs/claude-code/hooks | 2025-12-31 | Monthly |
| Claude Code Settings | https://docs.anthropic.com/en/docs/claude-code/settings | 2025-12-31 | Monthly |
| Claude Code Permissions | https://docs.anthropic.com/en/docs/claude-code/permissions | 2025-12-31 | Monthly |
| Claude Code Sandbox | https://docs.anthropic.com/en/docs/claude-code/security | 2025-12-31 | Monthly |

**What to check for:** New hook types, permission syntax changes, new settings options, security feature updates.

**Docs affected:** `getting-started.md`, `permission-syntax.md`, `configuration.md`, `security.md`

---

## Model Context Protocol (MCP)

| Resource | URL | Last Synced | Review Interval |
|----------|-----|-------------|-----------------|
| MCP Specification | https://modelcontextprotocol.io/specification | 2025-12-31 | Quarterly |
| MCP Quickstart | https://modelcontextprotocol.io/quickstart | 2025-12-31 | Quarterly |

**What to check for:** New tool types, protocol changes, new capabilities.

**Docs affected:** `permission-syntax.md`, `configuration.md`

---

## HuggingFace

| Resource | URL | Last Synced | Review Interval |
|----------|-----|-------------|-----------------|
| Datasets Documentation | https://huggingface.co/docs/datasets/ | 2025-12-31 | Quarterly |
| Hub API | https://huggingface.co/docs/huggingface_hub/ | 2025-12-31 | Quarterly |

**What to check for:** API changes, new dataset formats, upload requirements.

**Docs affected:** `README.md`, contributing workflow in web UI

---

## Docker

| Resource | URL | Last Synced | Review Interval |
|----------|-----|-------------|-----------------|
| Docker Desktop | https://docs.docker.com/desktop/ | 2025-12-31 | Quarterly |
| Dockerfile Reference | https://docs.docker.com/reference/dockerfile/ | 2025-12-31 | Quarterly |

**What to check for:** Volume mount syntax changes, security features, platform-specific updates.

**Docs affected:** `docker-sandbox.md`, `security.md`

---

## Other Coding Agents

These are agents that agentwatch can monitor. Check their docs for log format changes.

| Agent | Documentation URL | Last Synced | Review Interval |
|-------|------------------|-------------|-----------------|
| Codex CLI | https://github.com/openai/codex | 2025-12-31 | Quarterly |
| Gemini CLI | https://github.com/google/gemini-cli | 2025-12-31 | Quarterly |
| OpenCode | https://github.com/opencode-ai/opencode | 2025-12-31 | Quarterly |
| Cursor | https://docs.cursor.com | 2025-12-31 | Quarterly |

**What to check for:** Log file locations, log format changes, new features that affect monitoring.

**Docs affected:** `data-sources.md`, `README.md`

---

## macOS Security

| Resource | URL | Last Synced | Review Interval |
|----------|-----|-------------|-----------------|
| App Sandbox | https://developer.apple.com/documentation/security/app_sandbox | 2025-12-31 | Quarterly |

**What to check for:** New sandbox restrictions, entitlement changes.

**Docs affected:** `security.md`

---

## How to Update This File

When you review an external resource:

1. Open the resource URL and check for significant changes
2. Update any affected documentation files
3. Update the "Last Synced" date in the table above
4. If the resource structure changed significantly, update the URL

### Sync Date Format

Use `YYYY-MM-DD` format for all dates.

### Review Intervals

- **Monthly**: Fast-moving projects or critical dependencies (Claude Code)
- **Quarterly**: Stable projects or less critical dependencies
- **Yearly**: Very stable specifications

---

## Changelog

| Date | Resource | Changes Made |
|------|----------|--------------|
| 2025-12-31 | Initial | Created tracking file with all resources |

---

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Created fresh; URLs verified |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>

