/**
 * Local Anthropic-compatible proxy → multi-provider LLM gateway
 * Translates POST /v1/messages (Anthropic format) to each provider's API
 * Set ANTHROPIC_BASE_URL=http://localhost:3456 to use
 */
import { TokenStore } from "./token-store";
import { CopilotProvider } from "./providers/copilot";
import { KimiProvider } from "./providers/kimi";
import { MinimaxProvider } from "./providers/minimax";
import { GlmProvider } from "./providers/glm";
import { QwenProvider } from "./providers/qwen";
import { ProviderRegistry } from "./registry";

const PORT = parseInt(process.env.LLM_PROXY_PORT ?? "3456");
const DEFAULT_MODEL = process.env.LLM_PROXY_MODEL ?? "claude-sonnet-4";

const store = new TokenStore();
const copilotProvider = new CopilotProvider(store);
const registry = new ProviderRegistry(store);

async function getCopilotToken(): Promise<string> {
  if (!copilotProvider.isAuthenticated()) await copilotProvider.refreshAuth();
  return store.load().copilot!.sessionToken;
}

// model list cache: 5 min TTL
let modelCache: { data: any[]; ts: number } | null = null;

async function fetchCopilotModels(token: string): Promise<any[]> {
  if (modelCache && Date.now() - modelCache.ts < 5 * 60 * 1000) return modelCache.data;
  const resp = await fetch("https://api.githubcopilot.com/models", {
    headers: { "Authorization": `Bearer ${token}`, "Editor-Version": "vscode/1.85.0", "Copilot-Integration-Id": "vscode-chat" }
  });
  if (!resp.ok) return [];
  const d = await resp.json() as { data: any[] };
  const models = (d.data ?? []).filter((m: any) =>
    m.capabilities?.type === "chat" &&
    m.model_picker_enabled !== false &&
    !m.id.startsWith("accounts/") &&
    !m.id.includes("embedding") &&
    !m.id.includes("oswe") &&
    !m.id.includes("search") &&
    !m.id.includes("router")
  );
  modelCache = { data: models, ts: Date.now() };
  return models;
}

// Detect which provider to use based on model ID prefix or known model IDs
function detectProvider(model: string): string {
  if (model.startsWith("kimi/") || model.startsWith("moonshot-") || model.startsWith("kimi-")) return "kimi";
  if (model.startsWith("minimax/") || model.startsWith("abab") || model.startsWith("MiniMax-")) return "minimax";
  if (model.startsWith("glm/") || model.startsWith("glm-") || model.startsWith("chatglm")) return "glm";
  if (model.startsWith("qwen/") || model.startsWith("qwen-") || model.startsWith("qwen2") || model.startsWith("qwen3")) return "qwen";
  return "copilot";
}

// Strip provider prefix if present (e.g. "kimi/moonshot-v1-128k" → "moonshot-v1-128k")
function stripPrefix(model: string): string {
  const slash = model.indexOf("/");
  if (slash !== -1) {
    const prefix = model.substring(0, slash);
    if (["copilot","kimi","minimax","glm","qwen"].includes(prefix)) return model.substring(slash + 1);
  }
  return model;
}

// Normalize Anthropic-style model IDs (dashes) to Copilot-style (dots)
// e.g. claude-sonnet-4-6 → claude-sonnet-4.6, claude-opus-4-7 → claude-opus-4.7
function normalizeCopilotModel(model: string): string {
  // Match patterns like claude-xxx-4-6, claude-xxx-4-7, claude-xxx-4-5
  return model.replace(/^(claude-(?:opus|sonnet|haiku)-\d+)-(\d+)$/, "$1.$2");
}

// Route a chat request to the appropriate provider's API
// Returns a fetch Response in OpenAI format (all providers use OpenAI-compatible APIs)
async function routeToProvider(providerName: string, modelId: string, openaiBody: any): Promise<Response> {
  const creds = store.load();

  if (providerName === "kimi") {
    if (!creds.kimi?.apiKey) throw new Error("Kimi not authenticated");
    const kimiBody = { ...openaiBody, model: modelId };
    // kimi-k2* models only accept temperature=1
    if (modelId.startsWith("kimi-k2")) kimiBody.temperature = 1;
    return fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${creds.kimi.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(kimiBody)
    });
  }

  if (providerName === "minimax") {
    if (!creds.minimax?.apiKey) throw new Error("MiniMax not authenticated");
    const body = { ...openaiBody, model: modelId };
    const endpoint = creds.minimax.region === "cn"
      ? "https://api.minimax.chat/v1/chat/completions"
      : "https://platform.minimax.io/v1/chat/completions";
    return fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${creds.minimax.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  if (providerName === "glm") {
    if (!creds.glm?.apiKey) throw new Error("GLM not authenticated");
    const glmProvider = registry.getProvider("glm") as GlmProvider;
    const token = await (glmProvider as any).generateToken(creds.glm.apiKey);
    return fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...openaiBody, model: modelId })
    });
  }

  if (providerName === "qwen") {
    if (!creds.qwen?.apiKey) throw new Error("Qwen not authenticated");
    return fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${creds.qwen.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...openaiBody, model: modelId })
    });
  }

  // Default: copilot
  const token = await getCopilotToken();
  return fetch("https://api.githubcopilot.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Editor-Version": "vscode/1.85.0",
      "Copilot-Integration-Id": "vscode-chat"
    },
    body: JSON.stringify({ ...openaiBody, model: modelId })
  });
}

// Anthropic messages → OpenAI messages
function toOpenAIMessages(messages: any[], system?: string): any[] {
  const result: any[] = [];
  if (system) result.push({ role: "system", content: system });

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (!Array.isArray(msg.content)) continue;

    if (msg.role === "user") {
      const toolResults = msg.content.filter((b: any) => b.type === "tool_result");
      const textBlocks = msg.content.filter((b: any) => b.type === "text");
      for (const tr of toolResults) {
        const content = typeof tr.content === "string" ? tr.content
          : Array.isArray(tr.content) ? tr.content.map((c: any) => c.text ?? "").join("") : "";
        result.push({ role: "tool", tool_call_id: tr.tool_use_id, content });
      }
      if (textBlocks.length > 0) {
        result.push({ role: "user", content: textBlocks.map((b: any) => b.text ?? "").join("") });
      }
    } else if (msg.role === "assistant") {
      const textBlocks = msg.content.filter((b: any) => b.type === "text");
      const toolUse = msg.content.filter((b: any) => b.type === "tool_use");
      const m: any = { role: "assistant" };
      if (textBlocks.length > 0) m.content = textBlocks.map((b: any) => b.text).join("");
      if (toolUse.length > 0) {
        m.tool_calls = toolUse.map((b: any) => ({
          id: b.id, type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }
        }));
      }
      result.push(m);
    }
  }
  return result;
}

function toOpenAITools(tools?: any[]): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }));
}

function toAnthropicResponse(data: any, model: string): any {
  const choice = data.choices?.[0];
  const message = choice?.message ?? {};
  const content: any[] = [];

  if (message.content) content.push({ type: "text", text: message.content });
  for (const tc of message.tool_calls ?? []) {
    let input: any = {};
    try { input = JSON.parse(tc.function.arguments ?? "{}"); } catch {}
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }

  const stopReason = choice?.finish_reason === "tool_calls" ? "tool_use"
    : choice?.finish_reason === "length" ? "max_tokens" : "end_turn";

  return {
    id: `msg_${Date.now()}`, type: "message", role: "assistant",
    content, model, stop_reason: stopReason, stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0
    }
  };
}

// Convert OpenAI SSE stream → Anthropic SSE events
async function* convertStream(
  body: ReadableStream<Uint8Array>,
  model: string,
  inputTokens: number
): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let outputTokens = 0;
  const msgId = `msg_${Date.now()}`;
  // tool call accumulator: index → {id, name, args}
  const tcBuf: Record<number, { id: string; name: string; args: string }> = {};

  yield `event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: { id: msgId, type: "message", role: "assistant", content: [], model,
      stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } }
  })}\n\n`;
  yield `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`;
  yield `event: ping\ndata: {"type":"ping"}\n\n`;

  let stopReason = "end_turn";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        let chunk: any;
        try { chunk = JSON.parse(raw); } catch { continue; }

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};

        if (delta.content) {
          outputTokens++;
          yield `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: delta.content } })}\n\n`;
        }

        for (const tc of delta.tool_calls ?? []) {
          const i = tc.index ?? 0;
          if (!tcBuf[i]) tcBuf[i] = { id: "", name: "", args: "" };
          if (tc.id) tcBuf[i].id = tc.id;
          if (tc.function?.name) tcBuf[i].name += tc.function.name;
          if (tc.function?.arguments) tcBuf[i].args += tc.function.arguments;
        }

        if (choice.finish_reason) {
          stopReason = choice.finish_reason === "tool_calls" ? "tool_use"
            : choice.finish_reason === "length" ? "max_tokens" : "end_turn";
        }
        if (chunk.usage?.completion_tokens) outputTokens = chunk.usage.completion_tokens;
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`;

  // Emit accumulated tool_use blocks
  let blockIdx = 1;
  for (const tc of Object.values(tcBuf)) {
    yield `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: blockIdx, content_block: { type: "tool_use", id: tc.id, name: tc.name, input: {} } })}\n\n`;
    yield `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: blockIdx, delta: { type: "input_json_delta", partial_json: tc.args } })}\n\n`;
    yield `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: blockIdx })}\n\n`;
    blockIdx++;
  }

  yield `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`;
  yield `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", default_model: DEFAULT_MODEL }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // GET /v1/models — Claude Code /model command uses this
    if (req.method === "GET" && url.pathname === "/v1/models") {
      // Copilot models (dynamic) — add copilot/ prefix for consistency
      let copilotModels: any[] = [];
      try {
        const token = await getCopilotToken();
        const raw = await fetchCopilotModels(token);
        copilotModels = raw.map((m: any) => ({
          ...m,
          id: m.id.startsWith("copilot/") ? m.id : `copilot/${m.id}`,
        }));
      } catch {}

      // Other authenticated providers (static model lists)
      const otherModels = registry.authenticatedProviders()
        .filter(p => p.name !== "copilot")
        .flatMap(p => p.listModels().map(m => ({
          id: m.fullId,
          object: "model",
          name: `[${p.displayName}] ${m.name}`,
          display_name: `[${p.displayName}] ${m.name}`,
          type: "model",
          created_at: "2025-01-01T00:00:00Z",
          model_picker_enabled: true,
          model_picker_category: "versatile"
        })));

      const data = [...copilotModels, ...otherModels];
      return new Response(JSON.stringify({ object: "list", data, has_more: false, first_id: data[0]?.id ?? null, last_id: data[data.length - 1]?.id ?? null }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (req.method !== "POST" || url.pathname !== "/v1/messages") {
      return new Response("Not Found", { status: 404 });
    }

    let body: any;
    try { body = await req.json(); } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const stream = body.stream ?? false;
    const rawModel = (body.model as string | undefined) ?? DEFAULT_MODEL;
    const providerName = detectProvider(rawModel);
    const modelId = providerName === "copilot"
      ? normalizeCopilotModel(stripPrefix(rawModel))
      : stripPrefix(rawModel);
    const openaiMessages = toOpenAIMessages(body.messages ?? [], body.system);
    const openaiTools = toOpenAITools(body.tools);

    const openaiBody: any = {
      model: modelId,
      messages: openaiMessages,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.max_tokens ?? 16000,
      stream
    };
    if (openaiTools) openaiBody.tools = openaiTools;
    if (body.tool_choice) {
      if (body.tool_choice === "auto" || body.tool_choice?.type === "auto") openaiBody.tool_choice = "auto";
      else if (body.tool_choice?.type === "any") openaiBody.tool_choice = "required";
      else if (body.tool_choice?.type === "tool") openaiBody.tool_choice = { type: "function", function: { name: body.tool_choice.name } };
    }

    let providerResp: Response;
    try {
      providerResp = await routeToProvider(providerName, modelId, openaiBody);
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: String(e), type: "auth_error" } }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }

    if (!providerResp.ok) {
      const errText = await providerResp.text();
      return new Response(JSON.stringify({ error: { message: errText, type: "api_error" } }), {
        status: providerResp.status, headers: { "Content-Type": "application/json" }
      });
    }

    if (stream) {
      const sseStream = new ReadableStream({
        async start(controller) {
          for await (const chunk of convertStream(providerResp.body!, rawModel, 0)) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        }
      });
      return new Response(sseStream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" }
      });
    }

    const data = await providerResp.json();
    return new Response(JSON.stringify(toAnthropicResponse(data, rawModel)), {
      headers: { "Content-Type": "application/json" }
    });
  }
});

process.stderr.write(`LLM proxy listening on http://localhost:${PORT} (default: ${DEFAULT_MODEL})\n`);
