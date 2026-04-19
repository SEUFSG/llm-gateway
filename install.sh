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

# 5. Install slash commands to ~/.claude/commands/
mkdir -p "${HOME}/.claude/commands"
for skill_dir in "${INSTALL_DIR}/skills"/*/; do
  skill_name="$(basename "$skill_dir")"
  if [ -f "${skill_dir}SKILL.md" ]; then
    cp "${skill_dir}SKILL.md" "${HOME}/.claude/commands/${skill_name}.md"
    echo "✓ Installed /${skill_name} command"
  fi
done

# 6. Install llm-auth CLI to ~/.local/bin/
mkdir -p "${HOME}/.local/bin"
cat > "${HOME}/.local/bin/llm-auth" <<EOF
#!/usr/bin/env bash
exec bun "${INSTALL_DIR}/src/cli.ts" "\$@"
EOF
chmod +x "${HOME}/.local/bin/llm-auth"
echo "✓ llm-auth CLI installed"

# Ensure ~/.local/bin is in PATH (add to shell rc if missing)
for rc in "${HOME}/.bashrc" "${HOME}/.zshrc"; do
  if [ -f "$rc" ] && ! grep -q '\.local/bin' "$rc"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc"
    echo "✓ Added ~/.local/bin to PATH in $(basename $rc)"
  fi
done

# 7. Make hook executable
chmod +x "${INSTALL_DIR}/hooks/session-start"
echo "✓ Hooks configured"

echo ""
echo "✅ llm-gateway installed!"
echo ""
echo "Before starting Claude Code, authenticate providers:"
echo "  llm-auth setup              — interactive setup for all providers"
echo "  llm-auth login copilot      — GitHub Copilot (OAuth)"
echo "  llm-auth login kimi --key <key>"
echo ""
echo "Then start Claude Code with any model:"
echo "  llm-auth models             — list all available models"
echo "  claude --model copilot/gpt-4o"
echo "  claude --model copilot/claude-sonnet-4.6"
