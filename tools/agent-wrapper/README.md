# Agent Wrapper

Emit synthetic agentwatch hooks for agents that don't have native hook support.

## How it works

1. Snapshots git status before running agent
2. Spawns the agent process (passes through stdio)
3. Snapshots git status after agent exits
4. Emits synthetic hook events for file changes
5. Posts to the same `/api/hooks/*` endpoints that Claude Code uses

## Usage

```bash
# From repo root
bun tools/agent-wrapper/wrap.ts codex "add dark mode"

# Or with any command
bun tools/agent-wrapper/wrap.ts aider --model gpt-4 "fix the bug"
```

## What gets tracked

- **Session lifecycle**: start/end with timing
- **File changes**: detected via git diff, emitted as Write/Edit tool events

## Limitations

- Only detects file changes, not individual tool invocations
- Requires git repository (uses git status/diff)
- No token counting (agent-specific)
- No real-time tool events (all emitted at end)

## Environment

- `AGENTWATCH_URL`: Daemon URL (default: `http://localhost:8420`)

## Future ideas

- PTY output parsing for real-time tool detection
- Agent-specific parsers (Codex, Aider, Cursor, etc.)
- File system watcher for real-time change detection
- Process spawn monitoring
