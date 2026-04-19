# LLM Gateway

Use GitHub Copilot, Kimi, MiniMax, GLM, Qwen models as Claude Code's agent model.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/SEUFSG/llm-gateway/master/install.sh | bash
```

Requirements: `bun` (or `node`), `git`, `claude` CLI.

## Setup

```bash
# Interactive — authenticate all providers at once
llm-auth setup

# Or one by one
llm-auth login copilot            # GitHub OAuth device flow
llm-auth login kimi --key sk-xxx
llm-auth login qwen --key sk-xxx
llm-auth login minimax --key xxx
llm-auth login glm --key xxx.xxx

# Check status
llm-auth status

# List all available models
llm-auth models
```

## Usage

```bash
# Start Claude Code with a specific model
claude --model copilot/claude-opus-4.7
claude --model copilot/gpt-5.4
claude --model copilot/gpt-4o
claude --model kimi/kimi-latest
claude --model qwen/qwen-max
claude --model glm/glm-4-plus
claude --model minimax/MiniMax-Text-01
```

Model IDs always use `provider/model` format to avoid conflicts between providers.

## Supported Providers

| Provider | Auth Method | Example Models |
|----------|-------------|----------------|
| GitHub Copilot | OAuth Device Flow | claude-opus-4.7, claude-sonnet-4.6, gpt-5.4, gpt-4o, gemini-2.5-pro, grok-code-fast-1 |
| Moonshot Kimi | API Key | kimi-latest, kimi-thinking-preview, moonshot-v1-128k |
| Alibaba Qwen | API Key | qwen3-235b-a22b, qwen-max, qwen-plus, qwen2.5-coder-32b-instruct |
| MiniMax | API Key | MiniMax-Text-01, abab6.5-chat |
| Zhipu GLM | API Key | glm-z1-preview, glm-4-plus, glm-4-flash |

## How It Works

1. **`llm-auth`** manages credentials in `~/.llm-gateway/credentials.json`
2. **Proxy server** (`localhost:3456`) translates Anthropic API format to each provider's API
3. **`ANTHROPIC_BASE_URL`** points Claude Code to the proxy
4. **SessionStart hook** auto-starts the proxy when Claude Code launches

## Uninstall

```bash
claude mcp remove llm-gateway -s user
rm -rf ~/.local/share/llm-gateway ~/.local/bin/llm-auth ~/.llm-gateway
# Remove ANTHROPIC_BASE_URL and SessionStart hook from ~/.claude/settings.json
```
