# Docker Sandbox Guide

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) in complete isolation using [Docker](https://docs.docker.com/) containers.

> **What is Docker?** Docker lets you run applications in isolated "containers"—like mini-computers inside your computer. See the [Glossary](glossary.md) for more details.

## Overview

The Docker sandbox provides the strongest isolation by running Claude Code inside a container. A container is an isolated environment that can only access what you explicitly allow. The container has:

- **Limited filesystem access**: Only your project directory is mounted
- **Controlled network**: API calls work, but no arbitrary network access
- **Non-root user**: Runs as unprivileged user inside container
- **Agentwatch hooks**: Your security configuration carries over

## Prerequisites: Docker Runtime

You need a Docker-compatible runtime. Choose one:

### Option A: Docker Desktop (Recommended for Beginners)

[Docker Desktop](https://docs.docker.com/desktop/) is the official Docker GUI application.

```bash
# macOS (via Homebrew)
brew install --cask docker

# Then launch Docker.app from Applications
```

<details>
<summary><strong>More about Docker Desktop</strong></summary>

**Pros:**
- Official Docker product with full support
- GUI for managing containers, images, volumes
- Automatic updates
- Kubernetes built-in (optional)
- Works on macOS, Windows, Linux

**Cons:**
- Heavy resource usage (~2GB RAM idle)
- Requires license for commercial use in large companies
- Slower startup than alternatives
- Background daemon always running

**System Requirements:**
- macOS 12+ (Intel or Apple Silicon)
- 4GB RAM minimum (8GB recommended)
- ~2GB disk space for Docker + images

**Verify installation:**
```bash
docker --version    # Docker version 24.x.x
docker info         # Should show daemon running
```
</details>

### Option B: Colima (Lightweight, Free)

[Colima](https://github.com/abiosoft/colima) is a lightweight Docker runtime for macOS and Linux. Uses Lima VMs under the hood.

```bash
# Install Colima and Docker CLI
brew install colima docker

# Start Colima (creates a Linux VM)
colima start

# Verify Docker works
docker ps
```

<details>
<summary><strong>More about Colima</strong></summary>

**Pros:**
- Free and open source (no licensing issues)
- Lightweight (~500MB RAM)
- Fast startup
- CLI-focused (no GUI overhead)
- Supports Docker, containerd, and Kubernetes

**Cons:**
- No GUI (CLI only)
- Slightly more manual setup
- Less polished than Docker Desktop
- VM management required

**Configuration options:**
```bash
# Start with custom resources
colima start --cpu 4 --memory 8 --disk 60

# Start with Rosetta for x86 emulation (Apple Silicon)
colima start --arch aarch64 --vm-type=vz --vz-rosetta

# Stop when not in use (saves resources)
colima stop

# Check status
colima status
```

**Troubleshooting Colima:**
```bash
# If Docker commands fail after reboot
colima start

# Reset if corrupted
colima delete
colima start

# View logs
colima ssh -- journalctl -u docker
```
</details>

### Option C: OrbStack (macOS, Fast)

[OrbStack](https://orbstack.dev/) is a fast, lightweight Docker runtime for macOS.

```bash
brew install --cask orbstack
```

<details>
<summary><strong>More about OrbStack</strong></summary>

**Pros:**
- Extremely fast and lightweight
- Native Apple Silicon support
- Linux machine support built-in
- Beautiful GUI (optional)
- Free for personal use

**Cons:**
- macOS only
- Requires license for commercial use
- Newer/less battle-tested than Docker Desktop

**Key features:**
- Starts in ~1 second
- Uses ~200MB RAM
- Seamless file sharing
- Built-in Linux VMs
</details>

### Option D: Rancher Desktop

[Rancher Desktop](https://rancherdesktop.io/) is an open-source Docker Desktop alternative.

```bash
brew install --cask rancher
```

<details>
<summary><strong>More about Rancher Desktop</strong></summary>

**Pros:**
- Free and open source
- Kubernetes built-in
- Supports both dockerd and containerd
- Cross-platform (macOS, Windows, Linux)

**Cons:**
- Heavier than Colima
- Can be slower than alternatives
- More complex configuration

**Configuration:**
- Use Preferences to switch between dockerd/containerd
- Enable Kubernetes if needed
- Configure resource limits in GUI
</details>

## Quick Comparison

| Runtime | Cost | Resources | Speed | GUI | Best For |
|---------|------|-----------|-------|-----|----------|
| **Docker Desktop** | Free/$9+/mo | High (~2GB) | Medium | Yes | Beginners, enterprise |
| **Colima** | Free | Low (~500MB) | Fast | No | CLI users, lightweight |
| **OrbStack** | Free/$8/mo | Very Low | Very Fast | Yes | macOS power users |
| **Rancher Desktop** | Free | Medium | Medium | Yes | Kubernetes users |

**Recommendation:**
- New to Docker? Use **Docker Desktop**
- Want lightweight/free? Use **Colima**
- macOS power user? Use **OrbStack**

## Installation

### Quick Install (Agentwatch CLI)

```bash
agentwatch sandbox install
```

This command:
1. Builds the `claude-sandbox` Docker image
2. Installs the `claude-sandboxed` launch script to `~/.local/bin/`
3. Makes the script executable

### Manual Install (Copy-Paste Ready)

If you prefer to set things up manually, use these ready-to-use files:

<details>
<summary><strong>📄 Dockerfile (click to expand)</strong></summary>

Save as `~/.agentwatch/sandbox/Dockerfile`:

```dockerfile
# Claude Code Sandboxed Container
# Usage: docker build -t claude-sandbox .

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ripgrep \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user
RUN useradd -m -s /bin/bash claude

# Set up directory structure
RUN mkdir -p /home/claude/.claude /home/claude/.agentwatch

USER claude
WORKDIR /workspace

ENTRYPOINT ["claude"]
```

Build it:
```bash
mkdir -p ~/.agentwatch/sandbox
# Save Dockerfile there, then:
docker build -t claude-sandbox ~/.agentwatch/sandbox/
```
</details>

<details>
<summary><strong>📄 claude-sandboxed script (click to expand)</strong></summary>

Save as `~/.local/bin/claude-sandboxed`:

```bash
#!/bin/bash
# Claude Code in Docker sandbox
# Usage: claude-sandboxed [args]
# Alias suggestion: alias cs='claude-sandboxed'

set -e

IMAGE_NAME="${CLAUDE_SANDBOX_IMAGE:-claude-sandbox}"

# Check Docker is running
if ! docker info &>/dev/null; then
    echo "Error: Docker is not running."
    echo ""
    echo "Start your Docker runtime:"
    echo "  Docker Desktop: Open Docker.app"
    echo "  Colima: colima start"
    echo "  OrbStack: Open OrbStack.app"
    exit 1
fi

# Check if image exists
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Error: Docker image '$IMAGE_NAME' not found."
    echo "Run: agentwatch sandbox install"
    echo "Or build manually: docker build -t claude-sandbox ~/.agentwatch/sandbox/"
    exit 1
fi

# Run Claude Code in container
docker run -it --rm \
    -v "$(pwd):/workspace" \
    -v "$HOME/.claude:/home/claude/.claude" \
    -v "$HOME/.agentwatch:/home/claude/.agentwatch:ro" \
    -e ANTHROPIC_API_KEY \
    -e CLAUDE_CODE_USE_BEDROCK \
    -e CLAUDE_CODE_USE_VERTEX \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    -e AWS_REGION \
    -e GOOGLE_APPLICATION_CREDENTIALS \
    --network bridge \
    "$IMAGE_NAME" --dangerously-skip-permissions "$@"
```

Make it executable:
```bash
chmod +x ~/.local/bin/claude-sandboxed

# Add to PATH if needed
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```
</details>

<details>
<summary><strong>📄 One-liner setup script (click to expand)</strong></summary>

Run this to set up everything at once:

```bash
# Create directories
mkdir -p ~/.agentwatch/sandbox ~/.local/bin

# Write Dockerfile
cat > ~/.agentwatch/sandbox/Dockerfile << 'DOCKERFILE'
FROM node:20-slim
RUN apt-get update && apt-get install -y git curl ripgrep jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN useradd -m -s /bin/bash claude
RUN mkdir -p /home/claude/.claude /home/claude/.agentwatch
USER claude
WORKDIR /workspace
ENTRYPOINT ["claude"]
DOCKERFILE

# Build image
docker build -t claude-sandbox ~/.agentwatch/sandbox/

# Write script
cat > ~/.local/bin/claude-sandboxed << 'SCRIPT'
#!/bin/bash
set -e
IMAGE_NAME="${CLAUDE_SANDBOX_IMAGE:-claude-sandbox}"
if ! docker info &>/dev/null; then echo "Error: Docker not running"; exit 1; fi
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then echo "Error: Image not found"; exit 1; fi
docker run -it --rm \
    -v "$(pwd):/workspace" \
    -v "$HOME/.claude:/home/claude/.claude" \
    -v "$HOME/.agentwatch:/home/claude/.agentwatch:ro" \
    -e ANTHROPIC_API_KEY -e CLAUDE_CODE_USE_BEDROCK -e CLAUDE_CODE_USE_VERTEX \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
    -e GOOGLE_APPLICATION_CREDENTIALS \
    --network bridge "$IMAGE_NAME" --dangerously-skip-permissions "$@"
SCRIPT

chmod +x ~/.local/bin/claude-sandboxed
echo "Done! Run: claude-sandboxed"
```
</details>

### Verify Installation

```bash
agentwatch sandbox status
```

Expected output:
```
Docker Sandbox Status
  Docker:  Running (v24.0.6)
  Image:   Built (512MB)
  Script:  Installed (~/.local/bin/claude-sandboxed)
  Ready:   Yes
```

## Usage

### Running Claude in Sandbox

```bash
# Navigate to your project
cd ~/projects/my-app

# Run Claude in sandbox
claude-sandboxed
```

Or use the agentwatch command:
```bash
agentwatch sandbox run
```

### Passing Arguments

```bash
# Get help
claude-sandboxed --help

# Resume a session
claude-sandboxed --resume

# One-shot prompt
claude-sandboxed -p "explain this codebase"
```

### Convenient Alias

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias cs='claude-sandboxed'
```

Then just use `cs` to run sandboxed Claude.

## How It Works

### Volume Mounts

| Host Path | Container Path | Mode |
|-----------|---------------|------|
| `$(pwd)` (your project) | `/workspace` | read-write |
| `~/.claude` | `/home/claude/.claude` | read-write |
| `~/.agentwatch` | `/home/claude/.agentwatch` | read-only |

<details>
<summary><strong>Understanding Docker volumes</strong></summary>

**What are volumes?**
Volumes are the way Docker shares files between your host machine and containers. When you mount a volume, changes made inside the container appear on your host and vice versa.

**The `-v` flag syntax:**
```bash
docker run -v /host/path:/container/path:mode
```
- `/host/path`: Path on your Mac/Linux
- `/container/path`: Path inside the container
- `mode`: `ro` (read-only) or `rw` (read-write, default)

**Why these specific mounts?**
1. **Project directory** (`$(pwd):/workspace`): Claude needs to read/write your code
2. **Claude config** (`~/.claude`): Contains settings, auth tokens, session history
3. **Agentwatch** (`~/.agentwatch:ro`): Hooks config, read-only for security

**Security implications:**
- Claude can modify anything in your project directory
- Claude can read your Claude settings (includes API keys in some configs)
- Claude cannot modify agentwatch configuration
- Claude cannot access other directories on your system
</details>

### Environment Variables

These are passed through to the container:
- `ANTHROPIC_API_KEY`
- `CLAUDE_CODE_USE_BEDROCK`
- `CLAUDE_CODE_USE_VERTEX`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`
- `GOOGLE_APPLICATION_CREDENTIALS`

<details>
<summary><strong>How environment variables work</strong></summary>

**The `-e` flag:**
```bash
docker run -e VAR_NAME           # Pass through from host
docker run -e VAR_NAME=value     # Set explicit value
```

When you use `-e ANTHROPIC_API_KEY` without a value, Docker passes the current value from your shell into the container.

**Security note:**
Environment variables are visible inside the container. If Claude runs `env` or reads `/proc/*/environ`, it can see these values. This is necessary for API access but means API keys are exposed inside the sandbox.

**Adding more variables:**
Edit the script to add more `-e` flags:
```bash
docker run ... \
    -e MY_CUSTOM_VAR \
    -e ANOTHER_VAR=explicit_value \
    ...
```
</details>

### Network

The container uses Docker's bridge network, allowing:
- Outbound connections (for API calls)
- No inbound connections
- No access to host services on localhost

<details>
<summary><strong>Understanding Docker networking</strong></summary>

**Bridge network (default):**
- Container gets its own IP address
- Can make outbound connections to internet
- Cannot receive inbound connections from outside
- Cannot access host's `localhost` services directly

**What this means for Claude:**
- ✅ Can call Anthropic API
- ✅ Can fetch from GitHub, npm, etc.
- ❌ Cannot connect to your local database
- ❌ Cannot access your local dev server

**If you need localhost access:**
```bash
# Use host network instead (less isolated)
docker run --network host ...

# Or expose specific ports
docker run -p 3000:3000 ...
```

**More restrictive networking:**
```bash
# No network at all
docker run --network none ...
```
This would break API calls but provides maximum isolation.
</details>

## Customization

### Custom Image Name

```bash
# Build with custom name
agentwatch sandbox install --image my-claude-sandbox

# Use custom image
agentwatch sandbox run --image my-claude-sandbox
```

### Adding Tools to Container

<details>
<summary><strong>Extended Dockerfile with common tools</strong></summary>

```dockerfile
FROM node:20-slim

# System tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    ripgrep \
    jq \
    tree \
    htop \
    vim-tiny \
    && rm -rf /var/lib/apt/lists/*

# Python (for Python projects)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Rust (for Rust projects)
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Go (for Go projects)
# RUN wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz && \
#     tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz && \
#     rm go1.21.5.linux-amd64.tar.gz
# ENV PATH=$PATH:/usr/local/go/bin

# Claude Code
RUN npm install -g @anthropic-ai/claude-code

# User setup
RUN useradd -m -s /bin/bash claude
RUN mkdir -p /home/claude/.claude /home/claude/.agentwatch
USER claude
WORKDIR /workspace

ENTRYPOINT ["claude"]
```
</details>

### Modifying the Dockerfile

The Dockerfile is generated at `~/.agentwatch/sandbox/Dockerfile`. To customize:

1. Edit the Dockerfile
2. Rebuild: `agentwatch sandbox install --force`

## Troubleshooting

### Docker/Colima Not Running

```
Error: Docker daemon is not running
```

**Solutions:**
```bash
# Docker Desktop
open -a Docker

# Colima
colima start

# OrbStack
open -a OrbStack

# Check status
docker info
```

### Image Build Fails

```bash
# View build output
agentwatch sandbox install --force 2>&1 | tee build.log

# Check for network issues (common during npm install)
docker build --network host ~/.agentwatch/sandbox/
```

<details>
<summary><strong>Common build errors</strong></summary>

**"npm ERR! network"**
- Docker can't reach npm registry
- Try: `docker build --network host ...`
- Or: Check your firewall/VPN

**"permission denied"**
- Docker daemon not accessible
- Try: `sudo docker ...` or fix Docker socket permissions

**"no space left on device"**
- Docker disk full
- Fix: `docker system prune -a` (removes unused images/containers)

**Slow builds on Apple Silicon**
- Emulating x86 images is slow
- Use: `--platform linux/arm64` for native builds
- Or: Ensure Dockerfile uses multi-arch base images

</details>

### Permission Issues

If you get permission errors inside the container:

1. Check the user mapping matches your host user
2. Ensure mounted directories are accessible
3. Try rebuilding the image

<details>
<summary><strong>Understanding user permissions</strong></summary>

Docker containers run as root by default, but our Dockerfile creates a `claude` user for security. This can cause permission issues when:

1. **Host files are owned by different UID**
   - Container user (UID 1000) may not match your Mac user
   - Fix: Build image with matching UID

2. **Mounted directories not accessible**
   - Check: `ls -la ~/.claude`
   - Fix: `chmod 755 ~/.claude`

3. **Git operations fail**
   - Container user different from host user
   - Fix: Configure git safe directories inside container

**Building with matching UID:**
```dockerfile
# Add to Dockerfile before USER line
ARG UID=1000
RUN usermod -u $UID claude

# Build with your UID
docker build --build-arg UID=$(id -u) -t claude-sandbox .
```
</details>

### Script Not Found

```bash
# Check if script is in PATH
which claude-sandboxed

# Add to PATH if needed
export PATH="$HOME/.local/bin:$PATH"

# Add to shell config permanently
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Security Considerations

### What the Sandbox Protects Against

- **Filesystem escape**: Can't access files outside mounts
- **Network exfiltration**: Limited to known APIs
- **System modification**: No access to host system
- **Privilege escalation**: Runs as non-root

### What It Doesn't Protect Against

- **Your mounted project**: Claude has full access to /workspace
- **Your Claude config**: Settings/auth in ~/.claude are accessible
- **API key exposure**: Keys are in environment variables
- **Time-of-check attacks**: If you approve something outside sandbox

### Best Practices

1. **Don't mount sensitive directories**: Only mount what's needed
2. **Review before running**: Check Claude's plan before approval
3. **Use with agentwatch gates**: Container + gates = maximum protection
4. **Regular image updates**: Rebuild periodically for security patches

## Comparison with macOS Sandbox

| Feature | Docker | macOS Sandbox |
|---------|--------|---------------|
| Isolation | Complete | Directory-based |
| Platform | All | macOS only |
| Setup | Requires Docker | Built-in |
| Performance | Slight overhead | Native |
| Customization | Full control | Limited |
| Network control | Bridge network | Domain allowlist |

**Recommendation**: Use Docker for maximum isolation on sensitive projects. Use macOS sandbox for daily development with good protection and less overhead.

## See Also

- [Docker Desktop](https://docs.docker.com/desktop/) - Install Docker for your platform
- [Colima](https://github.com/abiosoft/colima) - Lightweight Docker alternative for macOS/Linux
- [OrbStack](https://orbstack.dev/) - Fast Docker runtime for macOS
- [Rancher Desktop](https://rancherdesktop.io/) - Open-source Docker Desktop alternative
- [Dockerfile Reference](https://docs.docker.com/reference/dockerfile/) - Customize the container
- [Docker Security](https://docs.docker.com/engine/security/) - Understanding container security
- [Claude Code Security](https://docs.anthropic.com/en/docs/claude-code/security) - Claude Code's built-in security features

<details>
<summary><strong>📋 Document Freshness Log</strong></summary>

| Check | Date | Who | Notes |
|-------|------|-----|-------|
| AI review vs external docs | 2025-12-31 | Claude | Added Colima/OrbStack/Rancher; expanded with detailed explanations |
| Human full read | — | — | *Awaiting review* |

*To update: Edit this table after reviewing the full document.*
</details>
