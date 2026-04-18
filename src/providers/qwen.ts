import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const QWEN_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  { id: "qwen3-235b-a22b",        name: "Qwen3 235B-A22B",     contextWindow: 131072, maxOutput: 8192,  tags: ["code_generation","reasoning","chinese_writing","math"],  description: "Qwen3 MoE 235B flagship, thinking mode" },
  { id: "qwen-max",               name: "Qwen Max",            contextWindow: 32768,  maxOutput: 8192,  tags: ["code_generation","reasoning","chinese_writing"],          description: "Qwen Max — most capable" },
  { id: "qwen-plus",              name: "Qwen Plus",           contextWindow: 131072, maxOutput: 8192,  tags: ["code_generation","chinese_writing","creative"],           description: "Qwen Plus — balanced" },
  { id: "qwen-turbo",             name: "Qwen Turbo",          contextWindow: 131072, maxOutput: 8192,  tags: ["quick_qa","chinese_writing"],                             description: "Qwen Turbo — fast and cheap" },
  { id: "qwen-long",              name: "Qwen Long",           contextWindow: 10000000, maxOutput: 6000, tags: ["long_context","chinese_writing"],                        description: "Qwen Long — 10M token context" },
  { id: "qwen2.5-72b-instruct",   name: "Qwen2.5 72B",         contextWindow: 131072, maxOutput: 8192,  tags: ["code_generation","reasoning","chinese_writing"],          description: "Qwen2.5 72B open-weight instruct" },
  { id: "qwen2.5-coder-32b-instruct", name: "Qwen2.5 Coder 32B", contextWindow: 131072, maxOutput: 8192, tags: ["code_generation"],                                     description: "Qwen2.5 Coder 32B — specialized for code" },
];

export class QwenProvider {
  readonly name = "qwen";
  readonly displayName = "Alibaba Qwen";
  readonly authType = "api_key" as const;

  private readonly BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    return !!this.store.load().qwen?.apiKey;
  }

  listModels(): ModelInfo[] {
    return QWEN_MODELS.map(m => ({ ...m, provider: "qwen", fullId: `qwen/${m.id}` }));
  }

  async login(apiKey: string): Promise<AuthResult> {
    const resp = await fetch(`${this.BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen-turbo", messages: [{ role: "user", content: "hi" }], max_tokens: 1 })
    });
    if (resp.status === 401 || resp.status === 403) {
      return { success: false, message: "Invalid Qwen API key" };
    }
    this.store.update("qwen", { apiKey });
    return { success: true, message: "Qwen API key saved successfully" };
  }

  logout(): void {
    this.store.clear("qwen");
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    if (!creds.qwen?.apiKey) throw new Error("Qwen not authenticated. Run llm_login first.");

    const resp = await fetch(`${this.BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${creds.qwen.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`Qwen API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "qwen",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }
}
