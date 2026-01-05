# Claude Code Docker Sandbox

Run Claude Code in complete isolation using Docker containers.

## Quick Start

### Option 1: One-liner setup

```bash
# Clone and run setup
git clone https://github.com/nickmvincent/agentwatch
cd agentwatch/sandbox
./setup.sh
```

### Option 2: Manual setup

```bash
# Build the image
docker build -t claude-sandbox .

# Copy and enable the script
cp claude-sandboxed ~/.local/bin/
chmod +x ~/.local/bin/claude-sandboxed

# Add to PATH (add to ~/.zshrc for permanent)
export PATH="$HOME/.local/bin:$PATH"

# Run!
cd your-project
claude-sandboxed
```

## What's Included

| File | Purpose |
|------|---------|
| `Dockerfile` | Container image for Claude Code |
| `claude-sandboxed` | Launch script with proper mounts |
| `setup.sh` | Automated installation |
| `README.md` | This file |

## Prerequisites

You need a Docker-compatible runtime:

| Runtime | Install |
|---------|---------|
| Docker Desktop | `brew install --cask docker` |
| Colima | `brew install colima docker && colima start` |
| OrbStack | `brew install --cask orbstack` |

## Usage

```bash
# Navigate to your project
cd ~/projects/my-app

# Run Claude in sandbox
claude-sandboxed

# Pass arguments
claude-sandboxed -p "explain this codebase"

# Resume session
claude-sandboxed --resume
```

## What Gets Mounted

| Host Path | Container Path | Access |
|-----------|---------------|--------|
| Current directory | `/workspace` | Read-write |
| `~/.claude` | `/home/claude/.claude` | Read-write |
| `~/.agentwatch` | `/home/claude/.agentwatch` | Read-only |

## Security

The sandbox provides:
- **Filesystem isolation**: Only mounted paths accessible
- **Network restriction**: Bridge network (outbound only)
- **Non-root user**: Runs as unprivileged `claude` user
- **No host access**: Cannot reach host localhost services

## Customization

### Add more tools

Edit the Dockerfile:

```dockerfile
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*
```

Rebuild: `docker build -t claude-sandbox .`

### Custom image name

```bash
export CLAUDE_SANDBOX_IMAGE=my-custom-image
claude-sandboxed
```

## Troubleshooting

### Docker not running

```bash
# Docker Desktop
open -a Docker

# Colima
colima start

# OrbStack
open -a OrbStack
```

### Script not found

```bash
export PATH="$HOME/.local/bin:$PATH"
# Add to ~/.zshrc for permanent fix
```

## Learn More

See the full documentation: [Docker Sandbox Guide](../docs/docker-sandbox.md)
