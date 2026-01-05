# Permission Syntax Reference

[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) permissions use pattern matching to control tool access. These rules are defined in `~/.claude/settings.json`.

> **Official Documentation:** For the authoritative reference, see [Claude Code Permissions](https://docs.anthropic.com/en/docs/claude-code/permissions).

---

## Pattern Format

```
Tool(argument:pattern)
```

| Component | Description | Examples |
|-----------|-------------|----------|
| `Tool` | The tool name | `Bash`, `Read`, `Write`, `Edit`, `WebFetch` |
| `argument` | The command or path | `git`, `/etc/passwd`, `https://example.com` |
| `pattern` | Wildcard matching | `*` matches anything |

## Common Patterns

### Bash Commands

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",       // All git commands
      "Bash(npm:*)",       // All npm commands
      "Bash(ls:*)",        // Directory listing
      "Bash(cat:*)",       // Read files
      "Bash(grep:*)",      // Search files
      "Bash(find:*)",      // Find files
      "Bash(pwd)",         // Print working directory
      "Bash(echo:*)"       // Echo commands
    ]
  }
}
```

### File Operations

```json
{
  "permissions": {
    "allow": [
      "Read",                          // Allow reading any file
      "Read(/Users/me/projects/*)",    // Only allow specific paths
      "Edit",                          // Allow editing any file
      "Write"                          // Allow writing any file
    ],
    "deny": [
      "Read(/etc/*)",                  // Block system files
      "Write(.env*)",                  // Block .env files
      "Write(*credentials*)"           // Block credential files
    ]
  }
}
```

### Network Access

```json
{
  "permissions": {
    "allow": [
      "WebFetch(https://api.github.com/*)",
      "WebFetch(https://registry.npmjs.org/*)"
    ],
    "deny": [
      "WebFetch"                       // Block all other web access
    ]
  }
}
```

### MCP Tools

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) tools follow the pattern `mcp__<server>__<tool>`:

```json
{
  "permissions": {
    "allow": [
      "mcp__*",                        // All MCP tools
      "mcp__filesystem__*",            // Specific MCP server
      "mcp__github__create_issue"      // Specific tool
    ]
  }
}
```

**Learn more:** [MCP Specification](https://modelcontextprotocol.io/specification)

## Priority Order

```
deny (highest priority)
  ↓
ask (prompts user)
  ↓
allow (lowest priority)
```

If a command matches both `allow` and `deny`, **deny wins**.

## Matching Rules

1. **Prefix Matching**: `Bash(git` matches `Bash(git status)`, `Bash(git commit)`, etc.

2. **Wildcards**: `*` matches any characters
   - `Bash(npm:*)` matches `Bash(npm install)`, `Bash(npm run build)`
   - `Write(.env*)` matches `Write(.env)`, `Write(.env.local)`

3. **Exact Match**: No wildcard means exact match
   - `Bash(pwd)` only matches `Bash(pwd)`, not `Bash(pwd -L)`

## Example Configurations

### Permissive (for trusted projects)

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(node:*)",
      "Bash(python:*)",
      "Read",
      "Edit"
    ],
    "deny": [
      "Bash(rm -rf /*)",
      "Bash(sudo:*)"
    ]
  }
}
```

### Balanced (recommended)

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Read"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(curl:*)|sh",
      "Bash(wget:*)|bash",
      "Write(.env*)",
      "Write(*secret*)",
      "Write(*credential*)"
    ]
  }
}
```

### Restrictive (for sensitive projects)

```json
{
  "permissions": {
    "allow": [
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(git log)"
    ],
    "deny": [
      "Bash(rm:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Bash(git push:*)",
      "Bash(git commit:*)",
      "Write"
    ]
  }
}
```

## See Also

- [Claude Code Permissions](https://docs.anthropic.com/en/docs/claude-code/permissions) - Official permission documentation
- [Claude Code Settings](https://docs.anthropic.com/en/docs/claude-code/settings) - Full settings reference
- [MCP Specification](https://modelcontextprotocol.io/specification) - Model Context Protocol docs

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Verified pattern syntax against Claude Code permission docs |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
