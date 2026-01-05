# Agentwatch Vision

> This document captures the long-term vision for agentwatch, synthesized from discussions about public AI data flywheels and the role of agent contribution logs.

## Core Mission

Agentwatch is a tool that helps users **collect, understand, and share their coding agent interaction logs**. It operates at two stages of the data pipeworks:

- **Stage 2 (Records)**: Transforming raw agent logs into sanitized, shareable records
- **Stage 5 (Feedback loops)**: Enabling contributions that improve future AI models

## The Agent-First Hypothesis

As coding agents (Claude Code, Codex, OpenCode, etc.) become the dominant way developers interact with AI, agent logs become a critical data source for AI improvement. Paradoxically, agent logs are **easier to share** than web chat logs because:

1. **Possession**: Agent logs exist as files on your machine. Web chats may only exist on the provider's servers.
2. **Structure**: Agent logs are well-structured (JSONL with clear message types, explicit tool calls)
3. **Boundaries**: Sessions have clear start/end points
4. **Context**: Less ambient personal context than casual chat

## Data Model

Agentwatch collects data from hooks and process monitoring, and reads (but doesn't modify) existing agent transcripts. See [Data Sources](data-sources.md) for implementation details and [Getting Started](getting-started.md) for the collection architecture.

## The Sandboxing Insight

There's a powerful coupling between **responsible tool use** and **data sharing**:

> Good sandboxing → cleaner logs → easier sharing

If your coding agent operates in a well-isolated environment:
- Less sensitive context leaks into logs
- Sanitization becomes simpler
- You can share more freely

This means helping users set up good security practices directly enables better data contribution. Agentwatch should document and encourage this.

## Automation Vision

Once a user has their settings configured:
1. Agentwatch collects logs via hooks/scanning
2. At regular intervals, logs are prepared for contribution
3. User reviews and approves (or auto-approves based on trust settings)
4. Contributions flow to destination (HuggingFace, data collective, etc.)

The goal is "set it and forget it" contribution for users who trust their setup.

## Preference Signals and Licensing

Future versions should support:
- Per-contribution license metadata (CC0, CC-BY, CC-BY-SA, etc.)
- AI preference signals (`train-genai=n;exceptions=cc-cr`, etc.)
- Granular controls (per-session preferences)

This is important but not immediate priority. Legal/licensing clarity is still evolving in the ecosystem.

## Data Collectives

Agentwatch contributions can naturally coordinate with data collectives:
- Open source project communities
- Companies with OSS policies
- Language/framework communities
- Geographic/regulatory groupings

Collectives can:
- Aggregate contributions from members
- Set default licensing/preferences
- Negotiate with AI labs
- Provide server-side processing (the appropriate place for non-local processing)

## Architecture Principles

### Local-First Processing

Local-first is a core principle:
- Sanitization happens client-side (browser workers, CLI)
- Users maintain control over their data
- Server-side processing only appropriate at collective level

### Flexible Backend

HuggingFace is currently convenient for storage/publishing, but the architecture should remain backend-agnostic. Contributions could go to:
- HuggingFace datasets
- GitHub repositories
- Data collective endpoints
- Custom destinations

### Two UI Surfaces

| Surface | Purpose |
|---------|---------|
| **Static site (pages/)** | Demo/proof-of-concept for public AI community |
| **Full web app (web/)** | Primary interface for agentwatch ecosystem |

Both share core logic via `@agentwatch/pre-share`. The static site demonstrates the concepts; real contributions flow through the full software.

## Connection to Public AI Data Flywheels

Agentwatch is part of a broader vision for public AI data flywheels (see paidf-mini-book concepts):

- **Transparency**: Users see exactly what data is shared
- **Consent**: Explicit opt-in for all contributions
- **Data Rights**: Export, delete, control at all times
- **Preference Signals**: Machine-readable expressions of intent
- **Data Leverage**: Collective bargaining power through data flow control

## Success Metrics

A healthy agentwatch ecosystem would show:
- Growing number of contributors
- High-quality, well-sanitized contributions
- Visible impact on public AI models
- Active data collectives
- Low friction for repeat contributors
- Trust maintained over time

## Open Questions

1. How to correlate hooks/process data with existing transcripts?
2. What shared identifiers exist across collection methods?
3. How to balance automation with user review?
4. What's the right granularity for preference signals?
5. How to measure contribution quality and impact?

---

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Internal vision doc; no external references |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
