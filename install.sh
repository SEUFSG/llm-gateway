#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/SEUFSG/llm-gateway}"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.local/share/llm-gateway}"
SETTINGS_FILE="${HOME}/.claude/settings.json"

echo "Installing llm-gateway..."

# 1. Get the code
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ Updating existing installation at ${INSTALL_DIR}..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "→ Cloning from ${REPO_URL}..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
fi

echo "✓ Source at ${INSTALL_DIR}"

# 2. Install dependencies
echo "→ Installing dependencies..."
if command -v bun &>/dev/null; then
  bun install --cwd "$INSTALL_DIR" --silent
elif command -v npm &>/dev/null; then
  npm install --prefix "$INSTALL_DIR" --silent
else
  echo "⚠ Neither bun nor npm found — skipping dependency install"
fi
echo "✓ Dependencies installed"

# 3. Register MCP server
if command -v bun &>/dev/null; then
  RUNNER="bun"
else
  RUNNER="node"
fi

# Remove old registration if exists, then re-add with current path
claude mcp remove llm-gateway -s user 2>/dev/null || true
claude mcp add -s user llm-gateway "$RUNNER" "${INSTALL_DIR}/src/server.ts"
echo "✓ MCP server registered"

# 4. Write settings.json (ANTHROPIC_BASE_URL + SessionStart hook)
mkdir -p "${HOME}/.claude"
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

HOOK_CMD="${INSTALL_DIR}/hooks/session-start"
MERGE_SCRIPT="
const fs = require('fs');
const p = process.env.SETTINGS_FILE;
const hookCmd = process.env.HOOK_CMD;
const s = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');

s.env = s.env || {};
s.env.ANTHROPIC_BASE_URL = 'http://localhost:3456';

s.hooks = s.hooks || {};
s.hooks.SessionStart = s.hooks.SessionStart || [];
const already = s.hooks.SessionStart.some(h =>
  h.hooks && h.hooks.some(hh => hh.command === hookCmd)
);
if (!already) {
  s.hooks.SessionStart.push({ matcher: '', hooks: [{ type: 'command', command: hookCmd }] });
}

fs.writeFileSync(p, JSON.stringify(s, null, 2));
console.log('✓ settings.json configured');
"

if command -v bun &>/dev/null; then
  SETTINGS_FILE="$SETTINGS_FILE" HOOK_CMD="$HOOK_CMD" bun -e "$MERGE_SCRIPT"
elif command -v node &>/dev/null; then
  SETTINGS_FILE="$SETTINGS_FILE" HOOK_CMD="$HOOK_CMD" node -e "$MERGE_SCRIPT"
else
  echo "⚠ Could not configure settings.json: bun/node not found"
fi

# 5. Make hook executable
chmod +x "${INSTALL_DIR}/hooks/session-start"
echo "✓ Hooks configured"

echo ""
echo "✅ llm-gateway installed!"
echo ""
echo "Restart Claude Code, then:"
echo "  /llm-login   — authenticate a provider (Copilot OAuth / API key)"
echo "  /model       — pick a model from all authenticated providers"
