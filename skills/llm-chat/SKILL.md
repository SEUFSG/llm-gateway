---
name: llm-chat
description: Use when the user wants to chat with a non-Claude model (GPT-4o, Claude via Copilot, Kimi, GLM, MiniMax), get a second opinion from another LLM, compare model responses, or when working on multi-agent tasks that benefit from model diversity. Also use in auto mode when Claude needs to delegate a subtask to the most appropriate available model.
---

# LLM Chat

Route messages to GitHub Copilot, Kimi, MiniMax, or GLM via the llm-gateway MCP server.

## Two Modes

### Manual Mode — User specifies the model
Use when the user names a specific model or provider, or when precision matters.

1. If provider status is unknown, call `llm_status` to check authentication
2. If needed, call `llm_models` to see available models
3. Call `llm_chat` with `mode: "manual"`, `provider`, `model`, and `messages`
4. Present the response with clear attribution: **[Provider / Model Name]** followed by the response

### Auto Mode — Claude selects the best available model
Use during multi-agent tasks, parallel work, or when the user says "use whatever model is best".

1. Call `llm_models` to perceive all currently available models (REQUIRED before routing)
2. Identify the task type from context: `code_generation`, `code_review`, `reasoning`, `chinese_writing`, `translation`, `quick_qa`, `math`, `creative`, `long_context`
3. Call `llm_chat` with `mode: "auto"`, `task`, and `messages`
4. The router walks the fallback chain from settings.json and calls the first available model
5. Present the response with attribution showing which model was actually used

## Attribution Format

Always show which model answered:
> **[GitHub Copilot / GPT-4o]**
> [response content here]

## Error Recovery

- If `llm_chat` fails with "not authenticated" → tell user to run `llm_login [provider]`
- If auto mode fails with "All models in fallback chain exhausted" → show the tried list, suggest the user authenticate a provider or add a routing rule
- If manual mode fails with "model not found" → call `llm_models` and show the user what's available
