# Full Agentwatch Spec (From Scratch)

## Status Legend
- Done: implemented and wired in UI/backend.
- Partial: implemented core but missing requested sub-features.
- Planned: specified but not implemented.

## Watcher

### Agents
- Status: Done (one-off annotations handled in watcher without analyzer).
- Scope: running agents list with status (Active/Waiting/Stalled/Done), custom names/tags, PID, uptime, CPU/mem, last activity (source + time), runtime location, project association, per-agent detail modal, activity feed.
- Data Sources:
  - Process scan: `ps -axo` + cwd resolution via `lsof` (cached).
  - Hook sessions + tool usage (for Claude Code agents).
  - Managed sessions (`aw run`) metadata for wrapped runs.
- File I/O (UX visible):
  - `~/.agentwatch/processes/` (copy button in About data).
  - `~/.agentwatch/enrichments/store.json` (copy button in annotation panel).
  - `~/.agentwatch/conversation-metadata.json` (copy button in annotation panel).
- File I/O (UX not shown):
  - `~/.agentwatch/agent-metadata.json` (custom names/tags).
  - `~/.agentwatch/hooks/` (session/tool logs).
  - `~/.agentwatch/sessions/` (managed sessions).
- Calculations Shown:
  - Heuristic state detection (active/stalled), uptime, last activity age, CPU/mem formatting, tool/commit counts.
- Live Indicators:
  - WebSocket streaming updates; hook activity feed; connected badge.
- Tests:
  - `packages/watcher/test/api.test.ts` (agents endpoints).
  - `packages/watcher/test/scanners-ws.integration.test.ts` (agents WS updates).
  - `packages/monitor/test/scanners.test.ts` (ProcessScanner).
- Open Questions:
  - Should agent metadata file path be visible with copy button?

### Repos + Projects
- Status: Done for shared CRUD and watcher filtering; Partial for richer per-project stats.
- Scope: Repos tab shows only agent/project repos by default; shared Projects editor between watcher/analyzer; infer projects from scanned repos; projects list includes repo dirty/clean stats.
- Data Sources:
  - Repo scanner (git status + worktree info).
  - Shared projects config (watcher edits analyzer config).
- File I/O (UX visible):
  - `~/.config/agentwatch/analyzer.toml` or `~/.config/agentwatch/config.toml` (copy button in Projects pane).
- File I/O (UX not shown):
  - git status queries in repo paths.
- Calculations Shown:
  - Relevant repo filtering by agent cwd / project paths.
  - Per-project repo stats (dirty/clean) and session counts when analytics available.
- Live Indicators:
  - WebSocket updates for repo changes.
- Tests:
  - `packages/watcher/test/api.test.ts` (repos endpoints).
  - `packages/watcher/test/scanners-ws.integration.test.ts` (repos WS updates).
  - `packages/monitor/test/scanners.test.ts` (RepoScanner).
  - `packages/monitor/test/git.test.ts` (git scanner).
- Open Questions:
  - Should watcher display per-project analytics when analyzer is online?
  - Should project repo stats include branch/ahead-behind?

### Ports
- Status: Done.
- Scope: list of listening ports with default filter to agent-linked or project-linked processes; toggle to show all; per-port hide controls.
- Data Sources:
  - Port scanner using `lsof`.
- File I/O (UX visible): none.
- File I/O (UX not shown): none.
- Calculations Shown:
  - Port categories, age, filtered counts (agent-linked/project-linked).
- Live Indicators:
  - WebSocket updates for port changes.
- Tests:
  - `packages/watcher/test/api.test.ts` (ports endpoints).
  - `packages/watcher/test/scanners-ws.integration.test.ts` (ports WS updates).
  - `packages/monitor/test/scanners.test.ts` (PortScanner).
- Open Questions:
  - Persist hidden ports in watcher config (currently only in default dashboard config)?

### Command Center
- Status: Partial.
- Scope: run managed sessions with predictions, prediction history, calibration stats, tmux availability check, and tmux attach command display.
- Required Additions:
  - Full in-browser terminal for managed sessions (pty streaming).
  - Tmux attach workflow should remain available alongside browser terminal.
  - Prediction data entered in Command Center is treated as pre-registered and should be flagged as such in annotations.
- Data Sources:
  - Managed sessions API and prediction store.
- File I/O (UX visible): none.
- File I/O (UX not shown):
  - `~/.agentwatch/predictions/predictions.jsonl`.
  - `~/.agentwatch/sessions/`.
- Calculations Shown:
  - Calibration stats, prediction summaries.
- Live Indicators:
  - Launching state; tmux availability flag.
- Tests:
  - `packages/monitor/src/prediction-store.test.ts`.
- Open Questions:
  - Browser terminal UX (attach, detach, input handling, scrollback, reconnect behavior).
  - Should predictions lock after run starts (true pre-registration)?

### Settings
- Status: Done.
- Scope: watcher config editor with load/save/reload and restart hint; hook enhancements summary tied to watcher config.
- Data Sources:
  - Watcher config TOML.
- File I/O (UX visible):
  - `~/.config/agentwatch/watcher.toml` or `~/.config/agentwatch/config.toml` (copy button in watcher settings).
- Calculations Shown: none.
- Live Indicators: loading/saving states.
- Tests:
  - `packages/watcher/test/api.test.ts` (config routes).
- Open Questions:
  - Add structured editor for common settings (notifications, matchers) vs raw edit only?

### Analyzer Availability Indicator
- Status: Removed.
- Scope: Watcher no longer pings analyzer; analyzer is opened explicitly when needed.
- Data Sources: none.
- File I/O (UX visible): none.
- Calculations Shown: none.
- Live Indicators: none.
- Tests: none.
- Open Questions: none.

## Analyzer

### Conversations
- Status: Partial (quarantine not implemented).
- Scope: Conversations tab with full-width search row, explained filters/tags, left list + detail viewer; shared annotation component (feedback, rating, workflow status, goal achieved, tags, notes, task description, arbitrary JSON); conversation rename; privacy flags in Chat view.
- Data Sources:
  - Hook sessions (`~/.agentwatch/hooks/`).
  - Local transcripts (`~/.claude/`).
  - Managed sessions (`~/.agentwatch/sessions/`).
  - Enrichment store (`~/.agentwatch/enrichments/store.json`).
  - Conversation metadata store (`~/.agentwatch/conversation-metadata.json`).
- File I/O (UX visible):
  - `~/.agentwatch/hooks/` (copy button in Conversations header).
  - `~/.agentwatch/enrichments/store.json` (copy button in annotation panel).
  - `~/.agentwatch/conversation-metadata.json` (copy button in name section).
- File I/O (UX not shown):
  - `~/.agentwatch/sessions/` (managed sessions).
  - `~/.claude/` (transcripts).
- Calculations Shown:
  - Correlation stats, quality scores, auto-tags, token/cost summaries, privacy risk analysis summary.
- Live Indicators:
  - Loading states for list/detail/analyze/bulk compute (no continuous live indicator).
- Tests:
  - `packages/analyzer/test/api.test.ts`.
  - `packages/analyzer/test/integration.test.ts`.
  - `packages/daemon/test/correlation.test.ts`.
  - `packages/daemon/test/enrichments.test.ts`.
  - `packages/daemon/test/annotations.test.ts`.
  - `packages/core/test/transcript.test.ts`.
  - `packages/transcript-parser/src/index.test.ts`.
  - `e2e/analyzer-flow.spec.ts`.
  - `e2e/cross-app.spec.ts`.
- Open Questions:
  - Should transcript root path `~/.claude/` have a copy button?
  - Should we add a live indicator for transcript indexing/scanning?

### Quarantine
- Status: Planned.
- Scope: move transcript files to a quarantine repo under `~/.agentwatch/quarantine/`.
- Data Sources:
  - Transcript files only (no enrichments or hooks for v1).
- File I/O (UX visible): planned copy button for quarantine path.
- Calculations Shown: none.
- Live Indicators: move-in-progress indicator.
- Tests: none.
- Open Questions:
  - Should move be reversible (restore)?
  - Should quarantine update transcript index or maintain separate index?

### Analytics
- Status: Done (but verify functionality).
- Scope: overview + daily analytics with breakdowns and click-through.
- Data Sources:
  - Enrichments + transcript index.
- File I/O (UX visible): none.
- Calculations Shown:
  - Session totals, quality distribution, daily usage, etc.
- Live Indicators: loading state only.
- Tests:
  - `packages/analyzer/test/api.test.ts`.
  - `packages/analyzer/test/integration.test.ts`.
- Open Questions:
  - Which analytics panes are currently broken or missing?

### Projects
- Status: Partial.
- Scope: shared Projects pane; richer analyzer view should include per-project tokens, cost estimates, and tool usage.
- Data Sources:
  - Projects config + analytics API.
- File I/O (UX visible):
  - `~/.config/agentwatch/analyzer.toml` or `~/.config/agentwatch/config.toml` (copy button in Projects pane).
- Calculations Shown:
  - Project session counts (current), add tokens/cost/tool usage per-project (planned).
- Live Indicators: loading state + stale refresh on tab focus.
- Tests:
  - `packages/analyzer/test/api.test.ts` (projects API).
  - `packages/daemon/test/project-matcher.test.ts` (matching logic).
- Open Questions:
  - Which tool usage breakdowns are most useful (calls, success rate, duration)?

### Docs
- Status: Done.
- Scope: docs list + markdown render from repo docs directory.
- Data Sources:
  - `docs/*.md` from repo.
- File I/O (UX visible): none.
- Calculations Shown: none.
- Live Indicators: loading state only.
- Tests: none.
- Open Questions:
  - Should docs be editable in-app or remain read-only?

## Shared Components

### Conversation Annotation Panel
- Status: Done.
- Scope: shared component for manual annotation + arbitrary JSON, used in both Watcher (agent detail) and Analyzer (conversations).
- Pre-Registration Rule:
  - Any data entered in Command Center is considered pre-registered for the run and should be labeled accordingly when displayed in annotations.
- Data Sources:
  - Enrichment store API (`/api/enrichments/:sessionId/annotation`).
- File I/O (UX visible):
  - `~/.agentwatch/enrichments/store.json` (copy button).
  - `~/.agentwatch/conversation-metadata.json` (copy button when naming enabled).
- Calculations Shown: none.
- Live Indicators: save state and error messages.
- Tests:
  - `packages/analyzer/test/api.test.ts` (annotation endpoints).
  - `packages/analyzer/test/integration.test.ts`.
- Open Questions:
  - Should arbitrary JSON be schema-validated or stored as raw?

## Pending Implementation Summary
- In-browser terminal for Command Center runs (plus tmux attach).
- Quarantine transcript move to `~/.agentwatch/quarantine/`.
- Analyzer Projects per-project stats: tokens, cost estimate, tool usage.
- Annotation UI display for pre-registered predictions.
