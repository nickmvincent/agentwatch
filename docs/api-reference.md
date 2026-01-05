# API Reference

Complete reference for Agentwatch daemon REST API endpoints.

> **Base URL:** `http://localhost:8420` (configurable via `daemon.port`)
>
> **Content-Type:** All requests and responses use `application/json`

## Core Endpoints

These endpoints are part of the main API (see `packages/daemon/src/api.ts`).

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | Daemon status (agent count, repo count, uptime) |
| POST | `/api/shutdown` | Shutdown daemon |

### Agents (Process Monitoring)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List active agents |
| GET | `/api/agents/:pid` | Get specific agent |
| GET | `/api/agents/:pid/output` | Get agent output |
| POST | `/api/agents/:pid/kill` | Kill agent process |
| POST | `/api/agents/:pid/signal` | Send signal to agent |
| POST | `/api/agents/:pid/input` | Send input to agent |

### Repositories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repos` | List repositories |
| POST | `/api/repos/rescan` | Force repository rescan |

### Ports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ports` | List listening ports |
| GET | `/api/ports/:port` | Get port details |

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get parsed configuration |
| PATCH | `/api/config` | Update configuration |
| GET | `/api/config/raw` | Get raw TOML config file |
| PUT | `/api/config/raw` | Update raw TOML config file |

### Claude Code Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claude/settings` | Read Claude settings |
| PUT | `/api/claude/settings` | Replace entire settings |
| PATCH | `/api/claude/settings` | Merge settings updates |
| GET | `/api/claude/mcp` | Get MCP configuration |
| GET | `/api/claude/reference/env-vars` | Environment variables reference |
| GET | `/api/claude/reference/permissions` | Permissions reference |

### Hooks & Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hooks/sessions` | List hook sessions |
| GET | `/api/hooks/sessions/:id` | Get session details |
| GET | `/api/hooks/sessions/:id/timeline` | Get session timeline |
| GET | `/api/hooks/sessions/:id/commits` | Get commits from session |
| GET | `/api/hooks/sessions/:id/suggestions` | Get suggestions for session |
| GET | `/api/hooks/tools/stats` | Tool usage statistics |
| GET | `/api/hooks/tools/recent` | Recent tool usages |
| GET | `/api/hooks/stats/daily` | Daily activity statistics |
| GET | `/api/hooks/commits` | All git commits |
| GET | `/api/hooks/suggestions` | Session suggestions |

**Hook Event Endpoints** (called by Claude Code hooks):

| Method | Endpoint | Hook Type |
|--------|----------|-----------|
| POST | `/api/hooks/session-start` | SessionStart |
| POST | `/api/hooks/session-end` | SessionEnd |
| POST | `/api/hooks/pre-tool-use` | PreToolUse |
| POST | `/api/hooks/post-tool-use` | PostToolUse |
| POST | `/api/hooks/notification` | Notification |
| POST | `/api/hooks/permission-request` | PermissionRequest |
| POST | `/api/hooks/user-prompt-submit` | UserPromptSubmit |
| POST | `/api/hooks/stop` | Stop |
| POST | `/api/hooks/subagent-stop` | SubagentStop |
| POST | `/api/hooks/pre-compact` | PreCompact |

### Test Gate

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test-gate` | Get Test Gate status |
| POST | `/api/test-gate/toggle` | Enable/disable Test Gate |

### Contribution & Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contrib/transcripts` | List transcripts |
| GET | `/api/contrib/local-logs` | List local transcripts |
| GET | `/api/contrib/local-logs/:id` | Read local transcript |
| GET | `/api/contrib/correlated` | Correlate sessions/transcripts |
| POST | `/api/contrib/prepare` | Prepare sessions for sharing |
| POST | `/api/contrib/export` | Export sessions |
| POST | `/api/contrib/export/bundle` | Export as ZIP bundle |
| GET | `/api/contrib/cost/aggregate` | Aggregate cost statistics |
| GET | `/api/contrib/cost/:sessionId` | Session cost |
| POST | `/api/contrib/sanitize` | Sanitize transcript |
| GET | `/api/contrib/patterns` | Get redaction patterns |
| POST | `/api/contrib/patterns/test` | Test pattern |
| GET | `/api/contrib/fields` | Field schema for redaction |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/share/gist` | Share as GitHub Gist |
| POST | `/api/share/huggingface` | Upload to HuggingFace |
| GET | `/api/share/huggingface/oauth/config` | HF OAuth config |
| POST | `/api/share/huggingface/oauth/start` | Start HF OAuth flow |

### Enrichments

Session enrichments provide auto-tags, quality scores, outcome signals, and manual annotations.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enrichments` | List all enriched sessions |
| GET | `/api/enrichments/:sessionId` | Get enrichments for session |
| POST | `/api/enrichments/:sessionId` | Update manual annotation/tags |
| DELETE | `/api/enrichments/:sessionId` | Clear enrichments |
| POST | `/api/enrichments/compute` | Trigger auto-enrichment |
| POST | `/api/enrichments/bulk` | Batch get enrichments |

### Analytics

Aggregate statistics and trends across sessions.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard?days=7` | Summary dashboard |
| GET | `/api/analytics/success-trend?days=30` | Success rate over time |
| GET | `/api/analytics/cost-by-type?days=30` | Cost breakdown by task type |
| GET | `/api/analytics/quality-distribution?days=30` | Quality score histogram |

### Reference & Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/docs` | List documentation |
| GET | `/api/docs/:id` | Get documentation |
| GET | `/api/reference/format-schemas` | Format schemas |
| GET | `/api/reference/format-schemas/:agent` | Agent-specific schema |
| GET | `/api/security/overview` | Security overview |
| GET | `/api/sandbox/documentation` | Sandbox documentation |

## Hook Enhancement Endpoints

These endpoints manage advanced hook features (see `packages/daemon/src/api-enhancements.ts`).

### Rule Management

Rules allow pattern-based decisions on hook events.

#### List Rules

```http
GET /api/rules
```

**Response:**
```json
{
  "rules": [
    {
      "id": "block-rm-rf",
      "name": "Block rm -rf",
      "enabled": true,
      "priority": 10,
      "hook_types": ["PreToolUse"],
      "conditions_count": 2,
      "action": "block"
    }
  ],
  "total": 1
}
```

#### Get Rule

```http
GET /api/rules/:id
```

**Response:**
```json
{
  "rule": {
    "id": "block-rm-rf",
    "name": "Block rm -rf",
    "enabled": true,
    "priority": 10,
    "hookTypes": ["PreToolUse"],
    "conditions": [
      { "field": "toolName", "operator": "eq", "value": "Bash" },
      { "field": "toolInput.command", "operator": "contains", "value": "rm -rf" }
    ],
    "action": { "type": "block", "reason": "Dangerous command blocked" }
  }
}
```

#### Create Rule

```http
POST /api/rules
```

**Request Body:**
```json
{
  "id": "my-rule",
  "name": "My Custom Rule",
  "enabled": true,
  "priority": 100,
  "hookTypes": ["PreToolUse"],
  "conditions": [
    { "field": "toolName", "operator": "eq", "value": "Write" },
    { "field": "toolInput.file_path", "operator": "matches", "value": "/.env$/" }
  ],
  "action": { "type": "deny", "reason": "Cannot modify .env files" }
}
```

**Condition Operators:**
| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Exact match | `{ "field": "toolName", "operator": "eq", "value": "Bash" }` |
| `neq` | Not equal | `{ "field": "toolName", "operator": "neq", "value": "Read" }` |
| `contains` | Substring match | `{ "operator": "contains", "value": "rm -rf" }` |
| `startsWith` | Prefix match | `{ "operator": "startsWith", "value": "/etc" }` |
| `endsWith` | Suffix match | `{ "operator": "endsWith", "value": ".env" }` |
| `matches` | Regex or glob | `{ "operator": "matches", "value": "/\\.env$/" }` |
| `in` | Value in array | `{ "operator": "in", "value": ["Read", "Glob"] }` |
| `gt`, `lt`, `gte`, `lte` | Numeric comparison | `{ "operator": "gt", "value": 1000 }` |

**Pattern Formats for `matches`:**
- Regex: Wrap in slashes `/pattern/` (e.g., `/\.(env|secret)$/`)
- Glob: Plain pattern with wildcards (e.g., `*.config.ts`)

**Action Types:**
| Type | Description |
|------|-------------|
| `allow` | Allow the operation |
| `deny` | Deny with message to Claude |
| `block` | Block silently |
| `modify` | Modify the input |
| `notify` | Send notification |

#### Update Rule

```http
PUT /api/rules/:id
```

**Request Body:** Partial rule object (fields to update)

#### Delete Rule

```http
DELETE /api/rules/:id
```

#### Test Rule

Test a rule against a context without affecting real operations.

```http
POST /api/rules/test
```

**Request Body:**
```json
{
  "context": {
    "hook_type": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": { "command": "rm -rf /tmp/test" }
  }
}
```

**Response:**
```json
{
  "matched": true,
  "rule_id": "block-rm-rf",
  "action": { "type": "block", "reason": "Dangerous command" }
}
```

### Cost Control

Track and limit spending across sessions.

#### Get Cost Status

```http
GET /api/cost/status
```

**Response:**
```json
{
  "enabled": true,
  "daily": {
    "cost_usd": 2.35,
    "input_tokens": 125000,
    "output_tokens": 45000,
    "session_count": 5
  },
  "monthly": {
    "cost_usd": 45.80,
    "input_tokens": 2500000,
    "output_tokens": 900000,
    "session_count": 87
  },
  "limits": {
    "session_usd": 5.00,
    "daily_usd": 25.00,
    "monthly_usd": 500.00
  },
  "alerts": [
    {
      "type": "warning",
      "budget": "daily",
      "current_usd": 2.35,
      "limit_usd": 25.00,
      "percentage": 0.094,
      "timestamp": "2025-01-15T14:30:00Z"
    }
  ]
}
```

#### Get Cost History

```http
GET /api/cost/history?days=30&months=12
```

**Query Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `days` | 30 | Days of daily history |
| `months` | 12 | Months of monthly history |

**Response:**
```json
{
  "daily": [
    {
      "period": "2025-01-15",
      "cost_usd": 2.35,
      "input_tokens": 125000,
      "output_tokens": 45000,
      "session_count": 5
    }
  ],
  "monthly": [
    {
      "period": "2025-01",
      "cost_usd": 45.80,
      "input_tokens": 2500000,
      "output_tokens": 900000,
      "session_count": 87
    }
  ]
}
```

#### Update Cost Limits

```http
PATCH /api/cost/limits
```

**Request Body:**
```json
{
  "enabled": true,
  "session_budget_usd": 10.00,
  "daily_budget_usd": 50.00,
  "monthly_budget_usd": 1000.00,
  "over_budget_action": "warn"
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `warn` | Allow but warn user |
| `block` | Block the operation |
| `notify` | Send notification only |

### Notification Hub

Manage notification providers and webhooks.

#### List Providers

```http
GET /api/notifications/providers
```

**Response:**
```json
{
  "providers": ["desktop", "webhook-slack", "webhook-discord"],
  "available": true
}
```

#### Test Provider

```http
POST /api/notifications/test/:provider
```

**Response:**
```json
{
  "success": true,
  "provider": "desktop",
  "error": null
}
```

#### Test All Providers

```http
POST /api/notifications/test
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "success": true, "provider": "desktop", "error": null },
    { "success": false, "provider": "webhook-slack", "error": "Connection refused" }
  ]
}
```

#### Add Webhook

```http
POST /api/notifications/webhooks
```

**Request Body:**
```json
{
  "id": "my-webhook",
  "name": "Slack Alerts",
  "url": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "enabled": true,
  "hook_types": ["Stop", "PostToolUse"],
  "retry_count": 3
}
```

#### Delete Webhook

```http
DELETE /api/notifications/webhooks/:id
```

### Hook Enhancements Configuration

Get and update the full hook enhancements configuration.

#### Get Configuration

```http
GET /api/hook-enhancements
```

**Response:**
```json
{
  "rules": {
    "enabled": true,
    "rules_file": "",
    "enabled_rule_sets": ["SECURITY"]
  },
  "auto_permissions": {
    "enabled": false,
    "auto_approve_read_only": false
  },
  "context_injection": {
    "inject_git_context": true,
    "inject_project_context": true,
    "max_context_lines": 100
  },
  "input_modification": {
    "enabled": false,
    "add_dry_run_flags": false,
    "enforce_commit_format": false,
    "commit_message_prefix": ""
  },
  "stop_blocking": {
    "enabled": false,
    "require_tests_pass": false,
    "require_no_lint_errors": false,
    "require_coverage_threshold": null,
    "max_block_attempts": 3
  },
  "prompt_validation": {
    "enabled": false,
    "block_patterns": [],
    "warn_patterns": [],
    "min_length": 0,
    "max_length": null
  },
  "cost_controls": {
    "enabled": true,
    "session_budget_usd": 5.00,
    "daily_budget_usd": 25.00,
    "monthly_budget_usd": 500.00,
    "alert_thresholds": [0.5, 0.8, 0.95],
    "over_budget_action": "warn"
  },
  "llm_evaluation": {
    "enabled": false,
    "provider": "anthropic",
    "model": "claude-3-haiku-20240307",
    "trigger_hooks": ["PreToolUse", "PermissionRequest"]
  }
}
```

#### Update Configuration

```http
PATCH /api/hook-enhancements
```

**Request Body:** Partial configuration (only include sections to update)

```json
{
  "cost_controls": {
    "enabled": true,
    "daily_budget_usd": 50.00
  },
  "stop_blocking": {
    "enabled": true,
    "require_tests_pass": true
  }
}
```

## Enrichment Endpoints

Session enrichments are computed automatically at session end and can be manually edited.

### Get Session Enrichments

```http
GET /api/enrichments/:sessionId
```

**Response:**
```json
{
  "session_id": "abc123",
  "enrichments": {
    "auto_tags": {
      "tags": [
        { "name": "bugfix", "category": "task_type", "confidence": 0.8 },
        { "name": "typescript", "category": "language", "confidence": 0.9 }
      ],
      "task_type": "bugfix",
      "user_tags": ["priority-high"],
      "computed_at": "2025-01-01T10:00:00Z"
    },
    "quality_score": {
      "score": 0.75,
      "classification": "good",
      "signals": {
        "no_failures": { "value": true, "weight": 0.3, "description": "No tool failures" },
        "has_commits": { "value": true, "weight": 0.2, "description": "Session has commits" }
      },
      "computed_at": "2025-01-01T10:00:00Z"
    },
    "outcome_signals": {
      "success_count": 5,
      "failure_count": 1,
      "test_results": { "passed": 10, "failed": 0 },
      "computed_at": "2025-01-01T10:00:00Z"
    },
    "manual_annotation": {
      "feedback": "positive",
      "notes": "Worked great!",
      "tags": ["useful"],
      "updated_at": "2025-01-01T10:00:00Z"
    }
  }
}
```

### Update Manual Annotation

```http
POST /api/enrichments/:sessionId
```

**Request Body:**
```json
{
  "feedback": "positive",
  "notes": "This session was helpful",
  "tags": ["useful", "feature-complete"]
}
```

### List Enriched Sessions

```http
GET /api/enrichments?limit=50&offset=0&feedback=positive
```

**Query Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 50 | Max sessions to return |
| `offset` | 0 | Pagination offset |
| `feedback` | - | Filter by feedback (positive/negative) |
| `task_type` | - | Filter by task type |

**Response:**
```json
{
  "sessions": [
    {
      "session_id": "abc123",
      "hook_session_id": "abc123",
      "task_type": "bugfix",
      "quality_score": 0.75,
      "feedback": "positive",
      "updated_at": "2025-01-01T10:00:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Trigger Auto-Enrichment

```http
POST /api/enrichments/compute
```

**Request Body:**
```json
{
  "session_ids": ["abc123", "def456"]
}
```

Recomputes auto-enrichments (tags, quality score, outcome signals) for specified sessions.

## Analytics Endpoints

Analytics aggregate data across sessions for trend analysis.

### Dashboard Summary

```http
GET /api/analytics/dashboard?days=7
```

**Response:**
```json
{
  "time_range": {
    "start": "2024-12-25",
    "end": "2025-01-01",
    "days": 7
  },
  "summary": {
    "total_sessions": 42,
    "success_rate": 0.85,
    "total_cost_usd": 12.50,
    "avg_duration_ms": 180000
  }
}
```

### Success Rate Trend

```http
GET /api/analytics/success-trend?days=30
```

**Response:**
```json
{
  "days": 30,
  "trend": [
    {
      "date": "2024-12-25",
      "success_count": 5,
      "failure_count": 1,
      "total": 6,
      "rate": 0.83
    }
  ]
}
```

### Cost by Task Type

```http
GET /api/analytics/cost-by-type?days=30
```

**Response:**
```json
{
  "days": 30,
  "breakdown": [
    {
      "task_type": "bugfix",
      "total_cost_usd": 5.25,
      "session_count": 10,
      "avg_cost_usd": 0.525
    },
    {
      "task_type": "feature",
      "total_cost_usd": 7.25,
      "session_count": 15,
      "avg_cost_usd": 0.48
    }
  ]
}
```

### Quality Score Distribution

```http
GET /api/analytics/quality-distribution?days=30
```

**Response:**
```json
{
  "days": 30,
  "total_scored": 42,
  "distribution": [
    { "range": "0-25", "min": 0, "max": 25, "count": 5, "percentage": 11.9 },
    { "range": "25-50", "min": 25, "max": 50, "count": 8, "percentage": 19.0 },
    { "range": "50-75", "min": 50, "max": 75, "count": 15, "percentage": 35.7 },
    { "range": "75-100", "min": 75, "max": 100, "count": 14, "percentage": 33.3 }
  ],
  "percentiles": {
    "p25": 40,
    "p50": 65,
    "p75": 82,
    "p90": 90
  }
}
```

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Description of what went wrong"
}
```

**HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 404 | Resource not found |
| 500 | Server error |

## Examples

### Block Dangerous Commands

```bash
# Add a rule to block rm -rf
curl -X POST http://localhost:8420/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "block-rm-rf",
    "name": "Block rm -rf",
    "priority": 10,
    "hookTypes": ["PreToolUse"],
    "conditions": [
      { "field": "toolName", "operator": "eq", "value": "Bash" },
      { "field": "toolInput.command", "operator": "contains", "value": "rm -rf" }
    ],
    "action": { "type": "block", "reason": "Dangerous command blocked by Agentwatch" }
  }'
```

### Set Daily Budget

```bash
curl -X PATCH http://localhost:8420/api/cost/limits \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "daily_budget_usd": 25.00,
    "over_budget_action": "warn"
  }'
```

### Add Slack Webhook

```bash
curl -X POST http://localhost:8420/api/notifications/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "slack-errors",
    "name": "Slack Error Alerts",
    "url": "https://hooks.slack.com/services/T.../B.../...",
    "hook_types": ["Stop"],
    "enabled": true
  }'
```

### Check Cost Status

```bash
curl http://localhost:8420/api/cost/status | jq
```

## See Also

- [Configuration Reference](configuration.md) — TOML configuration options
- [Value Enrichment](value-enrichment.md) — Philosophy and use cases
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — Official hooks documentation

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs codebase | 2025-12-31 | Claude | Created from api-enhancements.ts |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
