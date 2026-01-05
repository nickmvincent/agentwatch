#!/bin/bash
# Quick setup script for Claude Code Docker sandbox
# https://github.com/nickmvincent/agentwatch
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nickmvincent/agentwatch/main/sandbox/setup.sh | bash
#
# Or clone and run:
#   git clone https://github.com/nickmvincent/agentwatch
#   cd agentwatch/sandbox
#   ./setup.sh

set -e

echo "🐳 Claude Code Docker Sandbox Setup"
echo "===================================="
echo ""

# Check for Docker
if ! command -v docker &>/dev/null; then
    echo "❌ Docker not found."
    echo ""
    echo "Install a Docker runtime first:"
    echo "  Docker Desktop: brew install --cask docker"
    echo "  Colima:         brew install colima docker && colima start"
    echo "  OrbStack:       brew install --cask orbstack"
    exit 1
fi

# Check Docker is running
if ! docker info &>/dev/null; then
    echo "❌ Docker is not running."
    echo ""
    echo "Start your Docker runtime:"
    echo "  Docker Desktop: open -a Docker"
    echo "  Colima:         colima start"
    echo "  OrbStack:       open -a OrbStack"
    exit 1
fi

echo "✅ Docker is running"

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Dockerfile exists
if [[ -f "$SCRIPT_DIR/Dockerfile" ]]; then
    DOCKERFILE_DIR="$SCRIPT_DIR"
else
    # Create inline Dockerfile
    DOCKERFILE_DIR="$HOME/.agentwatch/sandbox"
    mkdir -p "$DOCKERFILE_DIR"

    cat > "$DOCKERFILE_DIR/Dockerfile" << 'EOF'
FROM node:20-slim
RUN apt-get update && apt-get install -y git curl ripgrep jq && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN useradd -m -s /bin/bash claude
RUN mkdir -p /home/claude/.claude /home/claude/.agentwatch
USER claude
WORKDIR /workspace
ENTRYPOINT ["claude"]
EOF
fi

# Build image
echo ""
echo "📦 Building Docker image..."
docker build -t claude-sandbox "$DOCKERFILE_DIR"
echo "✅ Image built: claude-sandbox"

# Install script
echo ""
echo "📝 Installing claude-sandboxed script..."
mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/claude-sandboxed" << 'SCRIPT'
#!/bin/bash
set -e
IMAGE_NAME="${CLAUDE_SANDBOX_IMAGE:-claude-sandbox}"
if ! docker info &>/dev/null; then
    echo "Error: Docker not running. Start Docker Desktop, Colima, or OrbStack."
    exit 1
fi
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Error: Image not found. Run: docker build -t claude-sandbox ~/.agentwatch/sandbox/"
    exit 1
fi
docker run -it --rm \
    -v "$(pwd):/workspace" \
    -v "$HOME/.claude:/home/claude/.claude" \
    -v "$HOME/.agentwatch:/home/claude/.agentwatch:ro" \
    -e ANTHROPIC_API_KEY -e CLAUDE_CODE_USE_BEDROCK -e CLAUDE_CODE_USE_VERTEX \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN -e AWS_REGION \
    -e GOOGLE_APPLICATION_CREDENTIALS \
    --network bridge "$IMAGE_NAME" --dangerously-skip-permissions "$@"
SCRIPT

chmod +x "$HOME/.local/bin/claude-sandboxed"
echo "✅ Script installed: ~/.local/bin/claude-sandboxed"

# Check PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  ~/.local/bin is not in your PATH"
    echo ""
    echo "Add this to your ~/.zshrc or ~/.bashrc:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    echo ""
    echo "Then run: source ~/.zshrc"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Usage:"
echo "  cd your-project"
echo "  claude-sandboxed"
echo ""
echo "Alias suggestion for ~/.zshrc:"
echo "  alias cs='claude-sandboxed'"
