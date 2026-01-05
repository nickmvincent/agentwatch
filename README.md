# agentwatch

A tool with two purposes:

1. **Monitor & control AI coding agents** — see what's running, track sessions, enforce security gates
2. **Review & contribute session data** — sanitize transcripts, enrich with feedback, share with researchers

**Supports:** [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) (full integration), [Codex CLI](https://github.com/openai/codex), [Gemini CLI](https://github.com/google/gemini-cli), [OpenCode](https://github.com/opencode-ai/opencode) (transcript reading)

## Quick Start

```bash
# Install
git clone https://github.com/nickmvincent/agentwatch && cd agentwatch
bun install
cd packages/cli && bun link && cd ../..

# Start daemon and web UI
aw daemon start
aw web                 # Opens http://localhost:8420

# For Claude Code: Install hooks for real-time tracking
aw hooks install
```

See [Getting Started](docs/getting-started.md) for detailed setup instructions.

## Features

### For Daily Development

| Feature | Description |
|---------|-------------|
| **Monitor** | Detect running agents, view state (working/waiting/stalled), CPU/memory |
| **Track** | Session history, tool usage stats, token counts, cost estimation |
| **Secure** | Test Gate blocks commits until tests pass; permission presets for protection |
| **Launch** | Start agents with `aw run "prompt"` and track what you asked |

### For Data Contribution

| Feature | Description |
|---------|-------------|
| **Analyze** | Auto-tags, quality scores, success rates, loop detection |
| **Annotate** | Rate sessions (thumbs up/down), add notes and tags |
| **Sanitize** | Redact secrets, PII, file paths before sharing |
| **Contribute** | Export bundles or upload directly to HuggingFace |
| **Audit** | Full transparency into what data is collected and shared |

See [CLI Reference](docs/cli-reference.md) for all commands.

## Web UI Tabs

| Tab | Purpose |
|-----|---------|
| **Agents** | Monitor running agents, process controls |
| **Claude Code Hooks** | Real-time tool usage and session timeline |
| **Conversations** | Browse sessions with enrichments and annotations |
| **Analytics** | Success rates, costs, quality trends |
| **Repos / Ports** | Git status, listening ports |
| **Review/Share** | Sanitize and export sessions |
| **Settings** | Claude Code settings, Test Gate, Projects |

**Keyboard shortcuts:** `1-9` switch tabs, `p` pause, `r` refresh

## Documentation

| Getting Started | Reference | Contributing Data |
|-----------------|-----------|-------------------|
| [Getting Started](docs/getting-started.md) | [CLI Reference](docs/cli-reference.md) | [Data Contribution Guide](docs/data-contribution-guide.md) |
| [Glossary](docs/glossary.md) | [Configuration](docs/configuration.md) | [Data Sources](docs/data-sources.md) |
| [Security Guide](docs/security.md) | [API Reference](docs/api-reference.md) | |

**Full index:** [docs/README.md](docs/README.md)


## Architecture

```
packages/
├── cli/        # Command-line interface (aw daemon, aw hooks)
├── core/       # Shared types and utilities
├── daemon/     # HTTP/WebSocket server (Hono)
├── monitor/    # Process and repo scanning
├── pre-share/  # Sanitization pipeline
├── tui/        # Terminal UI (Ink/React)
└── ui/         # Shared React components

web/            # Web dashboard (React + Vite)
pages/          # Static demo site (Astro)
docs/           # Documentation
```

## Development

```bash
bun run dev          # Daemon + web with hot reload (http://localhost:5173)
bun run build        # Build all packages
bun test             # Run tests
```

| Command | Description |
|---------|-------------|
| `bun run dev` | Full-stack with hot reload |
| `bun run dev:daemon` | Daemon only |
| `bun run dev:web` | Web only (needs daemon) |
| `aw daemon start` | Production mode |

## License

MIT
