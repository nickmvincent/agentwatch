# Claude Code Sandboxed Container
# Built by agentwatch - https://github.com/nickmvincent/agentwatch
#
# Usage:
#   docker build -t claude-sandbox .
#   docker run -it --rm -v $(pwd):/workspace claude-sandbox
#
# Full usage with mounts:
#   docker run -it --rm \
#     -v $(pwd):/workspace \
#     -v $HOME/.claude:/home/claude/.claude \
#     -v $HOME/.agentwatch:/home/claude/.agentwatch:ro \
#     -e ANTHROPIC_API_KEY \
#     claude-sandbox

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

# Create non-root user for security
# ARG UID=1000
# RUN useradd -m -s /bin/bash -u $UID claude
RUN useradd -m -s /bin/bash claude

# Set up directory structure
RUN mkdir -p /home/claude/.claude /home/claude/.agentwatch

# Switch to non-root user
USER claude

# Working directory for mounted projects
WORKDIR /workspace

# Default entrypoint
ENTRYPOINT ["claude"]
