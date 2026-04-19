---
name: llm-login
description: Use when the user runs /llm-login or wants to authenticate an LLM provider (GitHub Copilot, Kimi, MiniMax, GLM, Qwen), check auth status, or logout from a provider.
---

# LLM Login

Interactive authentication for LLM providers. After login, use `/model` to pick a model.

## Flow

1. Call `llm_status({})` to show current auth state for all providers
2. Ask the user which provider to authenticate (present numbered list of unauthenticated ones)
3. Run the appropriate login flow below
4. Confirm success, then say: "Now run `/model` to pick a model from this provider"

## Provider Login Flows

### GitHub Copilot (OAuth Device Flow)
1. Call `llm_login({ provider: "copilot" })`
2. The tool returns a `userCode` and `verificationUri`
3. Tell the user:
   > Please open **[verificationUri]** and enter code: **[userCode]**
   > Waiting for authorization...
4. The tool polls automatically — when it resolves, confirm: "✅ GitHub Copilot authenticated"

### Kimi / MiniMax / GLM / Qwen (API Key)
1. Ask: "Please paste your [Provider] API key:"
   - Kimi key: https://platform.moonshot.cn/
   - MiniMax key: https://api.minimax.chat/
   - GLM key: https://open.bigmodel.cn/
   - Qwen key: https://dashscope.aliyun.com/
2. Call `llm_login({ provider: "<name>", apiKey: "<key>" })`
3. Confirm: "✅ [Provider] authenticated"

## After Login

Run `llm_status({})` once more to show the updated state, then remind the user:
> Run `/model` to select a model — all authenticated provider models are now available.

## Logout

If the user wants to logout: call `llm_logout({ provider: "<name>" })`
