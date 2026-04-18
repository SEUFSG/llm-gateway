#!/usr/bin/env bash
set -euo pipefail

GITHUB_USER="${1:-}"
REPO_NAME="llm-gateway"

if [ -z "$GITHUB_USER" ]; then
  echo "Usage: bash install.sh <github-user>"
  echo "Or:    curl -fsSL https://raw.githubusercontent.com/<user>/llm-gateway/main/install.sh | bash -s <user>"
  exit 1
fi

echo "Installing llm-gateway plugin from ${GITHUB_USER}/${REPO_NAME}..."

claude plugin marketplace add "${GITHUB_USER}/${REPO_NAME}" 2>/dev/null || true
claude plugin install "${REPO_NAME}@${GITHUB_USER}"

echo ""
echo "llm-gateway installed!"
echo ""
echo "Next steps — authenticate your providers:"
echo "  In Claude Code, say: 'login to copilot'    -> OAuth Device Flow"
echo "  In Claude Code, say: 'login to kimi'        -> paste API key"
echo "  In Claude Code, say: 'login to minimax'     -> paste API key"
echo "  In Claude Code, say: 'login to glm'         -> paste API key"
echo ""
echo "Then verify: 'show llm models'"
