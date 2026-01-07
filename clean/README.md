# Agentwatch Clean (Minimal)

This is a minimal, modular rebuild with separate services and JSONL storage.

## Setup

```bash
cd clean
bun install
```

## Run Services

```bash
bun run dev:scanner
bun run dev:hooks
bun run dev:runs
bun run dev:settings-editor
bun run dev:request-lab
```

Default ports:
- Scanner: `8701`
- Hooks: `8702`
- Runs: `8703`
- Settings editor: `8704`
- Request Lab: `8705`

## Data Layout

- Default data dir: `~/.agentwatch-clean`
- Override with `AWC_DATA_DIR=/path/to/data`
- Verbose logs: `~/.agentwatch-clean/verbose/*.jsonl`

## Settings Editor

Open http://localhost:8704 after starting the settings editor service.

Override settings paths with env vars:

```bash
CLAUDE_SETTINGS_PATH=~/.claude/settings.json \
CODEX_SETTINGS_PATH=~/.codex/config.json \
  bun run dev:settings-editor
```

## Request Lab

Open http://localhost:8705 to send GET/POST requests via a local proxy (avoids CORS).

## Hooks (receiver)

POST JSON to these endpoints:

- `POST http://localhost:8702/api/hooks/session-start`
- `POST http://localhost:8702/api/hooks/session-end`
- `POST http://localhost:8702/api/hooks/pre-tool-use`
- `POST http://localhost:8702/api/hooks/post-tool-use`
- `POST http://localhost:8702/api/hooks/notification`
- `POST http://localhost:8702/api/hooks/permission-request`
- `POST http://localhost:8702/api/hooks/user-prompt-submit`
- `POST http://localhost:8702/api/hooks/stop`
- `POST http://localhost:8702/api/hooks/subagent-stop`
- `POST http://localhost:8702/api/hooks/pre-compact`

## Scanner

Trigger a scan and log discoveries:

```bash
curl -X POST http://localhost:8701/api/scan
```

List detected agents without logging:

```bash
curl http://localhost:8701/api/agents
```

## Runs

Start a managed run:

```bash
curl -X POST http://localhost:8703/api/runs/start \
  -H 'Content-Type: application/json' \
  -d '{"command": "echo", "args": ["hello"]}'
```

Stop a managed run:

```bash
curl -X POST http://localhost:8703/api/runs/run_id/stop
```
