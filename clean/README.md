# Agentwatch

Local monitoring stack for AI coding agents (Claude Code, Codex CLI, Gemini CLI). Real-time process detection, hook interception, transcript review, and web dashboard.

## Requirements

- **Bun** v1.1+ (`curl -fsSL https://bun.sh/install | bash`)
- **macOS** or **Linux** (Windows: WSL2)

## Quickstart

```bash
bun install
bun run dev:launcher
```

Dashboard: http://localhost:8705

## Integrating with Your Agent

Agentwatch receives hook events via HTTP hooks on port 8702. Hooks are logged and
forwarded to the Events service (8706), which is the single source of truth for
significant events.

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "session-start": ["curl -sX POST http://localhost:8702/api/hooks/session-start -H 'Content-Type: application/json' -d @-"],
    "session-end": ["curl -sX POST http://localhost:8702/api/hooks/session-end -H 'Content-Type: application/json' -d @-"],
    "pre-tool-use": ["curl -sX POST http://localhost:8702/api/hooks/pre-tool-use -H 'Content-Type: application/json' -d @-"],
    "post-tool-use": ["curl -sX POST http://localhost:8702/api/hooks/post-tool-use -H 'Content-Type: application/json' -d @-"],
    "notification": ["curl -sX POST http://localhost:8702/api/hooks/notification -H 'Content-Type: application/json' -d @-"],
    "user-prompt-submit": ["curl -sX POST http://localhost:8702/api/hooks/user-prompt-submit -H 'Content-Type: application/json' -d @-"],
    "permission-request": ["curl -sX POST http://localhost:8702/api/hooks/permission-request -H 'Content-Type: application/json' -d @-"]
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[hooks]
session_start = "curl -sX POST http://localhost:8702/api/hooks/session-start -H 'Content-Type: application/json' -d @-"
session_end = "curl -sX POST http://localhost:8702/api/hooks/session-end -H 'Content-Type: application/json' -d @-"
```

### Verify

1. Start an agent session
2. Check dashboard at http://localhost:8705
3. Or: `curl http://localhost:8702/api/hooks/recent`

## Architecture

15 Bun microservices sharing `@aw-clean/core`:

| Port | Service | Description |
|------|---------|-------------|
| 8701 | Scanner | Detects agent processes |
| 8702 | Hooks | Receives hook events |
| 8703 | Runs | Process execution (PTY/tmux) |
| 8705 | Web | Dashboard UI |
| 8706 | Events | Event hub for significant events |
| 8708 | Launcher | Service orchestrator |
| 8710 | Review | Transcript management |
| 8721 | Meta Visualizer | 3D dependency graph |
| 8715 | Index | SQLite search |
| 8717 | Parser | Transcript parser |

Service dependencies and requirement tiers are defined in `packages/core/src/dependencies.ts`.
Run `bun run scripts/infer-dependencies.ts --check` to verify.

Events are emitted directly to the Events service (`/api/events/emit`), and the UI reads
from Events only. If Events is down, event-related features are unavailable.
Event sources include scanner, hooks, runs, tailer, review, launcher, bridges, index,
parser, writer, content, and agentwatch-settings.

## Data

All data in `~/.agentwatch-clean/` (override: `AWC_DATA_DIR`):

```
~/.agentwatch-clean/
├── config/settings.json    # Configuration
├── verbose/*.jsonl         # Service logs
└── significant/            # Significant events (events service)
```

## Commands

```bash
bun run dev:launcher     # Full stack
bun run dev:<service>    # Single service with hot reload
bun test                 # Unit tests
bun run test:e2e         # E2E tests
```

## Documentation

- **[Getting Started Guide](docs/getting-started.md)** - Full setup, configuration, hook rules, troubleshooting
- **[User Guide](docs/user-guide.md)** - API reference

## License

MIT
