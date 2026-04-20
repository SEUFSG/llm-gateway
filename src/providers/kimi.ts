import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const KIMI_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  { id: "kimi-k2.5",              name: "Kimi K2.5",            contextWindow: 131072,  maxOutput: 16384, tags: ["chinese_writing","reasoning","code_generation"],              description: "Kimi K2.5 最新旗舰" },
  { id: "kimi-k2-thinking",      name: "Kimi K2 Thinking",     contextWindow: 131072,  maxOutput: 16384, tags: ["reasoning","math","chinese_writing"],                         description: "Kimi K2 深度思考" },
  { id: "kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo", contextWindow: 131072, maxOutput: 16384, tags: ["reasoning","math","quick_qa"],                             description: "Kimi K2 快速思考" },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo",        contextWindow: 131072,  maxOutput: 16384, tags: ["code_generation","quick_qa","chinese_writing"],               description: "Kimi K2 Turbo 快速" },
  { id: "moonshot-v1-128k",      name: "Moonshot v1 128K",     contextWindow: 128000,  maxOutput: 16384, tags: ["chinese_writing","translation","long_context"],               description: "Moonshot 128K 长文档" },
  { id: "moonshot-v1-32k",       name: "Moonshot v1 32K",      contextWindow: 32000,   maxOutput: 8192,  tags: ["chinese_writing","translation"],                              description: "Moonshot 32K 均衡" },
  { id: "moonshot-v1-8k",        name: "Moonshot v1 8K",       contextWindow: 8000,    maxOutput: 4096,  tags: ["chinese_writing","quick_qa"],                                 description: "Moonshot 8K 快速" },
  { id: "moonshot-v1-auto",      name: "Moonshot v1 Auto",     contextWindow: 128000,  maxOutput: 16384, tags: ["chinese_writing","translation"],                              description: "Moonshot 自动选择上下文" },
];

export class KimiProvider {
  readonly name = "kimi";
  readonly displayName = "Moonshot Kimi";
  readonly authType = "api_key" as const;

  private readonly API_URL = "https://api.moonshot.cn/v1/chat/completions";

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    const creds = this.store.load();
    return !!creds.kimi?.apiKey;
  }

  listModels(): ModelInfo[] {
    return KIMI_MODELS.map(m => ({ ...m, provider: "kimi", fullId: `kimi/${m.id}` }));
  }

  async login(apiKey: string): Promise<AuthResult> {
    const resp = await fetch("https://api.moonshot.cn/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    if (!resp.ok) {
      return { success: false, message: `Invalid Kimi API key: ${resp.status}` };
    }
    this.store.update("kimi", { apiKey });
    return { success: true, message: "Kimi API key saved successfully" };
  }

  logout(): void {
    this.store.clear("kimi");
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    if (!creds.kimi?.apiKey) throw new Error("Kimi not authenticated. Run llm_login first.");

    const resp = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.kimi.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`Kimi API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "kimi",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }
}
