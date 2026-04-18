import type { ModelInfo, ChatRequest, ChatResponse, AuthResult } from "../types";
import type { TokenStore } from "../token-store";

const MINIMAX_MODELS: Omit<ModelInfo, "provider" | "fullId">[] = [
  { id: "MiniMax-Text-01",  name: "MiniMax Text-01",  contextWindow: 1000000, maxOutput: 16384, tags: ["chinese_writing","long_context","creative"],  description: "MiniMax Text-01 旗舰，100万上下文" },
  { id: "abab6.5s-chat",   name: "abab6.5s",         contextWindow: 245760,  maxOutput: 8192,  tags: ["chinese_writing","quick_qa","creative"],       description: "MiniMax abab6.5s 快速版" },
  { id: "abab6.5-chat",    name: "abab6.5",          contextWindow: 245760,  maxOutput: 8192,  tags: ["chinese_writing","quick_qa","creative"],       description: "MiniMax abab6.5 旗舰" },
  { id: "abab5.5-chat",    name: "abab5.5",          contextWindow: 16384,   maxOutput: 4096,  tags: ["chinese_writing","quick_qa"],                  description: "MiniMax abab5.5 标准" },
];

export class MinimaxProvider {
  readonly name = "minimax";
  readonly displayName = "MiniMax";
  readonly authType = "api_key" as const;

  private readonly API_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

  constructor(private readonly store: TokenStore) {}

  isAuthenticated(): boolean {
    const creds = this.store.load();
    return !!creds.minimax?.apiKey;
  }

  listModels(): ModelInfo[] {
    return MINIMAX_MODELS.map(m => ({ ...m, provider: "minimax", fullId: `minimax/${m.id}` }));
  }

  async login(apiKey: string): Promise<AuthResult> {
    const resp = await fetch("https://api.minimax.chat/v1/text/chatcompletion_v2", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "abab5.5-chat",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });
    if (resp.status === 401) {
      return { success: false, message: "Invalid MiniMax API key" };
    }
    this.store.update("minimax", { apiKey });
    return { success: true, message: "MiniMax API key saved successfully" };
  }

  logout(): void {
    this.store.clear("minimax");
  }

  async refreshAuth(): Promise<void> {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const creds = this.store.load();
    if (!creds.minimax?.apiKey) throw new Error("MiniMax not authenticated. Run llm_login first.");

    const resp = await fetch(this.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${creds.minimax.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        tokens_to_generate: request.maxTokens ?? 4096
      })
    });

    if (!resp.ok) throw new Error(`MiniMax API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json() as {
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model: string;
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      model: data.model ?? request.model,
      provider: "minimax",
      finishReason: (data.choices[0]?.finish_reason ?? "stop") as "stop" | "length" | "error",
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }
}
