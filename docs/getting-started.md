# Getting Started

Set up agentwatch in under 5 minutes.

## Quick Start

### 1. Install and Start

```bash
# Clone and install
git clone https://github.com/nickmvincent/agentwatch
cd agentwatch
bun install

# Link the CLI
cd packages/cli && bun link && cd ../..

# Start the daemon
aw daemon start

# Open the web UI
aw web
```

The daemon serves everything at **http://localhost:8420**.

## How Agentwatch Works

Understanding agentwatch's mental model helps you use it effectively.

### Three Data Sources

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENTWATCH DAEMON                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. HOOKS (collected)     2. TRANSCRIPTS (read)   3. PROCESSES │
│  ┌──────────────┐        ┌──────────────┐        ┌─────────┐ │
│  │ Claude Code  │        │ ~/.claude/   │        │ ps aux  │ │
│  │ sends events │        │ ~/.codex/    │        │ scans   │ │
│  │ to daemon    │        │ ~/.gemini/   │        │         │ │
│  └──────────────┘        └──────────────┘        └─────────┘ │
│         │                       │                      │     │
│         ▼                       ▼                      ▼     │
│  ~/.agentwatch/hooks/     Index only         ~/.agentwatch/  │
│  (we create this)        (files are theirs)   processes/     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Two Storage Locations

| Location | Purpose | Contents |
|----------|---------|----------|
| `~/.config/agentwatch/` | **Settings** | `config.toml` (all preferences) |
| `~/.agentwatch/` | **Data** | Events, sessions, hooks, index |

### Key Insight

**What agentwatch creates vs. what it reads:**

- **Creates:** Hook event data, process logs, transcript index, event log
- **Reads only:** Agent transcript files (`~/.claude/projects/`, etc.)

Uninstalling agentwatch leaves agent transcripts untouched. Delete `~/.agentwatch/` to remove all collected data.

### 2. Install Claude Code Hooks (Optional)

For real-time monitoring of Claude Code sessions:

```bash
aw hooks install
```

This adds hooks to `~/.claude/settings.json` that send events to the daemon.

<details>
<summary><strong>What do hooks collect?</strong></summary>

- Tool call events (which tools, inputs, outputs)
- Session start/end timestamps
- Permission request events
- Notification events

See [Data Sources](data-sources.md) for full details.
</details>

### 3. Configure Security (Optional)

**For code quality:** Enable the Test Gate

```bash
aw security enable
```

**For machine protection:** Configure deny rules in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf /*)",
      "Write(.env*)",
      "Bash(*|sh)"
    ]
  }
}
```

See [Security Guide](security.md) for threat categories and mitigations.

## Web UI Overview

The dashboard has 10 tabs:

| Tab | Purpose |
|-----|---------|
| **Agents** | Monitor running AI agents (state, CPU, memory) |
| **Claude Code Hooks** | Real-time tool usage, session timelines (Claude Code) |
| **Conversations** | Browse enriched sessions with auto-tags, quality scores, annotations |
| **Analytics** | Success rates, cost trends, quality distribution charts |
| **Repos** | Git repository status (dirty, conflicts) |
| **Ports** | Listening ports linked to agent processes |
| **Review/Share** | Export, redact, and share sessions |
| **Agentwatch Docs** | In-app documentation |
| **External Reference** | Format schemas, MCP servers, permissions, pricing |
| **Settings** | Claude Code settings editor, Test Gate, hook enhancements |

**Keyboard shortcuts:** `1-9` switch tabs, `p` pause, `r` refresh, `?` help

## Common Workflows

### Monitor Claude Code Sessions

1. Start daemon: `aw daemon start`
2. Install hooks: `aw hooks install`
3. Open UI: `aw web`
4. Use Claude Code normally—activity appears in real-time

### View Past Sessions

1. Go to **Review/Share** tab
2. Enable "Scan local transcripts"
3. Browse sessions from Claude Code, Codex, Gemini

### Ensure Tests Pass Before Commits

1. Enable Test Gate: `aw security enable`
2. Claude Code will be blocked from committing until tests pass

<details>
<summary><strong>How Test Gate works</strong></summary>

1. When you run your test command, agentwatch writes a "pass file"
2. Before `git commit`, agentwatch checks if tests passed recently
3. If not, the commit is blocked with an error message
4. The pass file expires after 5 minutes (configurable)
</details>

### Analyze Session Quality

1. Go to **Conversations** tab to see all enriched sessions
2. Each session shows auto-inferred tags (bugfix, feature, test, etc.)
3. Quality scores help identify successful patterns
4. Add thumbs up/down annotations to mark sessions for training data

### View Trends and Analytics

1. Go to **Analytics** tab
2. Select time range (7d, 14d, 30d)
3. View success rate trends, cost breakdowns by task type
4. Quality distribution shows how your sessions score overall

## Troubleshooting

### Hooks not working

```bash
# Check hook installation
aw hooks status

# Reinstall hooks
aw hooks uninstall
aw hooks install
```

### Daemon won't start

```bash
# Check if already running
aw daemon status

# Check port 8420
lsof -i :8420

# Stop and restart
aw daemon stop
aw daemon start
```

### No sessions appearing

- Ensure hooks are installed: `aw hooks status`
- Ensure daemon is running: `aw daemon status`
- Check the Claude Code Hooks tab—events should appear in real-time

## Next Steps

- [Data Sources](data-sources.md) — Understand what agentwatch collects
- [Security Guide](security.md) — Threat categories and mitigations
- [Configuration](configuration.md) — Full configuration reference

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Compared against Claude Code docs, verified commands |
| Added mental model section | 2026-01-02 | Claude | Three data sources, two storage locations |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
