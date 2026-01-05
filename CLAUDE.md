# Agent Instructions

General guidance for AI agents working on this codebase.

## Architecture

**Monorepo with Bun workspaces:**
- `packages/core` - Shared types, sanitization, transcript parsing
- `packages/monitor` - Data stores, process/repo/port scanners, hook store
- `packages/daemon` - HTTP API server (Hono), serves web UI
- `packages/cli` - CLI commands (`aw daemon`, `aw hooks`, etc.)
- `packages/tui` - Terminal UI (Ink/React)
- `packages/pre-share` - Sanitization library (browser + server)
- `web/` - React dashboard (Vite, serves from daemon)
- `pages/` - Static site (Astro, for standalone use)

**Data flow:** Hooks/scanners → DataStore/HookStore → API → Web UI

## Development vs Production

| Mode | Command | Source | Hot Reload | Port |
|------|---------|--------|------------|------|
| Dev | `bun run dev` | `src/*.ts` | Yes | 5173 (web) + 8420 (API) |
| Prod | `aw daemon start` | `dist/*.js` | No | 8420 |

**Dev commands:**
```bash
bun run dev              # Full stack with hot reload (use :5173)
bun run dev:debug        # Same + request logging
bun run dev:daemon       # Daemon only
bun run dev:web          # Web only (needs daemon running)
```

**Prod commands:**
```bash
aw daemon start          # Background
aw daemon start -f       # Foreground (see logs)
aw daemon stop/status    # Control
bun run daemon:rebuild   # Rebuild packages + restart
```

**Key:** Dev uses `src/`, prod uses `dist/`. After editing daemon code in prod mode, run `daemon:rebuild`.

## Testing

```bash
bun run test                       # Run all package tests
bun run test -- --coverage         # With coverage
bun run test:e2e                   # Run Playwright e2e tests
bun run build                      # Build all packages
cd packages/pre-share && bun test  # Test specific package
```

## Common Patterns

**API style:** Snake_case in JSON responses, camelCase in TypeScript
**File storage:** JSONL for append-only logs, JSON for state
**Data directory:** `~/.agentwatch/` (hooks/, logs/, processes/)

## Package Dependencies

Build order matters:
1. `@agentwatch/core` (no internal deps)
2. `@agentwatch/monitor` (depends on core)
3. `@agentwatch/pre-share` (depends on core)
4. `@agentwatch/daemon` (depends on monitor, core, pre-share)
5. `@agentwatch/cli`, `@agentwatch/tui` (depend on daemon types)

## Key Files

| File | Purpose |
|------|---------|
| `packages/daemon/src/api.ts` | All REST endpoints |
| `packages/daemon/src/api-enhancements.ts` | Hook enhancement endpoints |
| `packages/daemon/src/server.ts` | Daemon lifecycle, scanners |
| `packages/daemon/src/research-profiles.ts` | Research-oriented redaction profiles |
| `packages/daemon/src/contributor-settings.ts` | Contributor settings, artifact linking |
| `packages/monitor/src/hook-store.ts` | Hook session/tool tracking |
| `packages/monitor/src/store.ts` | In-memory data store |
| `packages/core/src/sanitizer.ts` | Transcript sanitization |

## Don'ts

- Don't add features beyond what's requested
- Don't create new markdown files without asking
- Don't modify `~/.claude/settings.json` directly (use API)
- Don't add time estimates to plans

## Design Principles

**Transparency first:** The UI should always tell users where data is stored. Every pane that manages persistent data should show the storage location. Users should never wonder "where does this go?" - make it self-documenting.

**Local-first:** All data stays on the user's machine by default. No external services required for core functionality.

**Plain text where possible:** Prefer human-readable formats (TOML, JSON, JSONL) over binary formats so users can inspect and edit their data directly.

## Storage Reference

**~/.config/agentwatch/ structure:**

| Path | Format | Purpose |
|------|--------|---------|
| `config.toml` | TOML | Projects, settings, preferences |

**~/.agentwatch/ structure:**

| Path | Format | Purpose |
|------|--------|---------|
| `events.jsonl` | JSONL | Master audit log |
| `hooks/sessions_*.jsonl` | JSONL | Hook session lifecycle |
| `hooks/tool_usages_*.jsonl` | JSONL | Tool invocations |
| `hooks/commits.jsonl` | JSONL | Git commits from sessions |
| `hooks/stats.json` | JSON | Aggregated statistics |
| `processes/snapshots_*.jsonl` | JSONL | Process state snapshots |
| `processes/events_*.jsonl` | JSONL | Process start/end events |
| `transcripts/index.json` | JSON | Durable transcript index |
| `enrichments/store.json` | JSON | Quality scores, auto-tags |
| `annotations.json` | JSON | User feedback/ratings |
| `artifacts.json` | JSON | Session → artifact links (PRs, repos, commits) |

**Audit event pattern:** All significant operations log to `events.jsonl` via `logAuditEvent(category, action, entityId, description, details)`. Events automatically appear in the Audit tab. See `packages/daemon/src/audit-log.ts`.

**Transcript index:** Full scan every 24h, incremental updates every 5min. Persists at `transcripts/index.json`. See `packages/daemon/src/transcript-index.ts`.

## Status & Roadmap

See `docs/internal/roadmap-todos.md` for current status, TODOs, and known issues.
