---
name: llm-login
description: Use when the user wants to login to an LLM provider (GitHub Copilot, Kimi, MiniMax, GLM), logout from a provider, check authentication status, or manage provider credentials.
---

# LLM Login

Manage authentication for LLM providers in the llm-gateway plugin.

## Login

### GitHub Copilot (OAuth Device Flow)

1. Call `llm_login({ provider: "copilot" })`
2. Returns a device code and URL
3. Tell the user: "Please visit [URL] and enter code: [CODE]"
4. The tool polls automatically until authorized
5. Confirm success: "✅ GitHub Copilot authenticated"

### API Key Providers (Kimi, MiniMax, GLM)

Ask the user for their API key if not provided, then call:
- `llm_login({ provider: "kimi", apiKey: "sk-xxx" })`
- `llm_login({ provider: "minimax", apiKey: "xxx" })`
- `llm_login({ provider: "glm", apiKey: "xxx.xxx" })`

Where to get API keys:
- Kimi: https://platform.moonshot.cn/
- MiniMax: https://api.minimax.chat/
- GLM: https://open.bigmodel.cn/

## Check Status

Call `llm_status({})` — shows all 4 providers with: authenticated (yes/no), model count.

## Logout

Call `llm_logout({ provider: "kimi" })` — removes stored credentials for that provider.

## New Machine Setup

After installing the plugin on a new machine:
1. `llm_login({ provider: "copilot" })` → OAuth flow
2. `llm_login({ provider: "kimi", apiKey: "..." })` → paste API key
3. `llm_login({ provider: "minimax", apiKey: "..." })` → paste API key
4. `llm_login({ provider: "glm", apiKey: "..." })` → paste API key
5. `llm_models({})` → verify models are visible
