# LLM Gateway — Claude Code Plugin

Unified multi-provider LLM access for Claude Code. Use GitHub Copilot (GPT-4o, Claude, Gemini, o3), Kimi, MiniMax, and GLM from a single interface.

## Features

- **Manual mode**: Specify exact provider/model
- **Auto mode**: Task-label routing with fallback chains
- **Portable**: Credentials stored in `~/.llm-gateway/`, separate from plugin code
- **4 providers**: GitHub Copilot, Moonshot Kimi, MiniMax, Zhipu GLM

## Install

```bash
claude plugin marketplace add <your-github-user>/llm-gateway
claude plugin install llm-gateway@<your-github-user>
```

Or one-liner:
```bash
curl -fsSL https://raw.githubusercontent.com/<user>/llm-gateway/main/install.sh | bash -s <user>
```

## Authenticate

After install, in any Claude Code session:

- "login to copilot" → OAuth Device Flow (browser)
- "login to kimi" → paste your [Moonshot API key](https://platform.moonshot.cn/)
- "login to minimax" → paste your [MiniMax API key](https://api.minimax.chat/)
- "login to glm" → paste your [GLM API key](https://open.bigmodel.cn/)

## Usage

**Manual (precise):**
> "Ask GPT-4o to review this code"
> "Use Claude Sonnet 4 via Copilot to summarize this"

**Auto (task-based routing):**
> "Use the best available model to translate this to Chinese"
> "Solve this math problem with the strongest reasoning model available"

## Routing Configuration

Add to `.claude/settings.json`:
```json
{
  "llm-gateway": {
    "routing": {
      "code_generation": ["copilot/gpt-4o", "copilot/claude-sonnet-4", "glm/glm-4"],
      "chinese_writing": ["kimi/moonshot-v1-128k", "glm/glm-4"],
      "reasoning":       ["copilot/o3-mini", "copilot/gpt-4o"]
    }
  }
}
```

## Providers & Models

| Provider | Auth | Key Models |
|----------|------|-----------|
| GitHub Copilot | OAuth Device | gpt-4o, claude-sonnet-4, o3-mini, gemini-2.0-flash |
| Kimi | API Key | moonshot-v1-8k/32k/128k |
| MiniMax | API Key | abab6.5-chat, abab5.5-chat |
| GLM | API Key | glm-4, glm-4-flash, glm-3-turbo |
